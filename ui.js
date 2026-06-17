// ui.js — DOM操作・表示更新

import { LOCATIONS, ACTIONS, STORIES, getState, subscribe, startAction, cancelAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, setTutorialDone, setPostExploreDone, setPlayerName, unlockCompanion, resetTutorial } from './game.js';
import { parseStoryPages } from './stories.js';
import { startFlavorScheduler } from './logs.js';
import { startOpeningTutorial, startPostExploreStory } from './tutorial.js';

const els = {
  resourceList: document.getElementById('resource-list'),
  actionPickerBtn: document.getElementById('action-picker-btn'),
  actionBtn: document.getElementById('action-btn'),
  progressBar: document.getElementById('progress-bar'),
  mainPanel: document.getElementById('main-panel'),
  actionList: document.getElementById('action-list'),
  storyList: document.getElementById('story-list'),
  storyOverlay: document.getElementById('story-overlay'),
  storyViewerTitle: document.getElementById('story-viewer-title'),
  storyBody: document.getElementById('story-body'),
  storyCloseBtn: document.getElementById('story-close-btn'),
};

const RESOURCE_LABELS = {
  fragment: 'フラグメント',
  herb: '薬草',
};

// ── ログ ──
function addLog(text, highlight = false) {
  const el = document.createElement('div');
  el.className = 'log-entry' + (highlight ? ' highlight' : '');
  el.textContent = text;
  els.mainPanel.appendChild(el);
  els.mainPanel.scrollTop = els.mainPanel.scrollHeight;
}

// ── 物語ビューア ──
// 現在開いている物語のページ一覧をキャッシュ
let _viewerPages = [];
let _viewerStoryId = null;

async function openStory(storyId) {
  const story = STORIES[storyId];
  if (!story) return;

  // テキストをfetchしてパース
  let pages;
  try {
    const res = await fetch(`stories/${storyId}.txt`);
    const text = await res.text();
    pages = parseStoryPages(text);
  } catch {
    addLog('【エラー】物語テキストの読み込みに失敗しました');
    return;
  }

  _viewerPages = pages;
  _viewerStoryId = storyId;

  els.storyViewerTitle.textContent = story.title;
  els.storyOverlay.classList.add('open');
  renderViewerBody(getState());
}

function renderViewerBody(state) {
  if (!_viewerStoryId) return;
  const story = STORIES[_viewerStoryId];
  const unlockedPages = state.storyProgress[_viewerStoryId] ?? 1;
  const totalPages = _viewerPages.length;

  els.storyBody.innerHTML = '';

  // 解放済みページを順に表示
  for (let i = 0; i < Math.min(unlockedPages, totalPages); i++) {
    const block = document.createElement('p');
    block.className = 'story-page';
    block.textContent = _viewerPages[i];
    els.storyBody.appendChild(block);

    // ページ間の空白行
    if (i < unlockedPages - 1 && i < totalPages - 1) {
      const sep = document.createElement('div');
      sep.className = 'story-sep';
      els.storyBody.appendChild(sep);
    }

  }

  // 次ページ解放ボタン
  if (unlockedPages < totalPages) {
    const costLabel = story.pageCost.map(c => `${RESOURCE_LABELS[c.resource] ?? c.resource} ×${c.amount}`).join(', ');
    const btn = document.createElement('button');
    btn.className = 'story-next-btn';
    btn.textContent = `続きを読む (${costLabel})`;
    btn.addEventListener('click', () => {
      const result = unlockNextPage(_viewerStoryId);
      if (!result.ok && result.reason === 'insufficient_resources') {
        addLog(`【物語】続きを読むには ${costLabel} が必要です`);
      }
    });
    els.storyBody.appendChild(btn);
  } else {
    const fin = document.createElement('div');
    fin.className = 'story-fin';
    fin.textContent = '— END —';
    els.storyBody.appendChild(fin);
  }

  els.storyBody.scrollTop = els.storyBody.scrollHeight;
}

function closeStory() {
  els.storyOverlay.classList.remove('open');
  _viewerPages = [];
  _viewerStoryId = null;
}

// ── 物語リスト描画 ──
function renderStoryList(state) {
  els.storyList.innerHTML = '';

  for (const story of Object.values(STORIES)) {
    const unlocked = state.unlockedStories.includes(story.id);
    const costLabel = story.unlockCost.map(c => `${RESOURCE_LABELS[c.resource] ?? c.resource} ×${c.amount}`).join(', ');

    const item = document.createElement('div');
    item.className = 'story-item';

    const info = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'story-item-title' + (unlocked ? '' : ' locked');
    title.textContent = unlocked ? story.title : `??? (${story.title})`;
    info.appendChild(title);

    if (!unlocked) {
      const cost = document.createElement('div');
      cost.className = 'story-cost';
      cost.textContent = `解放: ${costLabel}`;
      info.appendChild(cost);
    } else {
      const pages = state.storyProgress[story.id] ?? 1;
      const progress = document.createElement('div');
      progress.className = 'story-cost';
      progress.textContent = `${pages} ページ解放済み`;
      info.appendChild(progress);
    }

    const btn = document.createElement('button');
    btn.className = 'story-btn' + (unlocked ? '' : ' locked');
    btn.textContent = unlocked ? '読む' : '解放';
    btn.addEventListener('click', () => {
      if (unlocked) {
        openStory(story.id);
      } else {
        const result = unlockStory(story.id);
        if (!result.ok && result.reason === 'insufficient_resources') {
          addLog(`【物語】フラグメントが足りません (${costLabel} 必要)`);
        }
      }
    });

    item.appendChild(info);
    item.appendChild(btn);
    els.storyList.appendChild(item);
  }
}

