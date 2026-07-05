// guides.js — プレイヤーへ示すメタな助言・進行目標の定義
//
// 導きは受注や報酬を持たず、現在の状態から自動的に現れて消える。
// 達成時に世界を変化させる処理は rules.js が担当する。
// select(state, ctx) が null なら非表示、表示時は { text, progress?, target? } を返す。

export const GUIDES = [
  {
    id: 'restore_world_first',
    title: '最初の再生',
    completed: (state, ctx) => (state.worldLv ?? 0) >= ctx.discoveryStepLv[0],
    select: (state, ctx) => {
      const target = ctx.discoveryStepLv[0];
      if ((state.worldLv ?? 0) >= target) return null;
      return {
        text: `【再生された世界】の再生Lvを上げよう…（Lv${target}）`,
        progress: state.worldLv ?? 0,
        target,
      };
    },
  },
  {
    id: 'discover_next_location',
    title: '次の場所を探す',
    completed: (state, ctx) => (state.discoveryStep ?? 0) >= ctx.discoveryStepLv.length,
    select: (state, ctx) => {
      const firstTarget = ctx.discoveryStepLv[0];
      const step = state.discoveryStep ?? 0;
      if ((state.worldLv ?? 0) < firstTarget || !state.logSt4Done || step >= ctx.discoveryStepLv.length) return null;
      const target = ctx.discoveryStepLv[step];
      const current = state.LocationLv?.wherever ?? 0;
      if (current >= target) return null;
      return {
        text: `【再生された世界】をさらに再生しよう…（再生Lv${target}）`,
        progress: current,
        target,
      };
    },
  },
  {
    id: 'unlock_forest_gather',
    title: '森をさらに再生する',
    completed: (state) => state.unlockedActions?.includes('forest_gather'),
    select: (state) => {
      if (!state.unlockedLocations?.includes('forest') || state.unlockedActions?.includes('forest_gather')) return null;
      const current = state.LocationLv?.forest ?? 0;
      if (current >= 2) return null;
      return {
        text: '【はじまりの森】の再生Lvを上げよう…（新しいことができるようになる）',
        progress: current,
        target: 2,
      };
    },
  },
  {
    id: 'discover_nostalgia_facilities',
    title: 'ノスタルジアの施設を探す',
    completed: (state, ctx) => ctx.nostalgiaFacilities.every(id => state.unlockedActions?.includes(id)),
    select: (state, ctx) => {
      if (!state.unlockedLocations?.includes('nostalgia')) return null;
      const found = ctx.nostalgiaFacilities.filter(id => state.unlockedActions?.includes(id)).length;
      if (found >= ctx.nostalgiaFacilities.length) return null;
      return {
        text: '【ノスタルジア】を探索してみよう…まだ見つけていない施設がありそうだ',
        progress: found,
        target: ctx.nostalgiaFacilities.length,
      };
    },
  },
  {
    id: 'restore_continent_chronicle',
    title: '読めない本',
    completed: (state) => !!state.worldChronicleUnlocked,
    select: (state) => {
      if (!state.unlockedActions?.includes('nostalgia_library') || state.worldChronicleUnlocked) return null;
      return {
        text: '【ノスタルジア図書館】で調査を続けてみよう…読めない本が気にかかる',
        progress: Math.min(state.actionCount?.nostalgia_library_research ?? 0, 3),
        target: 3,
      };
    },
  },
  {
    id: 'become_flower_regular',
    title: '花屋の常連',
    completed: (state) => !!state.flowerHelpUnlocked,
    select: (state) => {
      if (!state.unlockedActions?.includes('nostalgia_flower') || state.flowerHelpUnlocked) return null;
      return {
        text: '【花屋 竜の鱗】で花を買ってみよう…何度か通えば、店員と親しくなれるかもしれない',
        progress: Math.min(state.shopPurchaseCount?.flower ?? 0, 3),
        target: 3,
      };
    },
  },
  {
    id: 'find_companion',
    title: '誰かの痕跡',
    completed: (state, ctx) => !Object.values(ctx.actions).some(action =>
      action.rareDrop &&
      state.unlockedLocations?.includes(action.locationId) &&
      !state.unlockedCompanions?.includes(action.rareDrop.companionId)
    ),
    select: (state, ctx) => {
      const action = Object.values(ctx.actions).find(candidate =>
        candidate.rareDrop &&
        state.unlockedLocations?.includes(candidate.locationId) &&
        !state.unlockedCompanions?.includes(candidate.rareDrop.companionId)
      );
      if (!action) return null;
      const location = ctx.locations[action.locationId];
      return { text: `${location?.label ?? 'どこか'}を探索してみよう…なにかが見つかるかもしれない` };
    },
  },
  {
    id: 'equip_companion_relic',
    title: '持ち物を渡す',
    completed: (state, ctx) => !(state.activeCompanions ?? []).some(id => {
      const relic = ctx.companionRelics[id];
      return relic && (state.resources?.[relic] ?? 0) > 0 && state.companionEquipment?.[id] !== relic;
    }),
    select: (state, ctx) => {
      const id = (state.activeCompanions ?? []).find(companionId => {
        const relic = ctx.companionRelics[companionId];
        return relic && (state.resources?.[relic] ?? 0) > 0 && state.companionEquipment?.[companionId] !== relic;
      });
      if (!id) return null;
      return { text: `${ctx.companions[id]?.name ?? id}に持ち物を持たせてみよう` };
    },
  },
];

export function getActiveGuides(state, ctx) {
  const active = [];
  for (const guide of GUIDES) {
    const selected = guide.select(state, ctx);
    if (!selected) continue;
    active.push({
      id: guide.id,
      title: guide.title,
      ...selected,
    });
  }
  return active;
}

export function isGuideCompleted(guideId, state, ctx) {
  const guide = GUIDES.find(candidate => candidate.id === guideId);
  return !!guide?.completed?.(state, ctx);
}
