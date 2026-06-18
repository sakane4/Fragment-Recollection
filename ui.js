// ui.js — DOM操作・表示更新

import { LOCATIONS, ACTIONS, STORIES, COMPANION_REWARDS, getState, subscribe, startAction, cancelAction, getProgress, unlockStory, unlockNextPage, forceAppearStory, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockLocation, unlockAllActions, lockAllActions, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setPlayerName, unlockCompanion, setActiveCompanion, resetTutorial, jumpToLogSt } from './game.js';
import { parseStoryPages, getCostForParagraph } from './stories.js';
import { startFlavorScheduler } from './logs.js';
import { startOpeningTutorial, runLogSt_1, runLogSt_2, runLogSt_3 } from './tutorial.js';
import { evaluateRules, resetFiredRules } from './rules.js';

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
  fragment:        'フラグメント',
  blue_fragment:   '青のフラグメント',
  red_fragment:    '赤のフラグメント',
  clear_fragment:  '無色のフラグメント',
  bubble_fragment: '泡のフラグメント',
  sky_fragment:    '空のフラグメント',
  herb:            '薬草',
};

// ── ユーティリティ ──
function actionDisplayLabel(action, sep = ' / ') {
  const loc = LOCATIONS[action.locationId];
  return loc?.label ? `${loc.label}${sep}${action.label}` : action.label;
}

function makeRandomRewardHandler() {
  return ({ resource, amount }) => {
    addLog(`<span class="log-companion-reward"><span class="log-resource">${RESOURCE_LABELS[resource] ?? resource}</span> を ${amount} 個見つけた</span>`, false, true);
  };
}

function makeCompanionRandomRewardHandler() {
  return ({ companionId, resource, amount }) => {
    const name = COMPANION_DATA[companionId]?.name ?? companionId;
    const label = RESOURCE_LABELS[resource] ?? resource;
    addLog(`<span class="log-companion-reward">${name}が <span class="log-resource-blue">${label}</span> を ${amount} 個見つけた</span>`, false, true);
  };
}

// ── ログ ──
let _logBuffer = [];
let _logPaused = false;

function addLog(text, highlight = false, html = false) {
  if (_logPaused) {
    _logBuffer.push({ text, highlight, html });
    return;
  }
  _appendLog(text, highlight, html);
}

function _appendLog(text, highlight, html) {
  const el = document.createElement('div');
  el.className = 'log-entry' + (highlight ? ' highlight' : '');
  if (html) el.innerHTML = text;
  else el.textContent = text;
  const panel = els.mainPanel;
  const atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40;
  panel.appendChild(el);
  if (atBottom) panel.scrollTop = panel.scrollHeight;
}

function pauseLog()  { _logPaused = true; }
function resumeLog() {
  _logPaused = false;
  _logBuffer.forEach(({ text, highlight, html }) => _appendLog(text, highlight, html));
  _logBuffer = [];
}

// ── 物語ビューア ──
// _viewerPages: string[][] (pages[i][j] = iページ目のj番目の段落)
let _viewerPages = [];
let _viewerStoryId = null;
let _viewerCurrentPage = 0;
let _viewerPrevUnlockedPages = 0;
const _storyPageCounts = {}; // storyId → 総段落数キャッシュ

function _saveLastPage(storyId, page) {
  try {
    const d = JSON.parse(localStorage.getItem('fr_story_lastpage') || '{}');
    d[storyId] = page;
    localStorage.setItem('fr_story_lastpage', JSON.stringify(d));
  } catch {}
}
function _loadLastPage(storyId) {
  try {
    return JSON.parse(localStorage.getItem('fr_story_lastpage') || '{}')[storyId] ?? 0;
  } catch { return 0; }
}

