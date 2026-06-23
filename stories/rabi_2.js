export default {
  id: 'rabi_2',
  title: '赤く滲む記憶',                  // 仮置き（命名規則に倣う）
  lockedTitle: 'あいまいに赤く滲む記憶',  // 仮置き
  companionId: 'rabi',
  pageCount: 1,                           // TODO: body を書いたら総段落数（`---` 区切りの数）に合わせて更新
  showCondition: { resource: 'red_fragment', amount: 30 },
  unlockCost: [{ resource: 'red_fragment', amount: 20 }],
  pageCost: [{ resource: 'red_fragment', amount: 5 }],
  body: ``,  // TODO: 本文を書く（`---` で段落区切り、`-----` でページ区切り、[pagecost: ...] でコスト変更）
};
