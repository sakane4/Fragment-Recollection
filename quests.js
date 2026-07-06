// quests.js — 物語上の人物から受ける「依頼」の定義
//
// 導き(guides.js)とは異なり、依頼は依頼人・発生イベント・進行状態・達成報告・報酬を持つ。
// 探索中のランダム発見は discover、直接納品は requirements/rewards で定義する。
// reveal.requirements で名前が見える条件、unlock.requirements で手動解放の消費素材を定義する。
import { WORLD_CHRONICLE_ENTRIES } from './chronicles/world.js';

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
    requester: 'ノスタルジアの住民',
    description: '薬草を必要としている人がいる。10束集めて届けよう。',
    requestComment: '「薬草が足りなくて困っているんです。10束ほど、集めてきてもらえませんか？」',
    completeComment: '「助かりました。これでしばらくは安心して過ごせそうです。本当にありがとう」',
    goalLabel: '薬草を10束集める',
    reveal: { requirements: [{ resource: 'nostalgia_rumor', amount: 1 }] },
    unlock: { requirements: [{ resource: 'nostalgia_rumor', amount: 3 }] },
    requirements: [{ resource: 'herb', amount: 10 }],
    rewards: [{ resource: 'magcoin', amount: 20 }],
    turnIn: 'quest_ui',
  },
  {
    id: 'missing_cat',
    title: 'いなくなった猫',
    rumorText: '何かを探している人がいるらしい……',
    requester: 'ノスタルジアの住民',
    description: 'いなくなった猫を探してほしいと頼まれた。ノスタルジアを探索してみよう。',
    requestComment: '「飼っている猫が戻ってこないんです。ノスタルジアのどこかにいると思うのですが……」',
    completeComment: '「見つけてくれたんですね……！　本当にありがとうございます」',
    goalLabel: '猫を探す',
    reveal: { requirements: [{ resource: 'nostalgia_rumor', amount: 5 }] },
    unlock: { requirements: [{ resource: 'nostalgia_rumor', amount: 5 }] },
    objective: { type: 'action_chance', actionId: 'nostalgia_explore', chance: 0.15 },
    progressLog: '猫を見つけた',
    rewards: [],
    turnIn: 'quest_ui',
    turnInLabel: '報告する',
    activeLabel: 'まだ猫は見つかっていない',
  },
  {
    id: 'restore_continent_chronicle',
    title: '大陸誌の復元',
    requester: 'ノスタルジアの司書',
    description: '各地の調査記録を集め、失われた大陸誌の頁を復元しよう。',
    requestComment: '「各地に残る記録を集めて、この大陸誌の復元に協力していただけませんか？」',
    completeComment: '「これで、失われかけていた世界を後世へ残せます。ご協力に、心から感謝します」',
    goalLabel: '大陸誌の頁を復元する',
    autoStart: { stateFlag: 'worldChronicleUnlocked' },
    objective: {
      type: 'resource_set',
      requirements: Object.values(WORLD_CHRONICLE_ENTRIES).map(entry => ({
        resource: entry.recordResource,
        amount: entry.required,
      })),
      unitLabel: '頁',
    },
    rewards: [],
    turnIn: 'quest_ui',
    turnInLabel: '報告する',
  },
  {
    id: 'lost_flowers',
    kind: 'long_term',
    title: '失われた花',
    requester: '花屋の店員',
    description: '失われた花の手がかりを集め、花屋 竜の鱗に九つの花を取り戻そう。',
    requestComment: '「花を探して、またこの花屋を、花でいっぱいにできたら……とても嬉しいです」',
    completeComment: '「こんなにたくさんの花が戻ってくるなんて……本当に、ありがとうございます」',
    goalLabel: '失われた花を9種取り戻す',
    baselineActions: ['nostalgia_library_research'],
    tasks: [
      {
        id: 'find_encyclopedia',
        label: '図書館で花について調べる',
        type: 'state_flag',
        stateFlag: 'flowerEncyclopediaUnlocked',
      },
      {
        id: 'restore_flowers',
        label: '失われた花を取り戻す',
        type: 'child_quest_count',
        target: 9,
        unitLabel: '種',
      },
    ],
    rewards: [],
    turnIn: 'quest_ui',
    turnInLabel: '報告する',
  },
  {
    // 象徴花(flowers.js)を1種ずつ店に増やしていく依頼群の第1弾。今後の花も同じ型
    // (花屋店員との会話を見る→autoStartで依頼が始まる→探索先でgrantResourceの種を発見→
    // 報告で店頭に並ぶ)で追加していく想定。会話の内容(_flowerClerkDialogue、ui.js)は別途執筆する。
    id: 'orsis_seed_request',
    parentId: 'lost_flowers',
    title: '雪架に届けたい花',
    requester: '花屋の店員',
    description: '雪架のために、魔界王都メフィストでオルシスの種を探してほしいと頼まれた。',
    requestComment: '「雪架さんが、魔界王都に咲く花を欲しがっていて……よかったら、探してきてもらえませんか？」',
    completeComment: '「見つけてくれたんですね……！　これで雪架さんにも渡せます。お店にも並べさせていただきますね」',
    goalLabel: 'オルシスの種を見つける',
    autoStart: { stateFlag: 'flowerEncyclopediaUnlocked' },
    objective: { type: 'action_chance', actionId: 'mephisto_explore', chance: 0.15, grantResource: 'orsis_seed' },
    progressLog: 'オルシスの種を見つけた',
    reportLog: '【花屋】オルシスが店頭に並ぶようになった',
    rewards: [{ resource: 'magcoin', amount: 20 }],
    turnIn: 'quest_ui',
    turnInLabel: '報告する',
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
  if (
    stored === QUEST_STATUS.UNAVAILABLE &&
    quest.autoStart?.stateFlag &&
    state[quest.autoStart.stateFlag]
  ) {
    status = QUEST_STATUS.ACTIVE;
  }
  if (stored === QUEST_STATUS.UNAVAILABLE && quest.reveal) {
    const revealed = (quest.reveal.requirements ?? []).every(requirement =>
      (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
    );
    if (revealed) status = QUEST_STATUS.AVAILABLE;
  }
  if (status !== QUEST_STATUS.ACTIVE) return status;
  if (quest.tasks) {
    const ready = quest.tasks.every(task => isQuestTaskComplete(state, quest, task));
    return ready ? QUEST_STATUS.COMPLETED : status;
  }
  if (quest.objective?.type === 'resource_set') {
    const ready = (quest.objective.requirements ?? []).every(requirement =>
      (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
    );
    return ready ? QUEST_STATUS.COMPLETED : status;
  }
  if (quest.objective?.type === 'action_count') {
    const count = state.actionCount?.[quest.objective.actionId] ?? 0;
    return count >= quest.objective.target ? QUEST_STATUS.COMPLETED : status;
  }
  if (quest.objective) return status;
  const ready = (quest.requirements ?? []).every(requirement =>
    (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
  );
  return ready ? QUEST_STATUS.COMPLETED : status;
}

export function getChildQuests(parentId) {
  return QUESTS.filter(quest => quest.parentId === parentId);
}

export function isQuestTaskComplete(state, quest, task) {
  if (task.type === 'state_flag') return !!state[task.stateFlag];
  if (task.type === 'child_quest_count') {
    const completed = getChildQuests(quest.id).filter(child =>
      getQuestStatus(state, child.id) === QUEST_STATUS.REPORTED
    ).length;
    return completed >= task.target;
  }
  return false;
}

export function getQuestTaskProgress(state, quest, task) {
  if (task.type === 'state_flag') {
    return { current: state[task.stateFlag] ? 1 : 0, target: 1, unitLabel: '' };
  }
  if (task.type === 'child_quest_count') {
    const current = getChildQuests(quest.id).filter(child =>
      getQuestStatus(state, child.id) === QUEST_STATUS.REPORTED
    ).length;
    return { current: Math.min(current, task.target), target: task.target, unitLabel: task.unitLabel ?? '' };
  }
  return null;
}

export function getQuestProgress(state, questId) {
  const quest = getQuestDefinition(questId);
  if (!quest) return null;
  if (quest.tasks) {
    const task = quest.tasks.find(item => item.type === 'child_quest_count') ?? quest.tasks[0];
    return task ? getQuestTaskProgress(state, quest, task) : null;
  }
  if (quest.objective?.type === 'resource_set') {
    const requirements = quest.objective.requirements ?? [];
    return {
      current: requirements.filter(requirement =>
        (state.resources?.[requirement.resource] ?? 0) >= requirement.amount
      ).length,
      target: requirements.length,
      unitLabel: quest.objective.unitLabel ?? '',
    };
  }
  if (quest.objective?.type === 'action_count') {
    return {
      current: Math.min(state.actionCount?.[quest.objective.actionId] ?? 0, quest.objective.target),
      target: quest.objective.target,
      unitLabel: quest.objective.unitLabel ?? '',
    };
  }
  return null;
}

export function getVisibleQuests(state) {
  return QUESTS
    .filter(quest => !quest.parentId)
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
