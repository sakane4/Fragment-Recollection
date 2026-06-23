export default {
  id: 'rabi_1',
  title: '赤く光る記憶',                  // 仮置き（命名規則に倣う）
  lockedTitle: 'あいまいに赤く光る記憶',  // 仮置き
  companionId: 'rabi',
  pageCount: 1,                           // TODO: body を書いたら総段落数（`---` 区切りの数）に合わせて更新
  showCondition: { resource: 'red_fragment', amount: 9 },
  unlockCost: [{ resource: 'red_fragment', amount: 10 }],
  pageCost: [{ resource: 'red_fragment', amount: 3 }],
  body: ``,  // TODO: 本文を書く（`---` で段落区切り、`-----` でページ区切り、[pagecost: ...] でコスト変更）
};
