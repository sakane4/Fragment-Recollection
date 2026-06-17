// ui.js — DOM操作・表示更新 (ゲームロジックの呼び出しのみ)

import { ACTIONS, getState, subscribe, startAction, getProgress } from './game.js';

const els = {
  fragmentCount: document.getElementById('fragment-count'),
  actionBtn: document.getElementById('action-btn'),
  progressBar: document.getElementById('progress-bar'),
  progressWrap: document.getElementById('progress-wrap'),
  statusText: document.getElementById('status-text'),
};

function render(state) {
  els.fragmentCount.textContent = state.resources.fragment;

  const active = state.activeAction;
  if (active) {
    const action = ACTIONS[active.actionId];
    els.actionBtn.disabled = true;
    els.actionBtn.textContent = `${action.label}中…`;
    els.progressWrap.hidden = false;
  } else {
    els.actionBtn.disabled = false;
    els.actionBtn.textContent = '探索を開始';
    els.progressWrap.hidden = true;
    els.progressBar.style.width = '0%';
  }
}

function tick() {
  const progress = getProgress();
  if (progress !== null) {
    els.progressBar.style.width = `${(progress * 100).toFixed(1)}%`;
    const state = getState();
    const remaining = Math.ceil((state.activeAction.endsAt - Date.now()) / 1000);
    els.statusText.textContent = `完了まで ${remaining} 秒`;
  } else {
    els.statusText.textContent = '';
  }
}

export function init() {
  subscribe(render);
  render(getState());

  els.actionBtn.addEventListener('click', () => {
    const result = startAction('explore');
    if (!result.ok) {
      console.warn('startAction failed:', result.reason);
    }
  });

  setInterval(tick, 100);
}
