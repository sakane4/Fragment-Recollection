// constellation-effects.js — 星座作成時に宿る効果の定義
import { sameMembers } from './constellations.js';

const CONSTELLATION_EFFECT_RULES = [
  {
    id: 'twin_chain',
    name: '双星連環',
    requiredMembers: ['yuya', 'rabi'],
    exact: true,
    priority: 100,
    description: 'ユウヤとラビの星が互いを呼び、探索の道を短く照らす。',
    effects: [
      { type: 'fragmentMultiplier', value: 3, resource: 'fragment', label: 'フラグメント×3' },
      { type: 'extraReward', resource: 'crescent_fragment', amount: 1, label: '三日月のフラグメント' },
      { type: 'durationRate', value: 0.8, label: '行動時間 80%' },
    ],
  },
];

const GENERIC_CONSTELLATION_EFFECT = {
  id: 'starlight_trace',
  name: '星明かりの跡',
  description: '結ばれた星の光が、かすかな行き先を示している。',
  effects: [
    { type: 'durationRate', value: 0.95, label: '探索時間 95%' },
  ],
};

function resolveConstellationEffect(members = []) {
  const matched = CONSTELLATION_EFFECT_RULES
    .filter(rule => {
      const hasRequired = rule.requiredMembers.every(id => members.includes(id));
      if (!hasRequired) return false;
      if (rule.exact && !sameMembers(members, rule.requiredMembers)) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];

  return matched ?? GENERIC_CONSTELLATION_EFFECT;
}

function effectSummary(effect) {
  if (!effect) return '';
  return (effect.effects ?? []).map(item => item.label).join(' / ');
}

export { resolveConstellationEffect, effectSummary };
