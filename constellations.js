// constellations.js — 星座まわりの共通ヘルパー

function sameMembers(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(id => rightSet.has(id));
}

export { sameMembers };
