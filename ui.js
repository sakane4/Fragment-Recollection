// ui.js — DOM操作・表示更新

import { LOCATIONS, ACTIONS, STORIES, getState, subscribe, startAction, cancelAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, setTutorialDone, setPostExploreDone, setPostExplore2Done, setFragmentHintShown, setPlayerName, unlockCompanion, setActiveCompanion, resetTutorial } from './game.js';
import { parseStoryPages } from './stories.js';
import { startFlavorScheduler } from './logs.js';
import { startOpeningTutorial, startPostExploreStory, startPostExplore2Story } from './tutorial.js';

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
function addLog(text, highlight = false, html = false) {
  const el = document.createElement('div');
  el.className = 'log-entry' + (highlight ? ' highlight' : '');
  if (html) el.innerHTML = text;
  else el.textContent = text;
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
    const actionLabel = location.label ? `${location.label} / ${action.label}` : action.label;
    addLog(`【${actionLabel}】開始`);
    els.actionPickerBtn.disabled = true;
    els.actionBtn.textContent = '中断';
    stopFlavor = startFlavorScheduler(active.actionId, text => addLog(text));
  }

  if (!active && prevActive) {
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    if (!_cancelled) {
      const action = ACTIONS[prevActive.actionId];
      const location = LOCATIONS[action.locationId];
      const hasBonus = (state.activeCompanions ?? []).length > 0;
      const rewardParts = action.rewards.map(r => {
        const label = RESOURCE_LABELS[r.resource] ?? r.resource;
        if (hasBonus) {
          return `${label} +${r.amount}<span class="log-bonus"> +${r.amount}</span>`;
        }
        return `${label} +${r.amount}`;
      });
      const rewardsHtml = rewardParts.join(', ');
      const actionLabel = location.label ? `${location.label} / ${action.label}` : action.label;
      addLog(`【${actionLabel}】完了 — ${rewardsHtml}`, true, true);
    }
    const wasCancelled = _cancelled;
    _cancelled = false;
    els.actionPickerBtn.disabled = false;
    els.actionBtn.textContent = '開始';
    els.progressBar.style.width = '0%';
    if (!wasCancelled) {
      if (_postExplorePending) {
        // render() 完了後にポスト探索ストーリー001を開始
        setTimeout(() => maybeStartPostExplore(), 0);
      } else if (!state.postExplore2Done && (state.activeCompanions ?? []).length > 0) {
        // ユウヤ同行中の初回探索完了 → ストーリー002
        setTimeout(() => maybeStartPostExplore2(state), 0);
      } else {
        // render() 完了後に startAction を呼ぶ（再帰的な notify を防ぐ）
        setTimeout(() => startAction(selectedActionId, {
          onRandomReward: ({ resource, amount }) => {
            addLog(`${RESOURCE_LABELS[resource] ?? resource} を ${amount} 個見つけた`);
          },
        }), 0);
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

  // フラグメント50個達成ヒント
  if (!state.fragmentHintShown && (state.resources.fragment ?? 0) >= 50) {
    setFragmentHintShown();
    showTabToast('.tab-btn[data-view="view-stories"]', '記憶を解放できます');
  }

  renderStoryList(state);
  renderCharTab(state);

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

    if (location.label) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'action-group-label';
      groupLabel.textContent = location.label;
      group.appendChild(groupLabel);
    }

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
        els.actionPickerBtn.textContent = location.label ? `${location.label} — ${action.label}` : action.label;
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

function maybeStartPostExplore2(state) {
  setPostExplore2Done();
  let cleanup = null;
  cleanup = startPostExplore2Story(els.mainPanel, {
    onComplete: () => {
      addLog('フラグメントをもっと集めてみよう...', false);
      if (cleanup) { cleanup(); cleanup = null; }
      // ストーリー後に自動再開
      setTimeout(() => startAction(selectedActionId, {
        onRandomReward: ({ resource, amount }) => {
          addLog(`${RESOURCE_LABELS[resource] ?? resource} を ${amount} 個見つけた`);
        },
      }), 0);
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
      addLog('【同行】ユウヤが仲間になった', true);
      renderCharTab(getState());
      if (_postExploreCleanup) { _postExploreCleanup(); _postExploreCleanup = null; }
    },
  });
}

// ── タブトースト ──
let _toastTimer = null;

function showTabToast(targetTabSelector, text) {
  const toast = document.getElementById('tab-toast');
  const tab = document.querySelector(targetTabSelector);
  if (!toast || !tab) return;

  // 既存バブルを削除
  toast.innerHTML = '';
  clearTimeout(_toastTimer);

  const bubble = document.createElement('div');
  bubble.className = 'toast-bubble';
  bubble.textContent = text;
  toast.appendChild(bubble);

  // タブの中央にバブルを位置合わせ
  const tabRect = tab.getBoundingClientRect();
  const toastRect = toast.getBoundingClientRect();
  const centerX = tabRect.left + tabRect.width / 2 - toastRect.left;
  bubble.style.left = `${centerX}px`;
  bubble.style.transform = `translateX(-50%) translateY(4px)`;

  // 表示
  requestAnimationFrame(() => {
    bubble.style.transform = `translateX(-50%) translateY(4px)`;
    requestAnimationFrame(() => bubble.classList.add('visible'));
  });

  // 3秒後にフェードアウト
  _toastTimer = setTimeout(() => {
    bubble.classList.remove('visible');
    bubble.addEventListener('transitionend', () => bubble.remove(), { once: true });
  }, 3000);
}

// ── 同行タブ描画 ──
const COMPANION_DATA = {
  yuuya: { name: 'ユウヤ', desc: '記憶を失った少年。何かを探している。' },
};

let _prevUnlockedCompanions = [];

function renderCharTab(state) {
  const view = document.getElementById('view-chars');
  view.innerHTML = '<div class="sub-title">同行</div>';

  const active = state.activeCompanions ?? [];
  const unlocked = state.unlockedCompanions ?? [];
  const bench = unlocked.filter(id => !active.includes(id));

  // ── 同行中エリア ──
  const activeSection = document.createElement('div');
  activeSection.className = 'party-section';
  const activeLabel = document.createElement('div');
  activeLabel.className = 'party-label';
  activeLabel.textContent = '同行中';
  activeSection.appendChild(activeLabel);

  // プレイヤーは常に固定表示
  const playerName = state.playerName || 'あなた';
  const playerCard = document.createElement('div');
  playerCard.className = 'companion-card companion-card--fixed';
  playerCard.innerHTML = `<div class="companion-name">${playerName}</div><div class="companion-desc">（あなた）</div>`;
  activeSection.appendChild(playerCard);

  for (const id of active) {
    const data = COMPANION_DATA[id];
    if (!data) continue;
    const card = document.createElement('div');
    card.className = 'companion-card companion-card--active';
    card.innerHTML = `<div class="companion-name">${data.name}</div><div class="companion-desc">${data.desc}</div>`;
    const btn = document.createElement('button');
    btn.className = 'companion-btn companion-btn--remove';
    btn.textContent = '外す';
    btn.addEventListener('click', () => setActiveCompanion(id, false));
    card.appendChild(btn);
    activeSection.appendChild(card);
  }

  if (active.length > 0) {
    const bonus = document.createElement('div');
    bonus.className = 'party-bonus';
    bonus.textContent = '探索報酬 ×2';
    activeSection.appendChild(bonus);
  }

  view.appendChild(activeSection);

  // ── 控えエリア ──
  const benchSection = document.createElement('div');
  benchSection.className = 'party-section';
  const benchLabel = document.createElement('div');
  benchLabel.className = 'party-label';
  benchLabel.textContent = '控え';
  benchSection.appendChild(benchLabel);

  if (bench.length === 0 && unlocked.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'party-empty';
    empty.textContent = 'まだ誰もいない';
    benchSection.appendChild(empty);
  } else if (bench.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'party-empty';
    empty.textContent = '全員が同行中';
    benchSection.appendChild(empty);
  }

  for (const id of bench) {
    const data = COMPANION_DATA[id];
    if (!data) continue;
    const card = document.createElement('div');
    card.className = 'companion-card';
    card.innerHTML = `<div class="companion-name">${data.name}</div><div class="companion-desc">${data.desc}</div>`;
    const btn = document.createElement('button');
    btn.className = 'companion-btn companion-btn--add';
    btn.textContent = '同行する';
    btn.addEventListener('click', () => setActiveCompanion(id, true));
    card.appendChild(btn);
    benchSection.appendChild(card);
  }

  view.appendChild(benchSection);

  // 新同行者解放時にトースト表示
  const newlyUnlocked = unlocked.filter(id => !_prevUnlockedCompanions.includes(id));
  if (newlyUnlocked.length > 0) {
    showTabToast('.tab-btn[data-view="view-chars"]', '同行者を選択できます');
  }
  _prevUnlockedCompanions = [...unlocked];
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
      const label = location?.label ? `${location.label} / ${action.label}` : (action?.label ?? '行動');
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
