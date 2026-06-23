// game.js — ゲームロジック・状態管理 (DOM操作なし)
import { STORIES, getCostForParagraph } from './stories.js';

// 共通報酬テーブル。関数形式: (state) => Array<reward>
// 将来、世界Lvや状態を参照して量を変えることができる
const REWARD_TABLES = {
  fragment_fixed: (state, locationLv, actionLv) => [
    { resource: 'fragment', amount: 10 + state.worldLv * 2 + locationLv * 3 + actionLv * 2 },
  ],
  fragment_random: (state, locationLv, actionLv) => [
    { resource: 'fragment', minAmount: 1 + state.worldLv, maxAmount: 3 + state.worldLv * 2 + locationLv + actionLv, minMs: 4000, maxMs: 9000 },
  ],
  // はじまりの森 — 共通ランダム報酬（全行動に適用）
  forest_common_random: () => [
    { resource: 'forest_voice', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
  ],
  // はじまりの森 — 行動別ランダム報酬
  forest_explore_random: (_state, locationLv, actionLv) => [
    { resource: 'forest_voice', minAmount: 1, maxAmount: (locationLv >= 2 ? 3 : 2) + actionLv, minMs: 10000, maxMs: 20000 },
  ],
  forest_gather_random: (_state, locationLv, actionLv) => [
    { resource: 'herb',     minAmount: 1, maxAmount: 3 + actionLv, minMs: 4000, maxMs: 9000 },
    { resource: 'fragment', minAmount: 1, maxAmount: 2 + actionLv, minMs: 5000, maxMs: 12000 },
    ...(locationLv >= 2 ? [{ resource: 'branch', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 20000 }] : []),
  ],
};

// テーブル名 → 展開済み配列を返すヘルパー
function resolveTable(tableNameOrArray, locationId, actionId) {
  if (!tableNameOrArray) return [];
  const names = Array.isArray(tableNameOrArray) ? tableNameOrArray : [tableNameOrArray];
  const locationLv = state.LocationLv?.[locationId] ?? 0;
  const actionLv = state.ActionLv?.[actionId] ?? 0;
  return names.flatMap(name => {
    const fn = REWARD_TABLES[name];
    return fn ? fn(state, locationLv, actionLv) : [];
  });
}

// 場所・行動の定義（行動は場所にネスト）
const LOCATION_DEFS = [
  {
    id: 'wherever',
    label: '再生された世界',
    description: 'なにもない世界。ここから、すべてははじまる。',
    actions: [
      {
        id: 'explore',
        label: '探索',
        description: '再生された世界を探索する。',
        duration: 15000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'fragment_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'forest',
    label: 'はじまりの森',
    description: '静かな緑の森。木々の声が聞こえる気がする。',
    actions: [
      {
        id: 'forest_explore',
        label: '探索',
        description: 'はじまりの森を探索する。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: ['forest_common_random', 'forest_explore_random'],
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
      {
        id: 'forest_gather',
        label: '採集',
        description: '森を歩き回り、素材を集める。',
        duration: 15000,
        rewards: [
          { resource: 'herb', amount: 10 },
        ],
        rewardTableRandom: ['forest_common_random', 'forest_gather_random'],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'touto',
    label: '塔都',
    description: 'どこまでも空へ伸びる、白亜の塔をとりまく街',
    actions: [
      {
        id: 'touto_explore',
        label: '探索',
        description: '塔都の街路を歩く。何かが見つかるかもしれない。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'fragment_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
];

// 既存コードが参照するフラットな lookup map を生成
const LOCATIONS = {};
const ACTIONS = {};
for (const loc of LOCATION_DEFS) {
  LOCATIONS[loc.id] = { id: loc.id, label: loc.label, description: loc.description ?? '' };
  for (const action of loc.actions) {
    ACTIONS[action.id] = { ...action, locationId: loc.id };
  }
}

// 場所レベルシステム
const LOCATION_LV_MAX = 5;
const LOCATION_LV_COSTS = [50, 150, 350, 700, 1200]; // Lv0→1, 1→2, ..., 4→5 のフラグメントコスト

// 同行者ごとのアクション完了時固有報酬
// amount は基本量（同行ボーナスの2倍乗算は適用しない）
const COMPANION_REWARDS = {
  yuya: [{ resource: 'blue_fragment',      amount: 3 }],
  rabi:   [{ resource: 'red_fragment',       amount: 3 }],
  shizuku:[{ resource: 'clear_fragment',     amount: 3 }],
  kaoru:  [{ resource: 'bubble_fragment',    amount: 3 }],
  yukika: [{ resource: 'sky_fragment',       amount: 3 }],
};

// 同行者ごとのアクション中ランダム報酬
const COMPANION_RANDOM_REWARDS = {
  yuya: [{ resource: 'blue_fragment',   minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  rabi:   [{ resource: 'red_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  shizuku:[{ resource: 'clear_fragment',  minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  kaoru:  [{ resource: 'bubble_fragment', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  yukika: [{ resource: 'sky_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
};

// 世界LVの閾値（フラグメント総獲得数）
// インデックス i → Lv i+1 に上がるのに必要な累計数
const WORLD_LV_THRESHOLDS = [
  50,    // Lv 0 → 1
  150,   // Lv 1 → 2
  350,   // Lv 2 → 3
  700,   // Lv 3 → 4
  1200,  // Lv 4 → 5
];

// 行動レベル(ActionLv)の閾値(仮値)。実行回数の累計でレベルアップ。LocationLvとは別管理。
const ACTION_LV_THRESHOLDS = [
  10,   // Lv 0 → 1
  30,   // Lv 1 → 2
  60,   // Lv 2 → 3
  100,  // Lv 3 → 4
  150,  // Lv 4 → 5
];

const INITIAL_STATE = {
  resources: {
    fragment: 0,
    blue_fragment: 0,
    red_fragment: 0,
    clear_fragment: 0,
    bubble_fragment: 0,
    sky_fragment: 0,
    forest_voice: 0,
    branch: 0,
  },
  activeAction: null,
  unlockedStories: [],
  storyProgress: {},
  unlockedLocations: ['wherever'],
  unlockedActions: ['explore'],
  tutorialDone: false,
  logSt1Done: false,
  logSt2Done: false,
  logSt3Done: false,
  logSt4Done: false,
  guideUnlocked: false,
  playerName: '',
  unlockedCompanions: [],
  activeCompanions: [],
  ELv: {},
  companionEquipment: {},
  titleRevealed: {},
  discoveredResources: ['fragment'],
  appearedStories: [],
  worldLv: 0,
  totalFragments: 0,
  LocationLv: {},
  actionCount: {},
  ActionLv: {},
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

// フラグメント累計を加算し、世界LVアップを判定して返す
// 戻り値: 新しいLv（上がらなかった場合は現在Lvと同じ）
function _addTotalFragments(amount) {
  const newTotal = state.totalFragments + amount;
  let newLv = state.worldLv;
  while (newLv < WORLD_LV_THRESHOLDS.length && newTotal >= WORLD_LV_THRESHOLDS[newLv]) {
    newLv++;
  }
  state = { ...state, totalFragments: newTotal, worldLv: newLv };
  return newLv;
}

// 行動の実行回数を加算し、ActionLvアップを判定する
function _addActionCount(actionId) {
  const newCount = (state.actionCount[actionId] ?? 0) + 1;
  let newLv = state.ActionLv[actionId] ?? 0;
  while (newLv < ACTION_LV_THRESHOLDS.length && newCount >= ACTION_LV_THRESHOLDS[newLv]) {
    newLv++;
  }
  state = {
    ...state,
    actionCount: { ...state.actionCount, [actionId]: newCount },
    ActionLv: { ...state.ActionLv, [actionId]: newLv },
  };
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

function unlockAction(actionId) {
  if (state.unlockedActions.includes(actionId)) return;
  state = { ...state, unlockedActions: [...state.unlockedActions, actionId] };
  saveToStorage(state);
  notify();
}

function unlockGuide() {
  if (state.guideUnlocked) return;
  state = { ...state, guideUnlocked: true };
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
  const allRandom = [...resolveTable(action.rewardTableRandom, action.locationId, action.id), ...(action.randomRewards ?? [])];
  if (allRandom.length === 0) return;

  for (const reward of allRandom) {
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
        if (reward.resource === 'fragment') _addTotalFragments(amount);
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

function startAction(actionId, { onRandomReward, onCompanionRandomReward, onComplete } = {}) {
  if (state.activeAction) return { ok: false, reason: 'already_active' };
  _savedCallbacks = { onRandomReward, onCompanionRandomReward, onComplete };
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

  _timer = setTimeout(() => completeAction(actionId, _savedCallbacks.onComplete), duration);
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
    completeAction(actionId, _savedCallbacks.onComplete);
  } else {
    _timer = setTimeout(() => completeAction(actionId, _savedCallbacks.onComplete), remaining);
    const action = ACTIONS[actionId];
    scheduleRandomRewards(action, _savedCallbacks.onRandomReward);
    scheduleCompanionRandomRewards(_savedCallbacks.onCompanionRandomReward);
  }
}

function completeAction(actionId, onComplete) {
  const action = ACTIONS[actionId];
  if (!action) return;

  const newResources = { ...state.resources };
  const multiplier = state.activeCompanions.length > 0 ? 2 : 1;
  const allRewards = [...resolveTable(action.rewardTable, action.locationId, action.id), ...(action.rewards ?? [])];
  let fragmentsGained = 0;
  for (const reward of allRewards) {
    const gained = reward.amount * multiplier;
    newResources[reward.resource] = (newResources[reward.resource] ?? 0) + gained;
    if (reward.resource === 'fragment') fragmentsGained += gained;
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
  const prevLv = state.worldLv;
  if (fragmentsGained > 0) _addTotalFragments(fragmentsGained);
  const lvedUp = state.worldLv > prevLv;
  _addActionCount(actionId);
  saveToStorage(state);
  notify();
  const result = { discovered, allRewards, companionRewards: companionRewardsList, worldLvUp: lvedUp ? state.worldLv : null };
  onComplete?.(result);
  return result;
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
    companionEquipment: saved.companionEquipment ?? INITIAL_STATE.companionEquipment,
    titleRevealed: saved.titleRevealed ?? INITIAL_STATE.titleRevealed,
    discoveredResources: saved.discoveredResources ?? INITIAL_STATE.discoveredResources,
    appearedStories: saved.appearedStories ?? INITIAL_STATE.appearedStories,
    logSt2Done: saved.logSt2Done ?? INITIAL_STATE.logSt2Done,
    logSt3Done: saved.logSt3Done ?? INITIAL_STATE.logSt3Done,
    logSt4Done: saved.logSt4Done ?? INITIAL_STATE.logSt4Done,
    guideUnlocked: saved.guideUnlocked ?? INITIAL_STATE.guideUnlocked,
    worldLv: saved.worldLv ?? INITIAL_STATE.worldLv,
    totalFragments: saved.totalFragments ?? INITIAL_STATE.totalFragments,
    LocationLv: saved.LocationLv ?? INITIAL_STATE.LocationLv,
    actionCount: saved.actionCount ?? INITIAL_STATE.actionCount,
    ActionLv: saved.ActionLv ?? INITIAL_STATE.ActionLv,
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

function setCompanionEquipment(companionId, itemId) {
  state = { ...state, companionEquipment: { ...state.companionEquipment, [companionId]: itemId } };
  saveToStorage(state);
  notify();
}

function revealStoryTitle(storyId) {
  if (state.titleRevealed[storyId]) return;
  state = { ...state, titleRevealed: { ...state.titleRevealed, [storyId]: true } };
  saveToStorage(state);
  notify();
}

// LocationLvの上限。worldLvが天井になる（worldLv0なら0、最大はLOCATION_LV_MAX=5）
function getLocationLvCap() {
  return Math.min(LOCATION_LV_MAX, state.worldLv);
}

function levelUpLocation(locationId, prepaid = 0) {
  const currentLv = state.LocationLv?.[locationId] ?? 0;
  if (currentLv >= LOCATION_LV_MAX) return { ok: false, reason: 'max_level' };
  if (currentLv >= getLocationLvCap()) return { ok: false, reason: 'world_lv_cap' };
  const cost = LOCATION_LV_COSTS[currentLv];
  const remaining = cost - prepaid;
  if ((state.resources.fragment ?? 0) < remaining) return { ok: false, reason: 'insufficient_resources' };
  const newResources = { ...state.resources, fragment: state.resources.fragment - remaining };
  const newLv = currentLv + 1;
  state = { ...state, resources: newResources, LocationLv: { ...state.LocationLv, [locationId]: newLv } };
  saveToStorage(state);
  notify();
  return { ok: true, newLv };
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

// ログストーリーnへジャンプするための前提状態を整える(開発用)
// nを直接再生するための、ここまでに本来達成されているはずのフラグ・進捗をまとめて反映する
function jumpToLogSt(n) {
  const prologueTotal = STORIES['prologue']?.pageCount ?? 0;

  const next = {
    ...state,
    tutorialDone: true,
    logSt1Done: false,
    logSt2Done: false,
    logSt3Done: false,
    logSt4Done: false,
    guideUnlocked: false,
    unlockedStories: [...state.unlockedStories],
    storyProgress: { ...state.storyProgress },
    unlockedCompanions: [...state.unlockedCompanions],
    activeCompanions: [...state.activeCompanions],
    unlockedLocations: [...state.unlockedLocations],
    unlockedActions: [...state.unlockedActions],
  };

  if (!next.unlockedStories.includes('prologue')) next.unlockedStories.push('prologue');
  next.storyProgress['prologue'] = prologueTotal;

  if (n >= 2) {
    next.logSt1Done = true;
    if (!next.unlockedCompanions.includes('yuya')) next.unlockedCompanions.push('yuya');
    if (!next.activeCompanions.includes('yuya')) next.activeCompanions.push('yuya');
  }
  if (n >= 3) {
    next.logSt2Done = true;
    if (!next.unlockedStories.includes('yuya_1')) next.unlockedStories.push('yuya_1');
    next.storyProgress['yuya_1'] = Math.max(next.storyProgress['yuya_1'] ?? 0, 3);
  }
  if (n >= 4) {
    next.logSt3Done = true;
    if (!next.unlockedLocations.includes('forest')) next.unlockedLocations.push('forest');
    if (!next.unlockedActions.includes('forest_explore')) next.unlockedActions.push('forest_explore');
    next.storyProgress['yuya_1'] = Math.max(next.storyProgress['yuya_1'] ?? 0, 13);
  }

  state = next;
  saveToStorage(state);
  notify();
}

function resetTutorial() {
  state = { ...state, tutorialDone: false, logSt1Done: false, logSt2Done: false, logSt3Done: false, logSt4Done: false, guideUnlocked: false, playerName: '', unlockedCompanions: [], activeCompanions: [] };
  saveToStorage(state);
  notify();
}

export { LOCATIONS, ACTIONS, STORIES, COMPANION_REWARDS, COMPANION_RANDOM_REWARDS, WORLD_LV_THRESHOLDS, LOCATION_LV_COSTS, LOCATION_LV_MAX, ACTION_LV_THRESHOLDS, getLocationLvCap, levelUpLocation, getState, forceAppearStory, subscribe, startAction, cancelAction, pauseAction, resumeAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockLocation, unlockAction, unlockAllActions, lockAllActions, unlockGuide, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setLogSt4Done, setPlayerName, unlockCompanion, setCompanionLevel, setCompanionEquipment, revealStoryTitle, setActiveCompanion, resetTutorial, jumpToLogSt };
