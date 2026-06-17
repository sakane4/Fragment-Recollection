// stories.js — 物語メタデータのみ。本文は stories/{id}.txt から fetch する

const STORIES = {
  prologue: {
    id: 'prologue',
    title: 'プロローグ',
    // 物語タブに出現する条件
    showCondition: { resource: 'fragment', amount: 50 },
    // 物語が一覧に表示され、解放ボタンが押せるようになる条件
    unlockCost: [{ resource: 'fragment', amount: 10 }],
    // 2ページ目以降を1ページ解放するごとに消費する資源
    pageCost: [{ resource: 'fragment', amount: 5 }],
  },
};

// 本文テキストをページに分割するパーサー
// `---` のみの行をページ区切りとして扱う
function parseStoryPages(text) {
  return text
    .split(/^---$/m)
    .map(block => block.replace(/^\n+|\n+$/g, '')) // 先頭・末尾の改行のみ除去(行頭スペースは保持)
    .filter(block => block.length > 0);
}

export { STORIES, parseStoryPages };
