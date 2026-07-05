// rules.js — アンロック・発火条件の一元管理
// condition(state): true のとき action を実行
// requireViewerClosed: true のとき、ビューアが開いている間はスキップ
// storyLogPlaying フラグは ctx 経由で渡す

import { STORIES } from './stories.js';
import { getPendingDiscovery } from './game.js';

export const UNLOCK_RULES = [

  // ── ログストーリー ──
  {
    id: 'log_st_1',
    requireViewerClosed: true,
    condition: (state) =>
      !state.logSt1Done &&
      (state.storyProgress['prologue'] ?? 0) >= (STORIES['prologue']?.pageCount ?? Infinity),
    action: (ctx) => ctx.startLogSt_1(),
  },
  {
    id: 'log_st_3',
    requireViewerClosed: true,
    condition: (state) =>
      !state.logSt3Done &&
      (state.storyProgress['yuya_1'] ?? 0) >= 3,
    action: (ctx) => ctx.startLogSt_3(),
  },
  {
    id: 'log_st_4',
    requireViewerClosed: true,
    condition: (state) =>
      !state.logSt4Done &&
      (state.storyProgress['yuya_1'] ?? 0) >= 13,
    action: (ctx) => ctx.startLogSt_4(),
  },

  // ── 場所・行動の解放 ──
  {
    id: 'unlock_forest',
    condition: (state) =>
      state.logSt3Done &&
      !state.unlockedLocations.includes('forest'),
    action: (ctx) => ctx.unlockLocation('forest', ['forest_explore']),
  },
  {
    id: 'unlock_forest_gather',
    condition: (state) =>
      (state.LocationLv?.['forest'] ?? 0) >= 2 &&
      state.unlockedLocations.includes('forest') &&
      !(state.unlockedActions ?? []).includes('forest_gather'),
    action: (ctx) => ctx.unlockAction('forest_gather'),
  },
  {
    // 道具屋で斧を買う(resources.axe>0)と、はじまりの森で木こりが解放される
    id: 'unlock_forest_woodcut',
    condition: (state) =>
      (state.resources?.axe ?? 0) > 0 &&
      state.unlockedLocations.includes('forest') &&
      !(state.unlockedActions ?? []).includes('forest_woodcut'),
    action: (ctx) => ctx.unlockAction('forest_woodcut'),
  },
  {
    id: 'unlock_guide',
    condition: (state) =>
      state.logSt4Done &&
      !state.guideUnlocked,
    action: (ctx) => ctx.unlockGuide(),
  },
  {
    id: 'unlock_world_chronicle',
    requireViewerClosed: true,
    condition: (state) =>
      (state.actionCount?.nostalgia_library_research ?? 0) >= 3 &&
      !state.worldChronicleUnlocked,
    action: (ctx) => ctx.startWorldChronicleIntro(),
  },
  {
    id: 'unlock_flower_help',
    requireViewerClosed: true,
    condition: (state) =>
      (state.shopPurchaseCount?.flower ?? 0) >= 3 &&
      !state.flowerHelpUnlocked,
    action: (ctx) => ctx.startFlowerHelpIntro(),
  },
  {
    id: 'all_companions_met',
    requireViewerClosed: true,
    condition: (state) =>
      ['yuya', 'rabi', 'shizuku', 'kaoru', 'yukika'].every(id => state.unlockedCompanions.includes(id)) &&
      !state.allCompanionsMetDone,
    action: (ctx) => ctx.startAllCompanionsMet(),
  },
  {
    // ログストーリー004以降 ＆ 再生された世界(wherever)のLvが各ステップの閾値に達したら発見イベントを提示
    // repeatable: ステップが進むたびに次の閾値で再提示される（詳細スケジュールは game.js）
    id: 'discover_location_choice',
    repeatable: true,
    requireViewerClosed: true,
    condition: (state) => getPendingDiscovery(state) != null,
    action: (ctx) => ctx.showDiscovery(),
  },

  // ── 記憶の出現 ──
  // showCondition を持つ物語は stories.js のデータから自動生成
  ...Object.values(STORIES)
    .filter(s => s.showCondition)
    .map(s => ({
      id: `appear_${s.id}`,
      condition: (state) =>
        !state.appearedStories.includes(s.id) &&
        !state.unlockedStories.includes(s.id) &&
        (state.resources[s.showCondition.resource] ?? 0) >= s.showCondition.amount,
      action: (ctx) => ctx.forceAppearStory(s.id),
    })),
];

// セッション内の二重発火防止
const _fired = new Set();

export function evaluateRules(state, ctx) {
  if (ctx.storyLogPlaying) return;
  for (const rule of UNLOCK_RULES) {
    if (_fired.has(rule.id)) continue;
    if (rule.requireViewerClosed && ctx.viewerOpen) continue;
    if (rule.condition(state)) {
      if (!rule.repeatable) _fired.add(rule.id);
      rule.action(ctx);
      if (ctx.isStoryLogPlaying?.()) break;
    }
  }
}

export function resetFiredRules() {
  _fired.clear();
}
