// constellations.js — 星座の定義と発見判定

const CONSTELLATIONS = [
  {
    id: 'twin_stars',
    name: '双星座',
    mark: '✦',
    members: ['yuya', 'rabi'],
    connections: [['yuya', 'rabi']],
    description: 'ユウヤとラビの光が、ひとつの導きを描く',
    requirements: { explorationCount: 3, questIds: [], itemIds: [], actionIds: [] },
    effects: [],
    episodes: [],
  },
  {
    id: 'snow_rabbit',
    name: '雪うさぎ座',
    mark: '△',
    members: ['yuya', 'rabi', 'yukika'],
    connections: [['yuya', 'rabi'], ['rabi', 'yukika'], ['yukika', 'yuya']],
    description: '三つの光が、雪原を跳ねるうさぎを描く',
    requirements: { explorationCount: 5, questIds: [], itemIds: [], actionIds: [] },
    effects: [],
    episodes: [],
  },
];

function sameMembers(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(id => rightSet.has(id));
}

function requirementsMet(constellation, state) {
  const requirements = constellation.requirements ?? {};
  const questsMet = (requirements.questIds ?? []).every(
    id => state.questStatus?.[id] === 'completed'
  );
  const itemsMet = (requirements.itemIds ?? []).every(requirement => {
    const item = typeof requirement === 'string' ? { id: requirement, amount: 1 } : requirement;
    return (state.resources?.[item.id] ?? 0) >= (item.amount ?? 1);
  });
  const progress = state.constellationProgress?.[constellation.id] ?? 0;
  return questsMet && itemsMet && progress >= (requirements.explorationCount ?? 0);
}

function advanceConstellations(state, actionId) {
  const progress = { ...(state.constellationProgress ?? {}) };
  const discovered = [...(state.discoveredConstellations ?? [])];
  const newlyDiscovered = [];

  for (const constellation of CONSTELLATIONS) {
    if (discovered.includes(constellation.id)) continue;
    if (!sameMembers(state.activeCompanions, constellation.members)) continue;
    const actionIds = constellation.requirements?.actionIds ?? [];
    if (actionIds.length > 0 && !actionIds.includes(actionId)) continue;

    progress[constellation.id] = (progress[constellation.id] ?? 0) + 1;
    const nextState = { ...state, constellationProgress: progress };
    if (requirementsMet(constellation, nextState)) {
      discovered.push(constellation.id);
      newlyDiscovered.push(constellation.id);
    }
  }

  return {
    state: {
      ...state,
      constellationProgress: progress,
      discoveredConstellations: discovered,
    },
    newlyDiscovered,
  };
}

export { CONSTELLATIONS, sameMembers, requirementsMet, advanceConstellations };