// ── 状態レンダリング ──
let prevActive = null;
let prevUnlocked = [];
let prevUnlockedLocations = [];
let prevUnlockedActions = [];
let stopFlavor = null;
let _cancelled = false;

function renderResources(resources) {
  els.resourceList.innerHTML = '';
  for (const [key, amount] of Object.entries(resources)) {
    if (amount === 0) continue;
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.innerHTML = `<span class="resource-name">${RESOURCE_LABELS[key] ?? key}</span><span class="resource-val">${amount}</span>`;
    els.resourceList.appendChild(row);
  }
}

function render(state) {
  renderResources(state.resources);

  const active = state.activeAction;

  if (active && !prevActive) {
    const action = ACTIONS[active.actionId];
    const location = LOCATIONS[action.locationId];
    addLog(`【${location.label} / ${action.label}】開始`);
    els.actionPickerBtn.disabled = true;
    els.actionBtn.textContent = '中断';
    stopFlavor = startFlavorScheduler(active.actionId, text => addLog(text));
  }

  if (!active && prevActive) {
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    if (!_cancelled) {
      const action = ACTIONS[prevActive.actionId];
      const location = LOCATIONS[action.locationId];
      const rewards = action.rewards.map(r => `${RESOURCE_LABELS[r.resource] ?? r.resource} +${r.amount}`).join(', ');
      addLog(`【${location.label} / ${action.label}】完了 — ${rewards}`, true);
    }
    const wasCancelled = _cancelled;
    _cancelled = false;
    els.actionPickerBtn.disabled = false;
    els.actionBtn.textContent = '開始';
    els.progressBar.style.width = '0%';
    if (!wasCancelled) {
      if (_postExplorePending) {
        maybeStartPostExplore();
        // ポスト探索ストーリー中は自動再開しない
      } else {
        startAction(selectedActionId, {
          onRandomReward: ({ resource, amount }) => {
            addLog(`${RESOURCE_LABELS[resource] ?? resource} を ${amount} 個見つけた`);
          },
        });
      }
    }
  }

  for (const id of state.unlockedStories) {
    if (!prevUnlocked.includes(id)) {
      addLog(`【物語】「${STORIES[id].title}」を解放しました`, true);
    }
  }

  for (const id of state.unlockedLocations) {
    if (!prevUnlockedLocations.includes(id)) {
      addLog(`【発見】新しい場所「${LOCATIONS[id].label}」を見つけた`, true);
    }
  }
  for (const id of state.unlockedActions) {
    if (!prevUnlockedActions.includes(id)) {
      const action = ACTIONS[id];
      const location = LOCATIONS[action.locationId];
      addLog(`【発見】${location.label} で「${action.label}」ができるようになった`, true);
    }
  }

  prevActive = active;
  prevUnlocked = [...state.unlockedStories];
  prevUnlockedLocations = [...state.unlockedLocations];
  prevUnlockedActions = [...state.unlockedActions];

  renderStoryList(state);

  // ビューアが開いていればページ表示を更新
  if (_viewerStoryId) renderViewerBody(state);
}

// ── プログレスバー ──
function tick() {
  const p = getProgress();
  if (p !== null) {
    els.progressBar.style.width = `${(p * 100).toFixed(1)}%`;
  }
}

// ── フッタータブ ──
function switchTab(viewId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
  const tabBtn = document.querySelector(`.tab-btn[data-view="${viewId}"]`);
  if (tabBtn) tabBtn.classList.add('active');
  document.getElementById(viewId).classList.add('active');
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.view));
  });
}

// ── 行動選択 ──
let selectedActionId = 'forest_explore';

