// stories/pageCount.js — body本文から総段落数(pageCount)を数える共通ヘルパー
// stories.js の parseStoryPages と同じ区切りルール(-----=ページ、---=段落、[pagecost:]除外)を
// 使って、単純に「全段落の総数」だけを返す。循環import回避のため stories.js とは独立させている

export function countStoryParagraphs(body) {
  if (!body) return 0;
  const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text
    .split(/^-----$/m)
    .flatMap(pageText => pageText.split(/^---$/m))
    .map(block => block.replace(/^\n+|\n+$/g, ''))
    .filter(block => block.length > 0 && !/^\[pagecost:/i.test(block))
    .length;
}
