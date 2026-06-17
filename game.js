// game.js — ゲームロジック・状態管理 (DOM操作なし)

const ACTIONS = {
  explore: {
    id: 'explore',
    label: '探索',
    duration: 20000, // ms
    rewards: [{ resource: 'fragment', amount: 10 }],
  },
};

const INITIAL_STATE = {
  resources: {
    fragment: 0,
  },
  activeAction: null, // { actionId, startedAt, endsAt }
};

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

export { ACTIONS, getState, subscribe, startAction, getProgress };
