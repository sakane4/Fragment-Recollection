// ui.js — DOM操作・表示更新

import { ACTIONS, getState, subscribe, startAction, getProgress } from './game.js';

const els = {
  fragmentCount: document.getElementById('fragment-count'),
  actionSelect: document.getElementById('action-select'),
  actionBtn: document.getElementById('action-btn'),
  progressBar: document.getElementById('progress-bar'),
  mainPanel: document.getElementById('main-panel'),
};

// ── ログ ──
function addLog(text, highlight = false) {
  const el = document.createElement('div');
  el.className = 'log-entry' + (highlight ? ' highlight' : '');
  el.textContent = text;
  els.mainPanel.appendChild(el);
  els.mainPanel.scrollTop = els.mainPanel.scrollHeight;
}

// ── 状態レンダリング ──
let prevActive = null;

function render(state) {
  els.fragmentCount.textContent = state.resources.fragment;

  const active = state.activeAction;

  if (active && !prevActive) {
    // 開始
    const action = ACTIONS[active.actionId];
    addLog(`【${action.label}】開始`);
    els.actionBtn.disabled = true;
    els.actionSelect.disabled = true;
    els.actionBtn.textContent = '進行中…';
  }

  if (!active && prevActive) {
    // 完了
    const action = ACTIONS[prevActive.actionId];
    const rewards = action.rewards.map(r => `${RESOURCE_LABELS[r.resource] ?? r.resource} +${r.amount}`).join(', ');
    addLog(`【${action.label}】完了 — ${rewards}`, true);
    els.actionBtn.disabled = false;
    els.actionSelect.disabled = false;
    els.actionBtn.textContent = '開始';
    els.progressBar.style.width = '0%';
  }

  prevActive = active;
}

const RESOURCE_LABELS = {
  fragment: 'フラグメント',
};

// ── プログレスバー ──
function tick() {
  const p = getProgress();
  if (p !== null) {
    els.progressBar.style.width = `${(p * 100).toFixed(1)}%`;
  }
}

// ── フッタータブ ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.view).classList.add('active');
    });
  });
}

// ── 開始ボタン ──
function initActions() {
  els.actionBtn.addEventListener('click', () => {
    const actionId = els.actionSelect.value;
    startAction(actionId);
  });
}

export function init() {
  subscribe(render);
  initTabs();
  initActions();
  setInterval(tick, 100);
}
