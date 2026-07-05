// stories.js — パーサーのみ。メタデータは stories/index.js で管理

export { STORIES } from './stories/index.js';

// テキストから読み込んだランタイムコストマップ { storyId: { [fromParagraph]: cost[] } }
const _runtimeCostMaps = {};

export function setStoryCostMap(storyId, costMap) {
  _runtimeCostMaps[storyId] = costMap;
}

// 本文テキストをページに分割するパーサー
// `-----` のみの行をページ区切り、`---` のみの行を段落区切りとして扱う
// [pagecost: ...] ブロックは表示から除外する
// string[][] を返す: pages[i][j] = iページ目のj番目の段落
export function parseStoryPages(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text
    .split(/^-----$/m)
    .map(pageText =>
      pageText
        .split(/^---$/m)
        .map(block => block.replace(/^\n+|\n+$/g, ''))
        .filter(block => block.length > 0 && !/^\[pagecost:/i.test(block))
    )
    .filter(page => page.length > 0);
}

// 本文テキストから [pagecost: resource×amount] マーカーを解析する
// Returns: { [fromParagraph: number]: Array<{resource, amount}> }
// マーカーは段落の直前に置く。そのマーカー以降の段落に適用される。
export function parseStoryCostOverrides(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const map = {};
  let paraIndex = 0;
  const allBlocks = text
    .split(/^-----$/m)
    .flatMap(page => page.split(/^---$/m))
    .map(b => b.replace(/^\n+|\n+$/g, ''))
    .filter(b => b.length > 0);

  for (const block of allBlocks) {
    const match = block.match(/^\[pagecost:\s*(.+)\]$/i);
    if (match) {
      const costs = match[1].split(',').map(part => {
        const m = part.trim().match(/^(.+)[×x](\d+)$/);
        if (!m) return null;
        return { resource: m[1].trim(), amount: parseInt(m[2], 10) };
      }).filter(Boolean);
      if (costs.length > 0) map[paraIndex] = costs;
      // マーカー自体は段落カウントに含めない
    } else {
      paraIndex++;
    }
  }
  return map;
}

// 本文テキストから [milestone: flagName] マーカーを解析する
// Returns: { [paragraphIndex: number]: string }
export function parseMilestones(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const map = {};
  let paraIndex = 0;
  const allBlocks = text
    .split(/^-----$/m)
    .flatMap(page => page.split(/^---$/m))
    .map(b => b.replace(/^\n+|\n+$/g, ''))
    .filter(b => b.length > 0);

  for (const block of allBlocks) {
    if (/^\[pagecost:/i.test(block)) continue; // pagecostはカウントしない
    const match = block.match(/^\[milestone:\s*(.+)\]$/i);
    if (match) {
      map[paraIndex] = match[1].trim();
      // マーカー自体は段落カウントに含めない
    } else {
      paraIndex++;
    }
  }
  return map;
}

const _runtimeMilestoneMaps = {};

export function setStoryMilestoneMap(storyId, milestoneMap) {
  _runtimeMilestoneMaps[storyId] = milestoneMap;
}

export function getMilestoneAtParagraph(storyId, paragraphIndex) {
  return _runtimeMilestoneMaps[storyId]?.[paragraphIndex] ?? null;
}

// 段落インデックスに対応するコストを返す
// ランタイムコストマップ → pageCostRules → pageCost の優先順で解決
export function getCostForParagraph(story, paragraphIndex) {
  const runtimeMap = _runtimeCostMaps[story.id];
  if (runtimeMap) {
    const keys = Object.keys(runtimeMap).map(Number).filter(k => k <= paragraphIndex);
    if (keys.length > 0) return runtimeMap[Math.max(...keys)];
    return story.pageCost;
  }
  // フォールバック: メタデータの pageCostRules
  const rules = story.pageCostRules;
  if (rules && rules.length > 0) {
    const applicable = rules
      .filter(r => r.fromParagraph <= paragraphIndex)
      .sort((a, b) => b.fromParagraph - a.fromParagraph);
    if (applicable.length > 0) return applicable[0].cost;
  }
  return story.pageCost;
}
