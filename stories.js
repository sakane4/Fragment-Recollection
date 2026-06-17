// stories.js — 物語メタデータのみ。本文は stories/{id}.txt から fetch する

const STORIES = {
  prologue: {
    id: 'prologue',
    title: '再生の書',
    lockedTitle: 'あいまいな記憶',
    pageCount: 3,
    // 物語タブに出現する条件
    showCondition: { resource: 'fragment', amount: 50 },
    // 物語が一覧に表示され、解放ボタンが押せるようになる条件
    unlockCost: [{ resource: 'fragment', amount: 10 }],
    // 2ページ目以降を1ページ解放するごとに消費する資源
    pageCost: [{ resource: 'fragment', amount: 5 }],
  },

  yuya_1: {
    id: 'yuya_1',
    title: '青く光る記憶',
    lockedTitle: 'あいまいに青く光る記憶',
    pageCount: 6,
    // 物語タブに出現する条件
    showCondition: { resource: 'blue_fragment', amount: 10 },
    // 物語が一覧に表示され、解放ボタンが押せるようになる条件
    unlockCost: [{ resource: 'blue_fragment', amount: 15 }],
    // 2ページ目以降を1ページ解放するごとに消費する資源
    pageCost: [{ resource: 'blue_fragment', amount: 5 }],
  },
};

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

export { STORIES, parseStoryPages };
