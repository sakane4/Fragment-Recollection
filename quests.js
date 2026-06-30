// quests.js — 物語上の人物から受ける「依頼」の定義
//
// 導き(guides.js)とは異なり、依頼は依頼人・発生イベント・進行状態・達成報告・報酬を持つ。
// 探索中のランダム発見は discover、直接納品は requirements/rewards で定義する。

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
    requester: '塔都の住民',
    description: '薬草を必要としている人がいる。10束集めて届けよう。',
    discover: { actionId: 'touto_explore', chance: 0.1 },
    requirements: [{ resource: 'herb', amount: 10 }],
    rewards: [{ resource: 'magcoin', amount: 20 }],
    turnIn: 'quest_ui',
  },
];

export function getQuestDefinition(questId) {
  return QUESTS.find(quest => quest.id === questId) ?? null;
}

export function getQuestStatus(state, questId) {
  const stored = state.questStatus?.[questId] ?? QUEST_STATUS.UNAVAILABLE;
  if (stored !== QUEST_STATUS.ACTIVE) return stored;
  const quest = getQuestDefinition(questId);
  if (!quest) return stored;
  const ready = (quest.requirements ?? []).every(requirement =>
    (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
  );
  return ready ? QUEST_STATUS.COMPLETED : stored;
}

export function getVisibleQuests(state) {
  return QUESTS
    .map(quest => ({ quest, status: getQuestStatus(state, quest.id) }))
    .filter(({ status }) => status !== QUEST_STATUS.UNAVAILABLE);
}

export function getDiscoverableQuests(actionId, state) {
  return QUESTS.filter(quest =>
    quest.discover?.actionId === actionId &&
    getQuestStatus(state, quest.id) === QUEST_STATUS.UNAVAILABLE
  );
}

export function canTurnInQuest(state, questId) {
  const quest = getQuestDefinition(questId);
  return !!quest &&
    quest.turnIn === 'quest_ui' &&
    getQuestStatus(state, questId) === QUEST_STATUS.COMPLETED;
}