async function openStory(storyId, { prevProgress } = {}) {
  const story = STORIES[storyId];
  if (!story) return;

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
  _viewerCurrentPage = Math.min(_loadLastPage(storyId), pages.length - 1);
  _viewerPrevUnlockedPages = prevProgress ?? (getState().storyProgress[storyId] ?? 0);
  _storyPageCounts[storyId] = pages.reduce((s, p) => s + p.length, 0);

  els.storyViewerTitle.textContent = story.title;
  els.storyOverlay.classList.add('open');
  pauseLog();
  renderViewerBody(getState());
}

function renderViewerBody(state, { scrollToTop = false } = {}) {
  if (!_viewerStoryId) return;
  const story = STORIES[_viewerStoryId];
  const unlockedParas = state.storyProgress[_viewerStoryId] ?? 0;
  const pages = _viewerPages;
  const totalPages = pages.length;
  const totalParas = pages.reduce((s, p) => s + p.length, 0);
  const finBar = document.getElementById('story-fin-bar');

  els.storyBody.innerHTML = '';
  finBar.innerHTML = '';

  // 現ページの段落グローバル開始インデックス
  let globalOffset = 0;
  for (let p = 0; p < _viewerCurrentPage; p++) globalOffset += (pages[p] ?? []).length;

  const currentParas = pages[_viewerCurrentPage] ?? [];
  const currentCost = getCostForParagraph(story, unlockedParas);
  const costLabel = currentCost.map(c => `${RESOURCE_LABELS[c.resource] ?? c.resource} ×${c.amount}`).join(', ');
  const isNew = (idx) => idx >= _viewerPrevUnlockedPages;

  let shownCount = 0;
  for (let i = 0; i < currentParas.length; i++) {
    const globalIdx = globalOffset + i;

    if (globalIdx < unlockedParas) {
      const block = document.createElement('p');
      block.className = 'story-page' + (isNew(globalIdx) ? ' story-page-new' : '');
      block.textContent = currentParas[i];
      els.storyBody.appendChild(block);
      shownCount++;
    } else if (globalIdx === unlockedParas) {
      // 次に解放できる段落 → 思い出すボタン
      const btn = document.createElement('button');
      btn.className = 'story-next-btn';

      const CIRC = 2 * Math.PI * 14; // r=14 の円周
      const costsHtml = currentCost.map(c => {
        const have = state.resources[c.resource] ?? 0;
        const need = c.amount;
        const ratio = Math.min(have / need, 1);
        const offset = CIRC * (1 - ratio);
        const enough = have >= need;
        const ringColor = enough ? 'var(--accent)' : 'var(--muted)';
        const label = RESOURCE_LABELS[c.resource] ?? c.resource;
        return `
          <span class="memory-cost-item${enough ? ' enough' : ''}">
            <svg class="memory-ring" viewBox="0 0 36 36">
              <circle class="memory-ring-bg" cx="18" cy="18" r="14"/>
              <circle class="memory-ring-fill" cx="18" cy="18" r="14"
                stroke="${ringColor}"
                stroke-dasharray="${CIRC.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"/>
            </svg>
            <span class="memory-cost-text">
              <span class="memory-resource-name">${label}</span>
              <span class="memory-counts">${need} / ${have}</span>
            </span>
          </span>`;
      }).join('');
      btn.innerHTML = costsHtml;

      btn.addEventListener('click', () => {
        const result = unlockNextPage(_viewerStoryId);
        if (!result.ok && result.reason === 'insufficient_resources') {
          showViewerToast(`素材が足りません`);
        }
      });
      // 段落が1つも表示されていなければ先頭に挿入（別ページ頭）
      if (shownCount === 0) els.storyBody.insertBefore(btn, els.storyBody.firstChild);
      else els.storyBody.appendChild(btn);
      break;
    }
  }

  // 解放済み段落数から「表示可能なページ数」を算出
  let revealedPages = 1;
  let cumOffset = 0;
  for (let p = 0; p < totalPages - 1; p++) {
    cumOffset += pages[p].length;
    if (unlockedParas >= cumOffset) revealedPages++;
    else break;
  }

  const isLastRevealed = _viewerCurrentPage === revealedPages - 1;

  const allDone = unlockedParas >= totalParas;

  if (totalPages === 1 && allDone) {
    finBar.textContent = '— END —';
  } else if (totalPages > 1) {
    const nav = document.createElement('div');
    nav.className = 'story-nav';

    const prevLabel = document.createElement('span');
    prevLabel.className = 'story-nav-btn';
    prevLabel.textContent = '◁';
    if (_viewerCurrentPage === 0) prevLabel.style.visibility = 'hidden';

    const info = document.createElement('span');
    info.className = 'story-nav-info';
    info.textContent = `${_viewerCurrentPage + 1} / ${revealedPages}`;

    const nextLabel = document.createElement('span');
    nextLabel.className = 'story-nav-btn';
    nextLabel.textContent = '▷';
    if (isLastRevealed) {
      nextLabel.style.visibility = 'hidden';
    } else {
      const pageLastParaIdx = globalOffset + currentParas.length;
      const justUnlocked = _viewerPrevUnlockedPages < pageLastParaIdx && unlockedParas >= pageLastParaIdx;
      if (justUnlocked) nextLabel.classList.add('story-nav-btn--blink');
    }

    nav.appendChild(prevLabel);
    nav.appendChild(info);
    nav.appendChild(nextLabel);
    finBar.appendChild(nav);
  }

  _viewerPrevUnlockedPages = unlockedParas;
  if (scrollToTop) els.storyBody.scrollTop = 0;
  else els.storyBody.scrollTop = els.storyBody.scrollHeight;
}

