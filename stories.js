// stories.js — パーサーのみ。メタデータは stories/index.js で管理

export { STORIES } from './stories/index.js';



// 本文テキストをページに分割するパーサー
// `---` のみの行をページ区切りとして扱う
// string[][] を返す: pages[i][j] = iページ目のj番目の段落
function parseStoryPages(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text
    .split(/^-----$/m)
    .map(pageText =>
      pageText
        .split(/^---$/m)
        .map(block => block.replace(/^\n+|\n+$/g, ''))
        .filter(block => block.length > 0)
    )
    .filter(page => page.length > 0);
}

// 段落インデックスに対応するコストを返す
// pageCostRules があれば fromParagraph が最も近いルールを適用、なければ pageCost
function getCostForParagraph(story, paragraphIndex) {
  const rules = story.pageCostRules;
  if (rules && rules.length > 0) {
    const applicable = rules
      .filter(r => r.fromParagraph <= paragraphIndex)
      .sort((a, b) => b.fromParagraph - a.fromParagraph);
    if (applicable.length > 0) return applicable[0].cost;
  }
  return story.pageCost;
}

export { parseStoryPages, getCostForParagraph };
