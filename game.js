// game.js — ゲームロジック・状態管理 (DOM操作なし)

const ACTIONS = {
  explore: {
    id: 'explore',
    label: '探索',
    duration: 5000, // ms
    rewards: [{ resource: 'fragment', amount: 10 }],
  },
};

const INITIAL_STATE = {
  resources: {
    fragment: 0,
  },
  activeAction: null, // { actionId, startedAt, endsAt }
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

function startAction(actionId) {
  if (state.activeAction) return { ok: false, reason: 'already_active' };
  const action = ACTIONS[actionId];
  if (!action) return { ok: false, reason: 'unknown_action' };

  const now = Date.now();
  state = {
    ...state,
    activeAction: { actionId, startedAt: now, endsAt: now + action.duration },
  };
  saveToStorage(state);
  notify();

  _timer = setTimeout(() => completeAction(actionId), action.duration);
  return { ok: true };
}

function completeAction(actionId) {
  const action = ACTIONS[actionId];
  if (!action) return;

  const newResources = { ...state.resources };
  for (const reward of action.rewards) {
    newResources[reward.resource] = (newResources[reward.resource] ?? 0) + reward.amount;
  }

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

// 起動時にセーブデータを復元し、進行中のアクションがあれば再スケジュール
function init() {
  const saved = loadFromStorage();
  if (!saved) return;

  state = { ...INITIAL_STATE, ...saved, resources: { ...INITIAL_STATE.resources, ...saved.resources } };

  if (state.activeAction) {
    const remaining = state.activeAction.endsAt - Date.now();
    if (remaining > 0) {
      _timer = setTimeout(() => completeAction(state.activeAction.actionId), remaining);
    } else {
      // ページを閉じている間に完了していたケース
      completeAction(state.activeAction.actionId);
    }
  }
}

init();

export { ACTIONS, getState, subscribe, startAction, getProgress };