let _viewerToastTimer = null;
function showViewerToast(text) {
  let toast = document.getElementById('viewer-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'viewer-toast';
    els.storyOverlay.querySelector('#story-viewer').appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.remove('visible');
  // 再アニメーションのためにリフロー
  void toast.offsetWidth;
  toast.classList.add('visible');
  clearTimeout(_viewerToastTimer);
  _viewerToastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

function closeStory() {
  els.storyOverlay.classList.remove('open');
  _viewerPages = [];
  _viewerStoryId = null;
  resumeLog();
  // ビューアを閉じた直後にルール評価（requireViewerClosed なルールを発火させる）
  setTimeout(() => render(getState()), 0);
}

// ── 物語リスト描画 ──
function storyIsVisible(story, state) {
  if (state.unlockedStories.includes(story.id)) return true;
  if ((state.appearedStories ?? []).includes(story.id)) return true;
  if (!story.showCondition) return false;
  const { resource, amount } = story.showCondition;
  return (state.resources[resource] ?? 0) >= amount;
}

function renderStoryList(state) {
  els.storyList.innerHTML = '';

  for (const story of Object.values(STORIES)) {
    if (!storyIsVisible(story, state)) continue;

    const unlocked = state.unlockedStories.includes(story.id);
    const appeared = !unlocked && (state.appearedStories ?? []).includes(story.id);
    const costLabel = story.unlockCost.map(c => `${RESOURCE_LABELS[c.resource] ?? c.resource} ×${c.amount}`).join(', ');

    const item = document.createElement('div');
    item.className = 'story-item';

    const info = document.createElement('div');

    const title = document.createElement('div');
    if (unlocked) {
      // 解放済み：本当のタイトル
      title.className = 'story-item-title';
      title.textContent = story.title;
    } else {
      // 出現中（未解放）：曖昧なタイトル
      title.className = 'story-item-title locked';
      title.textContent = story.lockedTitle ?? 'あいまいな記憶';
    }
    info.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'story-cost';
    if (unlocked) {
      const progress = state.storyProgress[story.id] ?? 0;
      const total = story.pageCount ?? _storyPageCounts[story.id];
      sub.textContent = total ? `${progress} / ${total}` : progress > 0 ? `${progress} / ?` : '未読';
      if (total && progress < total) {
        const nextCost = getCostForParagraph(story, progress);
        const nextCostLabel = nextCost.map(c => `${RESOURCE_LABELS[c.resource] ?? c.resource} ×${c.amount}`).join(', ');
        sub.textContent += `  ·  ${nextCostLabel}`;
      }
    } else {
      sub.textContent = `思い出す: ${costLabel}`;
    }
    info.appendChild(sub);

    item.appendChild(info);

    if (unlocked) {
      item.classList.add('unlocked');
      item.addEventListener('click', () => openStory(story.id));
    } else {
      const btn = document.createElement('button');
      btn.className = 'story-btn locked';
      btn.textContent = '思い出す';
      btn.addEventListener('click', () => {
        const result = unlockStory(story.id);
        if (result.ok) {
          openStory(story.id, { prevProgress: 0 });
        } else if (result.reason === 'insufficient_resources') {
          addLog(`フラグメントが足りません (${costLabel} 必要)`);
        }
      });
      item.appendChild(btn);
    }
    els.storyList.appendChild(item);
  }
}

// ── 状態レンダリング ──
let prevActive = null;
let prevUnlocked = [];
let prevAppearedStories = [];
let prevUnlockedLocations = [];
let prevUnlockedActions = [];
let stopFlavor = null;
let _cancelled = false;
let _isAutoRestart = false;
let _autoRestartEnabled = false; // 開発メニューからのみON可

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
    const startMsg = _isAutoRestart
      ? `さらに【${actionDisplayLabel(action)}】を続ける・・・`
      : `【${actionDisplayLabel(action)}】開始`;
    addLog(startMsg, true);
    _isAutoRestart = false;
    els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
    els.actionBtn.textContent = '中断';
    const companions = (state.activeCompanions ?? [])
      .map(id => COMPANION_DATA[id] ? { id, name: COMPANION_DATA[id].name } : null)
      .filter(Boolean);
    stopFlavor = startFlavorScheduler(active.actionId, text => addLog(text), { companions });
  }

  if (!active && prevActive) {
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    if (!_cancelled) {
      const action = ACTIONS[prevActive.actionId];
      const hasBonus = (state.activeCompanions ?? []).length > 0;
      const rewardsHtml = action.rewards.map(r => {
        const label = RESOURCE_LABELS[r.resource] ?? r.resource;
        return hasBonus
          ? `<span class="log-resource">${label}</span> +${r.amount}<span class="log-bonus"> +${r.amount}</span>`
          : `<span class="log-resource">${label}</span> +${r.amount}`;
      }).join(', ');
      // 同行者固有報酬ログ
      const companionRewardsHtml = (state.activeCompanions ?? []).flatMap(id => {
        const rewards = COMPANION_REWARDS[id];
        if (!rewards) return [];
        const companionName = COMPANION_DATA[id]?.name ?? id;
        return rewards.map(r => {
          const label = RESOURCE_LABELS[r.resource] ?? r.resource;
          return `<span class="log-companion-reward"><span class="log-resource-blue">${label}</span> +${r.amount}</span>`;
        });
      }).join(', ');
      const fullRewardsHtml = companionRewardsHtml
        ? `${rewardsHtml} / ${companionRewardsHtml}`
        : rewardsHtml;
      addLog(`【${actionDisplayLabel(action)}】完了 — ${fullRewardsHtml}`, true, true);
    }
    const wasCancelled = _cancelled;
    _cancelled = false;
    els.actionBtn.textContent = '開始';
    els.progressBar.style.width = '0%';
    const selAction = ACTIONS[selectedActionId];
    els.actionPickerBtn.textContent = selAction ? actionDisplayLabel(selAction, ' — ') : '探索';
    if (!wasCancelled) {
      if (_logStPending) {
        // render() 完了後にプロローグ解放フェーズへ
        setTimeout(() => startProloguePhase(), 0);
      } else if (state.logSt1Done && !state.logSt2Done && (state.activeCompanions ?? []).length > 0) {
        setTimeout(() => startLogSt_2(state), 0);
      } else if (_autoRestartEnabled) {
        // 自動再開(開発メニューでONのときのみ)
        setTimeout(() => {
          if (_storyLogPlaying) return;
          _isAutoRestart = true;
          startAction(selectedActionId, { onRandomReward: makeRandomRewardHandler(), onCompanionRandomReward: makeCompanionRandomRewardHandler() });
        }, 0);
      }
    }
  }


  for (const id of (state.appearedStories ?? [])) {
    if (!prevAppearedStories.includes(id)) {
      const story = STORIES[id];
      if (!story) continue;
      addLog(`【記憶】「${story.lockedTitle ?? 'あいまいな記憶'}」を思い出せそうだ`, true);
    }
  }
  prevAppearedStories = [...(state.appearedStories ?? [])];

  for (const id of state.unlockedStories) {
    if (!prevUnlocked.includes(id)) {
      if (!STORIES[id]) continue;
      addLog(`【記憶】「${STORIES[id].title}」を解放しました`, true);
    }
  }

  for (const id of state.unlockedLocations) {
    if (!prevUnlockedLocations.includes(id) && LOCATIONS[id]?.label) {
      addLog(`【発見】新しい場所「${LOCATIONS[id].label}」を見つけた`, true);
    }
  }
  for (const id of state.unlockedActions) {
    if (!prevUnlockedActions.includes(id)) {
      const action = ACTIONS[id];
      const location = LOCATIONS[action.locationId];
      const msg = location?.label
        ? `${location.label} で「${action.label}」ができるようになった`
        : `「${action.label}」ができるようになった`;
      addLog(msg, true);
    }
  }

  prevActive = active;
  prevUnlocked = [...state.unlockedStories];
  prevUnlockedLocations = [...state.unlockedLocations];
  prevUnlockedActions = [...state.unlockedActions];

renderStoryList(state);
  renderCharTab(state);

  // ビューアが開いていればページ表示を更新
  if (_viewerStoryId) renderViewerBody(state);

  // アンロックルール評価
  evaluateRules(state, {
    viewerOpen: _viewerStoryId !== null,
    storyLogPlaying: _storyLogPlaying,
    startLogSt_1,
    startLogSt_2: () => startLogSt_2(state),
    startLogSt_3,
    unlockLocation,
    forceAppearStory,
  });
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
let selectedActionId = 'explore';

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

      // カードタップ → 選択のみ
      card.addEventListener('click', (e) => {
        if (e.target.closest('.action-start-btn')) return;
        selectedActionId = action.id;
        if (!getState().activeAction) {
          els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
        }
        renderActionList();
      });

      // 開始ボタン → 現在の行動を中断して即開始
      const startBtn = document.createElement('button');
      startBtn.className = 'action-start-btn';
      startBtn.textContent = '開始';
      startBtn.addEventListener('click', () => {
        const running = getState().activeAction;
        if (running) {
          const curAction = ACTIONS[running.actionId];
          if (stopFlavor) { stopFlavor(); stopFlavor = null; }
          _cancelled = true;
          cancelAction();
          addLog(`【${actionDisplayLabel(curAction)}】中断`, true);
        }
        selectedActionId = action.id;
        els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
        renderActionList();
        switchTab('view-items');
        if (!_storyLogPlaying) startAction(action.id, { onRandomReward: makeRandomRewardHandler(), onCompanionRandomReward: makeCompanionRandomRewardHandler() });
      });
      card.appendChild(startBtn);

      group.appendChild(card);
    }

    els.actionList.appendChild(group);
  }
}

