// game.js — ゲームロジック・状態管理 (DOM操作なし)
import { STORIES, getCostForParagraph } from './stories.js';

const LOCATIONS = {
  wherever:   { id: 'wherever',   label: '' },          // 場所不明の初期状態
  forest:     { id: 'forest',     label: 'はじまりの森' },
  touto: { id: 'touto', label: '塔都' },
};

const ACTIONS = {
  explore: {
    id: 'explore',
    label: '探索',
    locationId: 'wherever',
    description: 'なにもない世界を探索する。',
    duration: 15000,
    rewards: [{ resource: 'fragment', amount: 10 }],
    randomRewards: [
      { resource: 'fragment', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
    ],
    discoveries: [
      // 例: { type: 'location', id: 'touto', chance: 0.3 }
      // 例: { type: 'action',   id: 'forest_gather', chance: 0.5 }
    ],
  },
  forest_explore: {
    id: 'forest_explore',
    label: '探索',
    locationId: 'forest',
    description: 'はじまりの森を探索する。',
    duration: 20000,
    rewards: [{ resource: 'fragment', amount: 10 }],
    randomRewards: [
      { resource: 'fragment',     minAmount: 2, maxAmount: 4, minMs: 4000, maxMs: 9000 },
      { resource: 'forest_voice', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
    ],
    discoveries: [],
  },
  forest_gather: {
    id: 'forest_gather',
    label: '採集',
    locationId: 'forest',
    description: '森を歩き回り、素材を集める。',
    duration: 15000,
    rewards: [
  { resource: 'herb', amount: 10 },
  { resource: 'fragment', amount: 5 },
    ],
    
    randomRewards: [
      { resource: 'herb', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
      { resource: 'fragment', minAmount: 1, maxAmount: 2, minMs: 5000, maxMs: 12000 },
    ],
    discoveries: [],
  },
  touto_explore: {
    id: 'touto_explore',
    label: '探索',
    locationId: 'touto',
    description: '塔都の街路を歩く。何かが見つかるかもしれない。',
    duration: 20000,
    rewards: [{ resource: 'fragment', amount: 10 }],
    randomRewards: [
      { resource: 'fragment', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
    ],
    discoveries: [],
  },
};

// 同行者ごとのアクション完了時固有報酬
// amount は基本量（同行ボーナスの2倍乗算は適用しない）
const COMPANION_REWARDS = {
  yuya:  [{ resource: 'blue_fragment',      amount: 3 }],
  rabi:   [{ resource: 'red_fragment',       amount: 3 }],
  shizuku:[{ resource: 'clear_fragment',     amount: 3 }],
  kaoru:  [{ resource: 'bubble_fragment',    amount: 3 }],
  yukika: [{ resource: 'sky_fragment',       amount: 3 }],
};

// 同行者ごとのアクション中ランダム報酬
const COMPANION_RANDOM_REWARDS = {
  yuya:  [{ resource: 'blue_fragment',   minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  rabi:   [{ resource: 'red_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  shizuku:[{ resource: 'clear_fragment',  minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  kaoru:  [{ resource: 'bubble_fragment', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  yukika: [{ resource: 'sky_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
};

const INITIAL_STATE = {
  resources: {
    fragment: 0,
    blue_fragment: 0,
    red_fragment: 0,
    clear_fragment: 0,
    bubble_fragment: 0,
    sky_fragment: 0,
    forest_voice: 0,
  },
  activeAction: null,
  unlockedStories: [],
  storyProgress: {},
  unlockedLocations: ['wherever'],
  unlockedActions: ['explore'],
  tutorialDone: false,        // オープニングチュートリアル完了フラグ
  logSt1Done: false,     // 探索後ストーリー完了フラグ
  logSt2Done: false,    // 探索後ストーリー002完了フラグ
  logSt3Done: false,    // 探索後ストーリー003完了フラグ
  logSt4Done: false,    // 探索後ストーリー004完了フラグ
  playerName: '',             // プレイヤーネーム
  unlockedCompanions: [],     // 解放済み同行者IDの配列
  activeCompanions: [],       // 同行中の同行者IDの配列
  ELv: {},        // 同行者ごとのLv { companionId: number }
  discoveredResources: ['fragment'], // 一度でも入手したリソースID（最初からフラグメントは既知）
  appearedStories: [],        // リストに出現済みだがまだ解放していない物語ID
};

const SAVE_KEY = 'fr_save_v1';

function saveToStorage(s) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let devMode = false;

function setDevMode(enabled) {
  devMode = enabled;
}

function isDevMode() {
  return devMode;
}

// リソースを追加し、初入手なら discoveredResources にも登録する
function _addToResources(resources, resourceId, amount) {
  resources[resourceId] = (resources[resourceId] ?? 0) + amount;
}

function _markDiscovered(resourceId) {
  if (state.discoveredResources.includes(resourceId)) return false;
  state = { ...state, discoveredResources: [...state.discoveredResources, resourceId] };
  return true;
}

function addResources(resource, amount) {
  const newResources = { ...state.resources, [resource]: (state.resources[resource] ?? 0) + amount };
  state = { ...state, resources: newResources };
  _markDiscovered(resource);
  saveToStorage(state);
  notify();
}

function unlockAllStories() {
  const allIds = Object.keys(STORIES);
  const progress = { ...state.storyProgress };
  for (const id of allIds) {
    progress[id] = 999; // 全ページ解放
  }
  state = { ...state, appearedStories: [], unlockedStories: allIds, storyProgress: progress };
  saveToStorage(state);
  notify();
}

function lockAllStories() {
  state = { ...state, appearedStories: [], unlockedStories: [], storyProgress: {} };
  saveToStorage(state);
  notify();
}

function unlockLocation(locationId, actionIds = []) {
  const newLocations = state.unlockedLocations.includes(locationId)
    ? state.unlockedLocations
    : [...state.unlockedLocations, locationId];
  const newActions = [...state.unlockedActions];
  for (const id of actionIds) {
    if (!newActions.includes(id)) newActions.push(id);
  }
  state = { ...state, unlockedLocations: newLocations, unlockedActions: newActions };
  saveToStorage(state);
  notify();
}

function unlockAllActions() {
  state = { ...state, unlockedLocations: Object.keys(LOCATIONS), unlockedActions: Object.keys(ACTIONS) };
  saveToStorage(state);
  notify();
}

function lockAllActions() {
  state = { ...state, unlockedLocations: ['wherever'], unlockedActions: ['explore'] };
  saveToStorage(state);
  notify();
}

let state = structuredClone(INITIAL_STATE);
let listeners = [];

function getState() {
  return state;
}

function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
  listeners.forEach(fn => fn(state));
}

let _timer = null;
let _randomRewardTimers = [];
let _savedCallbacks = { onRandomReward: null, onCompanionRandomReward: null };

function scheduleRandomRewards(action, onReward) {
  if (!action.randomRewards) return;

  for (const reward of action.randomRewards) {
    const { minMs, maxMs } = reward;

    function schedule() {
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const t = setTimeout(() => {
        if (!state.activeAction) return;
        const amount = Math.floor(Math.random() * (reward.maxAmount - reward.minAmount + 1)) + reward.minAmount;
        const newResources = { ...state.resources };
        newResources[reward.resource] = (newResources[reward.resource] ?? 0) + amount;
        _markDiscovered(reward.resource);
        state = { ...state, resources: newResources };
        saveToStorage(state);
        notify();
        if (onReward) onReward({ resource: reward.resource, amount });
        schedule();
      }, delay);
      _randomRewardTimers.push(t);
    }

    schedule();
  }
}

function clearRandomRewardTimers() {
  _randomRewardTimers.forEach(t => clearTimeout(t));
  _randomRewardTimers = [];
}

function scheduleCompanionRandomRewards(onReward) {
  for (const companionId of state.activeCompanions) {
    const rewards = COMPANION_RANDOM_REWARDS[companionId];
    if (!rewards) continue;

    for (const reward of rewards) {
      const { minMs, maxMs } = reward;

      function schedule() {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        const t = setTimeout(() => {
          if (!state.activeAction) return;
          const amount = Math.floor(Math.random() * (reward.maxAmount - reward.minAmount + 1)) + reward.minAmount;
          const newResources = { ...state.resources };
          newResources[reward.resource] = (newResources[reward.resource] ?? 0) + amount;
          _markDiscovered(reward.resource);
          state = { ...state, resources: newResources };
          saveToStorage(state);
          notify();
          if (onReward) onReward({ companionId, resource: reward.resource, amount });
          schedule();
        }, delay);
        _randomRewardTimers.push(t);
      }

      schedule();
    }
  }
}

function startAction(actionId, { onRandomReward, onCompanionRandomReward } = {}) {
  if (state.activeAction) return { ok: false, reason: 'already_active' };
  _savedCallbacks = { onRandomReward, onCompanionRandomReward };
  const action = ACTIONS[actionId];
  if (!action) return { ok: false, reason: 'unknown_action' };

  const now = Date.now();
  const duration = devMode ? 1000 : action.duration;
  state = {
    ...state,
    activeAction: { actionId, startedAt: now, endsAt: now + duration },
  };
  saveToStorage(state);
  notify();

  _timer = setTimeout(() => completeAction(actionId), duration);
  scheduleRandomRewards(action, onRandomReward);
  scheduleCompanionRandomRewards(onCompanionRandomReward);
  return { ok: true };
}

function cancelAction() {
  if (!state.activeAction) return { ok: false, reason: 'no_active_action' };
  clearTimeout(_timer);
  clearRandomRewardTimers();
  state = { ...state, activeAction: null };
  saveToStorage(state);
  notify();
  return { ok: true };
}

function pauseAction() {
  if (!state.activeAction || state.activeAction.pausedAt) return;
  clearTimeout(_timer);
  clearRandomRewardTimers();
  state = { ...state, activeAction: { ...state.activeAction, pausedAt: Date.now() } };
  saveToStorage(state);
  notify();
}

function resumeAction() {
  if (!state.activeAction || !state.activeAction.pausedAt) return;
  const pauseDuration = Date.now() - state.activeAction.pausedAt;
  const newEndsAt = state.activeAction.endsAt + pauseDuration;
  const actionId = state.activeAction.actionId;
  state = {
    ...state,
    activeAction: { ...state.activeAction, endsAt: newEndsAt, pausedAt: undefined },
  };
  saveToStorage(state);
  notify();
  const remaining = newEndsAt - Date.now();
  if (remaining <= 0) {
    completeAction(actionId);
  } else {
    _timer = setTimeout(() => completeAction(actionId), remaining);
    const action = ACTIONS[actionId];
    scheduleRandomRewards(action, _savedCallbacks.onRandomReward);
    scheduleCompanionRandomRewards(_savedCallbacks.onCompanionRandomReward);
  }
}

function completeAction(actionId) {
  const action = ACTIONS[actionId];
  if (!action) return;

  const newResources = { ...state.resources };
  const multiplier = state.activeCompanions.length > 0 ? 2 : 1;
  for (const reward of action.rewards) {
    newResources[reward.resource] = (newResources[reward.resource] ?? 0) + reward.amount * multiplier;
  }

  // 同行者固有報酬
  const companionRewardsList = [];
  for (const companionId of state.activeCompanions) {
    const rewards = COMPANION_REWARDS[companionId];
    if (!rewards) continue;
    const level = state.ELv[companionId] ?? 0;
    for (const reward of rewards) {
      const total = reward.amount + level;
      newResources[reward.resource] = (newResources[reward.resource] ?? 0) + total;
      companionRewardsList.push({ companionId, resource: reward.resource, amount: total });
    }
  }

  // 発見判定
  const newLocations = [...state.unlockedLocations];
  const newActions = [...state.unlockedActions];
  const discovered = [];

  for (const disc of (action.discoveries ?? [])) {
    if (Math.random() > disc.chance) continue;
    if (disc.type === 'location' && !newLocations.includes(disc.id)) {
      newLocations.push(disc.id);
      discovered.push({ type: 'location', id: disc.id });
    } else if (disc.type === 'action' && !newActions.includes(disc.id)) {
      newActions.push(disc.id);
      discovered.push({ type: 'action', id: disc.id });
    }
  }

  // 新規入手リソースを discoveredResources に登録
  const newDiscovered = [...state.discoveredResources];
  for (const key of Object.keys(newResources)) {
    if (!newDiscovered.includes(key) && (newResources[key] ?? 0) > (state.resources[key] ?? 0)) {
      newDiscovered.push(key);
    }
  }

  clearRandomRewardTimers();
  state = {
    ...state,
    resources: newResources,
    activeAction: null,
    unlockedLocations: newLocations,
    unlockedActions: newActions,
    discoveredResources: newDiscovered,
  };
  saveToStorage(state);
  notify();
  return { discovered, companionRewards: companionRewardsList };
}

function getProgress() {
  if (!state.activeAction) return null;
  const { startedAt, endsAt, pausedAt } = state.activeAction;
  const now = pausedAt ?? Date.now();
  const elapsed = now - startedAt;
  const total = endsAt - startedAt;
  return Math.min(elapsed / total, 1);
}

// 物語を解放する(1ページ目が読めるようになる)
// コスト消費なしで物語をリストに出現させる（チュートリアル用）
function forceAppearStory(storyId) {
  if (state.appearedStories.includes(storyId) || state.unlockedStories.includes(storyId)) return;
  state = { ...state, appearedStories: [...state.appearedStories, storyId] };
  saveToStorage(state);
  notify();
}

function unlockStory(storyId) {
  const story = STORIES[storyId];
  if (!story) return { ok: false, reason: 'unknown_story' };
  if (state.unlockedStories.includes(storyId)) return { ok: false, reason: 'already_unlocked' };

  const newResources = { ...state.resources };
  for (const cost of story.unlockCost) {
    if ((newResources[cost.resource] ?? 0) < cost.amount) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    newResources[cost.resource] -= cost.amount;
  }

  // appeared状態から解放状態に移行
  const newAppeared = state.appearedStories.filter(id => id !== storyId);
  state = {
    ...state,
    resources: newResources,
    appearedStories: newAppeared,
    unlockedStories: [...state.unlockedStories, storyId],
    storyProgress: { ...state.storyProgress, [storyId]: 1 },
  };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// 次のページを解放する
function unlockNextPage(storyId) {
  const story = STORIES[storyId];
  if (!story) return { ok: false, reason: 'unknown_story' };
  if (!state.unlockedStories.includes(storyId)) return { ok: false, reason: 'story_locked' };

  const current = state.storyProgress[storyId] ?? 0;
  const cost = getCostForParagraph(story, current);
  const newResources = { ...state.resources };
  for (const c of cost) {
    if ((newResources[c.resource] ?? 0) < c.amount) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    newResources[c.resource] -= c.amount;
  }
  state = {
    ...state,
    resources: newResources,
    storyProgress: { ...state.storyProgress, [storyId]: current + 1 },
  };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// 起動時にセーブデータを復元し、進行中のアクションがあれば再スケジュール
function init() {
  const saved = loadFromStorage();
  if (!saved) return;

  state = {
    ...INITIAL_STATE,
    ...saved,
    resources: { ...INITIAL_STATE.resources, ...saved.resources },
    storyProgress: { ...INITIAL_STATE.storyProgress, ...saved.storyProgress },
    unlockedLocations: saved.unlockedLocations ?? INITIAL_STATE.unlockedLocations,
    unlockedActions: saved.unlockedActions ?? INITIAL_STATE.unlockedActions,
    activeCompanions: saved.activeCompanions ?? INITIAL_STATE.activeCompanions,
    ELv:  saved.ELv  ?? INITIAL_STATE.ELv,
    discoveredResources: saved.discoveredResources ?? INITIAL_STATE.discoveredResources,
    appearedStories: saved.appearedStories ?? INITIAL_STATE.appearedStories,
    logSt2Done: saved.logSt2Done ?? INITIAL_STATE.logSt2Done,
    logSt3Done: saved.logSt3Done ?? INITIAL_STATE.logSt3Done,
    logSt4Done: saved.logSt4Done ?? INITIAL_STATE.logSt4Done,
  };

  if (state.activeAction) {
    const remaining = state.activeAction.endsAt - Date.now();
    if (remaining > 0) {
      _timer = setTimeout(() => completeAction(state.activeAction.actionId), remaining);
    } else {
      completeAction(state.activeAction.actionId);
    }
  }
}

init();

function setTutorialDone() {
  state = { ...state, tutorialDone: true };
  saveToStorage(state);
}

function setLogSt1Done() {
  state = { ...state, logSt1Done: true };
  saveToStorage(state);
}

function setLogSt2Done() {
  state = { ...state, logSt2Done: true };
  saveToStorage(state);
}

function setLogSt3Done() {
  state = { ...state, logSt3Done: true };
  saveToStorage(state);
}

function setLogSt4Done() {
  state = { ...state, logSt4Done: true };
  saveToStorage(state);
}

function setPlayerName(name) {
  state = { ...state, playerName: name };
  saveToStorage(state);
  notify();
}

function unlockCompanion(id) {
  if (state.unlockedCompanions.includes(id)) return;
  state = { ...state, unlockedCompanions: [...state.unlockedCompanions, id] };
  saveToStorage(state);
  notify();
}

function setCompanionLevel(companionId, level) {
  state = { ...state, ELv: { ...state.ELv, [companionId]: level } };
  saveToStorage(state);
  notify();
}

function setActiveCompanion(id, active) {
  const current = state.activeCompanions;
  const next = active
    ? (current.includes(id) ? current : [...current, id])
    : current.filter(c => c !== id);
  state = { ...state, activeCompanions: next };
  saveToStorage(state);
  notify();
}

function jumpToLogSt(n) {
  state = {
    ...state,
    logSt1Done:  n > 1 ? true : false,
    logSt2Done: n > 2 ? true : false,
    logSt3Done: false,
    logSt4Done: false,
  };
  saveToStorage(state);
}

function resetTutorial() {
  state = { ...state, tutorialDone: false, logSt1Done: false, logSt2Done: false, logSt3Done: false, logSt4Done: false, playerName: '', unlockedCompanions: [], activeCompanions: [] };
  saveToStorage(state);
  notify();
}

export { LOCATIONS, ACTIONS, STORIES, COMPANION_REWARDS, COMPANION_RANDOM_REWARDS, getState, forceAppearStory, subscribe, startAction, cancelAction, pauseAction, resumeAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockLocation, unlockAllActions, lockAllActions, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setLogSt4Done, setPlayerName, unlockCompanion, setCompanionLevel, setActiveCompanion, resetTutorial, jumpToLogSt };