function renderActionList() {
  els.actionList.innerHTML = '';

  const state = getState();
  for (const location of Object.values(LOCATIONS)) {
    if (!state.unlockedLocations.includes(location.id)) continue;
    const actions = Object.values(ACTIONS).filter(a =>
      a.locationId === location.id && state.unlockedActions.includes(a.id)
    );
    if (actions.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'action-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'action-group-label';
    groupLabel.textContent = location.label;
    group.appendChild(groupLabel);

    for (const action of actions) {
      const card = document.createElement('div');
      card.className = 'action-card' + (action.id === selectedActionId ? ' selected' : '');

      const info = document.createElement('div');
      info.className = 'action-card-info';

      const name = document.createElement('div');
      name.className = 'action-card-name';
      name.textContent = action.label;

      const desc = document.createElement('div');
      desc.className = 'action-card-desc';
      desc.textContent = action.description ?? '';

      info.appendChild(name);
      info.appendChild(desc);

      const meta = document.createElement('div');
      meta.className = 'action-card-meta';
      meta.textContent = `${action.duration / 1000}秒`;

      card.appendChild(info);
      card.appendChild(meta);

      card.addEventListener('click', () => {
        selectedActionId = action.id;
        els.actionPickerBtn.textContent = `${location.label} — ${action.label}`;
        renderActionList();
      });

      group.appendChild(card);
    }

    els.actionList.appendChild(group);
  }
}

function initActionPicker() {
  renderActionList();
  els.actionPickerBtn.addEventListener('click', () => {
    renderActionList();
    switchTab('view-actions');
  });
}

// ── 物語ポップアップ ──
function initStoryViewer() {
  els.storyCloseBtn.addEventListener('click', closeStory);
  els.storyOverlay.addEventListener('click', e => {
    if (e.target === els.storyOverlay) closeStory();
  });
}

// ── チュートリアル起動 ──
let _postExploreCleanup = null;
let _postExplorePending = false;

function launchTutorial() {
  resetTutorial();
  startOpeningTutorial({
    onComplete: () => {
      setTutorialDone();
      _postExplorePending = true;
    },
  });
}

function maybeStartPostExplore() {
  if (!_postExplorePending) return;
  const state = getState();
  if (state.postExploreDone) return;
  _postExplorePending = false;
  setPostExploreDone();

  if (_postExploreCleanup) { _postExploreCleanup(); _postExploreCleanup = null; }
  _postExploreCleanup = startPostExploreStory(els.mainPanel, {
    onNameDecided: (name) => {
      setPlayerName(name);
      renderCharTab(getState());
    },
    onComplete: () => {
      unlockCompanion('yuuya');
      renderCharTab(getState());
      if (_postExploreCleanup) { _postExploreCleanup(); _postExploreCleanup = null; }
    },
  });
}

// ── キャラクタータブ描画 ──
const COMPANION_DATA = {
  yuuya: { name: 'ユウヤ', desc: '記憶を失った少年。何かを探している。' },
};

function renderCharTab(state) {
  const view = document.getElementById('view-chars');
  view.innerHTML = '<div class="sub-title">キャラクター</div>';

  if (state.unlockedCompanions.length === 0) {
    const p = document.createElement('div');
    p.className = 'placeholder';
    p.textContent = '準備中';
    view.appendChild(p);
    return;
  }

  for (const id of state.unlockedCompanions) {
    const data = COMPANION_DATA[id];
    if (!data) continue;
    const card = document.createElement('div');
    card.className = 'companion-card';
    card.innerHTML = `<div class="companion-name">${data.name}</div><div class="companion-desc">${data.desc}</div>`;
    view.appendChild(card);
  }
}

function initDevTools() {
  const modeBtn = document.getElementById('dev-mode-btn');
  const modeDesc = document.getElementById('dev-mode-desc');
  const devTools = document.getElementById('dev-tools');

  modeBtn.addEventListener('click', () => {
    const next = !isDevMode();
    setDevMode(next);
    modeBtn.textContent = next ? 'ON' : 'OFF';
    modeBtn.classList.toggle('dev-btn--on', next);
    modeDesc.textContent = next ? 'ON — 探索1秒・資源追加有効' : 'OFF — 通常動作';
    devTools.style.display = next ? 'block' : 'none';
  });

  document.querySelectorAll('[data-add-resource]').forEach(btn => {
    btn.addEventListener('click', () => {
      addResources(btn.dataset.addResource, Number(btn.dataset.addAmount));
    });
  });

  document.getElementById('dev-unlock-all-stories').addEventListener('click', unlockAllStories);
  document.getElementById('dev-lock-all-stories').addEventListener('click', lockAllStories);
  document.getElementById('dev-tutorial-btn').addEventListener('click', launchTutorial);
}

export function init() {
  subscribe(render);
  const initialState = getState();
  render(initialState);
  renderCharTab(initialState);
  initTabs();
  initStoryViewer();
  initDevTools();

  if (!initialState.tutorialDone) {
    launchTutorial();
  }

  initActionPicker();

  els.actionBtn.addEventListener('click', () => {
    const active = getState().activeAction;
    if (active) {
      const action = ACTIONS[active.actionId];
      const location = LOCATIONS[action?.locationId];
      const label = location ? `${location.label} / ${action.label}` : (action?.label ?? '行動');
      if (stopFlavor) { stopFlavor(); stopFlavor = null; }
      _cancelled = true;
      cancelAction();
      addLog(`【${label}】中断`);
    } else {
      startAction(selectedActionId, {
        onRandomReward: ({ resource, amount }) => {
          addLog(`${RESOURCE_LABELS[resource] ?? resource} を ${amount} 個見つけた`);
        },
      });
    }
  });

  setInterval(tick, 100);
}
