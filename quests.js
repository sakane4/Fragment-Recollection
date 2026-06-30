// quests.js — 物語上の人物から受ける「依頼」の定義
//
// 導き(guides.js)とは異なり、依頼は依頼人・発生イベント・進行状態・達成報告・報酬を持つ。
// 探索中のランダム発見は discover、直接納品は requirements/rewards で定義する。
// reveal.requirements で名前が見える条件、unlock.requirements で手動解放の消費素材を定義する。

export const QUEST_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  AVAILABLE: 'available',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  REPORTED: 'reported',
});

export const QUESTS = [
  {
    id: 'need_herb',
    title: '薬草が欲しい',
    rumorText: '薬草を探している人がいるらしい……',
    requester: '塔都の住民',
    description: '薬草を必要としている人がいる。10束集めて届けよう。',
    requestComment: '「薬草が足りなくて困っているんです。10束ほど、集めてきてもらえませんか？」',
    completeComment: '「助かりました。これでしばらくは安心して過ごせそうです。本当にありがとう」',
    goalLabel: '薬草を10束集める',
    reveal: { requirements: [{ resource: 'touto_rumor', amount: 1 }] },
    unlock: { requirements: [{ resource: 'touto_rumor', amount: 3 }] },
    requirements: [{ resource: 'herb', amount: 10 }],
    rewards: [{ resource: 'magcoin', amount: 20 }],
    turnIn: 'quest_ui',
  },
  {
    id: 'missing_cat',
    title: 'いなくなった猫',
    rumorText: '何かを探している人がいるらしい……',
    requester: '塔都の住民',
    description: 'いなくなった猫を探してほしいと頼まれた。塔都を探索してみよう。',
    requestComment: '「飼っている猫が戻ってこないんです。塔都のどこかにいると思うのですが……」',
    completeComment: '「見つけてくれたんですね……！　本当にありがとうございます」',
    goalLabel: '猫を探す',
    reveal: { requirements: [{ resource: 'touto_rumor', amount: 5 }] },
    unlock: { requirements: [{ resource: 'touto_rumor', amount: 5 }] },
    objective: { type: 'action_chance', actionId: 'touto_explore', chance: 0.15 },
    progressLog: '猫を見つけた',
    rewards: [],
    turnIn: 'quest_ui',
    turnInLabel: '報告する',
    activeLabel: 'まだ猫は見つかっていない',
  },
];

export function getQuestDefinition(questId) {
  return QUESTS.find(quest => quest.id === questId) ?? null;
}

export function getQuestStatus(state, questId) {
  const stored = state.questStatus?.[questId] ?? QUEST_STATUS.UNAVAILABLE;
  let status = stored;
  const quest = getQuestDefinition(questId);
  if (!quest) return stored;
  if (stored === QUEST_STATUS.UNAVAILABLE && quest.reveal) {
    const revealed = (quest.reveal.requirements ?? []).every(requirement =>
      (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
    );
    if (revealed) status = QUEST_STATUS.AVAILABLE;
  }
  if (status !== QUEST_STATUS.ACTIVE) return status;
  if (quest.objective) return status;
  const ready = (quest.requirements ?? []).every(requirement =>
    (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
  );
  return ready ? QUEST_STATUS.COMPLETED : status;
}

export function getVisibleQuests(state) {
  return QUESTS
    .map(quest => ({ quest, status: getQuestStatus(state, quest.id) }))
    .filter(({ status }) => status !== QUEST_STATUS.UNAVAILABLE);
}

export function getDiscoverableQuests(actionId, state) {
  return QUESTS.filter(quest =>
    !quest.reveal &&
    quest.discover?.actionId === actionId &&
    (quest.discover?.requirements ?? []).every(requirement =>
      (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
    ) &&
    getQuestStatus(state, quest.id) === QUEST_STATUS.UNAVAILABLE
  );
}

export function canTurnInQuest(state, questId) {
  const quest = getQuestDefinition(questId);
  return !!quest &&
    quest.turnIn === 'quest_ui' &&
    getQuestStatus(state, questId) === QUEST_STATUS.COMPLETED;
}

export function canUnlockQuest(state, questId) {
  const quest = getQuestDefinition(questId);
  return !!quest &&
    getQuestStatus(state, questId) === QUEST_STATUS.AVAILABLE &&
    (quest.unlock?.requirements ?? []).every(requirement =>
      (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
    );
}

export function getActionObjectiveQuests(actionId, state) {
  return QUESTS.filter(quest =>
    quest.objective?.type === 'action_chance' &&
    quest.objective.actionId === actionId &&
    getQuestStatus(state, quest.id) === QUEST_STATUS.ACTIVE
  );
}
