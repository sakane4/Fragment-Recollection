// game.js — ゲームロジック・状態管理 (DOM操作なし)
import { STORIES } from './stories.js';

const LOCATIONS = {
  wherever:   { id: 'wherever',   label: '' },          // 場所不明の初期状態
  forest:     { id: 'forest',     label: 'はじまりの森' },
  tower_city: { id: 'tower_city', label: '塔都' },
};

const ACTIONS = {
  forest_explore: {
    id: 'forest_explore',
    label: '探索',
    locationId: 'wherever',
    description: 'なにもない世界を探索する。',
    duration: 20000,
    rewards: [{ resource: 'fragment', amount: 10 }],
    randomRewards: [
      { resource: 'fragment', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
    ],
    discoveries: [
      // 例: { type: 'location', id: 'tower_city', chance: 0.3 }
      // 例: { type: 'action',   id: 'forest_gather', chance: 0.5 }
    ],
  },
  forest_gather: {
    id: 'forest_gather',
    label: '採集',
    locationId: 'forest',
    description: '森を歩き回り、素材を集める。',
    duration: 15000,
    rewards: [{ resource: 'herb', amount: 10 }],
    randomRewards: [
      { resource: 'herb', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
    ],
    discoveries: [],
  },
  tower_explore: {
    id: 'tower_explore',
    label: '探索',
    locationId: 'tower_city',
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
  yuuya: [{ resource: 'blue_fragment', amount: 3 }],
};

// 同行者ごとのアクション中ランダム報酬
const COMPANION_RANDOM_REWARDS = {
  yuuya: [
    { resource: 'blue_fragment', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 },
  ],
};

const INITIAL_STATE = {
  resources: {
    fragment: 0,
    blue_fragment: 0,
  },
  activeAction: null,
  unlockedStories: [],
  storyProgress: {},
  unlockedLocations: ['wherever'],
  unlockedActions: ['forest_explore'],
  tutorialDone: false,        // オープニングチュートリアル完了フラグ
  postExploreDone: false,     // 探索後ストーリー完了フラグ
  postExplore2Done: false,    // 探索後ストーリー002完了フラグ
  fragmentHintShown: false,   // フラグメント50個ヒント表示済みフラグ
  playerName: '',             // プレイヤーネーム
  unlockedCompanions: [],     // 解放済み同行者IDの配列
  activeCompanions: [],       // 同行中の同行者IDの配列
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

function addResources(resource, amount) {
  const newResources = { ...state.resources, [resource]: (state.resources[resource] ?? 0) + amount };
  state = { ...state, resources: newResources };
  saveToStorage(state);
  notify();
}

function unlockAllStories() {
  const allIds = Object.keys(STORIES);
  const progress = { ...state.storyProgress };
  for (const id of allIds) {
    progress[id] = 999; // 全ページ解放
  }
  state = { ...state, unlockedStories: allIds, storyProgress: progress };
  saveToStorage(state);
  notify();
}

function lockAllStories() {
  state = { ...state, unlockedStories: [], storyProgress: {} };
  saveToStorage(state);
  notify();
}

function unlockAllActions() {
  state = { ...state, unlockedLocations: Object.keys(LOCATIONS), unlockedActions: Object.keys(ACTIONS) };
  saveToStorage(state);
  notify();
}

function lockAllActions() {
  state = { ...state, unlockedLocations: ['wherever'], unlockedActions: ['forest_explore'] };
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
    for (const reward of rewards) {
      newResources[reward.resource] = (newResources[reward.resource] ?? 0) + reward.amount;
      companionRewardsList.push({ companionId, ...reward });
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

  clearRandomRewardTimers();
  state = {
    ...state,
    resources: newResources,
    activeAction: null,
    unlockedLocations: newLocations,
    unlockedActions: newActions,
  };
  saveToStorage(state);
  notify();
  return { discovered, companionRewards: companionRewardsList };
}

function getProgress() {
  if (!state.activeAction) return null;
  const { startedAt, endsAt } = state.activeAction;
  const now = Date.now();
  const elapsed = now - startedAt;
  const total = endsAt - startedAt;
  return Math.min(elapsed / total, 1);
}

// 物語を解放する(1ページ目が読めるようになる)
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

  state = {
    ...state,
    resources: newResources,
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

  const newResources = { ...state.resources };
  for (const cost of story.pageCost) {
    if ((newResources[cost.resource] ?? 0) < cost.amount) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    newResources[cost.resource] -= cost.amount;
  }

  const current = state.storyProgress[storyId] ?? 1;
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
    postExplore2Done: saved.postExplore2Done ?? INITIAL_STATE.postExplore2Done,
    fragmentHintShown: saved.fragmentHintShown ?? INITIAL_STATE.fragmentHintShown,
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

function setPostExploreDone() {
  state = { ...state, postExploreDone: true };
  saveToStorage(state);
}

function setPostExplore2Done() {
  state = { ...state, postExplore2Done: true };
  saveToStorage(state);
}

function setFragmentHintShown() {
  state = { ...state, fragmentHintShown: true };
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

function setActiveCompanion(id, active) {
  const current = state.activeCompanions;
  const next = active
    ? (current.includes(id) ? current : [...current, id])
    : current.filter(c => c !== id);
  state = { ...state, activeCompanions: next };
  saveToStorage(state);
  notify();
}

function resetTutorial() {
  state = { ...state, tutorialDone: false, postExploreDone: false, postExplore2Done: false, fragmentHintShown: false, playerName: '', unlockedCompanions: [], activeCompanions: [] };
  saveToStorage(state);
  notify();
}

export { LOCATIONS, ACTIONS, STORIES, COMPANION_REWARDS, COMPANION_RANDOM_REWARDS, getState, subscribe, startAction, cancelAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockAllActions, lockAllActions, setTutorialDone, setPostExploreDone, setPostExplore2Done, setFragmentHintShown, setPlayerName, unlockCompanion, setActiveCompanion, resetTutorial };
