// ui.js — DOM操作・表示更新

import { LOCATIONS, ACTIONS, FACILITIES, getShopItems, buyShopItem, STORIES, COMPANION_REWARDS, COMPANION_RELICS, EQUIP_BONUS, WORLD_LV_THRESHOLDS, getLocationLvCost, LOCATION_LV_MAX, DISCOVERY_LABELS, DISCOVERY_STEP_LV, NOSTALGIA_FACILITIES, ELV_MAX, ELV_COSTS, BOND_LV_MAX, BOND_LV_COSTS, GIFT_ITEMS, giveGift, COMPANION_SKILLS, COMPANION_TRAITS, levelUpCompanion, startFragmentConvert, startObservatoryResearch, getCompanionTaskProgress, FRAGMENT_CONVERT_MS_PER_UNIT, UNIQUE_FRAGMENTS, getPendingDiscovery, resolveDiscovery, getLocationLvCap, levelUpLocation, getState, subscribe, notify, startAction, restoreActiveActionCallbacks, cancelAction, pauseAction, resumeAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockQuest, activateQuest, turnInQuest, completeStoryQuest, unlockAllStories, lockAllStories, unlockLocation, unlockAction, unlockAllActions, lockAllActions, unlockGuide, unlockWorldChronicle, markFlowerClerkTalkSeen, setAllCompanionsMetDone, setAutoRepeat, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setLogSt4Done, setPlayerName, unlockCompanion, setCompanionLevel, setCompanionEquipment, revealStoryTitle, setActiveCompanion, setActiveCompanions, resetTutorial, jumpToLogSt, forceAppearStory, resetQuestsAndFacilities, setCompanionTutorialDone, setSelectedActionId } from './game.js';
import { WORLD_CHRONICLE_ENTRIES } from './chronicles/world.js';
import { parseStoryPages, parseStoryCostOverrides, setStoryCostMap, getCostForParagraph, parseMilestones, setStoryMilestoneMap } from './stories.js';
import { createLogManager, startFlavorScheduler } from './logs.js';
import { startOpeningTutorial, runLogSt_1, runLogSt_2, runLogSt_3, runLogSt_4, runWorldChronicleIntro, runAllCompanionsMet, runLocationChoice, runCompanionJoin, runFlowerShopDiscovery, runLostFlowersIntro, runFacilityMenu, runNostalgiaDiscovery, runStarlitObservatoryDiscovery } from './scenario.js';
import { evaluateRules, resetFiredRules } from './rules.js';
import { getActiveGuides } from './guides.js';
import { QUEST_STATUS, getQuestDefinition, getQuestStatus, getQuestProgress, getQuestTaskProgress, getChildQuests, getVisibleQuests } from './quests.js';
import { RESOURCES, RESOURCE_CATEGORY_ORDER, RESOURCE_CATEGORY_LABELS, resLabel, resColor, resCategory, resUnit, resourceSpan, resourceLog, maskedResLabel, formatCostLabel } from './resource.js';
import { COMPANION_DATA, createCompanionTabRenderer } from './companion-ui.js';
import { CONSTELLATIONS } from './constellations.js';
import { FLOWERS } from './flowers.js';

const DEFAULT_LOCKED_TITLE = 'あいまいな記憶';

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
  storyModeToggleBtn: document.getElementById('story-mode-toggle-btn'),
};

const {
  addLog,
  addTutorialLog,
  resetTutorialLogs,
  pauseLog,
  resumeLog,
  restoreLogHistory,
} = createLogManager(els.mainPanel);

// 記憶ビューアの表示モード: false=ページ送り / true=スクロール(-----区切りを無視)
let _viewerScrollMode = (() => {
  try { return localStorage.getItem('fr_viewer_scrollmode') === '1'; }
  catch { return false; }
})();

// 既読(リストに表示済みとして確認済み)の記憶ID集合。新着通知の判定に使う。
// null = 未初期化(初回レンダリングで現在の可視記憶を既読としてシードする)
let _seenStories = (() => {
  try {
    const raw = localStorage.getItem('fr_seen_stories');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return null;
})();
function _persistSeen() {
  try { localStorage.setItem('fr_seen_stories', JSON.stringify([...(_seenStories ?? [])])); } catch {}
}

// 既読(地図タブで確認済み)の場所・行動(施設含む)ID集合。新着通知の判定に使う。
// null = 未初期化(初回レンダリングで現在の解放済み一覧を既読としてシードする)
let _seenDiscoveries = (() => {
  try {
    const raw = localStorage.getItem('fr_seen_discoveries');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return null;
})();
function _persistSeenDiscoveries() {
  try { localStorage.setItem('fr_seen_discoveries', JSON.stringify([...(_seenDiscoveries ?? [])])); } catch {}
}

// 場所/行動(施設含む)に新着(未確認)の解放があるか
function _hasNewDiscovery(state) {
  if (!_seenDiscoveries) return false;
  return state.unlockedLocations.some(id => !_seenDiscoveries.has(id))
    || state.unlockedActions.some(id => !_seenDiscoveries.has(id));
}

// 地図タブ(フッター)の新着バッジを更新
function _updateActionsBadge(state) {
  const badge = document.getElementById('actions-tab-badge');
  if (!badge) return;
  badge.hidden = !_hasNewDiscovery(state);
}

// 現在解放済みの場所/行動をすべて既読にする(地図タブを開いたときに呼ぶ)
function _markDiscoveriesSeen(state) {
  if (!_seenDiscoveries) _seenDiscoveries = new Set();
  let changed = false;
  for (const id of [...state.unlockedLocations, ...state.unlockedActions]) {
    if (!_seenDiscoveries.has(id)) { _seenDiscoveries.add(id); changed = true; }
  }
  if (changed) {
    _persistSeenDiscoveries();
    _updateActionsBadge(state);
  }
}

// 解放済み段落数(unlockedParas)から「表示可能なページ数」を算出
function computeRevealedPages(pages, unlockedParas) {
  let revealedPages = 1;
  let cumOffset = 0;
  for (let p = 0; p < pages.length - 1; p++) {
    cumOffset += pages[p].length;
    if (unlockedParas >= cumOffset) revealedPages++;
    else break;
  }
  return revealedPages;
}

function companionLvTagHtml(level) {
  return level > 0 ? ` <span class="companion-lv">Lv ${level}</span>` : '';
}

// ── ユーティリティ ──
function placeNameHtml(label) {
  return `<span class="place-name">${label}</span>`;
}

function actionNameHtml(label) {
  return `<span class="action-name">${label}</span>`;
}

function actionDisplayHtml(action, sep = ' / ') {
  const loc = LOCATIONS[action.locationId];
  const actionLabel = FACILITIES[action.id] ? placeNameHtml(action.label) : actionNameHtml(action.label);
  return loc?.label ? `${placeNameHtml(loc.label)}${sep}${actionLabel}` : actionLabel;
}

function setActionPickerLabel(action, sep = ' — ') {
  const label = action ? actionDisplayHtml(action, sep) : actionNameHtml('探索');
  els.actionPickerBtn.innerHTML = `<span class="action-picker-label">${label}</span>`;
}

function makeRandomRewardHandler(actionId) {
  return ({ resource, amount }) => {
    if (RESOURCES[resource]?.highlight) {
      addLog(`【！】${resourceSpan(resource, resLabel(resource))} +${amount} を入手した`, true, true, false, 'log-rare');
    } else {
      addLog(`<span class="log-companion-reward">${resourceLog(resource, amount, actionId)}</span>`, false, true);
    }
    const recordEntry = Object.entries(WORLD_CHRONICLE_ENTRIES)
      .find(([, entry]) => entry.recordResource === resource);
    if (!recordEntry) return;
    const [locationId, entry] = recordEntry;
    if ((getState().resources[resource] ?? 0) === entry.required) {
      addLog(`【大陸誌】${LOCATIONS[locationId]?.label ?? locationId}の記録が復元された`, true);
    }
  };
}

let _pendingCompanionRewards = new Map();
const COMPANION_LOG_MODE_KEY = 'fr_companion_log_mode';
let _companionLogMode = (() => {
  try { return localStorage.getItem(COMPANION_LOG_MODE_KEY) || 'detailed'; }
  catch { return 'detailed'; }
})();

function _resetPendingCompanionRewards() {
  _pendingCompanionRewards = new Map();
}

function makeCompanionRandomRewardHandler(actionId) {
  return ({ companionId, resource, amount }) => {
    if (_companionLogMode === 'detailed') {
      const name = COMPANION_DATA[companionId]?.name ?? companionId;
      addLog(`<span class="log-companion-reward">${name}が${resourceLog(resource, amount, actionId)}</span>`, false, true);
      return;
    }
    _pendingCompanionRewards.set(
      resource,
      (_pendingCompanionRewards.get(resource) ?? 0) + amount,
    );
  };
}

function makeActionCallbacks(actionId) {
  return {
    onRandomReward: makeRandomRewardHandler(actionId),
    onCompanionRandomReward: makeCompanionRandomRewardHandler(actionId),
    onComplete: (result) => _handleActionComplete(actionId, result),
    onEncounter: (result) => _handleEncounter(actionId, result),
  };
}

// ── 物語ビューア ──
// _viewerPages: string[][] (pages[i][j] = iページ目のj番目の段落)
let _viewerPages = [];
let _viewerStoryId = null;

function _setViewerTitle(text) {
  const el = els.storyViewerTitle;
  if (el.textContent === text) return;
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 1000);
}

// ビューアを開いた直後の初期表示用。タイトル復元時のフェード切替とは違い、アニメーションさせない
function _setViewerTitleImmediate(text) {
  const el = els.storyViewerTitle;
  el.textContent = text;
  el.style.opacity = '1';
}
let _viewerCurrentPage = 0;
let _viewerPrevUnlockedPages = 0;
let _viewerFadeUpTo = 0;
// ビューアの開閉・記憶切り替えのたびに+1する。_viewerFadeUpToの遅延更新(setTimeout)が、
// 発火する前に別の記憶に切り替わっていた場合に古い値で上書きしてしまうのを防ぐため
let _viewerSession = 0;
let _viewerRenderedParas = -1; // 直近レンダリング時の解放段落数(スクロール位置維持の判定用)
const _storyPageCounts = {}; // storyId → 総段落数キャッシュ

// storyId → 値 のマップをlocalStorageに保存する共通ヘルパー(ページ番号・スクロール位置などで共用)
function _saveStoryMapValue(key, storyId, value) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || '{}');
    d[storyId] = value;
    localStorage.setItem(key, JSON.stringify(d));
  } catch {}
}
function _loadStoryMapValue(key, storyId, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')[storyId] ?? fallback;
  } catch { return fallback; }
}

const _saveLastPage = (storyId, page) => _saveStoryMapValue('fr_story_lastpage', storyId, page);
const _loadLastPage = (storyId) => _loadStoryMapValue('fr_story_lastpage', storyId, 0);
// スクロールモード用: 記憶ごとのスクロール位置(px)を保存
const _saveScrollPos = (storyId, top) => _saveStoryMapValue('fr_story_scrollpos', storyId, top);
const _loadScrollPos = (storyId) => _loadStoryMapValue('fr_story_scrollpos', storyId, 0);

// 記憶本文(story.body)は静的データなので、storyIdごとに一度パースした結果を再利用する
// (同じ記憶を開き直すたびに本文全体を正規表現で再分割していたのを防ぐ)
const _parsedStoryCache = new Map(); // storyId -> { pages, costMap }

function openStory(storyId, { prevProgress } = {}) {
  const story = STORIES[storyId];
  if (!story) return;

  let parsed = _parsedStoryCache.get(storyId);
  if (!parsed) {
    const text = story.body ?? '';
    parsed = { pages: parseStoryPages(text), costMap: parseStoryCostOverrides(text), milestoneMap: parseMilestones(text) };
    _parsedStoryCache.set(storyId, parsed);
  }
  const pages = parsed.pages;
  setStoryCostMap(storyId, parsed.costMap);
  setStoryMilestoneMap(storyId, parsed.milestoneMap);

  if (pages.length === 0) {
    addLog('【エラー】この記憶にはまだ本文がありません');
    return;
  }

  _viewerSession++;
  _viewerPages = pages;
  _viewerStoryId = storyId;
  _viewerCurrentPage = Math.min(_loadLastPage(storyId), pages.length - 1);
  _viewerPrevUnlockedPages = prevProgress ?? (getState().storyProgress[storyId] ?? 0);
  _viewerFadeUpTo = _viewerPrevUnlockedPages;
  _viewerRenderedParas = _viewerPrevUnlockedPages; // 開いた直後は先頭表示(段落増加扱いにしない)
  _storyPageCounts[storyId] = pages.reduce((s, p) => s + p.length, 0);

  const _titleRevealed = !!(getState().titleRevealed ?? {})[storyId];
  _setViewerTitleImmediate(_titleRevealed ? story.title : (story.lockedTitle ?? DEFAULT_LOCKED_TITLE));
  els.storyOverlay.classList.add('open');
  pauseLog();
  // スクロールモードでは前回閉じた位置を復元(0なら先頭でよいのでscrollToTopで十分)
  const savedScrollTop = _viewerScrollMode ? _loadScrollPos(storyId) : 0;
  if (savedScrollTop > 0) renderViewerBody(getState(), { scrollTopOverride: savedScrollTop });
  else renderViewerBody(getState(), { scrollToTop: true });
}

function _checkPageLevelUp(storyId, prevProgress) {
  const story = STORIES[storyId];
  if (!story?.companionId) return;
  const pages = _viewerPages;
  const newProgress = getState().storyProgress[storyId] ?? 0;
  let cum = 0;
  for (const page of pages) {
    cum += page.length;
    if (prevProgress < cum && newProgress >= cum) {
      const companionId = story.companionId;
      const currentLevel = getState().ELv[companionId] ?? 0;
      const newLevel = currentLevel + 1;
      setCompanionLevel(companionId, newLevel);
      const name = COMPANION_DATA[companionId]?.name ?? companionId;
      addLog(`【同行者】${name}の存在が少し安定した (Lv ${newLevel})`, true);
    }
  }
}

// 「次の段落を思い出す」ボタン(コストリング付き)を生成
function _buildUnlockButton(currentCost, state) {
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
    const label = maskedResLabel(c.resource, state);
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
    const prevProgress = getState().storyProgress[_viewerStoryId] ?? 0;
    const result = unlockNextPage(_viewerStoryId);
    if (!result.ok && result.reason === 'insufficient_resources') {
      showViewerToast(`素材が足りません`);
    } else if (result.ok) {
      _checkPageLevelUp(_viewerStoryId, prevProgress);
    }
  });
  return btn;
}

// 「(lockedTitle)を思い出す」タイトル復元ボタンを生成
function _buildTitleRevealBtn(story) {
  const revealBtn = document.createElement('button');
  revealBtn.className = 'story-title-reveal-btn';
  revealBtn.textContent = `「${story.lockedTitle ?? DEFAULT_LOCKED_TITLE}」を思い出す`;
  revealBtn.addEventListener('click', () => {
    revealStoryTitle(_viewerStoryId);
  });
  return revealBtn;
}

function renderViewerBody(state, { scrollToTop = false, scrollTopOverride = null } = {}) {
  if (!_viewerStoryId) return;
  const story = STORIES[_viewerStoryId];
  const unlockedParas = state.storyProgress[_viewerStoryId] ?? 0;
  const pages = _viewerPages;
  const totalPages = pages.length;
  const totalParas = pages.reduce((s, p) => s + p.length, 0);
  const finBar = document.getElementById('story-fin-bar');

  // innerHTML クリアでスクロール位置が失われるので事前に退避
  const _prevScrollTop = els.storyBody.scrollTop;
  els.storyBody.innerHTML = '';
  finBar.innerHTML = '';

  const allDone = unlockedParas >= totalParas;
  const titleAlreadyRevealed = !!(state.titleRevealed ?? {})[_viewerStoryId];
  const isNew = (idx) => idx >= _viewerFadeUpTo;

  if (_viewerScrollMode) {
    // ── スクロールモード: -----区切りを無視し、解放済み段落を一続きに表示 ──
    const allParas = [];
    for (const page of pages) for (const para of page) allParas.push(para);
    for (let i = 0; i < allParas.length; i++) {
      if (i < unlockedParas) {
        const block = document.createElement('p');
        block.className = 'story-page' + (isNew(i) ? ' story-page-new' : '');
        block.textContent = allParas[i];
        els.storyBody.appendChild(block);
      } else if (i === unlockedParas) {
        els.storyBody.appendChild(_buildUnlockButton(getCostForParagraph(story, unlockedParas), state));
        break;
      }
    }
    if (allDone && !titleAlreadyRevealed) {
      els.storyBody.appendChild(_buildTitleRevealBtn(story));
    }
    if (allDone) {
      // ENDは本文の最下層に表示
      const end = document.createElement('div');
      end.className = 'story-scroll-end';
      end.textContent = '— END —';
      els.storyBody.appendChild(end);
    }
  } else {
    // ── ページモード: _viewerCurrentPage のページのみ表示し、◁▷でページ送り ──
    let globalOffset = 0;
    for (let p = 0; p < _viewerCurrentPage; p++) globalOffset += (pages[p] ?? []).length;

    const currentParas = pages[_viewerCurrentPage] ?? [];
    const currentCost = getCostForParagraph(story, unlockedParas);

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
        const btn = _buildUnlockButton(currentCost, state);
        // 段落が1つも表示されていなければ先頭に挿入（別ページ頭）
        if (shownCount === 0) els.storyBody.insertBefore(btn, els.storyBody.firstChild);
        else els.storyBody.appendChild(btn);
        break;
      }
    }

    if (allDone && !titleAlreadyRevealed) {
      const onLastPage = globalOffset + currentParas.length >= totalParas;
      if (onLastPage) els.storyBody.appendChild(_buildTitleRevealBtn(story));
    }

    const revealedPages = computeRevealedPages(pages, unlockedParas);
    const isLastRevealed = _viewerCurrentPage === revealedPages - 1;

    if (totalPages === 1 && allDone) {
      const end = document.createElement('span');
      end.textContent = '— END —';
      finBar.appendChild(end);
    } else if (totalPages > 1) {
      const nav = document.createElement('div');
      nav.className = 'story-nav';

      const prevLabel = document.createElement('span');
      prevLabel.className = 'story-nav-btn';
      prevLabel.textContent = '◁';
      if (_viewerCurrentPage === 0) {
        prevLabel.style.visibility = 'hidden';
      } else {
        prevLabel.addEventListener('click', () => {
          if (_viewerCurrentPage > 0) {
            _viewerCurrentPage--;
            _saveLastPage(_viewerStoryId, _viewerCurrentPage);
            renderViewerBody(getState(), { scrollToTop: true });
          }
        });
      }

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
        nextLabel.addEventListener('click', () => {
          const st = getState();
          const up = st.storyProgress[_viewerStoryId] ?? 0;
          const rp = computeRevealedPages(_viewerPages, up);
          if (_viewerCurrentPage < rp - 1) {
            _viewerCurrentPage++;
            _viewerPrevUnlockedPages = up;
            _viewerFadeUpTo = up;
            _saveLastPage(_viewerStoryId, _viewerCurrentPage);
            renderViewerBody(st, { scrollToTop: true });
          }
        });
      }

      nav.appendChild(prevLabel);
      nav.appendChild(info);
      nav.appendChild(nextLabel);
      finBar.appendChild(nav);
    }
  }

  // 同一アクション内で複数回 renderViewerBody が呼ばれても(例: 同行者Lvアップ通知による再レンダリング)
  // 新規解放ブロックのフェード判定がブレないよう、更新を次フレームへ遅延させる
  const _fadeTarget = Math.max(_viewerFadeUpTo, unlockedParas);
  if (_fadeTarget !== _viewerFadeUpTo) {
    const _fadeSession = _viewerSession;
    setTimeout(() => {
      // 発火するまでにビューアが閉じられた/別の記憶に切り替わっていたら適用しない
      if (_viewerSession !== _fadeSession) return;
      _viewerFadeUpTo = Math.max(_viewerFadeUpTo, _fadeTarget);
    }, 0);
  }
  const _st = getState();
  const _sv = STORIES[_viewerStoryId];
  if (_sv) {
    const _tr = !!(_st.titleRevealed ?? {})[_viewerStoryId];
    _setViewerTitle(_tr ? _sv.title : (_sv.lockedTitle ?? DEFAULT_LOCKED_TITLE));
  }

  // スクロール位置: 復元指定があればそこへ、明示的な先頭指定なら先頭、
  // 新たに段落が解放されたときは最下部、それ以外(ログ更新などによる再描画)は元の位置を維持する
  const _grew = unlockedParas > _viewerRenderedParas;
  if (scrollTopOverride != null) els.storyBody.scrollTop = scrollTopOverride;
  else if (scrollToTop) els.storyBody.scrollTop = 0;
  else if (_grew) els.storyBody.scrollTop = els.storyBody.scrollHeight;
  else els.storyBody.scrollTop = _prevScrollTop;
  _viewerRenderedParas = unlockedParas;
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
  if (_viewerScrollMode && _viewerStoryId) _saveScrollPos(_viewerStoryId, els.storyBody.scrollTop);
  _viewerSession++;
  els.storyOverlay.classList.remove('open');
  _viewerPages = [];
  _viewerStoryId = null;
  _viewerPrevUnlockedPages = 0;
  _viewerFadeUpTo = 0;
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

// ── 通知判定 ──
function _canAfford(cost, state) {
  return (cost ?? []).every(c => (state.resources[c.resource] ?? 0) >= c.amount);
}

// 「いま操作できる」記憶か(解放済みで次ページが買える / 未解放だが思い出せる)
function _storyIsUpdatable(story, state) {
  if (state.unlockedStories.includes(story.id)) {
    const progress = state.storyProgress[story.id] ?? 0;
    const total = _storyPageCounts[story.id] ?? story.pageCount ?? 0;
    if (total && progress >= total) return false;
    return _canAfford(getCostForParagraph(story, progress), state);
  }
  if (storyIsVisible(story, state)) return _canAfford(story.unlockCost, state);
  return false;
}

// 新着(リストに出たがまだ確認していない)記憶か
function _storyIsNew(story, state) {
  return !!_seenStories && storyIsVisible(story, state) && !_seenStories.has(story.id);
}

function _storyIsNotable(story, state) {
  return _storyIsNew(story, state) || _storyIsUpdatable(story, state);
}

// 場所のLocationLvを今すぐ上げられるか(worldLv上限・最大Lv・フラグメント所持で判定)
function _canLevelUpLocation(locationId, state) {
  const lv = state.LocationLv?.[locationId] ?? 0;
  if (lv >= LOCATION_LV_MAX) return false;
  if (lv >= getLocationLvCap()) return false;
  return (state.resources.fragment ?? 0) >= getLocationLvCost(locationId, lv);
}

// 現在見えている記憶をすべて既読にする(記憶タブを開いたときに呼ぶ)
function _markStoriesSeen(state) {
  if (!_seenStories) _seenStories = new Set();
  let changed = false;
  for (const s of Object.values(STORIES)) {
    if (storyIsVisible(s, state) && !_seenStories.has(s.id)) { _seenStories.add(s.id); changed = true; }
  }
  if (changed) {
    _persistSeen();
    renderStoryList(state);
    _updateStoriesBadge(state);
  }
}

// 記憶タブ(フッター)の新着バッジを更新
function _updateStoriesBadge(state) {
  const badge = document.getElementById('stories-tab-badge');
  if (!badge) return;
  const anyNotable = Object.values(STORIES).some(s => _storyIsNotable(s, state));
  badge.hidden = !anyNotable;
}

function _buildStoryItem(story, state) {
  const unlocked = state.unlockedStories.includes(story.id);
    const appeared = !unlocked && (state.appearedStories ?? []).includes(story.id);
    const costLabel = formatCostLabel(story.unlockCost, state);

    const item = document.createElement('div');
    item.className = 'story-item';

    const info = document.createElement('div');

    const title = document.createElement('div');
    const fullyRead = !!(state.titleRevealed ?? {})[story.id];
    if (fullyRead) {
      title.className = 'story-item-title';
      title.textContent = story.title;
    } else {
      title.className = 'story-item-title locked';
      title.textContent = story.lockedTitle ?? DEFAULT_LOCKED_TITLE;
    }
    // 新着 or 更新可能なら通知ドット
    if (_storyIsNotable(story, state)) {
      const dot = document.createElement('span');
      dot.className = 'notify-dot';
      title.prepend(dot);
    }
    info.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'story-cost';
    if (unlocked) {
      const progress = state.storyProgress[story.id] ?? 0;
      const total = _storyPageCounts[story.id] ?? story.pageCount;
      sub.textContent = total ? `${progress} / ${total}` : progress > 0 ? `${progress} / ?` : '未読';
      if (total && progress < total) {
        const nextCost = getCostForParagraph(story, progress);
        const nextCostLabel = formatCostLabel(nextCost, state);
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
      const openBtn = document.createElement('button');
      openBtn.className = 'story-open-btn';
      openBtn.textContent = '▷';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openStory(story.id);
      });
      item.appendChild(openBtn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'story-btn locked';
      btn.textContent = '思い出す';
      btn.addEventListener('click', () => {
        const result = unlockStory(story.id);
        if (result.ok) {
          openStory(story.id, { prevProgress: 0 });
        } else if (result.reason === 'insufficient_resources') {
          addLog(`まだ思い出せない…（${costLabel} 必要）`);
        }
      });
      item.appendChild(btn);
    }
    return item;
}

function renderStoryList(state) {
  // 既存セーブの初回: 現在見えている記憶は「既読」としてシード(過去分を新着扱いしない)
  if (_seenStories === null) {
    _seenStories = new Set(
      Object.values(STORIES).filter(s => storyIsVisible(s, state)).map(s => s.id)
    );
    _persistSeen();
  }

  els.storyList.innerHTML = '';

  const pending = [];
  const revealed = [];
  for (const story of Object.values(STORIES)) {
    if (!storyIsVisible(story, state)) continue;
    if (state.titleRevealed?.[story.id]) revealed.push(story);
    else pending.push(story);
  }

  for (const story of pending) {
    els.storyList.appendChild(_buildStoryItem(story, state));
  }

  if (revealed.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'story-section-divider';
    divider.textContent = '思い出した記憶';
    els.storyList.appendChild(divider);
    for (const story of revealed) {
      els.storyList.appendChild(_buildStoryItem(story, state));
    }
  }
}

// ── 状態レンダリング ──
let prevActive = null;
// null = 未初期化。初回renderは現在値に同期するだけにし、セーブ済みの解放済み一覧を
// 誤って「いま解放された」と判定して再読み込みごとにログが再表示される不具合を防ぐ
let prevAppearedStories = null;
let prevUnlockedLocations = null;
let prevUnlockedActions = null;
let prevGuideUnlocked = null;
let prevCompanionTaskDoneAt = null; // null = 未初期化(初回renderでは現在値に同期するだけ)
let prevRestBuffStacks = null; // null = 未初期化(初回renderでは現在値に同期するだけ)
// 各タブの直前の再構築シグネチャ(JSON文字列)。nullなら必ず初回構築する
let _prevStorySig = null;
let _prevCharSig = null;
let _prevActionSig = null;
let _prevQuestSig = null;
let stopFlavor = null;
let _cancelled = false;
let _isAutoRestart = false;
let _autoRestartEnabled = false; // 開発メニューからのみON可

// 表示中のリソース行の値要素(key→.resource-val span)。数量だけの更新ならDOMを作り直さない
const _resourceValueEls = new Map();
let _prevResourceStructureKey = null;

function renderResources(resources) {
  const visible = [];
  for (const cat of RESOURCE_CATEGORY_ORDER) {
    for (const [key, amount] of Object.entries(resources)) {
      if (amount !== 0 && resCategory(key) === cat) visible.push([cat, key, amount]);
    }
  }
  // どのリソースが見えているか(種類・並び順)が前回と同じなら、数量の差し替えだけで済ませる
  const structureKey = visible.map(([cat, key]) => `${cat}:${key}`).join(',');

  if (structureKey === _prevResourceStructureKey) {
    for (const [, key, amount] of visible) {
      const span = _resourceValueEls.get(key);
      if (span) span.textContent = amount;
    }
    return;
  }

  els.resourceList.innerHTML = '';
  _resourceValueEls.clear();
  let currentCat = null;
  let section = null;
  for (const [cat, key, amount] of visible) {
    if (cat !== currentCat) {
      section = document.createElement('div');
      section.className = 'resource-section';
      const title = document.createElement('div');
      title.className = 'resource-section-title';
      title.textContent = RESOURCE_CATEGORY_LABELS[cat] ?? cat;
      section.appendChild(title);
      els.resourceList.appendChild(section);
      currentCat = cat;
    }
    const row = document.createElement('div');
    row.className = 'resource-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'resource-name';
    nameSpan.textContent = resLabel(key);
    const valSpan = document.createElement('span');
    valSpan.className = 'resource-val';
    valSpan.textContent = amount;
    row.appendChild(nameSpan);
    row.appendChild(valSpan);
    section.appendChild(row);
    _resourceValueEls.set(key, valSpan);
  }
  _prevResourceStructureKey = structureKey;
}

function render(state) {
  document.getElementById('world-lv-value').textContent = state.worldLv ?? 0;
  renderResources(state.resources);

  // worldLv進捗ポップアップが開いている間は、フラグメント獲得などに合わせてリアルタイムに更新する
  if (document.getElementById('worldlv-popup')?.classList.contains('open')) {
    _renderWorldLvPopup();
  }

  const restBuffStacks = state.restBuffStacks ?? 0;
  if (prevRestBuffStacks !== null && restBuffStacks > prevRestBuffStacks) {
    addLog(`【宿屋】良い夢を見た…これから${restBuffStacks}回分、報酬が2倍になる`, true);
  }
  prevRestBuffStacks = restBuffStacks;

  const effectPanelEl = document.getElementById('effect-panel');
  if (effectPanelEl) effectPanelEl.classList.toggle('hidden', !state.effectsUnlocked);
  renderEffectList(state);
  const questSig = JSON.stringify(getVisibleQuests(state).map(({ quest, status }) => [
    quest.id,
    status,
    [...(quest.reveal?.requirements ?? []), ...(quest.unlock?.requirements ?? []), ...(quest.requirements ?? [])]
      .concat(quest.objective?.requirements ?? [])
      .map(item => [item.resource, state.resources?.[item.resource] ?? 0]),
    quest.objective?.actionId
      ? [quest.objective.actionId, state.actionCount?.[quest.objective.actionId] ?? 0]
      : null,
    // long_termのtasks(state_flag/child_quest_count)は子依頼の状態変化・表記の解禁状態も含めて検知する
    quest.tasks
      ? quest.tasks.map(task => [
        task.type === 'child_quest_count'
          ? getChildQuests(quest.id).map(child => getQuestStatus(state, child.id))
          : getQuestTaskProgress(state, quest, task)?.current,
        task.revealed ? task.revealed(state) : true,
      ])
      : null,
  ]));
  if (questSig !== _prevQuestSig) {
    renderQuestList(state);
    _prevQuestSig = questSig;
  }

  const active = state.activeAction;

  if (active && !prevActive) {
    const action = ACTIONS[active.actionId];
    const startMsg = _isAutoRestart
      ? `さらに【${actionDisplayHtml(action)}】を続ける・・・`
      : `【${actionDisplayHtml(action)}】開始`;
    addLog(startMsg, true, true);
    _isAutoRestart = false;
    setActionPickerLabel(action);
    els.actionBtn.textContent = '中断';
    const companions = (state.activeCompanions ?? [])
      .map(id => COMPANION_DATA[id] ? { id, name: COMPANION_DATA[id].name } : null)
      .filter(Boolean);
    const locationLv = state.LocationLv?.[action?.locationId] ?? 0;
    stopFlavor = startFlavorScheduler(active.actionId, text => addLog(text), { companions, locationLv });
  }

  if (!active && prevActive) {
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    const wasCancelled = _cancelled;
    _cancelled = false;
    els.actionBtn.textContent = '開始';
    const selAction = ACTIONS[selectedActionId] ?? FACILITIES[selectedActionId];
    setActionPickerLabel(selAction);

    const willAutoRestart = !wasCancelled && !_logStPending &&
      !(state.logSt1Done && !state.logSt2Done && (state.activeCompanions ?? []).length > 0) &&
      (state.autoRepeat || _autoRestartEnabled);

    if (willAutoRestart) {
      // クールタイム中、プログレスバーを2秒かけてゆっくり0%へ戻す
      els.progressBar.classList.remove('cooldown');
      els.progressBar.style.width = '100%';
      void els.progressBar.offsetWidth; // 強制リフロー(transition切り替えを反映させる)
      els.progressBar.classList.add('cooldown');
      els.progressBar.style.width = '0%';
    } else {
      els.progressBar.classList.remove('cooldown');
      els.progressBar.style.width = '0%';
    }

    if (!wasCancelled) {
      if (_logStPending) {
        // render() 完了後にプロローグ解放フェーズへ
        setTimeout(() => startProloguePhase(), 0);
      } else if (state.logSt1Done && !state.logSt2Done && (state.activeCompanions ?? []).length > 0) {
        setTimeout(() => startLogSt_2(state), 0);
      } else if (state.autoRepeat || _autoRestartEnabled) {
        // 自動再開（プレイヤー設定 autoRepeat、または開発メニューの強制ON）
        // スピード感が速すぎるとの声を受け、2秒のクールタイムを挟む
        setTimeout(() => {
          els.progressBar.classList.remove('cooldown');
          if (_storyLogPlaying) return;
          if (!(getState().autoRepeat || _autoRestartEnabled)) return; // クールタイム中にオートが切られた場合
          if (getState().activeAction) return; // クールタイム中に別の行動が開始された場合
          _isAutoRestart = true;
          startAction(selectedActionId, makeActionCallbacks(selectedActionId));
        }, 2000);
      }
    }
  }


  if (prevAppearedStories === null) {
    // 初回render: セーブ済みの状態に同期するだけ(「いま現れた」扱いにしない)
  } else {
    for (const id of (state.appearedStories ?? [])) {
      if (!prevAppearedStories.includes(id)) {
        const story = STORIES[id];
        if (!story) continue;
        addLog(`【記憶】「${story.lockedTitle ?? DEFAULT_LOCKED_TITLE}」を思い出せそうだ`, true);
      }
    }
  }
  prevAppearedStories = [...(state.appearedStories ?? [])];

  if (prevUnlockedLocations === null) {
    // 初回render: セーブ済みの状態に同期するだけ(「いま見つけた」扱いにしない)
  } else {
    for (const id of state.unlockedLocations) {
      if (!prevUnlockedLocations.includes(id) && LOCATIONS[id]?.label) {
        addLog(`【発見】新しい場所「${placeNameHtml(LOCATIONS[id].label)}」を見つけた`, true, true);
      }
    }
  }
  if (prevUnlockedActions === null) {
    // 初回render: セーブ済みの状態に同期するだけ(「いま見つけた/できるようになった」扱いにしない)
  } else {
    for (const id of state.unlockedActions) {
      if (!prevUnlockedActions.includes(id)) {
        const action = ACTIONS[id] ?? FACILITIES[id];
        if (!action) continue;
        const location = LOCATIONS[action.locationId];
        const discoveredName = FACILITIES[id] ? placeNameHtml(action.label) : action.label;
        const msg = (action.stub || FACILITIES[id])
          ? `【発見】${location?.label ? `${placeNameHtml(location.label)}で` : ''}「${discoveredName}」を見つけた`
          : (location?.label
            ? `${placeNameHtml(location.label)} で「${action.label}」ができるようになった`
            : `「${action.label}」ができるようになった`);
        addLog(msg, true, true);
      }
    }
  }

  const taskResult = state.lastCompanionTaskResult;
  if (prevCompanionTaskDoneAt === null) {
    prevCompanionTaskDoneAt = taskResult?.doneAt ?? 0;
  } else if (taskResult && taskResult.doneAt > prevCompanionTaskDoneAt) {
    const name = COMPANION_DATA[taskResult.companionId]?.name ?? taskResult.companionId;
    if (taskResult.type === 'observatory_research') {
      addLog(`【星空研究所】${name}の資料調査が終わったようだ`, true, false, false, 'log-rare');
    } else {
      const fromSpan = `${resourceSpan(taskResult.fromRes, resLabel(taskResult.fromRes))}${taskResult.amount}`;
      const toSpan = `${resourceSpan(taskResult.toRes, resLabel(taskResult.toRes))}${taskResult.amount}`;
      addLog(`【${name}】${fromSpan} → ${toSpan} に変換した`, true, true, true);
    }
    prevCompanionTaskDoneAt = taskResult.doneAt;
  }

  prevActive = active;
  prevUnlockedLocations = [...state.unlockedLocations];
  prevUnlockedActions = [...state.unlockedActions];

// 各タブの再構築は、その内容に関わるstate部分が前回から変わっていないときはスキップする
  // (探索中のランダム報酬tickなどで毎回render()が走るため、無関係な変化でも記憶/地図/同行タブを
  //  毎回まるごと作り直していた。見た目・挙動は変えず、無駄な再構築だけを省く)
  const storySig = JSON.stringify([state.unlockedStories, state.storyProgress, state.appearedStories, state.titleRevealed, state.resources, state.discoveredResources]);
  if (storySig !== _prevStorySig) { renderStoryList(state); _prevStorySig = storySig; }
  _updateStoriesBadge(state);

  const charSig = JSON.stringify([state.unlockedCompanions, state.activeCompanions, state.discoveredConstellations, state.constellationProgress, state.ELv, state.bondLv, state.companionTraits, state.companionEquipment, state.companionTasks, state.resources, state.discoveredResources, state.appearedStories, state.unlockedStories, state.storyProgress, state.titleRevealed]);
  if (charSig !== _prevCharSig) { renderCharTab(state); _prevCharSig = charSig; }

  const actionSig = JSON.stringify([state.unlockedLocations, state.unlockedActions, state.activeAction?.actionId ?? null, state.ActionLv, state.LocationLv, state.resources.fragment, state.worldLv]);
  if (actionSig !== _prevActionSig) { renderActionList(); _prevActionSig = actionSig; }
  _updateActionsBadge(state);

  // ビューアが開いていればページ表示を更新
  if (_viewerStoryId) renderViewerBody(state);

  // アンロックルール評価
  evaluateRules(state, {
    viewerOpen: _viewerStoryId !== null,
    storyLogPlaying: _storyLogPlaying,
    isStoryLogPlaying: () => _storyLogPlaying,
    startLogSt_1,
    startLogSt_2: () => startLogSt_2(state),
    startLogSt_3,
    startLogSt_4,
    startWorldChronicleIntro,
    startAllCompanionsMet,
    unlockLocation,
    unlockAction,
    unlockGuide,
    showDiscovery,
    forceAppearStory,
  });

  const _curState = getState();
  const guidePanelEl = document.getElementById('guide-panel');
  if (guidePanelEl) {
    if (prevGuideUnlocked === null) {
      // 初回render: セーブ済みの状態に同期するだけ(「いま解放された」扱いにしない)
      guidePanelEl.classList.toggle('hidden', !_curState.guideUnlocked);
    } else if (_curState.guideUnlocked && !prevGuideUnlocked) {
      // 先にガードを立てる。setAutoRepeat()がnotify()→render()を同期再入させるため、
      // ここで更新しておかないと解放ログが二重に出てしまう(重複バグの原因)
      prevGuideUnlocked = true;
      guidePanelEl.classList.remove('hidden');
      addLog('【導き】が解放された', true);
      addLog('星の導きに任せて、これからは行動をくり返せるようになった', true);
      _flashGuideTab();
      if (!_curState.autoRepeat) setAutoRepeat(true);
    } else if (!_curState.guideUnlocked) {
      guidePanelEl.classList.add('hidden');
    }
  }
  prevGuideUnlocked = _curState.guideUnlocked;
  renderGuideList(_curState);
}

// 効果パネルの中身。現在かかっている時限効果・バフを一覧表示する
function renderEffectList(state) {
  const list = document.getElementById('effect-list');
  if (!list) return;
  list.innerHTML = '';

  const effects = [];
  const restBuffStacks = state.restBuffStacks ?? 0;
  if (restBuffStacks > 0) {
    effects.push(`【宿屋】報酬2倍 — 残り${restBuffStacks}回分`);
  }
  if ((state.activeCompanions ?? []).length > 0) {
    effects.push('【同行】フラグメント×2 — 仲間が同行中');
  }

  document.getElementById('effect-tab-btn')?.classList.toggle('glow', effects.length > 0);

  if (effects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'effect-empty';
    empty.textContent = '今はかかっている効果はない';
    list.appendChild(empty);
    return;
  }
  for (const text of effects) {
    const item = document.createElement('div');
    item.className = 'effect-item';
    item.textContent = text;
    list.appendChild(item);
  }
}

const _typedQuestComments = new Set();
const _collapsedQuestCards = new Set(JSON.parse(localStorage.getItem('questCollapsed') ?? '[]'));
const _justReportedQuests = new Set();
let _questFilter = 'all';

function _saveCollapsedQuestCards() {
  localStorage.setItem('questCollapsed', JSON.stringify([..._collapsedQuestCards]));
}

// 依頼パネルが開かれたとき、納品済み保留セットをクリアして再描画する
{
  const _questPanel = document.getElementById('quest-panel');
  if (_questPanel) {
    new MutationObserver(() => {
      if (_questPanel.classList.contains('open') && _justReportedQuests.size > 0) {
        _justReportedQuests.clear();
        renderQuestList(getState());
      }
    }).observe(_questPanel, { attributeFilter: ['class'] });
  }
}

function _setQuestComment(element, text, key) {
  if (_typedQuestComments.has(key)) {
    element.textContent = text;
    return;
  }
  _typedQuestComments.add(key);
  element.textContent = '';
  let index = 0;
  const timer = setInterval(() => {
    if (!element.isConnected) {
      clearInterval(timer);
      return;
    }
    element.textContent += text[index++] ?? '';
    if (index >= text.length) clearInterval(timer);
  }, 28);
}

function _buildQuestResourceList(items, values = null, extraClass = '') {
  const list = document.createElement('div');
  list.className = `quest-resource-list ${extraClass}`.trim();
  for (const item of items ?? []) {
    const chip = document.createElement('span');
    chip.className = 'quest-resource-chip';
    chip.title = resLabel(item.resource);
    const name = document.createElement('span');
    name.className = 'quest-resource-name';
    name.style.color = resColor(item.resource);
    name.textContent = resLabel(item.resource);
    const amount = document.createElement('span');
    amount.textContent = values
      ? `${Math.min(values[item.resource] ?? 0, item.amount)}/${item.amount}`
      : String(item.amount);
    chip.append(name, amount);
    list.appendChild(chip);
  }
  return list;
}

function _buildLongQuestTasks(quest, state) {
  const panel = document.createElement('div');
  panel.className = 'quest-task-panel';

  for (const task of quest.tasks ?? []) {
    const progress = getQuestTaskProgress(state, quest, task);
    const done = (progress?.current ?? 0) >= (progress?.target ?? 1);
    const row = document.createElement(task.type === 'child_quest_count' ? 'button' : 'div');
    row.className = `quest-task-row${done ? ' done' : ''}`;
    if (row instanceof HTMLButtonElement) row.type = 'button';
    const marker = document.createElement('span');
    marker.className = 'quest-task-marker';
    marker.textContent = done ? '✓' : '○';
    const label = document.createElement('span');
    label.className = 'quest-task-label';
    const revealed = task.revealed ? task.revealed(state) : true;
    label.textContent = revealed ? task.label : (task.abstractLabel ?? task.label);
    const count = document.createElement('span');
    count.className = 'quest-task-count';
    count.textContent = task.type === 'state_flag'
      ? (done ? '完了' : '未完了')
      : `${progress?.current ?? 0}/${progress?.target ?? 0}`;
    row.append(marker, label, count);
    panel.appendChild(row);

    if (task.type !== 'child_quest_count') continue;
    const collapseKey = `${quest.id}:${task.id}`;
    const children = document.createElement('div');
    children.className = 'quest-child-list';
    children.hidden = _collapsedQuestCards.has(collapseKey);
    const childQuests = getChildQuests(quest.id);
    for (let index = 0; index < task.target; index++) {
      const child = childQuests[index] ?? null;
      const childStatus = child ? getQuestStatus(state, child.id) : QUEST_STATUS.UNAVAILABLE;
      const visible = child && childStatus !== QUEST_STATUS.UNAVAILABLE;
      const childRow = document.createElement('div');
      childRow.className = `quest-child-row quest-child-row--${childStatus}`;
      childRow.innerHTML = visible
        ? `<span>${childStatus === QUEST_STATUS.REPORTED ? '✓' : '○'}</span><span>${child.title}</span>`
        : '<span>？</span><span>未発見</span>';
      children.appendChild(childRow);
    }
    row.setAttribute('aria-expanded', String(!children.hidden));
    row.addEventListener('click', () => {
      children.hidden = !children.hidden;
      row.setAttribute('aria-expanded', String(!children.hidden));
      if (children.hidden) _collapsedQuestCards.add(collapseKey);
      else _collapsedQuestCards.delete(collapseKey);
      _saveCollapsedQuestCards();
    });
    panel.appendChild(children);
  }
  return panel;
}

// 依頼パネル。進行状況を表示し、条件を満たした依頼はここから直接納品できる
function renderQuestList(state) {
  const panel = document.getElementById('quest-panel');
  const list = document.getElementById('quest-list');
  if (!panel || !list) return;

  const visible = getVisibleQuests(state);
  panel.classList.toggle('hidden', visible.length === 0);
  list.innerHTML = '';
  if (visible.length === 0) return;

  document.querySelectorAll('.quest-filter-btn').forEach(button => {
    const selected = button.dataset.questFilter === _questFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });

  const readyToTurnIn = visible.some(({ quest, status }) =>
    status === QUEST_STATUS.COMPLETED && quest.turnIn === 'quest_ui'
  );
  document.getElementById('quest-tab-btn')?.classList.toggle('ready', readyToTurnIn);

  const filtered = visible.filter(({ quest, status }) => {
    if (_questFilter === 'rumor') return status === QUEST_STATUS.AVAILABLE;
    if (_questFilter === 'active') {
      return status === QUEST_STATUS.ACTIVE || status === QUEST_STATUS.COMPLETED ||
        (status === QUEST_STATUS.REPORTED && _justReportedQuests.has(quest.id));
    }
    if (_questFilter === 'done') return status === QUEST_STATUS.REPORTED;
    return true;
  });
  const ordered = [
    ...filtered.filter(({ status }) => status !== QUEST_STATUS.REPORTED),
    ...filtered.filter(({ status }) => status === QUEST_STATUS.REPORTED),
  ];
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quest-filter-empty';
    empty.textContent = '該当する依頼はない';
    list.appendChild(empty);
    return;
  }
  for (const { quest, status } of ordered) {
    const card = document.createElement('div');
    card.className = `quest-card quest-card--${status}`;

    if (status === QUEST_STATUS.AVAILABLE) {
      const icon = document.createElement('div');
      icon.className = 'quest-rumor-icon';
      icon.textContent = '?';
      card.appendChild(icon);
      const rumorMain = document.createElement('div');
      rumorMain.className = 'quest-rumor-main';
      const kicker = document.createElement('div');
      kicker.className = 'quest-rumor-kicker';
      kicker.textContent = 'ノスタルジアの噂';
      rumorMain.appendChild(kicker);
      const title = document.createElement('div');
      title.className = 'quest-title';
      title.textContent = `「${quest.rumorText ?? '誰かが何かを求めているようだ・・・'}」`;
      rumorMain.appendChild(title);
      const unlockCosts = quest.unlock?.requirements ?? [];
      const canUnlock = unlockCosts.every(requirement =>
        (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
      );
      const actions = document.createElement('div');
      actions.className = 'quest-rumor-actions';
      for (const cost of unlockCosts) {
        const have = state.resources?.[cost.resource] ?? 0;
        const progress = document.createElement('div');
        progress.className = 'quest-progress';
        progress.innerHTML = `<span>${resLabel(cost.resource)}</span><span>${Math.min(have, cost.amount)} / ${cost.amount}</span>`;
        actions.appendChild(progress);
      }
      const button = document.createElement('button');
      button.className = 'quest-turnin-btn';
      button.textContent = '引き受ける';
      button.disabled = !canUnlock;
      button.addEventListener('click', () => {
        const result = unlockQuest(quest.id);
        if (result.ok) addLog(`【依頼】「${quest.title}」の詳細が判明した`, true, false, false, 'log-rare');
      });
      actions.appendChild(button);
      rumorMain.appendChild(actions);
      card.appendChild(rumorMain);
      list.appendChild(card);
      continue;
    }

    const layout = document.createElement('div');
    layout.className = 'quest-layout';
    const left = document.createElement('div');
    left.className = 'quest-left';
    const header = document.createElement('div');
    header.className = 'quest-header';
    const dialogIcon = document.createElement('div');
    dialogIcon.className = 'quest-dialog-icon';
    dialogIcon.textContent = status === QUEST_STATUS.REPORTED ? '✓' : '!';
    const heading = document.createElement('div');
    heading.className = 'quest-heading';
    heading.innerHTML = `<div class="quest-title">${quest.title}</div><div class="quest-requester">― ${quest.requester}</div>`;
    const toggleDetails = document.createElement('button');
    toggleDetails.className = 'quest-details-toggle';
    toggleDetails.type = 'button';
    const syncCollapsed = () => {
      const collapsed = _collapsedQuestCards.has(quest.id);
      layout.classList.toggle('quest-layout--collapsed', collapsed);
      toggleDetails.textContent = collapsed ? '⌄' : '⌃';
      toggleDetails.setAttribute('aria-label', collapsed ? '依頼内容を開く' : '依頼内容を閉じる');
      toggleDetails.setAttribute('aria-expanded', String(!collapsed));
    };
    toggleDetails.addEventListener('click', () => {
      if (_collapsedQuestCards.has(quest.id)) _collapsedQuestCards.delete(quest.id);
      else _collapsedQuestCards.add(quest.id);
      _saveCollapsedQuestCards();
      syncCollapsed();
    });
    header.append(dialogIcon, heading, toggleDetails);
    layout.appendChild(header);
    const dialog = document.createElement('div');
    dialog.className = 'quest-dialog';
    const comment = document.createElement('div');
    comment.className = 'quest-comment';
    const commentText = status === QUEST_STATUS.REPORTED
      ? (quest.completeComment ?? '「ありがとう。助かりました」')
      : (quest.requestComment ?? `「${quest.description}」`);
    _setQuestComment(comment, commentText, `${quest.id}:${status}`);
    dialog.appendChild(comment);
    left.appendChild(dialog);
    layout.appendChild(left);

    const rewardPanel = document.createElement('div');
    rewardPanel.className = 'quest-reward-panel';
    if (status === QUEST_STATUS.REPORTED) layout.classList.add('quest-layout--reported');
    const rewardLabel = document.createElement('div');
    rewardLabel.className = 'quest-reward-label';
    rewardLabel.textContent = '— 報酬 —';
    rewardPanel.appendChild(rewardLabel);
    if ((quest.rewards ?? []).length > 0) {
      rewardPanel.appendChild(_buildQuestResourceList(quest.rewards));
    } else {
      const emptyReward = document.createElement('div');
      emptyReward.className = 'quest-reward-empty';
      emptyReward.textContent = '—';
      rewardPanel.appendChild(emptyReward);
    }
    layout.appendChild(rewardPanel);

    const actionRow = document.createElement('div');
    actionRow.className = 'quest-action-row';
    const actionGoal = document.createElement('div');
    actionGoal.className = 'quest-action-goal';
    actionGoal.textContent = quest.goalLabel ?? quest.description;
    actionGoal.title = quest.goalLabel ?? quest.description;
    actionRow.appendChild(actionGoal);

    const actionProgress = document.createElement('div');
    actionProgress.className = 'quest-action-progress';
    if (status === QUEST_STATUS.REPORTED) {
      actionProgress.classList.add('done');
      actionProgress.textContent = '';
    } else if ((quest.requirements ?? []).length > 0) {
      actionProgress.appendChild(_buildQuestResourceList(quest.requirements, state.resources));
    } else if (quest.hideProgress) {
      actionProgress.textContent = '';
    } else if (
      quest.objective?.type === 'resource_set' ||
      quest.objective?.type === 'action_count' ||
      quest.objective?.type === 'state_count'
    ) {
      const progress = getQuestProgress(state, quest.id);
      actionProgress.textContent = `${progress?.unitLabel ?? ''} ${progress?.current ?? 0}/${progress?.target ?? 0}`.trim();
    } else {
      actionProgress.textContent = status === QUEST_STATUS.COMPLETED ? '発見済み' : '探索中';
    }
    actionRow.appendChild(actionProgress);

    const actionSlot = document.createElement('div');
    actionSlot.className = 'quest-action-slot';
    if (status === QUEST_STATUS.REPORTED) {
      const check = document.createElement('div');
      check.className = 'quest-inline-check';
      check.textContent = '✓';
      check.title = '報告済み';
      actionSlot.appendChild(check);
    } else if (!quest.autoCompleteStory) {
      const turnIn = document.createElement('button');
      turnIn.className = 'quest-turnin-btn';
      turnIn.textContent = (quest.turnInLabel ?? '納品する').replace(/する$/, '');
      turnIn.disabled = status !== QUEST_STATUS.COMPLETED;
      turnIn.addEventListener('click', () => {
        const result = turnInQuest(quest.id);
        if (!result.ok) return;
        const rewards = result.rewards.map(item => `${resLabel(item.resource)} +${item.amount}`).join('、');
        addLog(`【依頼】「${quest.title}」を達成した${rewards ? ` — ${rewards}` : ''}`, true);
        if (quest.reportLog) addLog(quest.reportLog, true, false, false, 'log-rare');
        _justReportedQuests.add(quest.id);
      });
      actionSlot.appendChild(turnIn);
    }
    actionRow.appendChild(actionSlot);
    layout.appendChild(actionRow);
    if (quest.kind === 'long_term' && quest.tasks) {
      layout.appendChild(_buildLongQuestTasks(quest, state));
    }
    syncCollapsed();
    card.appendChild(layout);
    list.appendChild(card);
  }
}

document.querySelectorAll('.quest-filter-btn').forEach(button => {
  button.addEventListener('click', () => {
    _questFilter = button.dataset.questFilter ?? 'all';
    renderQuestList(getState());
  });
});

function _flashQuestTab() {
  const btn = document.getElementById('quest-tab-btn');
  const panel = document.getElementById('quest-panel');
  if (!btn || !panel || panel.classList.contains('open')) return;
  btn.classList.add('glow');
  if (!btn._glowClearBound) {
    btn._glowClearBound = true;
    btn.addEventListener('click', () => btn.classList.remove('glow'));
  }
}

// 導きパネルの中身。導き定義(guides.js)から現在の助言を優先度順に表示する
function renderGuideList(state) {
  const list = document.getElementById('guide-list');
  if (!list) return;
  list.innerHTML = '';

  const guides = getActiveGuides(state, {
    discoveryStepLv: DISCOVERY_STEP_LV,
    nostalgiaFacilities: NOSTALGIA_FACILITIES,
    actions: ACTIONS,
    locations: LOCATIONS,
    companionRelics: COMPANION_RELICS,
    companions: COMPANION_DATA,
  });
  const displayItems = guides.length > 0
    ? guides
    : [{ id: 'guide_idle', text: '星の導きは、いまは静かだ…' }];

  for (const guide of displayItems) {
    const item = document.createElement('div');
    item.className = 'guide-hint-item';
    item.dataset.guideId = guide.id;
    item.textContent = guide.text;
    list.appendChild(item);
  }

  // 新しい導きが追加された時、または同じ導きの目標文が進行して変わった時だけタブを光らせる
  // (達成してヒントが消えただけの時や、初回同期では光らせない)
  const signatures = displayItems.map(guide => `${guide.id}:${guide.text}`);
  const hasNewGuide = signatures.some(signature => !(_prevGuideSigs?.includes(signature)));
  if (_prevGuideSigs !== null && hasNewGuide && state.guideUnlocked) {
    _flashGuideTab();
  }
  _prevGuideSigs = signatures;
}

// 導きタブ(#guide-tab-btn)を発光させる。導きパネルを開くと消える
let _prevGuideSigs = null;
function _flashGuideTab() {
  const btn = document.getElementById('guide-tab-btn');
  const panel = document.getElementById('guide-panel');
  if (!btn || !panel || panel.classList.contains('open')) return;
  btn.classList.add('glow');
  if (!btn._glowClearBound) {
    btn._glowClearBound = true;
    document.getElementById('guide-tab-btn').addEventListener('click', () => btn.classList.remove('glow'));
  }
}

// ── 汎用確認ポップアップ ──
// message を表示し、「はい」で onYes() を実行する。「いいえ」「枠外タップ」は何もしない
function showConfirm(message, onYes) {
  const popup = document.getElementById('confirm-popup');
  if (!popup) { onYes?.(); return; }
  document.getElementById('confirm-popup-message').textContent = message;
  const yes = document.getElementById('confirm-popup-yes');
  const no = document.getElementById('confirm-popup-no');
  function cleanup() {
    yes.removeEventListener('click', onYesClick);
    no.removeEventListener('click', onNoClick);
    popup.onclick = null;
  }
  function close() { popup.classList.remove('open'); cleanup(); }
  function onYesClick() { close(); onYes?.(); }
  function onNoClick() { close(); }
  yes.addEventListener('click', onYesClick);
  no.addEventListener('click', onNoClick);
  popup.onclick = (e) => { if (e.target === popup) close(); };
  popup.classList.add('open');
}

// 行動中に編成を変更する: 現在の行動を中断してから同行/別行動を適用する。
// オート再開が誤発火しないよう、_startActionByIdと同じく_cancelledを立ててからcancelする
function _interruptForPartyChange(companionId, makeActive) {
  const running = getState().activeAction;
  if (running) {
    const curAction = ACTIONS[running.actionId];
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    _cancelled = true;
    cancelAction();
    _resetPendingCompanionRewards();
    addLog(`【${actionDisplayHtml(curAction)}】中断`, true, true);
  }
  setActiveCompanion(companionId, makeActive);
  renderCharTab(getState());
}

function _changeCompanionFromChart(companionId, makeActive) {
  const state = getState();
  if (makeActive && state.companionTasks?.[companionId]) {
    addLog('作業中は同行させられません', true);
    return;
  }
  if (makeActive && (state.activeCompanions ?? []).length >= 5) {
    addLog('同行できるのは5人までです', true);
    return;
  }
  const apply = () => _interruptForPartyChange(companionId, makeActive);
  if (state.activeAction) showConfirm('現在の行動を中断して編成を変更しますか？', apply);
  else apply();
}

function _replacePartyFromChart(ids) {
  const apply = () => {
    const running = getState().activeAction;
    if (running) {
      if (stopFlavor) { stopFlavor(); stopFlavor = null; }
      _cancelled = true;
      cancelAction();
      _resetPendingCompanionRewards();
    }
    const result = setActiveCompanions(ids);
    if (!result.ok) addLog('この編成には切り替えられません', true);
    renderCharTab(getState());
  };
  if (getState().activeAction) showConfirm('現在の行動を中断して星座の編成へ切り替えますか？', apply);
  else apply();
}

// ── プログレスバー ──
function tick() {
  if (_storyLogPlaying) return;
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

  // 記憶タブ/地図タブを開いたら新着を既読化
  if (viewId === 'view-stories') _markStoriesSeen(getState());
  if (viewId === 'view-actions') { _markDiscoveriesSeen(getState()); renderActionList(); }

  // 初めて同行タブを開いた時、サイドバー→星図盤の順に軽いポインターチュートリアルを挟む
  if (viewId === 'view-chars') {
    const state = getState();
    if (!state.companionTutorialDone && (state.unlockedCompanions ?? []).length > 0) {
      _runCompanionTutorial();
    }
  }
}

// ── 要素ポインター(特定のUI要素を指して一言添えるミニチュートリアル) ──
let _companionTutorialActive = false;

function _runCompanionTutorial() {
  if (_companionTutorialActive) return;
  _companionTutorialActive = true;
  _runElementPointerSteps([
    {
      selector: '.star-chart-rail',
      text: 'ここから同行することができます',
      placement: 'left',
      // タップを奪わず、実際に誰かが同行するまで待ってから次へ進む
      waitFor: (state) => (state.activeCompanions ?? []).length > 0,
      // このステップ中は、サイドバーのユウヤ以外のボタンを押せないようにする
      restrictTo: 'yuya',
    },
    { selector: '.star-chart-sky', text: '同行している間、星の加護が行く先を示します' },
  ], () => {
    _companionTutorialActive = false;
    setCompanionTutorialDone();
  });
}

// サイドバーの指定同行者だけを残し、人物記録・星座一覧・下部メニューを含む
// ほかのボタンを一時的に無効化する。元に戻す関数を返す。
function _restrictCompanionTutorialInput(exceptId) {
  const buttons = document.querySelectorAll('button');
  const restored = [];
  buttons.forEach(btn => {
    const isAllowedCompanionToggle =
      btn.dataset.companion === exceptId
      && btn.matches('.star-chart-rail-person');
    if (isAllowedCompanionToggle || btn.disabled) return;
    btn.disabled = true;
    restored.push(btn);
  });
  return () => { restored.forEach(btn => { btn.disabled = false; }); };
}

function _runElementPointerSteps(steps, onComplete) {
  const overlay = document.getElementById('element-pointer-overlay');
  const bubble = document.getElementById('element-pointer-bubble');
  let index = 0;
  let unsubscribe = null;
  let restoreRestriction = null;

  function stopWaiting() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (restoreRestriction) { restoreRestriction(); restoreRestriction = null; }
  }

  function showStep() {
    const step = steps[index];
    const target = document.querySelector(step.selector);
    if (!target) { finish(); return; }
    bubble.textContent = step.text;
    bubble.classList.remove('visible', 'point-above', 'point-below', 'point-left');
    const rect = target.getBoundingClientRect();
    const margin = 10;
    const bubbleRect = bubble.getBoundingClientRect();

    if (step.placement === 'left') {
      // 対象が画面端に近い細長い要素の場合、上下ではなく左側に吹き出しを出し、右向きの矢印で指す
      let top = rect.top + rect.height / 2 - bubbleRect.height / 2;
      top = Math.max(margin, Math.min(top, window.innerHeight - bubbleRect.height - margin));
      bubble.style.top = `${top}px`;
      bubble.style.left = `${rect.left - margin - bubbleRect.width}px`;
      bubble.classList.add('point-left');
    } else {
      const pointBelow = rect.top < 140;
      let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin));
      bubble.style.left = `${left}px`;
      bubble.style.top = pointBelow
        ? `${rect.bottom + margin}px`
        : `${rect.top - bubbleRect.height - margin}px`;
      bubble.classList.add(pointBelow ? 'point-below' : 'point-above');
    }
    bubble.classList.add('visible');

    if (step.waitFor) {
      // 指している要素の実際の操作を通す(オーバーレイでタップを奪わない)。条件を満たしたら自動で次へ
      overlay.classList.add('passthrough');
      overlay.onclick = null;
      // renderCharTabは状態変化のたびに星図盤のボタンを作り直すため、再描画のたびに制限をかけ直す
      const applyRestriction = () => {
        if (restoreRestriction) restoreRestriction();
        restoreRestriction = step.restrictTo ? _restrictCompanionTutorialInput(step.restrictTo) : null;
      };
      applyRestriction();
      if (step.waitFor(getState())) { advance(); return; }
      unsubscribe = subscribe((state) => {
        applyRestriction();
        if (step.waitFor(state)) advance();
      });
    } else {
      overlay.classList.remove('passthrough');
      overlay.onclick = advance;
    }
  }

  function finish() {
    stopWaiting();
    overlay.classList.remove('open', 'passthrough');
    overlay.onclick = null;
    bubble.classList.remove('visible');
    onComplete?.();
  }

  function advance() {
    stopWaiting();
    index++;
    if (index >= steps.length) { finish(); return; }
    showStep();
  }

  overlay.classList.add('open');
  showStep();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.view));
  });
}

// ── worldLv 進捗ポップアップ ──
function _renderWorldLvPopup() {
  const state = getState();
  const lv = state.worldLv ?? 0;
  const cur = state.totalFragments ?? 0;
  const prevThresh = lv > 0 ? WORLD_LV_THRESHOLDS[lv - 1] : 0;
  const nextThresh = WORLD_LV_THRESHOLDS[lv] ?? null;
  const popup = document.getElementById('worldlv-popup');
  const isStoryCapped = lv >= 10 && !state.allCompanionsMetDone;
  document.getElementById('worldlv-popup-lv').textContent = `worldLv ${lv}`;
  const fill = document.getElementById('worldlv-popup-bar-fill');
  const label = document.getElementById('worldlv-popup-label');
  popup.classList.toggle('is-capped', isStoryCapped);
  if (isStoryCapped) {
    fill.style.width = '100%';
    label.textContent = '再生が停滞している...導きに従ってみよう';
  } else if (nextThresh == null) {
    fill.style.width = '100%';
    label.textContent = '最大';
  } else {
    const ratio = Math.min(1, (cur - prevThresh) / (nextThresh - prevThresh));
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    label.textContent = `${cur - prevThresh} / ${nextThresh - prevThresh}`;
  }
}

function initRefreshButton() {
  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('click', () => window.location.reload());
}

function initSettings() {
  const button = document.getElementById('settings-btn');
  const popup = document.getElementById('settings-popup');
  const modeButtons = [...popup.querySelectorAll('[data-log-mode]')];

  function renderMode() {
    modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.logMode === _companionLogMode));
  }

  button.addEventListener('click', () => {
    renderMode();
    popup.classList.add('open');
  });
  popup.addEventListener('click', (event) => {
    if (event.target === popup) popup.classList.remove('open');
  });
  modeButtons.forEach(btn => btn.addEventListener('click', () => {
    _companionLogMode = btn.dataset.logMode;
    try { localStorage.setItem(COMPANION_LOG_MODE_KEY, _companionLogMode); } catch {}
    _resetPendingCompanionRewards();
    renderMode();
  }));
}

function initWorldLvPopup() {
  const display = document.getElementById('world-lv-display');
  const popup = document.getElementById('worldlv-popup');
  display.addEventListener('click', () => {
    _renderWorldLvPopup();
    popup.classList.add('open');
  });
  popup.addEventListener('click', (e) => {
    if (e.target === popup) popup.classList.remove('open');
  });
}

// ── 場所詳細ポップアップ ──
const _lvupState = {}; // { [locationId]: { progress, consumed } }

function _renderLocationPopup(location) {
  const state = getState();
  const lv = state.LocationLv?.[location.id] ?? 0;
  const cap = getLocationLvCap();
  const isMax = lv >= LOCATION_LV_MAX;
  const atWorldCap = !isMax && lv >= cap;
  const cost = (isMax || atWorldCap) ? null : getLocationLvCost(location.id, lv);
  const have = state.resources.fragment ?? 0;

  document.getElementById('location-popup-name').textContent = location.label;
  document.getElementById('location-popup-desc').textContent = location.description ?? '';

  document.getElementById('location-popup-lv').textContent =
    isMax ? `Lv ${lv}  (MAX)` : `Lv ${lv}`;

  const btn = document.getElementById('location-popup-lvup-btn');
  const haveEl = document.getElementById('location-popup-lvup-have');
  btn.classList.remove('capped');
  if (isMax) {
    btn.hidden = true;
    haveEl.textContent = '';
  } else if (atWorldCap) {
    // worldLvが足りずレベルアップ不可。ボタン内にメッセージを表示
    btn.hidden = false;
    btn.classList.add('capped');
    haveEl.textContent = '';
    btn.innerHTML = `<span class="lvup-btn-capped">今はこれ以上再生できない...</span>`;
  } else {
    btn.hidden = false;
    btn.disabled = false;
    const label = resLabel('fragment');
    haveEl.textContent = `所持数：${have}`;
    btn.innerHTML =
      `<span class="lvup-btn-label">Lv${lv} </span>` +
      `<span class="lvup-btn-cost">${label}<span class="lvup-btn-ratio">${have} / ${cost}</span></span>`;
  }
}

function showLocationPopup(location, btnEl) {
  const popup = document.getElementById('location-popup');
  popup.classList.add('open');

  const inner = popup.querySelector('.location-popup-inner');
  requestAnimationFrame(() => {
    const rect = btnEl.getBoundingClientRect();
    const iw = inner.offsetWidth || 260;
    const ih = inner.offsetHeight || 160;
    let left = rect.left;
    if (left + iw > window.innerWidth - 8) left = window.innerWidth - iw - 8;
    let top = rect.bottom + 6;
    if (top + ih > window.innerHeight - 8) top = rect.top - ih - 6;
    inner.style.left = left + 'px';
    inner.style.top = Math.max(8, top) + 'px';
  });

  _renderLocationPopup(location);

  const btn = document.getElementById('location-popup-lvup-btn');

  // プログレスバー要素を追加
  let progEl = document.createElement('span');
  progEl.className = 'lvup-progress';
  btn.prepend(progEl);
  btn.classList.remove('ready');

  // 場所ごとの進捗を引き継ぐ
  if (!_lvupState[location.id]) _lvupState[location.id] = { progress: 0, consumed: 0 };
  const loc = _lvupState[location.id];
  progEl.style.width = loc.progress + '%';
  if (loc.progress >= 100) btn.classList.add('ready');

  const ratioEl = btn.querySelector('.lvup-btn-ratio');
  if (ratioEl && loc.consumed > 0) {
    const cost0 = getLocationLvCost(location.id, getState().LocationLv?.[location.id] ?? 0);
    ratioEl.textContent = `${loc.consumed} / ${cost0}`;
  }

  let _raf = null;
  let _lastTime = null;
  const FILL_DURATION = 2500;

  function startFill() {
    if (btn.classList.contains('capped')) return;
    if (btn.classList.contains('ready') || _raf) return;
    _lastTime = null;
    function tick(now) {
      if (_lastTime == null) _lastTime = now;
      const dt = now - _lastTime;
      _lastTime = now;
      const st = getState();
      const cost = getLocationLvCost(location.id, st.LocationLv?.[location.id] ?? 0);
      const have = st.resources.fragment ?? 0;
      const cap = cost ? Math.min(100, ((have + loc.consumed) / cost) * 100) : 100;
      loc.progress = Math.min(cap, loc.progress + (dt / FILL_DURATION) * 100);
      progEl.style.width = loc.progress + '%';
      const newConsumed = Math.floor(loc.progress / 100 * cost);
      if (newConsumed > loc.consumed) {
        addResources('fragment', -(newConsumed - loc.consumed));
        loc.consumed = newConsumed;
        // 所持数が変化したフレームだけテキストを更新(毎フレーム書き換えない)
        const rEl = btn.querySelector('.lvup-btn-ratio');
        if (rEl) rEl.textContent = `${loc.consumed} / ${cost}`;
        const hEl = document.getElementById('location-popup-lvup-have');
        if (hEl) hEl.textContent = `所持数：${getState().resources.fragment ?? 0}`;
      }
      if (loc.progress >= 100) { btn.classList.add('ready'); _raf = null; return; }
      if (loc.progress >= cap) { _raf = null; return; }
      _raf = requestAnimationFrame(tick);
    }
    _raf = requestAnimationFrame(tick);
  }
  function stopFill() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; _lastTime = null; }
  }

  btn.onmousedown = startFill;
  btn.onmouseup = stopFill;
  btn.onmouseleave = stopFill;
  btn.ontouchstart = () => { startFill(); };
  btn.ontouchend = stopFill;
  btn.ontouchcancel = stopFill;
  btn.onclick = () => {
    if (!btn.classList.contains('ready')) return;
    stopFill();
    btn.classList.remove('ready');
    const prepaid = loc.consumed;
    loc.progress = 0;
    loc.consumed = 0;
    progEl.style.width = '0%';
    // notify()(→render→ルール評価)より先にログを出すため、一旦silentで適用してからログ→notify
    const result = levelUpLocation(location.id, prepaid, { silent: true });
    if (result.ok) {
      addLog(`【${placeNameHtml(location.label)}】LocationLv が ${result.newLv} になった`, true, true);
      notify();
      _renderLocationPopup(location);
      // _renderLocationPopup が innerHTML を書き換えるので progEl を再追加
      progEl = document.createElement('span');
      progEl.className = 'lvup-progress';
      progEl.style.width = '0%';
      btn.prepend(progEl);
    }
  };

  popup.onclick = (e) => {
    if (e.target === popup) popup.classList.remove('open');
  };
}

// ── 行動選択 ──
let selectedActionId = 'explore';
const _openSections = new Set(); // 開いている場所ID
const _seenSections = new Set(); // 初回デフォルトオープン済みの場所ID

function _startActionById(actionId) {
  const facility = FACILITIES[actionId];
  if (facility) { _enterFacility(facility); return; }
  const action = ACTIONS[actionId];
  if (!action) return;
  const running = getState().activeAction;
  if (running) {
    const curAction = ACTIONS[running.actionId];
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    _cancelled = true;
    cancelAction();
    _resetPendingCompanionRewards();
    addLog(`【${actionDisplayHtml(curAction)}】中断`, true, true);
  }
  selectedActionId = actionId;
  setSelectedActionId(actionId);
  setActionPickerLabel(action);
  if (!_storyLogPlaying) {
    _resetPendingCompanionRewards();
    startAction(actionId, makeActionCallbacks(actionId));
  }
}

// 施設に入店する。メインパネルに専用メニュー(行動を選ぶ/買い物する/出る)を表示する
function _formatShopItemLabel(item) {
  const companion = item.companionId
    ? `（${COMPANION_DATA[item.companionId]?.name ?? item.companionId}の品）`
    : '';
  const description = item.description
    ? `<span class="facility-shop-item-desc">${item.description}</span>`
    : '';
  return `<span class="facility-shop-item-name">${resLabel(item.id)}${companion}</span>${description}<span class="facility-shop-item-price">${item.price}${resUnit('magcoin') || 'マグコイン'}</span>`;
}

// 施設メニューの選択肢が「？？？」表示のロック中かどうか(イベント経由で解放される選択肢のみ対象)
function _isFacilityOptionLocked(facilityId, optionId, state) {
  // 花が増えて店が忙しくなった段階で解放する予定。条件確定までは常にロックする。
  if (facilityId === 'nostalgia_flower' && optionId === 'help') return true;
  if (facilityId === 'nostalgia_flower' && optionId === 'talk') return (state.shopPurchaseCount?.flower ?? 0) < 3;
  return false;
}

// 花屋店員との会話は段階制。段階が進むごとに内容が更新され、最後まで読むと次の展開が動き出す。
// 1. 買い物3回で解放。最後まで読むと「手伝う」が解放される
// 2. 手伝いを10回終えると内容が更新。最後まで読むと雪架の花の依頼が始まる
// 3. それ以降は落ち着いた定型の会話になる(会話文はいずれも仮で、正式な文面は後日執筆)
function _flowerClerkDialogue(state) {
  if (!state.flowerHelpUnlocked) {
    return state.flowerEncyclopediaUnlocked
      ? '「図鑑に、失われた花の手がかりが残っているといいのですが……」'
      : '「図書館なら、失われた花について何かわかるかもしれません」';
  }
  if ((state.actionCount?.nostalgia_flower_help ?? 0) < 10) {
    return '「いつも、お手伝いありがとうございます」';
  }
  if (!state.flowerClerkTalkSeen) {
    return '「実は、雪架さんが魔界王都に咲く花を探しているみたいで……」';
  }
  return '「今日も、ありがとうございます」';
}

function _enterFacility(facility) {
  selectedActionId = facility.id;
  setSelectedActionId(facility.id);
  setActionPickerLabel(facility);
  _pauseForStory();
  _storyLogPlaying = true;
  const state = getState();
  const options = facility.options.map(o => ({
    ...o,
    icon: actionIconSvg(o.label),
    locked: _isFacilityOptionLocked(facility.id, o.id, state),
  }));
  if (facility.id === 'starlit_observatory') {
    const task = state.companionTasks?.shizuku;
    const remainingMinutes = task?.type === 'observatory_research'
      ? Math.max(1, Math.ceil((task.endsAt - Date.now()) / 60000))
      : 0;
    options.push({
      id: 'research_status',
      label: '資料調査',
      type: 'talk',
      speaker: 'シズク',
      getProgress: () => {
        const currentState = getState();
        const currentTask = currentState.companionTasks?.shizuku;
        if (currentTask?.type === 'observatory_research') {
          return getCompanionTaskProgress('shizuku') ?? 0;
        }
        return currentState.observatoryResearchDone ? 1 : 0;
      },
      getProgressText: () => {
        const currentState = getState();
        const currentTask = currentState.companionTasks?.shizuku;
        if (currentTask?.type !== 'observatory_research') {
          return currentState.observatoryResearchDone ? '調査完了' : '待機中';
        }
        const remainingSeconds = Math.max(0, Math.ceil((currentTask.endsAt - Date.now()) / 1000));
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = String(remainingSeconds % 60).padStart(2, '0');
        return `残り ${minutes}:${seconds}`;
      },
      dialogue: task?.type === 'observatory_research'
        ? `「まだ調べているところだ。あと${remainingMinutes}分くらいかかりそうだ」`
        : state.observatoryResearchDone
          ? '「ひと通り調べ終わった。少し気になることがある」'
          : '「この資料、少し時間をかけて調べてみたい」',
    });
  }
  if (facility.id === 'nostalgia_flower') {
    const talk = options.find(option => option.id === 'talk');
    if (talk) {
      talk.speaker = '花屋の店員';
      if (getQuestStatus(state, 'lost_flowers') === QUEST_STATUS.UNAVAILABLE) {
        talk.trigger = 'lost_flowers_intro';
      }
      // getter化: 同じ施設セッション内で段階が進んでも(例: 会話を見てflowerHelpUnlockedが変わった直後に
      // もう一度話しかけた場合)、次に開いた時は最新のstateに基づく内容を表示する
      Object.defineProperty(talk, 'dialogue', { get: () => _flowerClerkDialogue(getState()), configurable: true });
      // 「手伝う」の解放時期は未定。現時点では後続会話の既読処理だけを行う。
      talk.onDone = () => {
        const s = getState();
        if (s.flowerHelpUnlocked && (s.actionCount?.nostalgia_flower_help ?? 0) >= 10 && !s.flowerClerkTalkSeen) {
          markFlowerClerkTalkSeen();
        }
      };
    }
  }
  if (facility.id === 'nostalgia_library') {
    const restorationQuestStatus = getQuestStatus(state, 'restore_continent_chronicle');
    const restorationAccepted = [
      QUEST_STATUS.ACTIVE,
      QUEST_STATUS.COMPLETED,
      QUEST_STATUS.REPORTED,
    ].includes(restorationQuestStatus);
    options.push({
      id: 'restore_books',
      label: '復元',
      heading: '復元する本を選ぶ',
      type: 'submenu',
      style: 'bookshelf',
      icon: actionIconSvg('復元'),
      locked: !restorationAccepted,
      options: [
        {
          id: 'world_chronicle',
          label: '大陸誌',
          type: 'world_chronicle',
          icon: actionIconSvg('大陸誌'),
          bookTone: 'world',
          bookWidth: 38,
          locked: !state.worldChronicleUnlocked,
        },
        {
          id: 'flower_encyclopedia',
          label: '花の図鑑',
          type: 'flower_encyclopedia',
          icon: actionIconSvg('花の図鑑'),
          bookTone: 'flower',
          bookWidth: 29,
          locked: !state.flowerEncyclopediaUnlocked,
        },
        {
          id: 'ancient_grimoire',
          label: '古代魔術書',
          type: 'ancient_grimoire',
          icon: actionIconSvg('古代魔術書'),
          bookTone: 'magic',
          bookWidth: 33,
          disabled: true,
        },
        {
          id: 'labyrinth_theory',
          label: '迷宮理論',
          type: 'labyrinth_theory',
          icon: actionIconSvg('迷宮理論'),
          bookTone: 'labyrinth',
          bookWidth: 25,
          disabled: true,
        },
        {
          id: 'easy_cooking_recipes',
          label: 'かんたん！料理',
          type: 'easy_cooking_recipes',
          icon: actionIconSvg('かんたん！料理'),
          bookTone: 'cooking',
          bookWidth: 31,
          disabled: true,
        },
      ],
    });
  }
  let cleanup = null;
  cleanup = runFacilityMenu(els.mainPanel, {
    label: facility.label,
    description: facility.description,
    icon: actionIconSvg(facility.label),
    enterText: facility.enterText,
    options,
    getShopItems,
    formatShopItem: _formatShopItemLabel,
    getCurrency: () => ({ label: resLabel('magcoin'), amount: getState().resources.magcoin ?? 0, color: resColor('magcoin') }),
    onBuy: (shopId, itemId) => {
      const beforeFlowerCount = getState().shopPurchaseCount?.flower ?? 0;
      const result = buyShopItem(shopId, itemId);
      if (result.ok) {
        const label = resLabel(result.itemId);
        const extra = result.companionId ? `（${COMPANION_DATA[result.companionId]?.name ?? result.companionId}の品）` : '';
        const afterFlowerCount = getState().shopPurchaseCount?.flower ?? 0;
        // 3回目の購入をまたいだ瞬間だけ、店を閉じずにログで「話す」解放を知らせる
        if (shopId === 'flower' && beforeFlowerCount < 3 && afterFlowerCount >= 3) {
          const talk = options.find(option => option.id === 'talk');
          if (talk) talk.locked = false;
          addLog('【花屋】店員と話ができるようになった！', true);
        }
        return {
          message: `${label}${extra}を ${result.price}マグコインで買った`,
        };
      }
      if (result.reason === 'magcoin') return { message: 'マグコインが足りない…' };
      return { message: '今は買えそうな品がない…' };
    },
    onSelectAction: (subActionId) => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      _startActionById(subActionId);
    },
    onSelectOption: (option) => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      if (option.type === 'world_chronicle') openWorldChronicle();
      if (option.type === 'flower_encyclopedia') openFlowerEncyclopedia();
    },
    onTrigger: (trigger) => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      if (trigger === 'lost_flowers_intro') setTimeout(startLostFlowersIntro, 0);
    },
    onLeave: () => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      _revertActionSelection();
    },
  });
}

function openWorldChronicle() {
  const overlay = document.getElementById('world-chronicle-overlay');
  const list = document.getElementById('world-chronicle-list');
  const state = getState();
  document.querySelector('.world-chronicle-title').textContent = '大陸誌';
  document.querySelector('.world-chronicle-meta').textContent = '各地の調査記録を集め、失われた頁を復元する';
  list.innerHTML = '';

  for (const location of Object.values(LOCATIONS)) {
    const entry = WORLD_CHRONICLE_ENTRIES[location.id];
    if (!entry) continue;
    const discovered = state.unlockedLocations.includes(location.id);
    const recordCount = entry ? Math.min(state.resources[entry.recordResource] ?? 0, entry.required) : 0;
    const restored = state.restoredWorldChronicleEntries.includes(location.id) ||
      (entry && recordCount >= entry.required);
    const item = document.createElement('div');
    item.className = `chronicle-entry${restored ? ' restored' : ''}`;

    const title = document.createElement('div');
    title.className = 'chronicle-entry-title';
    title.textContent = discovered ? location.label : '判読できない頁';
    item.appendChild(title);

    const body = document.createElement('div');
    body.className = 'chronicle-entry-body';
    body.textContent = restored
      ? (entry?.body ?? location.description)
      : discovered
        ? '文字は擦り切れ、ほとんど読むことができない。'
        : '頁全体が曖昧にぼやけている。';
    item.appendChild(body);

    if (discovered && !restored && entry) {
      const progress = document.createElement('div');
      progress.className = 'chronicle-entry-progress';
      progress.textContent = `調査記録 ${recordCount}/${entry.required}`;
      item.appendChild(progress);
    }
    list.appendChild(item);
  }

  overlay.classList.add('open');
}

let _bookSpreads = [];
let _bookSpreadIndex = 0;
let _bookOpened = false;

function _bookText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _renderBookSpread() {
  const left = document.getElementById('book-left-page');
  const right = document.getElementById('book-right-page');
  const prev = document.getElementById('book-prev-btn');
  const next = document.getElementById('book-next-btn');
  const indicator = document.getElementById('book-page-indicator');
  if (!_bookOpened) {
    indicator.textContent = '表紙';
    prev.disabled = true;
    next.disabled = true;
    return;
  }
  const spread = _bookSpreads[_bookSpreadIndex];
  left.innerHTML = spread?.left ?? '';
  right.innerHTML = spread?.right ?? '';
  indicator.textContent = `${_bookSpreadIndex + 1} / ${_bookSpreads.length}`;
  prev.disabled = _bookSpreadIndex === 0;
  next.disabled = _bookSpreadIndex >= _bookSpreads.length - 1;
}

function _openBook({ title, subtitle, mark = '❈', spreads }) {
  const overlay = document.getElementById('book-viewer-overlay');
  const viewer = document.getElementById('book-viewer');
  _bookSpreads = spreads;
  _bookSpreadIndex = 0;
  _bookOpened = false;
  document.getElementById('book-viewer-heading').textContent = title;
  document.getElementById('book-cover-title').textContent = title;
  document.getElementById('book-cover-subtitle').textContent = subtitle;
  document.getElementById('book-cover-mark').textContent = mark;
  viewer.classList.remove('open');
  viewer.classList.add('closed');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  _renderBookSpread();
}

function _closeBook() {
  const overlay = document.getElementById('book-viewer-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  _bookOpened = false;
  _bookSpreads = [];
}

function openFlowerEncyclopedia() {
  const state = getState();
  const discoveredIds = new Set(state.discoveredResources ?? []);
  const contents = FLOWERS.map((flower, index) => {
    const discovered = discoveredIds.has(flower.id);
    return `<li class="${discovered ? '' : 'unknown'}"><span>${discovered ? _bookText(flower.label) : '判読不能'}</span><span>${index + 3}</span></li>`;
  }).join('');
  const spreads = [{
    left: `
      <div class="book-page-content">
        <div class="book-eyebrow">THE BOOK OF LOST FLOWERS</div>
        <h2>花の図鑑</h2>
        <div class="book-latin">a record of flowers once known</div>
        <div class="book-copy">この本は、大陸に咲く花々について記したものである。<br>多くの頁は傷み、文字も挿絵も失われている。</div>
      </div>
      <span class="book-page-number">1</span>`,
    right: `
      <div class="book-page-content">
        <div class="book-eyebrow">目次</div>
        <ol class="book-contents">${contents}</ol>
      </div>
      <span class="book-page-number">2</span>`,
  }];

  FLOWERS.forEach((flower, index) => {
    const discovered = discoveredIds.has(flower.id);
    const unreadable = discovered ? '' : ' unreadable';
    const label = _bookText(flower.label);
    const description = _bookText(flower.desc);
    const color = _bookText(resColor(flower.id));
    const page = index * 2 + 3;
    spreads.push({
      left: `
        ${discovered ? '' : '<div class="book-clear-note">まだ読めない</div>'}
        <div class="book-page-content${unreadable}">
          <div class="book-eyebrow">植物記録 ／ ${String(index + 1).padStart(2, '0')}</div>
          <h2>${label}</h2>
          <div class="book-latin">${_bookText(flower.realFlower)}</div>
          <div class="book-illustration"><div class="book-flower-glyph" style="--book-flower-color:${color}">❈</div></div>
        </div>
        <span class="book-page-number">${page}</span>`,
      right: `
        ${discovered ? '' : '<div class="book-clear-note book-mobile-only">まだ読めない</div>'}
        <div class="book-page-content${unreadable}">
          <div class="book-mobile-only">
            <div class="book-eyebrow">植物記録 ／ ${String(index + 1).padStart(2, '0')}</div>
            <h2>${label}</h2>
          </div>
          <div class="book-eyebrow">${label}について</div>
          <div class="book-copy">${description}。</div>
        </div>
        <span class="book-page-number">${page + 1}</span>`,
    });
  });

  _openBook({
    title: '花の図鑑',
    subtitle: '失われた花々についての記録',
    spreads,
  });
}

function _handleActionComplete(actionId, result) {
  const { discovered = [], allRewards, companionRewards, worldLvUp, rareDrop, flowerEncyclopediaFound, receivedQuests = [], progressedQuests = [], completedStoryQuests = [], discoveredConstellations = [] } = result;
  for (const id of discoveredConstellations) {
    const constellation = CONSTELLATIONS.find(item => item.id === id);
    addLog(`【星座発見】${constellation?.name ?? id}`, true, false, false, 'log-rare');
  }
  const act = ACTIONS[actionId];

  if (act?.stub) {
    addLog(`【${act.label}】はまだ準備中だ・・・`, true);
    return;
  }

  const _rewardHtml = ({ resource, amount }, wrapClass) => {
    const span = `${resourceSpan(resource, resLabel(resource))} +${amount}`;
    return wrapClass ? `<span class="${wrapClass}">${span}</span>` : span;
  };
  const normalRewards = (allRewards ?? []).filter(r => !RESOURCES[r.resource]?.highlight);
  const highlightRewards = (allRewards ?? []).filter(r => RESOURCES[r.resource]?.highlight);
  const rewardsHtml = normalRewards.map(r => _rewardHtml(r)).join(', ');
  if (_companionLogMode === 'detailed') {
    const companionHtml = (companionRewards ?? [])
      .map(reward => _rewardHtml(reward, 'log-companion-reward'))
      .join(', ');
    const fullRewards = companionHtml ? `${rewardsHtml} / ${companionHtml}` : rewardsHtml;
    addLog(`【${actionDisplayHtml(act)}】完了 — ${fullRewards}`, true, true);
    _resetPendingCompanionRewards();
  } else {
    addLog(`【${actionDisplayHtml(act)}】完了 — ${rewardsHtml}`, true, true);
    const companionTotals = new Map(_pendingCompanionRewards);
    for (const { resource, amount } of companionRewards ?? []) {
      companionTotals.set(resource, (companionTotals.get(resource) ?? 0) + amount);
    }
    _resetPendingCompanionRewards();
    if (companionTotals.size > 0) {
      const summary = [...companionTotals]
        .map(([resource, amount]) => _rewardHtml({ resource, amount }, 'log-companion-reward'))
        .join(' / ');
      addLog(`【同行者の成果】${summary}`, false, true);
    }
  }
  for (const r of highlightRewards) {
    addLog(`【！】${resourceSpan(r.resource, resLabel(r.resource))} +${r.amount} を入手した`, true, true);
  }

  if (flowerEncyclopediaFound) {
    // 発見を区切りとして探索の繰り返しを止める。本はログから任意で開ける。
    _cancelled = true;
    if (getState().autoRepeat) setAutoRepeat(false);
    addLog(
      '【図書館】失われた本棚から「花の図鑑」を見つけた'
      + '<button type="button" class="log-action-btn" data-open-book="flower-encyclopedia">本を開く</button>',
      true,
      true,
      false,
      'log-rare',
    );
  }

  for (const questId of receivedQuests) {
    const quest = getQuestDefinition(questId);
    if (!quest) continue;
    addLog(`【！】依頼「${quest.title}」を受けた`, true, false, false, 'log-rare');
  }
  for (const questId of progressedQuests) {
    const quest = getQuestDefinition(questId);
    if (!quest) continue;
    addLog(`【依頼】${quest.progressLog ?? `「${quest.title}」の手がかりを見つけた`}`, true, false, false, 'log-rare');
    _flashQuestTab();
  }
  if (completedStoryQuests.includes('find_starlit_observatory')) {
    _cancelled = true;
    if (getState().autoRepeat) setAutoRepeat(false);
    setTimeout(startStarlitObservatoryDiscovery, 0);
  }
  if (receivedQuests.length > 0) {
    renderQuestList(getState());
    _flashQuestTab();
  }

  if (worldLvUp != null) {
    const next = WORLD_LV_THRESHOLDS[worldLvUp];
    const nextStr = next != null ? `（次: ${next}lg）` : '（最大）';
    addLog(`【世界】worldLv が ${worldLvUp} になった ${nextStr}`, true);
    if (worldLvUp === 1) {
      addTutorialLog(
        'world-lv-1',
        '世界の再生',
        'フラグメントを集めると、記憶を取り戻し、世界を再生することができます。worldLvは、世界再生の指標です。また、フラグメントを使って、各場所の再生Lvをあげることができます。',
      );
    }
  }

  if (discovered.some(item => item.type === 'action' && item.id === 'nostalgia_flower')) {
    setTimeout(startFlowerShopDiscovery, 0);
  }

  // レアドロップ → アイテム発見ログのあと、加入イベントを再生してから同行者を解放
  if (rareDrop) {
    const itemLabel = resLabel(rareDrop.resource);
    addLog(`【！】${resourceSpan(rareDrop.resource, itemLabel)} を見つけた`, true, true);
    setTimeout(() => startCompanionJoin(rareDrop.companionId), 0);
  }
}

// 行動中にエンカウントが発生し、強制中断された(forest_exploreの「亡者の群れ」など。ENCOUNTERS参照)
// 自動再開(autoRepeat)はせず完全停止する。_cancelledを立てることで、render()内の自動再開判定を素通りさせる
function _handleEncounter(actionId, { evaded, enemyLabel } = {}) {
  _cancelled = true;
  _resetPendingCompanionRewards();
  const label = enemyLabel ?? '何か';
  addLog(evaded ? `【！】${label}に遭遇したが、難を逃れた` : `【！】${label}に遭遇した！探索は中断した…`, true, true);
  render(getState());
}

// レアドロップ後の同行者加入イベントを再生し、完了後にunlockCompanionする
function startCompanionJoin(companionId) {
  enqueueLogStory(`companion_join:${companionId}`, (finish) => {
    let cleanup = null;
    cleanup = runCompanionJoin(companionId, els.mainPanel, {
      initialName: getState().playerName,
      onComplete: () => {
        unlockCompanion(companionId);
        const compName = COMPANION_DATA[companionId]?.name ?? companionId;
        addLog(`【同行】${compName} が仲間になった`, true);
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

function startFlowerShopDiscovery() {
  enqueueLogStory('facility_discovery:nostalgia_flower', (finish) => {
    let cleanup = null;
    cleanup = runFlowerShopDiscovery(els.mainPanel, {
      onComplete: () => {
        addLog('【施設発見】花屋 竜の鱗', true, false, false, 'log-rare');
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

function startLostFlowersIntro() {
  if (getQuestStatus(getState(), 'lost_flowers') !== QUEST_STATUS.UNAVAILABLE) return;
  enqueueLogStory('quest_intro:lost_flowers', (finish) => {
    let cleanup = null;
    cleanup = runLostFlowersIntro(els.mainPanel, {
      initialName: getState().playerName,
      onComplete: () => {
        activateQuest('lost_flowers');
        addLog('【長期依頼】「失われた花」を引き受けた', true, false, false, 'log-rare');
        _flashQuestTab();
        finish(
          () => { if (cleanup) { cleanup(); cleanup = null; } },
          () => addLog('て言っても、どうやって調べればいいんだろう。花に詳しい人か、花の図鑑みたいなものがどこかにないかな？', false),
        );
      },
    });
  });
}

function startStarlitObservatoryDiscovery() {
  enqueueLogStory('quest_story:starlit_observatory_discovery', (finish) => {
    let cleanup = null;
    cleanup = runStarlitObservatoryDiscovery(els.mainPanel, {
      onComplete: () => {
        unlockAction('starlit_observatory');
        startObservatoryResearch();
        completeStoryQuest('find_starlit_observatory');
        addLog('【別行動】シズクが星空研究所で資料の調査を始めた', true);
        addTutorialLog(
          'separate-action',
          '別行動',
          '仲間が別行動を始めました。別行動は、ゲームを閉じている間も進行します。別行動中の仲間は、探索へ同行できません。同行メニューから、様子を確認することができます。',
        );
        addLog('【依頼完了】「星空研究所を探す」', true, false, false, 'log-rare');
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

// 行動アイコン(行動名で判定。未知の行動名は汎用アイコンにフォールバック)
const _ICON_SEARCH  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/></svg>`;
const _ICON_GATHER   = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><line x1="5" y1="19" x2="13" y2="11"/></svg>`;
const _ICON_BED      = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 19h18"/><path d="M3 14h18"/></svg>`;
const _ICON_FLOWER   = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/></svg>`;
const _ICON_BOOK     = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
const _ICON_GEM      = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M9 3l3 6-3 12"/><path d="M15 3l-3 6 3 12"/></svg>`;
const _ICON_DEFAULT  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`;
const _ICON_TALK     = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`;

const _ICON_AXE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3l7 7-3 3-7-7z"/><path d="M11 6L4 13l3 3 7-7"/><line x1="6" y1="15" x2="3" y2="21"/></svg>`;

const ACTION_ICONS = {
  '探索':          _ICON_SEARCH,
  '採集':          _ICON_GATHER,
  '木こり':        _ICON_AXE,
  '宿屋 尻尾亭':    _ICON_BED,
  '花屋 竜の鱗':    _ICON_FLOWER,
  'ノスタルジア図書館': _ICON_BOOK,
  '道具屋 リーリエ': _ICON_GEM,
  '調査':          _ICON_SEARCH,
  '復元':          _ICON_BOOK,
  '大陸誌':        _ICON_BOOK,
  '花の図鑑':      _ICON_FLOWER,
  '古代魔術書':    _ICON_BOOK,
  '迷宮理論':      _ICON_BOOK,
  'かんたん！料理': _ICON_BOOK,
  '休む':          _ICON_BED,
  '手伝う':        _ICON_FLOWER,
  '店員と話す':    _ICON_TALK,
};

function actionIconSvg(label) {
  return ACTION_ICONS[label] ?? _ICON_DEFAULT;
}

function renderActionList() {
  const state = getState();

  // 既存セーブの初回: 現在解放済みの場所/行動は「既読」としてシード(過去分を新着扱いしない)
  if (_seenDiscoveries === null) {
    _seenDiscoveries = new Set([...state.unlockedLocations, ...state.unlockedActions]);
    _persistSeenDiscoveries();
  }

  els.actionList.innerHTML = '';
  const runningId = state.activeAction?.actionId ?? null;

  for (const location of Object.values(LOCATIONS)) {
    if (!state.unlockedLocations.includes(location.id)) continue;
    // nostalgia解放後はwhereverを非表示（ノスタルジアにすり替わった）
    if (location.id === 'wherever' && state.unlockedLocations.includes('nostalgia')) continue;
    const actions = Object.values(ACTIONS).filter(a =>
      a.locationId === location.id && state.unlockedActions.includes(a.id)
    ).map(a => ({ ...a, _kind: 'action' }));
    const facilities = Object.values(FACILITIES).filter(f =>
      f.locationId === location.id && state.unlockedActions.includes(f.id)
    ).map(f => ({ ...f, _kind: 'facility' }));
    const items = [...actions, ...facilities];
    if (items.length === 0) continue;

    // 初回のみ開いておく（以降はユーザーの開閉状態を維持）
    if (!_seenSections.has(location.id)) {
      _seenSections.add(location.id);
      _openSections.add(location.id);
    }

    const section = document.createElement('div');
    section.className = 'action-section' + (_openSections.has(location.id) ? ' open' : '');

    // 場所ヘッダー
    const header = document.createElement('div');
    header.className = 'action-place-header';
    header.innerHTML = `<span class="action-place-toggle">▶</span><span class="action-place-name">${location.label || 'どこか'}</span>`;
    header.addEventListener('click', () => {
      if (_openSections.has(location.id)) _openSections.delete(location.id);
      else _openSections.add(location.id);
      section.classList.toggle('open');
    });

    // 新しく追加された場所なら通知ドット(地図タブを開くまで既読化されない)
    if (_seenDiscoveries && !_seenDiscoveries.has(location.id)) {
      const dot = document.createElement('span');
      dot.className = 'notify-dot';
      header.appendChild(dot);
    }

    if (location.description) {
      const infoBtn = document.createElement('button');
      infoBtn.className = 'location-info-btn';
      // LocationLvを今すぐ上げられる時は、アイコン自体を点滅させる(レベルアップ画面を開けるボタン)
      if (_canLevelUpLocation(location.id, state)) infoBtn.classList.add('glow');
      infoBtn.innerHTML = `<img src="resource/icon/icon_area.svg" width="14" height="14" style="display:block;">`;
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showLocationPopup(location, infoBtn);
      });
      header.appendChild(infoBtn);
    }

    section.appendChild(header);

    // 行動リスト
    const rows = document.createElement('div');
    rows.className = 'action-rows';

    for (const action of items) {
      const row = document.createElement('div');
      const isRunning = runningId === action.id;
      const isSelected = selectedActionId === action.id;
      row.className = 'action-row' + (isSelected ? ' selected' : '') + (isRunning ? ' running' : '');

      const icon = document.createElement('span');
      icon.className = 'action-row-icon';
      icon.innerHTML = actionIconSvg(action.label);

      const name = document.createElement('span');
      name.className = 'action-row-name' + (action._kind === 'facility' ? ' facility-name' : '');
      name.textContent = action.label;
      if (action._kind === 'action') {
        const actionLv = state.ActionLv?.[action.id] ?? 0;
        const lvTag = document.createElement('span');
        lvTag.className = 'action-row-lv';
        lvTag.textContent = ` Lv${actionLv}`;
        name.appendChild(lvTag);
      }

      const desc = document.createElement('span');
      desc.className = 'action-row-desc';
      desc.textContent = action.description ?? '';

      const time = document.createElement('span');
      time.className = 'action-row-time';
      time.textContent = action._kind === 'facility' ? '入る' : `${action.duration / 1000}秒`;

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedActionId = action.id;
        setSelectedActionId(action.id);
        setActionPickerLabel(action);
        renderActionList();
      });

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(desc);
      row.appendChild(time);
      rows.appendChild(row);
    }

    section.appendChild(rows);
    els.actionList.appendChild(section);
  }
}

function _revertActionSelection() {
  const running = getState().activeAction;
  if (running) {
    const action = ACTIONS[running.actionId];
    selectedActionId = running.actionId;
    if (action) setActionPickerLabel(action);
  }
  renderActionList();
}

function initActionPicker() {
  renderActionList();
  els.actionPickerBtn.addEventListener('click', () => {
    if (_storyLogPlaying) { els.mainPanel.click(); return; }
    renderActionList();
    switchTab('view-actions');
  });

  document.addEventListener('click', (e) => {
    if (!els.actionList.contains(e.target)) {
      const running = getState().activeAction;
      if (running && selectedActionId !== running.actionId) {
        _revertActionSelection();
      }
    }
  });
}

// ── 物語ポップアップ ──
// モード切替ボタンのアイコン(現在のモードを表示)
const _PAGE_MODE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
const _SCROLL_MODE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;

function _updateModeToggleBtn() {
  const btn = els.storyModeToggleBtn;
  if (!btn) return;
  // 切り替え先のモードのアイコンを表示
  btn.innerHTML = _viewerScrollMode ? _PAGE_MODE_ICON : _SCROLL_MODE_ICON;
  btn.title = _viewerScrollMode ? 'ページ送り表示に切り替え' : 'スクロール表示に切り替え';
}

function initStoryViewer() {
  els.storyCloseBtn.addEventListener('click', closeStory);
  els.mainPanel.addEventListener('click', event => {
    const button = event.target.closest('[data-open-book="flower-encyclopedia"]');
    if (!button) return;
    openFlowerEncyclopedia();
  });
  const chronicleOverlay = document.getElementById('world-chronicle-overlay');
  document.getElementById('world-chronicle-close').addEventListener('click', () => chronicleOverlay.classList.remove('open'));
  chronicleOverlay.addEventListener('click', e => {
    if (e.target === chronicleOverlay) chronicleOverlay.classList.remove('open');
  });
  const bookOverlay = document.getElementById('book-viewer-overlay');
  const bookViewer = document.getElementById('book-viewer');
  document.getElementById('book-open-btn').addEventListener('click', () => {
    _bookOpened = true;
    bookViewer.classList.remove('closed');
    bookViewer.classList.add('open');
    _renderBookSpread();
  });
  document.getElementById('book-close-btn').addEventListener('click', _closeBook);
  document.getElementById('book-prev-btn').addEventListener('click', () => {
    if (_bookOpened && _bookSpreadIndex > 0) {
      _bookSpreadIndex--;
      _renderBookSpread();
    }
  });
  document.getElementById('book-next-btn').addEventListener('click', () => {
    if (_bookOpened && _bookSpreadIndex < _bookSpreads.length - 1) {
      _bookSpreadIndex++;
      _renderBookSpread();
    }
  });
  document.getElementById('book-spread').addEventListener('click', event => {
    if (!_bookOpened) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const buttonId = event.clientX - rect.left > rect.width / 2 ? 'book-next-btn' : 'book-prev-btn';
    document.getElementById(buttonId).click();
  });
  document.addEventListener('keydown', event => {
    if (!bookOverlay.classList.contains('open')) return;
    if (event.key === 'ArrowLeft') document.getElementById('book-prev-btn').click();
    if (event.key === 'ArrowRight') document.getElementById('book-next-btn').click();
    if (event.key === 'Escape') _closeBook();
  });
  els.storyOverlay.addEventListener('click', e => {
    if (e.target === els.storyOverlay) closeStory();
  });

  _updateModeToggleBtn();
  els.storyModeToggleBtn.addEventListener('click', () => {
    _viewerScrollMode = !_viewerScrollMode;
    try { localStorage.setItem('fr_viewer_scrollmode', _viewerScrollMode ? '1' : '0'); } catch {}
    if (!_viewerScrollMode && _viewerStoryId) {
      // ページモードへ戻る時、最新の解放ページを表示
      const up = getState().storyProgress[_viewerStoryId] ?? 0;
      _viewerCurrentPage = Math.max(0, computeRevealedPages(_viewerPages, up) - 1);
    }
    _updateModeToggleBtn();
    if (_viewerStoryId) renderViewerBody(getState(), { scrollToTop: true });
  });

  document.getElementById('story-fin-bar').addEventListener('click', e => {
    if (!_viewerStoryId) return;
    if (_viewerScrollMode) return;
    if (e.target.closest('.story-nav-btn')) return;
    const bar = e.currentTarget;
    const isRight = e.clientX - bar.getBoundingClientRect().left > bar.offsetWidth / 2;
    if (isRight) {
      const pages = _viewerPages;
      // revealedPages を再計算
      const state = getState();
      const unlockedParas = state.storyProgress[_viewerStoryId] ?? 0;
      const revealedPages = computeRevealedPages(pages, unlockedParas);
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
const _logStoryQueue = [];
const _queuedLogStoryIds = new Set();
let _activeLogStoryId = null;
const _PENDING_LOG_STORY_KEY = 'fr_pending_log_story_id';

function _savePendingLogStory(id) {
  try { localStorage.setItem(_PENDING_LOG_STORY_KEY, id); } catch {}
}

function _clearPendingLogStory(id = null) {
  try {
    if (id && localStorage.getItem(_PENDING_LOG_STORY_KEY) !== id) return;
    localStorage.removeItem(_PENDING_LOG_STORY_KEY);
  } catch {}
}

function enqueueLogStory(id, start) {
  if (_activeLogStoryId === id || _queuedLogStoryIds.has(id)) return;
  _queuedLogStoryIds.add(id);
  _logStoryQueue.push({ id, start });
  drainLogStoryQueue();
}

function drainLogStoryQueue() {
  if (_storyLogPlaying || _activeLogStoryId || _logStoryQueue.length === 0) return;
  const next = _logStoryQueue.shift();
  _queuedLogStoryIds.delete(next.id);
  _activeLogStoryId = next.id;
  _savePendingLogStory(next.id);
  _pauseForStory();
  _storyLogPlaying = true;

  next.start((cleanup, extraFn) => {
    if (cleanup) cleanup();
    if (extraFn) extraFn();
    _clearPendingLogStory(next.id);
    _activeLogStoryId = null;
    _storyLogPlaying = false;

    if (_logStoryQueue.length > 0) {
      drainLogStoryQueue();
      render(getState());
      return;
    }
    _onLogStComplete();
  });
}

function _recoverPendingLogStory() {
  let id = '';
  try { id = localStorage.getItem(_PENDING_LOG_STORY_KEY) || ''; } catch {}
  if (!id) {
    // 永続化対応前に星空研究所の物語途中でリロードされたセーブも救済する。
    const state = getState();
    if (
      getQuestStatus(state, 'find_starlit_observatory') === QUEST_STATUS.COMPLETED &&
      !(state.unlockedActions ?? []).includes('starlit_observatory')
    ) {
      startStarlitObservatoryDiscovery();
    }
    return;
  }

  if (id.startsWith('companion_join:')) {
    startCompanionJoin(id.slice('companion_join:'.length));
    return;
  }

  const starters = {
    log_st_1: () => startLogSt_1(),
    log_st_2: () => startLogSt_2(getState()),
    log_st_3: () => startLogSt_3(),
    log_st_4: () => startLogSt_4(),
    world_chronicle_intro: () => startWorldChronicleIntro(),
    all_companions_met: () => startAllCompanionsMet(),
    'facility_discovery:nostalgia_flower': () => startFlowerShopDiscovery(),
    'quest_intro:lost_flowers': () => startLostFlowersIntro(),
    'quest_story:starlit_observatory_discovery': () => startStarlitObservatoryDiscovery(),
  };
  const start = starters[id];
  if (start) start();
  else _clearPendingLogStory(id);
}

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

// ログストーリー再生中は行動が一時停止するため、フレーバーテキストの表示も止める
function _pauseForStory() {
  if (stopFlavor) { stopFlavor(); stopFlavor = null; }
  pauseAction();
}

function _onLogStComplete(cleanup, extraFn) {
  resumeAction();
  _storyLogPlaying = false;
  if (cleanup) cleanup();
  if (extraFn) extraFn();
  render(getState());
  drainLogStoryQueue();
  if (_storyLogPlaying) return;
  // ポーズ中に止めていたフレーバーテキストを再開
  const resumedState = getState();
  if (resumedState.activeAction && !stopFlavor) {
    const companions = (resumedState.activeCompanions ?? [])
      .map(id => COMPANION_DATA[id] ? { id, name: COMPANION_DATA[id].name } : null)
      .filter(Boolean);
    const resumedAction = ACTIONS[resumedState.activeAction.actionId];
    const locationLv = resumedState.LocationLv?.[resumedAction?.locationId] ?? 0;
    stopFlavor = startFlavorScheduler(resumedState.activeAction.actionId, text => addLog(text), { companions, locationLv });
  }
}

function startLogSt_2(state) {
  if (state.logSt2Done) return;
  enqueueLogStory('log_st_2', (finish) => {
    let cleanup = null;
    cleanup = runLogSt_2(els.mainPanel, {
      onComplete: () => {
        setLogSt2Done();
        finish(
          () => { if (cleanup) { cleanup(); cleanup = null; } },
          () => addLog('フラグメントをもっと集めてみよう...', false),
        );
      },
    });
  });
}

function startLogSt_1() {
  const state = getState();
  if (state.logSt1Done) return;
  enqueueLogStory('log_st_1', (finish) => {
    _waitingForPrologue = false;
    if (_logStCleanup) { _logStCleanup(); _logStCleanup = null; }
    _logStCleanup = runLogSt_1(els.mainPanel, {
      onNameDecided: (name) => {
        setPlayerName(name);
        renderCharTab(getState());
      },
      onComplete: () => {
        setLogSt1Done();
        unlockCompanion('yuya');
        addLog('【同行】ユウヤが仲間になった', true);
        finish(() => { if (_logStCleanup) { _logStCleanup(); _logStCleanup = null; } });
      },
    });
  });
}

function startLogSt_3() {
  const state = getState();
  if (state.logSt3Done) return;
  enqueueLogStory('log_st_3', (finish) => {
    let cleanup = null;
    cleanup = runLogSt_3(els.mainPanel, {
      onComplete: () => {
        setLogSt3Done();
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

function startLogSt_4() {
  const state = getState();
  if (state.logSt4Done) return;
  enqueueLogStory('log_st_4', (finish) => {
    let cleanup = null;
    cleanup = runLogSt_4(els.mainPanel, {
      onComplete: () => {
        setLogSt4Done();
        finish(
          () => { if (cleanup) { cleanup(); cleanup = null; } },
          () => {
            addResources('guide_earring', 1);
            addLog(`【！】${resourceSpan('guide_earring', resLabel('guide_earring'))} を手に入れた`, true, true);
          },
        );
      },
    });
  });
}

function startWorldChronicleIntro() {
  if (getState().worldChronicleUnlocked) return;
  enqueueLogStory('world_chronicle_intro', (finish) => {
    let cleanup = null;
    cleanup = runWorldChronicleIntro(els.mainPanel, {
      onComplete: () => {
        unlockWorldChronicle();
        addLog('【依頼】「大陸誌の復元」を引き受けた', true, false, false, 'log-rare');
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

function startAllCompanionsMet() {
  if (getState().allCompanionsMetDone) return;
  enqueueLogStory('all_companions_met', (finish) => {
    let cleanup = null;
    cleanup = runAllCompanionsMet(els.mainPanel, {
      onComplete: () => {
        setAllCompanionsMetDone();
        addLog('【仲間】5人が揃い、世界の再生が新たな段階へ進んだ', true);
        finish(() => { if (cleanup) { cleanup(); cleanup = null; } });
      },
    });
  });
}

let _choicePending = false;

function showDiscovery() {
  // 再帰的な render（例: 同フレームの unlockGuide → notify）による多重起動を防ぐ
  if (_choicePending) return;
  const pending = getPendingDiscovery(getState());
  if (!pending) return;

  _choicePending = true;
  _storyLogPlaying = true;
  _pauseForStory();

  let cleanup = null;
  const finish = (chosenId) => {
    _choicePending = false;
    _onLogStComplete(
      () => { if (cleanup) { cleanup(); cleanup = null; } },
      () => { resolveDiscovery(chosenId); },
    );
  };

  if (pending.kind === 'fixed' && pending.locationId === 'nostalgia') {
    cleanup = runNostalgiaDiscovery(els.mainPanel, { onComplete: () => finish('nostalgia') });
  } else if (pending.kind === 'fixed') {
    cleanup = runLocationChoice(els.mainPanel, {
      prompt: '新しい場所が見つかりそうだ・・・',
      options: [{ id: pending.locationId, label: DISCOVERY_LABELS[pending.locationId] ?? pending.locationId }],
      onPick: finish,
    });
  } else {
    const options = pending.options.map(id => ({ id, label: DISCOVERY_LABELS[id] ?? id }));
    cleanup = runLocationChoice(els.mainPanel, {
      prompt: '新しい場所が見つかりそうだ・・・',
      options,
      onPick: finish,
    });
  }
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

  // タブの中央にバブルを位置合わせ(画面外に出ないようclamp)
  const tabRect = tab.getBoundingClientRect();
  const toastRect = toast.getBoundingClientRect();
  const margin = 8;
  const bubbleWidth = bubble.offsetWidth;
  let centerX = tabRect.left + tabRect.width / 2 - toastRect.left;
  const minCenterX = bubbleWidth / 2 + margin;
  const maxCenterX = toastRect.width - bubbleWidth / 2 - margin;
  centerX = Math.max(minCenterX, Math.min(centerX, maxCenterX));
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
// 【暫定メモ・後で変わるかも】キャラ詳細は「にょきっと展開型」(一覧の行の下にアコーディオンで詳細を表示)の方針。
// 詳細に載せる予定の項目:
//   - プロフィール(記憶を解放するごとに少しずつアンロック・追加されていく想定)
//   - 固有ドロップ品の説明
//   - 装備品(とりあえず1個だけ)
//   - 関連する記憶一覧(STORIES内のcompanionIdフィールドで絞り込んで取得できる、Lvアップ判定と同じ仕組みを再利用)
function openEquipPopup(companionId) {
  const popup = document.getElementById('equip-popup');
  const list = document.getElementById('equip-popup-list');
  list.innerHTML = '';

  const noneBtn = document.createElement('button');
  noneBtn.className = 'equip-popup-item';
  noneBtn.textContent = '外す';
  noneBtn.addEventListener('click', () => {
    setCompanionEquipment(companionId, null);
    popup.classList.remove('open');
  });
  list.appendChild(noneBtn);

  // 装備できるのは、その同行者の固有レリック(所持している場合のみ)
  const relicId = COMPANION_RELICS[companionId];
  const owned = relicId && (getState().resources[relicId] ?? 0) > 0;
  if (owned) {
    const btn = document.createElement('button');
    btn.className = 'equip-popup-item';
    const dropRes = COMPANION_REWARDS[companionId]?.[0]?.resource;
    const effect = dropRes ? `絆が深まる：${resLabel(dropRes)} +${EQUIP_BONUS}` : `絆が深まる +${EQUIP_BONUS}`;
    btn.textContent = `${resLabel(relicId)}（${effect}）`;
    btn.addEventListener('click', () => {
      setCompanionEquipment(companionId, relicId);
      popup.classList.remove('open');
    });
    list.appendChild(btn);
  } else {
    const empty = document.createElement('div');
    empty.className = 'equip-popup-empty';
    empty.textContent = 'まだ装備できるものを持っていない…';
    list.appendChild(empty);
  }

  popup.classList.add('open');
  popup.onclick = (e) => {
    if (e.target === popup) popup.classList.remove('open');
  };
}

function openConvertPopup(companionId) {
  const popup = document.getElementById('convert-popup');
  const topBox = document.getElementById('convert-box-top');
  const bottomBox = document.getElementById('convert-box-bottom');
  const fragmentList = document.getElementById('convert-fragment-list');
  const slider = document.getElementById('convert-slider');
  const label = document.getElementById('convert-amount-label');
  const confirmBtn = document.getElementById('convert-confirm-btn');

  const ownedList = () => ['fragment', ...UNIQUE_FRAGMENTS].filter(r => (getState().resources[r] ?? 0) > 0);

  const slots = { top: 'fragment', bottom: UNIQUE_FRAGMENTS.find(r => (getState().resources[r] ?? 0) > 0) ?? null };
  let selectedSlot = 'top';
  let convertInfo = { valid: false, direction: null, uniqueResource: null, fromRes: null };

  function computeConvertInfo() {
    if (slots.top === 'fragment' && slots.bottom && UNIQUE_FRAGMENTS.includes(slots.bottom)) {
      return { valid: true, direction: 'toUnique', uniqueResource: slots.bottom, fromRes: 'fragment' };
    }
    if (slots.bottom === 'fragment' && slots.top && UNIQUE_FRAGMENTS.includes(slots.top)) {
      return { valid: true, direction: 'toNormal', uniqueResource: slots.top, fromRes: slots.top };
    }
    return { valid: false, direction: null, uniqueResource: null, fromRes: null };
  }

  function updateLabel() {
    const amount = Number(slider.value);
    const seconds = (amount * FRAGMENT_CONVERT_MS_PER_UNIT / 1000).toFixed(1);
    label.textContent = amount > 0 ? `${amount} 個（変換時間 約${seconds}秒）` : '0 個';
    confirmBtn.disabled = amount <= 0 || !convertInfo.valid;
  }

  function renderFragmentList() {
    fragmentList.innerHTML = '';
    for (const res of ownedList()) {
      const have = getState().resources[res] ?? 0;
      const btn = document.createElement('button');
      btn.className = 'convert-fragment-item' + (slots[selectedSlot] === res ? ' selected' : '');
      btn.innerHTML = `<div class="resource-row"><span class="resource-name">${resLabel(res)}</span><span class="resource-val">${have}</span></div>`;
      btn.addEventListener('click', () => {
        const other = selectedSlot === 'top' ? 'bottom' : 'top';
        if (slots[other] === res) slots[other] = slots[selectedSlot];
        slots[selectedSlot] = res;
        refresh();
      });
      fragmentList.appendChild(btn);
    }
  }

  function refresh() {
    topBox.textContent = slots.top ? `${resLabel(slots.top)}　${getState().resources[slots.top] ?? 0}` : '選択してください';
    topBox.className = 'convert-box' + (selectedSlot === 'top' ? ' is-selected' : '');
    bottomBox.textContent = slots.bottom ? `${resLabel(slots.bottom)}　${getState().resources[slots.bottom] ?? 0}` : '選択してください';
    bottomBox.className = 'convert-box' + (selectedSlot === 'bottom' ? ' is-selected' : '');

    convertInfo = computeConvertInfo();
    const haveFrom = convertInfo.valid ? (getState().resources[convertInfo.fromRes] ?? 0) : 0;
    slider.max = String(haveFrom);
    if (Number(slider.value) > haveFrom) slider.value = String(haveFrom);
    slider.disabled = !convertInfo.valid;

    renderFragmentList();
    updateLabel();
  }

  topBox.onclick = () => { selectedSlot = 'top'; refresh(); };
  bottomBox.onclick = () => { selectedSlot = 'bottom'; refresh(); };
  slider.oninput = updateLabel;
  confirmBtn.onclick = () => {
    const amount = Number(slider.value);
    if (amount <= 0 || !convertInfo.valid) return;
    startFragmentConvert(companionId, convertInfo.direction, amount, convertInfo.uniqueResource);
    popup.classList.remove('open');
    renderCharTab(getState());
  };

  slider.value = '0';
  selectedSlot = 'top';
  refresh();

  popup.classList.add('open');
  popup.onclick = (e) => {
    if (e.target === popup) popup.classList.remove('open');
  };
}

// キャラ詳細パネル用タブアイコン(暫定の線画アイコン)
const _DETAIL_TAB_ICONS = {
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="1.5"/><line x1="7.5" y1="8.5" x2="16.5" y2="8.5"/><line x1="7.5" y1="12" x2="16.5" y2="12"/><line x1="7.5" y1="15.5" x2="13" y2="15.5"/></svg>',
  items:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="9" width="14" height="11" rx="2"/><path d="M9 9 V6.5 a3 3 0 0 1 6 0 V9"/></svg>',
  level:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 4 L14.5 9.5 L20.5 10.2 L16 14.2 L17.2 20 L12 17 L6.8 20 L8 14.2 L3.5 10.2 L9.5 9.5 Z"/></svg>',
  memory:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5 C6 4.5 9 4.5 11 5.5 V18.5 C9 17.5 6 17.5 4 18.5 Z"/><path d="M20 5.5 C18 4.5 15 4.5 13 5.5 V18.5 C15 17.5 18 17.5 20 18.5 Z"/></svg>',
};
const _DETAIL_TABS = [
  { id: 'profile', label: 'プロフィール' },
  { id: 'items',   label: '持ち物' },
  { id: 'level',   label: 'レベル・異能' },
  { id: 'memory',  label: '記憶' },
];
const _companionDetailTab = new Map();
const _companionTaskTickers = new Map();

function _buildCompanionDetailProfile(id, state) {
  const data = COMPANION_DATA[id];
  const wrap = document.createElement('div');

  const profile = document.createElement('div');
  profile.className = 'companion-detail-section';
  profile.innerHTML = `<div class="companion-detail-label">プロフィール</div><div class="companion-detail-body">${data.desc}</div>`;
  wrap.appendChild(profile);

  const drop = document.createElement('div');
  drop.className = 'companion-detail-section';
  const dropResource = COMPANION_REWARDS[id]?.[0]?.resource;
  const dropDiscovered = dropResource && (state.discoveredResources ?? []).includes(dropResource);
  const dropLabel = !dropResource ? '—' : dropDiscovered ? resLabel(dropResource) : '???';
  drop.innerHTML = `<div class="companion-detail-label">見つけられるもの</div><div class="companion-detail-body">${dropLabel}</div>`;
  wrap.appendChild(drop);

  // 特性(成長型パラメータ。COMPANION_TRAITS参照。今は「育つ・表示される」のみで効果は未定)
  const trait = COMPANION_TRAITS[id];
  if (trait) {
    const traitVal = state.companionTraits?.[id]?.[trait.id] ?? 0;
    const traitSection = document.createElement('div');
    traitSection.className = 'companion-detail-section';
    traitSection.innerHTML = `<div class="companion-detail-label">特性</div><div class="companion-detail-body">${trait.label} ${traitVal}</div>`;
    wrap.appendChild(traitSection);
  }

  // 絆Lv(プレゼントを渡して上げる。今は「育つ・表示される」のみで効果は未定)
  const bondLv = state.bondLv?.[id] ?? 0;
  const bondSection = document.createElement('div');
  bondSection.className = 'companion-detail-section';
  bondSection.innerHTML = `<div class="companion-detail-label">絆Lv</div>`;
  const bondRow = document.createElement('div');
  bondRow.className = 'companion-detail-body companion-level-row';
  bondRow.appendChild(Object.assign(document.createElement('span'), { textContent: `Lv ${bondLv}` }));
  if (bondLv < BOND_LV_MAX) {
    const cost = BOND_LV_COSTS[bondLv];
    const giftBtn = document.createElement('button');
    giftBtn.className = 'companion-equip-btn';
    giftBtn.textContent = '贈り物をする';

    const giftList = document.createElement('div');
    giftList.className = 'facility-list';
    giftList.style.display = 'none';
    giftList.style.marginTop = '0.4rem';

    // 一度でも入手したことのある花だけを贈れる(未知の花は名前も出さない)
    const knownGifts = GIFT_ITEMS.filter(itemId => (state.discoveredResources ?? []).includes(itemId));
    for (const itemId of knownGifts) {
      const have = state.resources[itemId] ?? 0;
      const row = document.createElement('button');
      row.className = 'facility-list-row';
      row.disabled = have < cost;
      row.innerHTML = `<span class="facility-card-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 22V7"/><path d="M12 7H7.5A2.5 2.5 0 0 1 7.5 2C11 2 12 7 12 7z"/><path d="M12 7h4.5A2.5 2.5 0 0 0 16.5 2C13 2 12 7 12 7z"/></svg></span><span class="facility-list-row-label">${resLabel(itemId)}の花束</span><span style="color:var(--muted);font-size:0.8rem">${resLabel(itemId)} ${have}/${cost}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const result = giveGift(id, itemId);
        if (result.ok) {
          const name = COMPANION_DATA[id]?.name ?? id;
          addLog(`【絆】${name}との絆が${result.matched ? '大きく' : ''}深まった (絆Lv ${result.newLv})`, true);
        }
        renderCharTab(getState());
      });
      giftList.appendChild(row);
    }
    if (knownGifts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'facility-list-row';
      empty.style.color = 'var(--muted)';
      empty.textContent = '贈れる花を持っていない…';
      giftList.appendChild(empty);
    }

    giftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      giftList.style.display = giftList.style.display === 'none' ? '' : 'none';
      giftBtn.textContent = giftList.style.display === 'none' ? '贈り物をする' : '▲ 閉じる';
    });

    bondRow.appendChild(giftBtn);
    bondSection.appendChild(bondRow);
    bondSection.appendChild(giftList);
  } else {
    bondSection.appendChild(bondRow);
  }
  wrap.appendChild(bondSection);

  return wrap;
}

function _buildCompanionDetailItems(id, state) {
  const wrap = document.createElement('div');
  const equip = document.createElement('div');
  equip.className = 'companion-detail-section';
  const equippedItem = state.companionEquipment?.[id] ?? null;
  const isEquippedRelic = equippedItem && equippedItem === COMPANION_RELICS[id];
  const dropRes = COMPANION_REWARDS[id]?.[0]?.resource;
  const relicEffect = dropRes ? `絆が深まる：${resLabel(dropRes)} +${EQUIP_BONUS}` : `絆が深まる +${EQUIP_BONUS}`;
  const equipLabel = equippedItem
    ? `${resLabel(equippedItem)}${isEquippedRelic ? `（${relicEffect}）` : ''}`
    : 'なにも持っていない…';
  equip.innerHTML = `<div class="companion-detail-label">持ち物</div>`;
  const equipBtn = document.createElement('button');
  equipBtn.className = 'companion-equip-btn';
  equipBtn.textContent = equipLabel;
  equipBtn.addEventListener('click', (e) => { e.stopPropagation(); openEquipPopup(id); });
  equip.appendChild(equipBtn);
  wrap.appendChild(equip);
  return wrap;
}

function _buildCompanionDetailLevel(id, state) {
  const wrap = document.createElement('div');
  const lv = state.ELv?.[id] ?? 0;
  const uniqueResource = COMPANION_REWARDS[id]?.[0]?.resource;

  const levelSection = document.createElement('div');
  levelSection.className = 'companion-detail-section';
  levelSection.innerHTML = `<div class="companion-detail-label">レベル</div>`;
  const levelRow = document.createElement('div');
  levelRow.className = 'companion-detail-body companion-level-row';
  const levelText = document.createElement('span');
  levelText.textContent = `Lv ${lv}`;
  levelRow.appendChild(levelText);
  if (lv < ELV_MAX && uniqueResource) {
    const cost = ELV_COSTS[lv];
    const have = state.resources[uniqueResource] ?? 0;
    const lvUpBtn = document.createElement('button');
    lvUpBtn.className = 'companion-equip-btn';
    lvUpBtn.textContent = `レベルアップ（${resLabel(uniqueResource)} ${cost}）`;
    lvUpBtn.disabled = have < cost;
    lvUpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      levelUpCompanion(id);
      renderCharTab(getState());
    });
    levelRow.appendChild(lvUpBtn);
  }
  levelSection.appendChild(levelRow);
  wrap.appendChild(levelSection);

  const skills = COMPANION_SKILLS[id] ?? [];
  if (skills.length > 0) {
    const skillSection = document.createElement('div');
    skillSection.className = 'companion-detail-section';
    skillSection.innerHTML = `<div class="companion-detail-label">異能</div>`;
    for (const skill of skills) {
      const unlocked = lv >= skill.lv;
      const skillBody = document.createElement('div');
      skillBody.className = 'companion-detail-body';
      if (!unlocked) {
        skillBody.textContent = `${skill.label}（Lv${skill.lv}で解放）`;
        skillSection.appendChild(skillBody);
        continue;
      }
      skillBody.innerHTML = `<strong>${skill.label}</strong> ${skill.desc}`;
      skillSection.appendChild(skillBody);

      if (skill.id === 'fragment_convert') {
        const convertRow = document.createElement('div');
        convertRow.className = 'companion-skill-convert-row';

        const isActive = (state.activeCompanions ?? []).includes(id);
        const task = state.companionTasks?.[id];

        if (isActive) {
          const msg = document.createElement('div');
          msg.className = 'companion-detail-body';
          msg.textContent = '別行動中のみ使える異能です';
          convertRow.appendChild(msg);
        } else if (task) {
          const progress = getCompanionTaskProgress(id) ?? 0;
          const remainingSec = Math.max(0, Math.ceil((task.endsAt - Date.now()) / 1000));
          const msg = document.createElement('div');
          msg.className = 'companion-detail-body';
          msg.textContent = `変換作業中…残り${remainingSec}秒`;
          convertRow.appendChild(msg);
          const barWrap = document.createElement('div');
          barWrap.className = 'convert-task-bar-wrap';
          const barFill = document.createElement('div');
          barFill.className = 'convert-task-bar-fill';
          barFill.style.width = `${Math.round(progress * 100)}%`;
          barWrap.appendChild(barFill);
          convertRow.appendChild(barWrap);
          // この変換中ブロックが再構築されるたびに(他の理由でのrenderCharTab呼び出しも含め)
          // 古いインターバルを破棄して、いま作ったmsg/barFill要素に対して張り直す。
          // (以前は500msごとにrenderCharTab()で同行タブ全体を再構築していたが、進捗バー1本の
          //  更新のためだけに全カードを作り直すのは無駄だったため、直接DOM更新に変更)
          if (_companionTaskTickers.has(id)) clearInterval(_companionTaskTickers.get(id));
          _companionTaskTickers.set(id, setInterval(() => {
            const curTask = getState().companionTasks?.[id];
            if (!curTask) {
              clearInterval(_companionTaskTickers.get(id));
              _companionTaskTickers.delete(id);
              renderCharTab(getState()); // 完了時のみ全体を再構築(ボタン表示等が変わるため)
              return;
            }
            const curProgress = getCompanionTaskProgress(id) ?? 0;
            const curRemainingSec = Math.max(0, Math.ceil((curTask.endsAt - Date.now()) / 1000));
            msg.textContent = `変換作業中…残り${curRemainingSec}秒`;
            barFill.style.width = `${Math.round(curProgress * 100)}%`;
          }, 500));
        } else {
          const openBtn = document.createElement('button');
          openBtn.className = 'companion-equip-btn';
          openBtn.textContent = 'フラグメントを変換する';
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openConvertPopup(id);
          });
          convertRow.appendChild(openBtn);
        }

        skillSection.appendChild(convertRow);
      }
    }
    wrap.appendChild(skillSection);
  }

  return wrap;
}

function _buildCompanionDetailMemory(id, state) {
  const wrap = document.createElement('div');
  const memories = document.createElement('div');
  memories.className = 'companion-detail-section';
  memories.innerHTML = `<div class="companion-detail-label">関連する記憶</div>`;
  const memoryBody = document.createElement('div');
  memoryBody.className = 'companion-detail-body';
  const relatedStories = Object.values(STORIES).filter(s =>
    s.companionId === id &&
    ((state.appearedStories ?? []).includes(s.id) || (state.unlockedStories ?? []).includes(s.id))
  );
  if (relatedStories.length === 0) {
    memoryBody.textContent = 'まだ何も思い出せない…';
  } else {
    for (const s of relatedStories) {
      const progress = state.storyProgress[s.id] ?? 0;
      const fullyRead = !!(state.titleRevealed ?? {})[s.id];
      const total = _storyPageCounts[s.id] ?? s.pageCount;
      const title = fullyRead ? s.title : (s.lockedTitle ?? DEFAULT_LOCKED_TITLE);
      const unlocked = state.unlockedStories.includes(s.id);

      const line = document.createElement('div');
      line.className = 'companion-memory-line';
      const label = document.createElement('span');
      label.textContent = `${title}${total ? `(${progress} / ${total})` : ''}`;
      line.appendChild(label);

      if (unlocked) {
        const openBtn = document.createElement('button');
        openBtn.className = 'story-open-btn';
        openBtn.textContent = '▷';
        openBtn.addEventListener('click', (e) => { e.stopPropagation(); openStory(s.id); });
        line.appendChild(openBtn);
      }
      memoryBody.appendChild(line);
    }
  }
  memories.appendChild(memoryBody);
  wrap.appendChild(memories);
  return wrap;
}

const _DETAIL_TAB_BUILDERS = {
  profile: _buildCompanionDetailProfile,
  items: _buildCompanionDetailItems,
  level: _buildCompanionDetailLevel,
  memory: _buildCompanionDetailMemory,
};

// キャラ詳細パネル: 左にタブアイコン、右に選択中タブの内容を表示
function _buildCompanionDetail(id, state) {
  const detail = document.createElement('div');
  detail.className = 'companion-detail';

  const activeTab = _companionDetailTab.get(id) ?? 'profile';

  const nav = document.createElement('div');
  nav.className = 'companion-detail-nav';
  for (const tab of _DETAIL_TABS) {
    const btn = document.createElement('button');
    btn.className = 'companion-detail-nav-btn' + (tab.id === activeTab ? ' active' : '');
    btn.innerHTML = _DETAIL_TAB_ICONS[tab.id];
    btn.title = tab.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _companionDetailTab.set(id, tab.id);
      renderCharTab(getState());
    });
    nav.appendChild(btn);
  }
  detail.appendChild(nav);

  const content = document.createElement('div');
  content.className = 'companion-detail-content';
  content.appendChild(_DETAIL_TAB_BUILDERS[activeTab](id, state));
  _attachSwipeTabHandlers(content, id, activeTab);
  detail.appendChild(content);

  return detail;
}

// サブパネル(プロフィール/持ち物/レベル・異能/記憶)を横フリックで切り替える
const _SWIPE_MOVE_THRESHOLD = 40;

function _attachSwipeTabHandlers(content, companionId, activeTab) {
  let startX = 0, startY = 0;
  let lastX = 0, lastY = 0;
  let tracking = false;

  function finish() {
    if (!tracking) return;
    tracking = false;
    const dx = lastX - startX;
    const dy = lastY - startY;
    if (Math.abs(dx) < _SWIPE_MOVE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    const idx = _DETAIL_TABS.findIndex(t => t.id === activeTab);
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= _DETAIL_TABS.length) return;
    _companionDetailTab.set(companionId, _DETAIL_TABS[nextIdx].id);
    renderCharTab(getState());
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input')) return;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    tracking = true;
  });

  content.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  content.addEventListener('pointerup', finish);
  content.addEventListener('pointercancel', finish);
}

const renderCharTab = createCompanionTabRenderer({
  getState,
  levelTagHtml: companionLvTagHtml,
  buildDetail: _buildCompanionDetail,
  showTabToast,
  changeCompanion: _changeCompanionFromChart,
  replaceParty: _replacePartyFromChart,
});

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
  document.getElementById('dev-reset-quests-btn').addEventListener('click', () => {
    if (!confirm('依頼・施設(花屋/図書館など)の進捗をリセットしますか？')) return;
    // 導入イベントの発火済み記録も戻し、リセット後に条件を満たせば再受注できるようにする。
    resetFiredRules();
    resetTutorialLogs();
    _clearPendingLogStory();
    resetQuestsAndFacilities();
  });

  document.getElementById('dev-unlock-all-companions').addEventListener('click', () => {
    Object.keys(COMPANION_DATA).forEach(id => unlockCompanion(id));
  });

  document.getElementById('dev-log-story-select').addEventListener('change', (e) => {
    const n = Number(e.target.value);
    if (!n) return;
    e.target.value = '';
    // n=1,3,4はrules.jsの条件(プロローグ全解放／yuya_1の段落数)を満たす状態にしておくので、
    // jumpToLogStのnotify()からevaluateRulesが自動でstartLogSt_Xを呼ぶ。
    // 002は行動完了イベント駆動でジャンプ不可のため選択肢から除外している。
    resetFiredRules();
    jumpToLogSt(n);
  });

  const autoRestartBtn = document.getElementById('dev-auto-restart-btn');
  autoRestartBtn.addEventListener('click', () => {
    _autoRestartEnabled = !_autoRestartEnabled;
    autoRestartBtn.textContent = _autoRestartEnabled ? 'ON' : 'OFF';
    autoRestartBtn.classList.toggle('dev-btn--on', _autoRestartEnabled);
  });
}

export function init() {
  restoreLogHistory();
  subscribe(render);
  const initialState = getState();
  if (initialState.activeAction?.actionId) {
    selectedActionId = initialState.activeAction.actionId;
  } else {
    // 前回選んでいた行動を復元する。ただしノスタルジア発見後のwherever(再生された世界)のように
    // 表示上すり替わって消えた場所を指している場合はnostalgia側へ読み替える
    selectedActionId = initialState.selectedActionId ?? 'explore';
    const currentLocationId = (ACTIONS[selectedActionId] ?? FACILITIES[selectedActionId])?.locationId;
    if (currentLocationId === 'wherever' && initialState.unlockedLocations.includes('nostalgia')) {
      selectedActionId = 'nostalgia_explore';
    }
  }
  setActionPickerLabel(ACTIONS[selectedActionId] ?? FACILITIES[selectedActionId]);
  render(initialState);
  initTabs();
  initStoryViewer();
  initDevTools();
  initWorldLvPopup();
  initRefreshButton();
  initSettings();

  if (!initialState.tutorialDone) {
    // スプラッシュ(TAP画面)が無い場合は即時、ある場合はタップで消えるのを待ってから開始
    if (document.getElementById('splash-screen')) {
      window.addEventListener('splash-dismissed', launchTutorial, { once: true });
    } else {
      launchTutorial();
    }
  }

  initActionPicker();
  _recoverPendingLogStory();
  if (initialState.activeAction?.actionId) {
    restoreActiveActionCallbacks(makeActionCallbacks(initialState.activeAction.actionId));
  }

  els.actionBtn.addEventListener('click', () => {
    if (_storyLogPlaying) { els.mainPanel.click(); return; }
    const active = getState().activeAction;
    if (active) {
      const action = ACTIONS[active.actionId];
      const label = action ? actionDisplayHtml(action) : '行動';
      if (stopFlavor) { stopFlavor(); stopFlavor = null; }
      _cancelled = true;
      cancelAction();
      _resetPendingCompanionRewards();
      addLog(`【${label}】中断`, true, true);
    } else {
      if (!_storyLogPlaying) _startActionById(selectedActionId);
    }
  });

  setInterval(tick, 100);
}
