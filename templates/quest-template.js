// 依頼追加用テンプレート
// このファイル自体はゲームから読み込みません。
// 使いたい形式のオブジェクトを quests.js の QUESTS 配列へコピーします。

// ──────────────────────────────────────────
// A. 素材納品型
// ──────────────────────────────────────────

const DELIVERY_QUEST = {
  id: 'sample_delivery',
  title: '木の実を探して',
  rumorText: '森で採れるものを欲しがっている人がいるらしい……',
  requester: '塔都の住民',
  description: '木の実を必要としている人がいる。5個集めて届けよう。',
  requestComment: '「森で採れる木の実を、5個ほど分けてもらえませんか？」',
  completeComment: '「こんなに瑞々しい木の実を……ありがとうございます」',
  goalLabel: '木の実を5個集める',

  // この数を持つと「噂」へ現れる。ここでは消費しない。
  reveal: {
    requirements: [{ resource: 'touto_rumor', amount: 2 }],
  },

  // 「引き受ける」を押したとき、この数を消費する。
  unlock: {
    requirements: [{ resource: 'touto_rumor', amount: 2 }],
  },

  // 所持数が揃うと完了になり、報告時に消費する。
  requirements: [
    { resource: 'kinomi', amount: 5 },
  ],

  rewards: [
    { resource: 'magcoin', amount: 15 },
  ],
  turnIn: 'quest_ui',
};

// ──────────────────────────────────────────
// B. 探索・行動発見型
// ──────────────────────────────────────────

const ACTION_QUEST = {
  id: 'sample_action',
  title: '珍しい木の実',
  rumorText: '珍しい木の実を探している人がいるらしい……',
  requester: '塔都の料理人',
  description: 'はじまりの森で、珍しい木の実を探そう。',
  requestComment: '「森の奥にだけ実る木の実を、探してきてもらえませんか？」',
  completeComment: '「これです！　よく見つけてくれましたね」',
  goalLabel: 'はじまりの森で採集する',

  reveal: {
    requirements: [{ resource: 'touto_rumor', amount: 3 }],
  },
  unlock: {
    requirements: [{ resource: 'touto_rumor', amount: 3 }],
  },

  // 受注後、指定行動の完了時に20%で達成する。
  objective: {
    type: 'action_chance',
    actionId: 'forest_gather',
    chance: 0.2,
  },
  progressLog: '探していた珍しい木の実を見つけた',
  activeLabel: 'まだ目的の木の実は見つかっていない',
  turnInLabel: '報告する',

  rewards: [
    { resource: 'magcoin', amount: 20 },
  ],
  turnIn: 'quest_ui',
};

// エディタで未使用警告を出しにくくするためのまとめ。
// ゲーム側へは、このexport行をコピーしません。
export {
  DELIVERY_QUEST,
  ACTION_QUEST,
};

