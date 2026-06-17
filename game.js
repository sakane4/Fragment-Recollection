// game.js — ゲームロジック・状態管理 (DOM操作なし)
import { STORIES } from './stories.js';

const ACTIONS = {
  explore: {
    id: 'explore',
    label: '探索',
    description: '未知の場所を探索する。フラグメントが手に入るかもしれない。',
    duration: 20000, // ms
    rewards: [{ resource: 'fragment', amount: 10 }],
    randomRewards: [
      { resource: 'fragment', minAmount: 1, maxAmount: 3, minMs: 4000, maxMs: 9000 },
    ],
  },
  gather: {
    id: 'gather',
    label: '採集',
    description: '周辺を歩き回り、素材を集める。',
    duration: 15000, // ms
    rewards: [{ resource: 'fragment', amount: 5 }],
    randomRewards: [],
  },
};

const INITIAL_STATE = {
  resources: {
    fragment: 0,
  },
  activeAction: null,       // { actionId, startedAt, endsAt }
  unlockedStories: [],      // 一覧に表示・解放済みの物語IDの配列
  storyProgress: {},        // { [storyId]: unlockedPages } 解放済みページ数
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
    if (!progress[id]) progress[id] = Object.keys(STORIES[id]).length || 1;
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

function startAction(actionId, { onRandomReward } = {}) {
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
  return { ok: true };
}

function completeAction(actionId) {
  const action = ACTIONS[actionId];
  if (!action) return;

  const newResources = { ...state.resources };
  for (const reward of action.rewards) {
    newResources[reward.resource] = (newResources[reward.resource] ?? 0) + reward.amount;
  }

  clearRandomRewardTimers();
  state = { ...state, resources: newResources, activeAction: null };
  saveToStorage(state);
  notify();
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

export { ACTIONS, STORIES, getState, subscribe, startAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories };
