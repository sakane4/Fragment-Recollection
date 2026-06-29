// ui.js — DOM操作・表示更新

import { LOCATIONS, ACTIONS, FACILITIES, getShopItems, buyShopItem, STORIES, COMPANION_REWARDS, COMPANION_RELICS, EQUIP_BONUS, WORLD_LV_THRESHOLDS, getLocationLvCost, LOCATION_LV_MAX, DISCOVERY_LABELS, DISCOVERY_STEP_LV, TOUTO_FACILITIES, ELV_MAX, ELV_COSTS, BOND_LV_MAX, BOND_LV_COSTS, GIFT_ITEMS, giveGift, COMPANION_SKILLS, COMPANION_TRAITS, levelUpCompanion, startFragmentConvert, getCompanionTaskProgress, FRAGMENT_CONVERT_MS_PER_UNIT, UNIQUE_FRAGMENTS, getPendingDiscovery, resolveDiscovery, getLocationLvCap, levelUpLocation, getState, subscribe, notify, startAction, restoreActiveActionCallbacks, cancelAction, pauseAction, resumeAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockLocation, unlockAction, unlockAllActions, lockAllActions, unlockGuide, setAutoRepeat, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setLogSt4Done, setPlayerName, unlockCompanion, setCompanionLevel, setCompanionEquipment, revealStoryTitle, setActiveCompanion, resetTutorial, jumpToLogSt, forceAppearStory } from './game.js';
import { parseStoryPages, parseStoryCostOverrides, setStoryCostMap, getCostForParagraph } from './stories.js';
import { startFlavorScheduler } from './logs.js';
import { startOpeningTutorial, runLogSt_1, runLogSt_2, runLogSt_3, runLogSt_4, runLocationChoice, runCompanionJoin, runFacilityMenu } from './scenario.js';
import { evaluateRules, resetFiredRules } from './rules.js';

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

// リソース定義を1か所に集約(label/color/category/unit)。新アイテム追加時はここに1行追加するだけ。
// category省略時は'material'、unit省略時は''がデフォルト
const RESOURCES = {
  fragment:        { label: 'フラグメント',     color: '#7ec8d8', category: 'fragment', unit: '片' },
  blue_fragment:   { label: '青のフラグメント',   color: '#89b4fa', category: 'fragment', unit: '片' },
  red_fragment:    { label: '赤のフラグメント',   color: '#f38ba8', category: 'fragment', unit: '片' },
  clear_fragment:  { label: '無色のフラグメント', color: '#cdd6f4', category: 'fragment', unit: '片' },
  bubble_fragment: { label: '泡のフラグメント',   color: '#cba6f7', category: 'fragment', unit: '片' },
  sky_fragment:    { label: '空のフラグメント',   color: '#89dceb', category: 'fragment', unit: '片' },
  herb:            { label: '薬草',     color: '#a6e3a1', unit: '束' },
  forest_voice:    { label: '木々の声', color: '#a8d8a8', unit: 'かけら' },
  branch:          { label: '木の枝',   color: '#c8a97e', unit: '本' },
  wood:            { label: '木材',     color: '#a47d4e', unit: '本' },
  axe:             { label: '鉄の斧',   color: '#9aa0a6', category: 'relic', unit: '振' },
  // 塔都
  magcoin:         { label: 'マグコイン', color: '#e6c200', unit: '枚' },
  old_text:        { label: '古文書',   color: '#bba16a', unit: '冊' },
  dream_fragment:  { label: '夢の欠片', color: '#b8a6e8', unit: '片' },
  pressed_flower_red:  { label: '赤い押し花', color: '#e06a8c' },
  pressed_flower_blue: { label: '青い押し花', color: '#6a9ee0' },
  // 黄昏の旧校舎
  old_paint:          { label: '古びた絵具',         color: '#e0a96d' },
  torn_page:          { label: '破れたページ',       color: '#d8cba0' },
  broken_piano_sound: { label: '少し狂ったピアノの音', color: '#b0a8c8' },
  art_room_key:       { label: '旧美術室の鍵',       color: '#d6336c', category: 'relic' },
  // 翼竜の都 レンリル
  wyvern_claw:        { label: '翼竜の爪', color: '#c0c4cc' },
  wyvern_scale:       { label: '翼竜の鱗', color: '#7fb0c8' },
  melon_keychain:     { label: 'もっふりん', color: '#d6336c', category: 'relic' },
  // 魔界王都 メフィスト
  spellbook_page:     { label: '魔術書のページ',       color: '#b89cd8' },
  magic_circle_shard: { label: '魔法陣の欠片',         color: '#a98cd8' },
  astard_fragment:    { label: 'アスタード文字の破片', color: '#9a8cc8' },
  sky_compass:        { label: '天空の羅針盤',         color: '#d6336c', category: 'relic' },
  // 王立騎士団本部
  subjugation_report: { label: '討伐報告書',       color: '#d8cba0' },
  old_armband:        { label: '古びた腕章',       color: '#b0926a' },
  chipped_insignia:   { label: '欠けた記章',       color: '#c0c4cc' },
  polished_sheath:    { label: '美しい細身の剣',   color: '#d6336c', category: 'relic' },
  guide_earring:      { label: '導きのイヤリング', color: '#d6336c', category: 'relic' },
};

const RESOURCE_CATEGORY_ORDER = ['fragment', 'material', 'relic'];
const RESOURCE_CATEGORY_LABELS = { fragment: 'フラグメント', material: '素材', relic: 'レリック' };

function resLabel(resource) { return RESOURCES[resource]?.label ?? resource; }
function resColor(resource) { return RESOURCES[resource]?.color ?? 'var(--text)'; }
function resCategory(resource) { return RESOURCES[resource]?.category ?? 'material'; }
function resUnit(resource) { return RESOURCES[resource]?.unit ?? ''; }

function resourceSpan(resource, text) {
  return `<span style="color:${resColor(resource)};font-weight:bold">${text}</span>`;
}

function resourceLog(resource, amount) {
  return `${resourceSpan(resource, resLabel(resource))} を ${amount}${resUnit(resource)} 見つけた`;
}

// まだ一度も入手していない(discoveredResourcesに無い)素材は名前を伏せて「???」で表示する。
// 解放条件にしか出てこない未知の素材のネタバレを防ぐ
function _maskedResLabel(resource, state) {
  if (state && !(state.discoveredResources ?? []).includes(resource)) return '???';
  return resLabel(resource);
}

function formatCostLabel(costs, state) {
  return costs.map(c => `${_maskedResLabel(c.resource, state)} ×${c.amount}`).join(', ');
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
function actionDisplayLabel(action, sep = ' / ') {
  const loc = LOCATIONS[action.locationId];
  return loc?.label ? `${loc.label}${sep}${action.label}` : action.label;
}

function makeRandomRewardHandler() {
  return ({ resource, amount }) => {
    addLog(`<span class="log-companion-reward">${resourceLog(resource, amount)}</span>`, false, true);
  };
}

function makeCompanionRandomRewardHandler() {
  return ({ companionId, resource, amount }) => {
    const name = COMPANION_DATA[companionId]?.name ?? companionId;
    addLog(`<span class="log-companion-reward">${name}が ${resourceLog(resource, amount)}</span>`, false, true);
  };
}

function makeActionCallbacks(actionId) {
  return {
    onRandomReward: makeRandomRewardHandler(),
    onCompanionRandomReward: makeCompanionRandomRewardHandler(),
    onComplete: (result) => _handleActionComplete(actionId, result),
    onEncounter: (result) => _handleEncounter(actionId, result),
  };
}

// ── ログ ──
// ページ再読込してもログが消えないよう、本文をlocalStorageに永続化する。件数はMAX_LOG_ENTRIESで頭打ち
const LOG_HISTORY_KEY = 'fr_log_history';
const MAX_LOG_ENTRIES = 200;
let _logBuffer = [];
let _logPaused = false;
let _logHistory = [];

function _saveLogHistory() {
  try { localStorage.setItem(LOG_HISTORY_KEY, JSON.stringify(_logHistory)); } catch {}
}

function _createLogEl(text, highlight, html, rightAlign) {
  const el = document.createElement('div');
  el.className = 'log-entry' + (highlight ? ' highlight' : '') + (rightAlign ? ' log-entry--right' : '');
  if (html) el.innerHTML = text;
  else el.textContent = text;
  return el;
}

// 起動時に1回だけ呼ぶ。保存済みのログがあれば(静的な初期表示の代わりに)それを復元表示する
function _restoreLogHistory() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LOG_HISTORY_KEY) || 'null'); } catch {}
  if (saved && saved.length > 0) {
    _logHistory = saved;
    els.mainPanel.innerHTML = '';
    for (const { text, highlight, html, rightAlign } of _logHistory) {
      els.mainPanel.appendChild(_createLogEl(text, highlight, html, rightAlign));
    }
    els.mainPanel.scrollTop = els.mainPanel.scrollHeight;
  } else {
    // 初回起動: 静的に表示済みの最初のログをそのまま履歴の1件目として積む
    _logHistory = [{ text: '世界を再生しました', highlight: true, html: false, rightAlign: false }];
    _saveLogHistory();
  }
}

function addLog(text, highlight = false, html = false, rightAlign = false) {
  if (_logPaused) {
    _logBuffer.push({ text, highlight, html, rightAlign });
    return;
  }
  _appendLog(text, highlight, html, rightAlign);
}

function _appendLog(text, highlight, html, rightAlign = false) {
  const el = _createLogEl(text, highlight, html, rightAlign);
  const panel = els.mainPanel;
  const atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40;
  panel.appendChild(el);
  if (atBottom) panel.scrollTop = panel.scrollHeight;

  _logHistory.push({ text, highlight, html, rightAlign });
  if (_logHistory.length > MAX_LOG_ENTRIES) {
    _logHistory.shift();
    if (panel.firstChild) panel.removeChild(panel.firstChild);
  }
  _saveLogHistory();
}

function pauseLog()  { _logPaused = true; }
function resumeLog() {
  _logPaused = false;
  _logBuffer.forEach(({ text, highlight, html, rightAlign }) => _appendLog(text, highlight, html, rightAlign));
  _logBuffer = [];
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
    parsed = { pages: parseStoryPages(text), costMap: parseStoryCostOverrides(text) };
    _parsedStoryCache.set(storyId, parsed);
  }
  const pages = parsed.pages;
  setStoryCostMap(storyId, parsed.costMap);

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
    const label = _maskedResLabel(c.resource, state);
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
        const nextCostLabel = formatCostLabel(nextCost);
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
          addLog(`フラグメントが足りません (${costLabel} 必要)`);
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
    const locationLv = state.LocationLv?.[action?.locationId] ?? 0;
    stopFlavor = startFlavorScheduler(active.actionId, text => addLog(text), { companions, locationLv });
  }

  if (!active && prevActive) {
    if (stopFlavor) { stopFlavor(); stopFlavor = null; }
    const wasCancelled = _cancelled;
    _cancelled = false;
    els.actionBtn.textContent = '開始';
    const selAction = ACTIONS[selectedActionId] ?? FACILITIES[selectedActionId];
    els.actionPickerBtn.textContent = selAction ? actionDisplayLabel(selAction, ' — ') : '探索';

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
        addLog(`【発見】新しい場所「${LOCATIONS[id].label}」を見つけた`, true);
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
        const msg = (action.stub || FACILITIES[id])
          ? `【発見】${location?.label ? `${location.label}で` : ''}「${action.label}」を見つけた`
          : (location?.label
            ? `${location.label} で「${action.label}」ができるようになった`
            : `「${action.label}」ができるようになった`);
        addLog(msg, true);
      }
    }
  }

  const taskResult = state.lastCompanionTaskResult;
  if (prevCompanionTaskDoneAt === null) {
    prevCompanionTaskDoneAt = taskResult?.doneAt ?? 0;
  } else if (taskResult && taskResult.doneAt > prevCompanionTaskDoneAt) {
    const name = COMPANION_DATA[taskResult.companionId]?.name ?? taskResult.companionId;
    const fromSpan = resourceSpan(taskResult.fromRes, `${resLabel(taskResult.fromRes)}${taskResult.amount}`);
    const toSpan = resourceSpan(taskResult.toRes, `${resLabel(taskResult.toRes)}${taskResult.amount}`);
    addLog(`【${name}】${fromSpan} → ${toSpan} に変換した`, true, true, true);
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

  const charSig = JSON.stringify([state.unlockedCompanions, state.activeCompanions, state.ELv, state.bondLv, state.companionTraits, state.companionEquipment, state.companionTasks, state.resources, state.discoveredResources, state.appearedStories, state.unlockedStories, state.storyProgress, state.titleRevealed]);
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
    startLogSt_1,
    startLogSt_2: () => startLogSt_2(state),
    startLogSt_3,
    startLogSt_4,
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

// 導きパネルの中身。状況に応じたヒントを優先度順に積む
function renderGuideList(state) {
  const list = document.getElementById('guide-list');
  if (!list) return;
  list.innerHTML = '';

  const hints = [];

  const firstDiscoveryLv = DISCOVERY_STEP_LV[0];
  if ((state.worldLv ?? 0) < firstDiscoveryLv) {
    hints.push(`【再生された世界】の再生Lvを上げよう…（Lv${firstDiscoveryLv}）`);
  } else {
    // 場所発見スケジュールの次のステップに向けて、再生された世界(wherever)のLvを上げるよう促す
    const step = state.discoveryStep ?? 0;
    if (state.logSt4Done && step < DISCOVERY_STEP_LV.length) {
      const targetLv = DISCOVERY_STEP_LV[step];
      const whereverLv = state.LocationLv?.['wherever'] ?? 0;
      if (whereverLv < targetLv) {
        hints.push(`【再生された世界】をさらに再生しよう…（再生Lv${targetLv}）`);
      }
    }
  }

  // はじまりの森のLvを2にすると採集が解放されることを示唆
  if (state.unlockedLocations?.includes('forest') && !state.unlockedActions?.includes('forest_gather')) {
    const forestLv = state.LocationLv?.['forest'] ?? 0;
    if (forestLv < 2) {
      hints.push('【はじまりの森】の再生Lvを上げよう…（新しいことができるようになる）');
    }
  }

  // 塔都が解放済みで、まだ見つけていない施設があれば探索を促す
  if (state.unlockedLocations?.includes('touto') && TOUTO_FACILITIES.some(id => !state.unlockedActions?.includes(id))) {
    hints.push('【塔都】を探索してみよう…まだ見つけていない施設がありそうだ');
  }

  // 解放済みの場所に、まだ見つけていない同行者がいれば探索を促す(レアドロップの示唆)
  for (const action of Object.values(ACTIONS)) {
    if (!action.rareDrop) continue;
    if (state.unlockedCompanions?.includes(action.rareDrop.companionId)) continue;
    if (!state.unlockedLocations?.includes(action.locationId)) continue;
    const locLabel = LOCATIONS[action.locationId]?.label ?? 'どこか';
    hints.push(`${locLabel}を探索してみよう…なにかが見つかるかもしれない`);
    break;
  }

  // 同行中なのに、持っているはずの固有レリックを装備していない仲間がいれば教える
  for (const id of (state.activeCompanions ?? [])) {
    const relic = COMPANION_RELICS[id];
    const owned = relic && (state.resources[relic] ?? 0) > 0;
    const equipped = state.companionEquipment?.[id] === relic;
    if (owned && !equipped) {
      const name = COMPANION_DATA[id]?.name ?? id;
      hints.push(`${name}に持ち物を持たせてみよう`);
      break;
    }
  }

  if (hints.length === 0) {
    hints.push('星の導きは、いまは静かだ…');
  }

  for (const hint of hints) {
    const item = document.createElement('div');
    item.className = 'guide-hint-item';
    item.textContent = hint;
    list.appendChild(item);
  }

  // ヒント内容が前回から変わっていたら、導きタブを光らせて気づかせる
  // (「静かだ…」だけの状態や初回同期では光らせない)
  const signature = hints.join('|');
  const meaningful = !(hints.length === 1 && hints[0] === '星の導きは、いまは静かだ…');
  if (_prevGuideSignature !== null && signature !== _prevGuideSignature && meaningful && state.guideUnlocked) {
    _flashGuideTab();
  }
  _prevGuideSignature = signature;
}

// 導きタブ(#guide-tab-btn)を発光させる。導きパネルを開くと消える
let _prevGuideSignature = null;
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
    addLog(`【${actionDisplayLabel(curAction)}】中断`, true);
  }
  setActiveCompanion(companionId, makeActive);
  renderCharTab(getState());
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
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.view));
  });
  _attachSubPanelSwipe();
}

// サブパネル(記憶/地図/持ち物/同行)を横フリックで切り替える(開発タブはスワイプ対象外)
const _SUB_PANEL_SWIPE_ORDER = ['view-stories', 'view-actions', 'view-items', 'view-chars', 'view-gallery'];
const _SUB_PANEL_SWIPE_THRESHOLD = 50;

function _attachSubPanelSwipe() {
  const panel = document.getElementById('sub-panel');
  let startX = 0, startY = 0;
  let lastX = 0, lastY = 0;
  let tracking = false;

  function finish() {
    if (!tracking) return;
    tracking = false;
    const dx = lastX - startX;
    const dy = lastY - startY;
    if (Math.abs(dx) < _SUB_PANEL_SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    const current = document.querySelector('.sub-view.active')?.id;
    const idx = _SUB_PANEL_SWIPE_ORDER.indexOf(current);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= _SUB_PANEL_SWIPE_ORDER.length) return;
    switchTab(_SUB_PANEL_SWIPE_ORDER[nextIdx]);
  }

  panel.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, .companion-detail')) return;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    tracking = true;
  });
  panel.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', finish);
}

// ── worldLv 進捗ポップアップ ──
function _renderWorldLvPopup() {
  const state = getState();
  const lv = state.worldLv ?? 0;
  const cur = state.totalFragments ?? 0;
  const prevThresh = lv > 0 ? WORLD_LV_THRESHOLDS[lv - 1] : 0;
  const nextThresh = WORLD_LV_THRESHOLDS[lv] ?? null;
  document.getElementById('worldlv-popup-lv').textContent = `worldLv ${lv}`;
  const fill = document.getElementById('worldlv-popup-bar-fill');
  const label = document.getElementById('worldlv-popup-label');
  if (nextThresh == null) {
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
      addLog(`【${location.label}】LocationLv が ${result.newLv} になった`, true);
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
    addLog(`【${actionDisplayLabel(curAction)}】中断`, true);
  }
  selectedActionId = actionId;
  els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
  if (!_storyLogPlaying) startAction(actionId, makeActionCallbacks(actionId));
}

// 施設に入店する。メインパネルに専用メニュー(行動を選ぶ/買い物する/出る)を表示する
function _formatShopItemLabel(item) {
  const base = `${resLabel(item.id)} ${item.price}${resUnit('magcoin') || 'マグコイン'}`;
  if (!item.companionId) return base;
  const name = COMPANION_DATA[item.companionId]?.name ?? item.companionId;
  return `${base}（${name}の品）`;
}

function _enterFacility(facility) {
  selectedActionId = facility.id;
  els.actionPickerBtn.textContent = actionDisplayLabel(facility, ' — ');
  _pauseForStory();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runFacilityMenu(els.mainPanel, {
    label: facility.label,
    enterText: facility.enterText,
    options: facility.options,
    getShopItems,
    formatShopItem: _formatShopItemLabel,
    onBuy: (shopId, itemId) => {
      const result = buyShopItem(shopId, itemId);
      if (result.ok) {
        const label = resLabel(result.itemId);
        const extra = result.companionId ? `（${COMPANION_DATA[result.companionId]?.name ?? result.companionId}の品）` : '';
        return { message: `${label}${extra}を ${result.price}マグコインで買った` };
      }
      if (result.reason === 'magcoin') return { message: 'マグコインが足りない…' };
      return { message: '今は買えそうな品がない…' };
    },
    onSelectAction: (subActionId) => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      _startActionById(subActionId);
    },
    onLeave: () => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
      _revertActionSelection();
    },
  });
}

function _handleActionComplete(actionId, result) {
  const { allRewards, companionRewards, worldLvUp, rareDrop } = result;
  const act = ACTIONS[actionId];

  if (act?.stub) {
    addLog(`【${act.label}】はまだ準備中だ・・・`, true);
    return;
  }

  const _rewardHtml = ({ resource, amount }, wrapClass) => {
    const span = `${resourceSpan(resource, resLabel(resource))} +${amount}`;
    return wrapClass ? `<span class="${wrapClass}">${span}</span>` : span;
  };
  const rewardsHtml = (allRewards ?? []).map(r => _rewardHtml(r)).join(', ');
  const companionRewardsHtml = (companionRewards ?? []).map(r => _rewardHtml(r, 'log-companion-reward')).join(', ');
  const fullRewardsHtml = companionRewardsHtml ? `${rewardsHtml} / ${companionRewardsHtml}` : rewardsHtml;
  addLog(`【${actionDisplayLabel(act)}】完了 — ${fullRewardsHtml}`, true, true);

  if (worldLvUp != null) {
    const next = WORLD_LV_THRESHOLDS[worldLvUp];
    const nextStr = next != null ? `（次: ${next}lg）` : '（最大）';
    addLog(`【世界】worldLv が ${worldLvUp} になった ${nextStr}`, true);
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
  const label = enemyLabel ?? '何か';
  addLog(evaded ? `【！】${label}に遭遇したが、難を逃れた` : `【！】${label}に遭遇した！探索は中断した…`, true, true);
  render(getState());
}

// レアドロップ後の同行者加入イベントを再生し、完了後にunlockCompanionする
function startCompanionJoin(companionId) {
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runCompanionJoin(companionId, els.mainPanel, {
    initialName: getState().playerName,
    onComplete: () => {
      _storyLogPlaying = false;
      if (cleanup) { cleanup(); cleanup = null; }
      unlockCompanion(companionId);
      const compName = COMPANION_DATA[companionId]?.name ?? companionId;
      addLog(`【同行】${compName} が仲間になった`, true);
      render(getState());
    },
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

const _ICON_AXE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3l7 7-3 3-7-7z"/><path d="M11 6L4 13l3 3 7-7"/><line x1="6" y1="15" x2="3" y2="21"/></svg>`;

const ACTION_ICONS = {
  '探索':          _ICON_SEARCH,
  '採集':          _ICON_GATHER,
  '木こり':        _ICON_AXE,
  '宿屋 尻尾亭':    _ICON_BED,
  '花屋 竜の鱗':    _ICON_FLOWER,
  '塔都図書館':     _ICON_BOOK,
  '道具屋 リーリエ': _ICON_GEM,
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
      name.className = 'action-row-name';
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
      time.textContent = action._kind === 'facility' ? '入店' : `${action.duration / 1000}秒`;

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedActionId = action.id;
        els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
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
    if (action) els.actionPickerBtn.textContent = actionDisplayLabel(action, ' — ');
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
  _pauseForStory();
  setLogSt2Done();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runLogSt_2(els.mainPanel, {
    onComplete: () => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } },
        () => addLog('フラグメントをもっと集めてみよう...', false));
    },
  });
}

function startLogSt_1() {
  const state = getState();
  if (state.logSt1Done) return;
  _pauseForStory();
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
      unlockCompanion('yuya');
      addLog('【同行】ユウヤが仲間になった', true);
      _onLogStComplete(() => { if (_logStCleanup) { _logStCleanup(); _logStCleanup = null; } });
    },
  });
}

function startLogSt_3() {
  const state = getState();
  if (state.logSt3Done) return;
  _pauseForStory();
  setLogSt3Done();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runLogSt_3(els.mainPanel, {
    onComplete: () => {
      _onLogStComplete(() => { if (cleanup) { cleanup(); cleanup = null; } });
    },
  });
}

function startLogSt_4() {
  const state = getState();
  if (state.logSt4Done) return;
  _pauseForStory();
  setLogSt4Done();
  _storyLogPlaying = true;
  let cleanup = null;
  cleanup = runLogSt_4(els.mainPanel, {
    onComplete: () => {
      _onLogStComplete(
        () => { if (cleanup) { cleanup(); cleanup = null; } },
        () => {
          addResources('guide_earring', 1);
          addLog(`【！】${resourceSpan('guide_earring', resLabel('guide_earring'))} を手に入れた`, true, true);
        }
      );
    },
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

  if (pending.kind === 'fixed') {
    cleanup = runLocationChoice(els.mainPanel, {
      prompt: '高くそびえる白亜の塔が見えてきた・・・',
      options: [{ id: pending.locationId, label: `${DISCOVERY_LABELS[pending.locationId] ?? '塔都'}へ向かう` }],
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
const COMPANION_DATA = {
  yuya:  { name: 'ユウヤ', desc: '記憶を失った少年。何かを探している。' },
  rabi:   { name: 'ラビ',   desc: '盲目の剣士。' },
  shizuku:{ name: 'シズク', desc: '寡黙な青年。' },
  kaoru:  { name: 'カオル', desc: 'いつも笑顔のお姉さん。' },
  yukika: { name: '雪架',   desc: 'なにか秘密を知っているようだ。' },
};

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

// null = 未初期化(初回renderはセーブ済みの状態に同期するだけにし、「いま新規解放された」と誤判定しない)
let _prevUnlockedCompanions = null;
const _expandedCompanionIds = new Set();

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
  const bondText = document.createElement('span');
  bondText.textContent = `Lv ${bondLv}`;
  bondRow.appendChild(bondText);
  if (bondLv < BOND_LV_MAX) {
    const cost = BOND_LV_COSTS[bondLv];
    for (const itemId of GIFT_ITEMS) {
      const have = state.resources[itemId] ?? 0;
      if (have <= 0) continue;
      const giftBtn = document.createElement('button');
      giftBtn.className = 'companion-equip-btn';
      giftBtn.textContent = `${resLabel(itemId)}を渡す（${cost}）`;
      giftBtn.disabled = have < cost;
      giftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        giveGift(id, itemId);
        renderCharTab(getState());
      });
      bondRow.appendChild(giftBtn);
    }
  }
  bondSection.appendChild(bondRow);
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
  const relatedStories = Object.values(STORIES).filter(s => s.companionId === id && (state.appearedStories ?? []).includes(s.id));
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

// 同行カードのドラッグハンドルによる長押しドラッグ&ドロップ(同行中⇔別行動の移動)
// ハンドル以外はタッチでの通常スクロールを邪魔しない(カード本体はtouch-action:auto)
const _PARTY_DRAG_LONGPRESS_MS = 350;
const _PARTY_DRAG_MOVE_THRESHOLD = 8;

function _attachPartyDragHandlers(handle, card, companionId) {
  let pressTimer = null;
  let dragging = false;
  let startX = 0, startY = 0;
  let ghost = null;
  let originZone = null;

  function cleanup() {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (ghost) { ghost.remove(); ghost = null; }
    card.classList.remove('dragging');
    document.querySelectorAll('.party-section.drop-target').forEach(el => el.classList.remove('drop-target'));
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }

  function zoneAt(x, y) {
    let zone = null;
    document.querySelectorAll('.party-section').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) zone = el.dataset.partyZone;
    });
    return zone;
  }

  function onMove(e) {
    const x = e.clientX, y = e.clientY;
    if (!dragging) {
      if (Math.abs(x - startX) > _PARTY_DRAG_MOVE_THRESHOLD || Math.abs(y - startY) > _PARTY_DRAG_MOVE_THRESHOLD) {
        clearTimeout(pressTimer);
      }
      return;
    }
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    const zone = zoneAt(x, y);
    document.querySelectorAll('.party-section').forEach(el => {
      el.classList.toggle('drop-target', el.dataset.partyZone === zone);
    });
  }

  function onUp(e) {
    if (dragging) {
      const targetZone = zoneAt(e.clientX, e.clientY);
      if (targetZone && targetZone !== originZone) {
        const makeActive = targetZone === 'active';
        const name = COMPANION_DATA[companionId]?.name ?? '';
        if (makeActive && getState().companionTasks?.[companionId]) {
          addLog('作業中は同行させられません', true);
        } else if (getState().activeAction) {
          // 行動中はいきなり中断せず、確認をとってから中断＆編成変更する
          const verb = makeActive ? '同行させ' : '別行動にし';
          showConfirm(`現在の行動を中断して、${name}を${verb}ますか？`, () => {
            _interruptForPartyChange(companionId, makeActive);
          });
        } else {
          setActiveCompanion(companionId, makeActive);
        }
      }
      renderCharTab(getState());
    }
    cleanup();
  }

  function onCancel() {
    cleanup();
  }

  handle.addEventListener('click', (e) => e.stopPropagation());
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    originZone = card.closest('.party-section')?.dataset.partyZone;
    pressTimer = setTimeout(() => {
      dragging = true;
      card.classList.add('dragging');
      ghost = document.createElement('div');
      ghost.className = 'party-drag-ghost';
      ghost.textContent = card.querySelector('.companion-name')?.textContent ?? '';
      ghost.style.left = `${startX}px`;
      ghost.style.top = `${startY}px`;
      document.body.appendChild(ghost);
    }, _PARTY_DRAG_LONGPRESS_MS);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

function renderCharTab(state) {
  const view = document.getElementById('view-chars');
  view.innerHTML = '<div class="sub-title">同行</div>';

  const active = state.activeCompanions ?? [];
  const unlocked = state.unlockedCompanions ?? [];
  const bench = unlocked.filter(id => !active.includes(id));

  // ── 同行中エリア ──
  const activeSection = document.createElement('div');
  activeSection.className = 'party-section';
  activeSection.dataset.partyZone = 'active';
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
    const lv = state.ELv?.[id] ?? 0;
    const lvTag = companionLvTagHtml(lv);
    card.innerHTML = `<div class="companion-name">${data.name}${lvTag}</div><div class="companion-desc">${data.desc}</div>`;
    const handle = document.createElement('div');
    handle.className = 'party-drag-handle';
    handle.textContent = '⠿';
    card.appendChild(handle);
    _attachPartyDragHandlers(handle, card, id);
    card.addEventListener('click', () => {
      if (_expandedCompanionIds.has(id)) _expandedCompanionIds.delete(id);
      else _expandedCompanionIds.add(id);
      renderCharTab(getState());
    });
    activeSection.appendChild(card);
    if (_expandedCompanionIds.has(id)) activeSection.appendChild(_buildCompanionDetail(id, state));
  }

  if (active.length > 0) {
    const bonusLines = [`探索報酬 ×${1 + active.length}`];
    for (const id of active) {
      const rewards = COMPANION_REWARDS[id];
      if (!rewards) continue;
      for (const r of rewards) {
        const discovered = (state.discoveredResources ?? []).includes(r.resource);
        const label = discovered ? `${resLabel(r.resource)} ` : '???';
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
  benchSection.dataset.partyZone = 'bench';
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
    const lv2 = state.ELv?.[id] ?? 0;
    const lvTag2 = companionLvTagHtml(lv2);
    card.innerHTML = `<div class="companion-name">${data.name}${lvTag2}</div><div class="companion-desc">${data.desc}</div>`;
    const detailBtn = document.createElement('button');
    detailBtn.className = 'companion-btn companion-btn--skill';
    detailBtn.textContent = '詳細';
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _expandedCompanionIds.add(id);
      renderCharTab(getState());
    });
    card.appendChild(detailBtn);
    const handle2 = document.createElement('div');
    handle2.className = 'party-drag-handle';
    handle2.textContent = '⠿';
    card.appendChild(handle2);
    _attachPartyDragHandlers(handle2, card, id);
    card.addEventListener('click', () => {
      if (_expandedCompanionIds.has(id)) _expandedCompanionIds.delete(id);
      else _expandedCompanionIds.add(id);
      renderCharTab(getState());
    });
    benchSection.appendChild(card);
    if (_expandedCompanionIds.has(id)) benchSection.appendChild(_buildCompanionDetail(id, state));
  }

  view.appendChild(benchSection);

  // 新同行者解放時にトースト表示(初回renderはセーブ済みの状態に同期するだけ)
  if (_prevUnlockedCompanions !== null) {
    const newlyUnlocked = unlocked.filter(id => !_prevUnlockedCompanions.includes(id));
    if (newlyUnlocked.length > 0) {
      showTabToast('.tab-btn[data-view="view-chars"]', '同行者を選択できます');
    }
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
  _restoreLogHistory();
  subscribe(render);
  const initialState = getState();
  if (initialState.activeAction?.actionId) selectedActionId = initialState.activeAction.actionId;
  render(initialState);
  initTabs();
  initStoryViewer();
  initDevTools();
  initWorldLvPopup();
  initRefreshButton();

  if (!initialState.tutorialDone) {
    // スプラッシュ(TAP画面)が無い場合は即時、ある場合はタップで消えるのを待ってから開始
    if (document.getElementById('splash-screen')) {
      window.addEventListener('splash-dismissed', launchTutorial, { once: true });
    } else {
      launchTutorial();
    }
  }

  initActionPicker();
  if (initialState.activeAction?.actionId) {
    restoreActiveActionCallbacks(makeActionCallbacks(initialState.activeAction.actionId));
  }

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
      if (!_storyLogPlaying) _startActionById(selectedActionId);
    }
  });

  setInterval(tick, 100);
}
