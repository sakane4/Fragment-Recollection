// 素材追加用テンプレート
// このファイル自体はゲームから読み込みません。
// 各ブロックを、コメントに書かれた場所へコピーして使います。

// ──────────────────────────────────────────
// 1. resource.js の RESOURCES 内へ追加
// ──────────────────────────────────────────

const RESOURCE_DEFINITION = {
  sample_material: {
    label: '素材の名前',
    color: '#a6e3a1',
    unit: '個',
    acquireVerb: '拾った',
  },
};

// 通常素材は category を省略すると、自動的に「素材」へ入ります。
// 必要な場合だけ、次の項目も定義できます。
//
// category: 'tool',       // 道具
// category: 'relic',      // レリック
// highlight: true,        // 獲得ログを強調
// acquireVerbByAction: {
//   action_id: 'もらった',
// },

// ──────────────────────────────────────────
// 2-A. 行動完了時に必ず入手する場合
// 対象行動の rewards 配列へ追加
// ──────────────────────────────────────────

const FIXED_REWARD = { resource: 'sample_material', amount: 1 };

// ──────────────────────────────────────────
// 2-B. 行動中にランダム入手する場合
// 対象行動の randomRewards 配列へ追加
// ──────────────────────────────────────────

const RANDOM_REWARD = {
  resource: 'sample_material',
  minAmount: 1,
  maxAmount: 2,
  minMs: 8000,
  maxMs: 18000,
  chance: 0.2,
};

// ──────────────────────────────────────────
// 2-C. 依頼報酬にする場合
// quests.js の対象依頼の rewards 配列へ追加
// ──────────────────────────────────────────

const QUEST_REWARD = { resource: 'sample_material', amount: 3 };

// エディタで未使用警告を出しにくくするためのまとめ。
// ゲーム側へは、このexport行をコピーしません。
export {
  RESOURCE_DEFINITION,
  FIXED_REWARD,
  RANDOM_REWARD,
  QUEST_REWARD,
};