function initActionPicker() {
  renderActionList();
  els.actionPickerBtn.addEventListener('click', () => {
    if (_storyLogPlaying) { els.mainPanel.click(); return; }
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

  document.getElementById('story-fin-bar').addEventListener('click', e => {
    if (!_viewerStoryId) return;
    if (e.target.closest('.story-nav-btn')) return;
    const bar = e.currentTarget;
    const isRight = e.clientX - bar.getBoundingClientRect().left > bar.offsetWidth / 2;
    if (isRight) {
      const pages = _viewerPages;
      // revealedPages を再計算
      const state = getState();
      const unlockedParas = state.storyProgress[_viewerStoryId] ?? 0;
      let revealedPages = 1, cum = 0;
      for (let p = 0; p < pages.length - 1; p++) {
        cum += pages[p].length;
        if (unlockedParas >= cum) revealedPages++; else break;
      }
      if (_viewerCurrentPage < revealedPages - 1) {
        _viewerCurrentPage++;
        _saveLastPage(_viewerStoryId, _viewerCurrentPage);
        renderViewerBody(state, { scrollToTop: true });
      }
    } else {
      if (_viewerCurrentPage > 0) {
        _viewerCurrentPage--;
        _saveLastPage(_viewerStoryId, _viewerCurrentPage);
        renderViewerBody(getState(), { scrollToTop: true });
      }
    }
  });
}

// ── チュートリアル起動 ──
let _logStCleanup = null;
let _logStPending = false;
let _storyLogPlaying = false; // ストーリーログ再生中フラグ
let _waitingForPrologue = false;

function launchTutorial() {
  resetTutorial();
  startOpeningTutorial({
    onComplete: () => {
      setTutorialDone();
      _logStPending = true; // 初回探索完了を待つフラグ
    },
  });
}

// 初回探索完了 → プロローグを強制解放して待機
function startProloguePhase() {
  if (!_logStPending) return;
  _logStPending = false;
  _waitingForPrologue = true;
  forceAppearStory('prologue');
  showTabToast('.tab-btn[data-view="view-stories"]', '記憶を解放できます');
}

function startLogSt_2(state) {
  setLogSt2Done();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runLogSt_2(els.mainPanel, {
    onComplete: () => {
      _storyLogPlaying = false;
      addLog('フラグメントをもっと集めてみよう...', false);
      if (cleanup) { cleanup(); cleanup = null; }
      render(getState());
    },
  });
}

function startLogSt_1() {
  const state = getState();
  if (state.logSt1Done) return;
  _waitingForPrologue = false;
  setLogSt1Done();
  _storyLogPlaying = true;

  if (_logStCleanup) { _logStCleanup(); _logStCleanup = null; }
  _logStCleanup = runLogSt_1(els.mainPanel, {
    onNameDecided: (name) => {
      setPlayerName(name);
      renderCharTab(getState());
    },
    onComplete: () => {
      _storyLogPlaying = false;
      unlockCompanion('yuuya');
      addLog('【同行】ユウヤが仲間になった', true);
      if (_logStCleanup) { _logStCleanup(); _logStCleanup = null; }
      render(getState());
    },
  });
}

function startLogSt_3() {
  const state = getState();
  if (state.logSt3Done) return;
  setLogSt3Done();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runLogSt_3(els.mainPanel, {
    onComplete: () => {
      _storyLogPlaying = false;
      if (cleanup) { cleanup(); cleanup = null; }
      render(getState());
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
  yuuya:  { name: 'ユウヤ', desc: '記憶を失った少年。何かを探している。' },
  rabi:   { name: 'ラビ',   desc: '盲目の剣士。' },
  shizuku:{ name: 'シズク', desc: '寡黙な青年。' },
  kaoru:  { name: 'カオル', desc: 'いつも笑顔のお姉さん。' },
  yukika: { name: '雪架',   desc: 'なにか秘密を知っているようだ。' },
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
    btn.textContent = '別行動';
    btn.addEventListener('click', () => setActiveCompanion(id, false));
    card.appendChild(btn);
    activeSection.appendChild(card);
  }

  if (active.length > 0) {
    const bonusLines = ['探索報酬 ×2'];
    for (const id of active) {
      const rewards = COMPANION_REWARDS[id];
      if (!rewards) continue;
      for (const r of rewards) {
        const discovered = (state.discoveredResources ?? []).includes(r.resource);
        const label = discovered ? `${RESOURCE_LABELS[r.resource] ?? r.resource} ` : '???';
        bonusLines.push(label);
      }
    }
    const bonus = document.createElement('div');
    bonus.className = 'party-bonus';
    bonus.innerHTML = bonusLines.map((line, i) =>
      i === 0 ? line : `<span class="party-bonus-extra">${line}</span>`
    ).join('<span class="party-bonus-sep"> / </span>');
    activeSection.appendChild(bonus);
  }

  view.appendChild(activeSection);

  // ── 控えエリア ──
  const benchSection = document.createElement('div');
  benchSection.className = 'party-section';
  const benchLabel = document.createElement('div');
  benchLabel.className = 'party-label';
  benchLabel.textContent = '別行動';
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
    modeDesc.textContent = next ? 'ON — 探索1秒' : 'OFF — 通常速度';
  });

  document.querySelectorAll('[data-add-resource]').forEach(btn => {
    btn.addEventListener('click', () => {
      addResources(btn.dataset.addResource, Number(btn.dataset.addAmount));
    });
  });

  document.getElementById('dev-unlock-all-stories').addEventListener('click', unlockAllStories);
  document.getElementById('dev-lock-all-stories').addEventListener('click', lockAllStories);
  document.getElementById('dev-unlock-all-actions').addEventListener('click', unlockAllActions);
  document.getElementById('dev-lock-all-actions').addEventListener('click', lockAllActions);

  document.getElementById('dev-unlock-all-companions').addEventListener('click', () => {
    Object.keys(COMPANION_DATA).forEach(id => unlockCompanion(id));
  });

  [1, 2, 3].forEach(n => {
    document.getElementById(`dev-log-story-${n}`).addEventListener('click', () => {
      jumpToLogSt(n);
      const fns = [null, runLogSt_1, runLogSt_2, runLogSt_3];
      fns[n](els.mainPanel, {
        onNameDecided: n === 1 ? (name) => { setPlayerName(name); } : undefined,
        onComplete: n === 1
          ? () => { setLogSt1Done(); }
          : n === 2
          ? () => { setLogSt2Done(); }
          : () => { setLogSt3Done(); unlockLocation('forest', ['forest_explore']); },
      });
    });
  });

  const autoRestartBtn = document.getElementById('dev-auto-restart-btn');
  autoRestartBtn.addEventListener('click', () => {
    _autoRestartEnabled = !_autoRestartEnabled;
    autoRestartBtn.textContent = _autoRestartEnabled ? 'ON' : 'OFF';
    autoRestartBtn.classList.toggle('dev-btn--on', _autoRestartEnabled);
  });
}

export function init() {
  subscribe(render);
  const initialState = getState();
  render(initialState);
  initTabs();
  initStoryViewer();
  initDevTools();

  if (!initialState.tutorialDone) {
    launchTutorial();
  }

  initActionPicker();

  els.actionBtn.addEventListener('click', () => {
    if (_storyLogPlaying) { els.mainPanel.click(); return; }
    const active = getState().activeAction;
    if (active) {
      const action = ACTIONS[active.actionId];
      const label = action ? actionDisplayLabel(action) : '行動';
      if (stopFlavor) { stopFlavor(); stopFlavor = null; }
      _cancelled = true;
      cancelAction();
      addLog(`【${label}】中断`, true);
    } else {
      if (!_storyLogPlaying) startAction(selectedActionId, { onRandomReward: makeRandomRewardHandler(), onCompanionRandomReward: makeCompanionRandomRewardHandler() });
    }
  });

  setInterval(tick, 100);
}
