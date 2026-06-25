// game.js — ゲームロジック・状態管理 (DOM操作なし)
import { STORIES, getCostForParagraph } from './stories.js';

// 共通報酬テーブル。関数形式: (state) => Array<reward>
// 将来、世界Lvや状態を参照して量を変えることができる
const REWARD_TABLES = {
  fragment_fixed: (state, locationLv, actionLv) => [
    { resource: 'fragment', amount: 10 + state.worldLv * 2 + locationLv * 3 + actionLv * 2 },
  ],
  fragment_random: (state, locationLv, actionLv) => [
    { resource: 'fragment', minAmount: 1 + state.worldLv, maxAmount: 3 + state.worldLv * 2 + locationLv + actionLv, minMs: 4000, maxMs: 9000 },
  ],
  // はじまりの森 — 共通ランダム報酬（全行動に適用）
  forest_common_random: () => [
    { resource: 'forest_voice', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
  ],
  // はじまりの森 — 行動別ランダム報酬
  forest_explore_random: (_state, locationLv, actionLv) => [
    { resource: 'forest_voice', minAmount: 1, maxAmount: (locationLv >= 2 ? 3 : 2) + actionLv, minMs: 10000, maxMs: 20000 },
  ],
  forest_gather_random: (_state, locationLv, actionLv) => [
    { resource: 'herb',     minAmount: 1, maxAmount: 3 + actionLv, minMs: 4000, maxMs: 9000 },
    { resource: 'fragment', minAmount: 1, maxAmount: 2 + actionLv, minMs: 5000, maxMs: 12000 },
    ...(locationLv >= 2 ? [{ resource: 'branch', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 20000 }] : []),
  ],
  // はじまりの森 — 木こり(道具屋で斧を買うと解放)
  wood_fixed: (_state, locationLv, actionLv) => [
    { resource: 'wood', amount: 3 + locationLv + actionLv },
  ],
  wood_random: (_state, _locationLv, actionLv) => [
    { resource: 'wood',   minAmount: 1, maxAmount: 2 + actionLv, minMs: 5000, maxMs: 12000 },
    { resource: 'branch', minAmount: 1, maxAmount: 1, minMs: 9000, maxMs: 20000 },
  ],
  // 塔都 — 花屋（マグコインを得る）
  magcoin_fixed: (_state, _locationLv, actionLv) => [
    { resource: 'magcoin', amount: 3 + actionLv },
  ],
  magcoin_random: (_state, _locationLv, actionLv) => [
    { resource: 'magcoin', minAmount: 1, maxAmount: 2 + actionLv, minMs: 5000, maxMs: 12000 },
  ],
  // 塔都 — 図書館（調査）
  library_random: (_state, _locationLv, actionLv) => [
    { resource: 'old_text', minAmount: 1, maxAmount: 1 + Math.floor(actionLv / 2), minMs: 6000, maxMs: 14000 },
  ],
};

// 塔都 — 骨董屋。マグコインを払って、出会った同行者の固有レリックを買う(レアドロップとは別の確定ルート)
const ANTIQUE_RELIC_PRICE = 30;
const ANTIQUE_RELIC_COMPANIONS = ['rabi', 'shizuku', 'kaoru', 'yukika'];

// テーブル名 → 展開済み配列を返すヘルパー
function resolveTable(tableNameOrArray, locationId, actionId) {
  if (!tableNameOrArray) return [];
  const names = Array.isArray(tableNameOrArray) ? tableNameOrArray : [tableNameOrArray];
  const locationLv = state.LocationLv?.[locationId] ?? 0;
  const actionLv = state.ActionLv?.[actionId] ?? 0;
  return names.flatMap(name => {
    const fn = REWARD_TABLES[name];
    return fn ? fn(state, locationLv, actionLv) : [];
  });
}

// 場所・行動の定義（行動は場所にネスト）
const LOCATION_DEFS = [
  {
    id: 'wherever',
    label: '再生された世界',
    description: 'なにもない世界。ここから、すべてははじまる。',
    actions: [
      {
        id: 'explore',
        label: '探索',
        description: '再生された世界を探索する。',
        duration: 15000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'fragment_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'forest',
    label: 'はじまりの森',
    description: '静かな緑の森。木々の声が聞こえる気がする。',
    actions: [
      {
        id: 'forest_explore',
        label: '探索',
        description: 'はじまりの森を探索する。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: ['forest_common_random', 'forest_explore_random'],
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
      {
        id: 'forest_gather',
        label: '採集',
        description: '森を歩き回り、素材を集める。',
        duration: 15000,
        rewards: [
          { resource: 'herb', amount: 10 },
        ],
        rewardTableRandom: ['forest_common_random', 'forest_gather_random'],
        randomRewards: [],
        discoveries: [],
      },
      {
        id: 'forest_woodcut',
        label: '木こり',
        description: '斧をふるい、木を伐って木材を集める。',
        duration: 20000,
        rewardTable: 'wood_fixed',
        rewardTableRandom: ['forest_common_random', 'wood_random'],
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'kyusha',
    label: '黄昏の旧校舎',
    description: '誰もいない、夕暮れの校舎。懐かしくも知らない記憶の匂いがする。',
    actions: [
      {
        id: 'kyusha_explore',
        label: '探索',
        description: '旧校舎の中を歩き回る。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        randomRewards: [
          { resource: 'old_paint', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 16000 },
          { resource: 'torn_page', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
          { resource: 'broken_piano_sound', minAmount: 1, maxAmount: 1, minMs: 9000, maxMs: 20000 },
        ],
        rareDrop: { resource: 'art_room_key', companionId: 'shizuku', chance: 0.05 },
        rewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'renril',
    label: '翼竜の都 レンリル',
    description: '人と翼竜がともに暮らす空の街。',
    actions: [
      {
        id: 'renril_explore',
        label: '探索',
        description: 'レンリルの街を歩く。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        randomRewards: [
          { resource: 'wyvern_claw', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 16000 },
          { resource: 'wyvern_scale', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
        ],
        rareDrop: { resource: 'melon_keychain', companionId: 'kaoru', chance: 0.05 },
        rewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'mephisto',
    label: '魔界王都 メフィスト',
    description: '紫煙ただよう魔の都。魔術と禁書のにおい。',
    actions: [
      {
        id: 'mephisto_explore',
        label: '探索',
        description: 'メフィストの路地を歩く。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        randomRewards: [
          { resource: 'spellbook_page', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 16000 },
          { resource: 'magic_circle_shard', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
          { resource: 'astard_fragment', minAmount: 1, maxAmount: 1, minMs: 9000, maxMs: 20000 },
        ],
        rareDrop: { resource: 'sky_compass', companionId: 'yukika', chance: 0.05 },
        rewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'knights',
    label: '王立騎士団本部',
    description: '規律と鋼の気配。騎士たちが行き交う本部。',
    actions: [
      {
        id: 'knights_explore',
        label: '探索',
        description: '騎士団本部のまわりを調べる。',
        duration: 20000,
        rewardTable: 'fragment_fixed',
        randomRewards: [
          { resource: 'subjugation_report', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 16000 },
          { resource: 'old_armband', minAmount: 1, maxAmount: 1, minMs: 8000, maxMs: 18000 },
          { resource: 'chipped_insignia', minAmount: 1, maxAmount: 1, minMs: 9000, maxMs: 20000 },
        ],
        rareDrop: { resource: 'polished_sheath', companionId: 'rabi', chance: 0.05 },
        rewards: [],
        discoveries: [],
      },
    ],
  },
  {
    id: 'touto',
    label: '塔都',
    description: 'どこまでも空へ伸びる、白亜の塔をとりまく街。さまざまな施設がある。',
    // 拠点エリア。探索を進める(ActionLvが上がる)ごとに施設をランダムな順で発見する。
    // 4施設(宿屋/花屋/図書館/骨董屋)は通常の行動ではなく「施設」(FACILITIES参照)。
    // 入店するとメインパネルに専用メニューが開き、そこから個別の行動(下記)や買い物を選ぶ
    actions: [
      {
        id: 'touto_explore',
        label: '探索',
        description: '塔都の街を歩き回る。',
        duration: 15000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'fragment_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
      // 宿屋(touto_inn)のメニューから選べる行動
      {
        id: 'touto_inn_rest',
        label: '休む',
        description: '旅の宿でゆっくり休む。',
        duration: 15000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'fragment_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
      // 花屋(touto_flower)のメニューから選べる行動
      {
        id: 'touto_flower_help',
        label: '手伝う',
        description: '花屋を手伝い、マグコインを得る。',
        duration: 15000,
        rewardTable: 'magcoin_fixed',
        rewardTableRandom: 'magcoin_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
      // 図書館(touto_library)のメニューから選べる行動
      {
        id: 'touto_library_research',
        label: '調査',
        description: '図書館で調査を行う。',
        duration: 15000,
        rewardTable: 'fragment_fixed',
        rewardTableRandom: 'library_random',
        rewards: [],
        randomRewards: [],
        discoveries: [],
      },
    ],
  },
];

// 既存コードが参照するフラットな lookup map を生成
const LOCATIONS = {};
const ACTIONS = {};
for (const loc of LOCATION_DEFS) {
  LOCATIONS[loc.id] = { id: loc.id, label: loc.label, description: loc.description ?? '' };
  for (const action of loc.actions) {
    ACTIONS[action.id] = { ...action, locationId: loc.id };
  }
}

// レベル系コスト・閾値の共通計算式（n段目→n+1段目に必要な量。LocationLv/worldLvで共用）
const _levelCostFormula = (n) => 50 * (n * n + n + 1);

// 場所レベルシステム
const LOCATION_LV_MAX = 25;
// Lv n→n+1 のフラグメントコスト（計算式で自動生成・仮。最初の数段は旧値[50,150,350,...]とほぼ一致）
const LOCATION_LV_COSTS = Array.from({ length: LOCATION_LV_MAX }, (_, n) => _levelCostFormula(n));

// ── 場所発見スケジュール ──
// ログストーリー004以降、再生された世界(wherever)のLocationLvが各ステップの閾値に達すると発見イベントが起きる。
// ステップ: 0=Lv5 序盤2択 / 1=Lv10 塔都(固定) / 2=Lv15 序盤の残り＋終盤の1/2抽選 / 3=Lv20 残り2つ / 4=Lv25 残り1つ
// キャラはテーマで場所に固定: 旧校舎→シズク, レンリル→カオル, メフィスト→ユキカ, 騎士団本部→ラビ
const DISCOVERY_EARLY = ['kyusha', 'renril'];
const DISCOVERY_LATE = ['mephisto', 'knights'];
const DISCOVERY_CHAR_LOCATIONS = [...DISCOVERY_EARLY, ...DISCOVERY_LATE];
const DISCOVERY_STEP_LV = [5, 10, 15, 20, 25];
const DISCOVERY_LABELS = {
  kyusha:   '黄昏の旧校舎',
  renril:   '翼竜の都 レンリル',
  mephisto: '魔界王都 メフィスト',
  knights:  '王立騎士団本部',
  touto:    '塔都',
};
// 各場所を解放したとき同時に解放する行動
const DISCOVERY_LOCATION_ACTIONS = {
  kyusha:   ['kyusha_explore'],
  renril:   ['renril_explore'],
  mephisto: ['mephisto_explore'],
  knights:  ['knights_explore'],
  touto:    ['touto_explore'],
};

// 塔都の施設。ActionLv(touto_exploreの実行回数レベル)が上がるたびランダムな順で1つずつ発見される
const TOUTO_FACILITIES = ['touto_inn', 'touto_flower', 'touto_library', 'touto_antique'];

// 指定ステップで提示する選択肢（まだ解放していない場所IDの配列）
function getDiscoveryOptions(state, step) {
  const unlocked = state.unlockedLocations ?? [];
  const remaining = (ids) => ids.filter(id => !unlocked.includes(id));
  if (step === 0) return remaining(DISCOVERY_EARLY);
  if (step === 2) {
    const earlyLeft = remaining(DISCOVERY_EARLY);
    const late = state.discoveryLatePick ? remaining([state.discoveryLatePick]) : [];
    return [...earlyLeft, ...late];
  }
  return remaining(DISCOVERY_CHAR_LOCATIONS); // step 3, 4
}

// いま発生すべき発見イベントを返す。なければ null
// { step, kind: 'choice'|'fixed', options?: string[], locationId?: string }
function getPendingDiscovery(state) {
  if (!state.logSt4Done) return null;
  const step = state.discoveryStep ?? 0;
  if (step >= DISCOVERY_STEP_LV.length) return null;
  if ((state.LocationLv?.['wherever'] ?? 0) < DISCOVERY_STEP_LV[step]) return null;
  if (step === 1) return { step, kind: 'fixed', locationId: 'touto' };
  const options = getDiscoveryOptions(state, step);
  if (options.length === 0) return null;
  return { step, kind: 'choice', options };
}

// 発見イベントを解決する：選んだ場所（固定時は'touto'）を解放し、ステップを進める
function resolveDiscovery(chosenLocationId) {
  const step = state.discoveryStep ?? 0;
  const actions = DISCOVERY_LOCATION_ACTIONS[chosenLocationId] ?? [];
  const newLocations = state.unlockedLocations.includes(chosenLocationId)
    ? state.unlockedLocations
    : [...state.unlockedLocations, chosenLocationId];
  const newActions = [...state.unlockedActions];
  for (const a of actions) if (!newActions.includes(a)) newActions.push(a);
  // 塔都(step1)を解決した時点で、step2に出す終盤の場所を1/2で抽選・固定
  let latePick = state.discoveryLatePick;
  if (step === 1 && !latePick) latePick = DISCOVERY_LATE[Math.random() < 0.5 ? 0 : 1];
  state = {
    ...state,
    unlockedLocations: newLocations,
    unlockedActions: newActions,
    discoveryStep: step + 1,
    discoveryLatePick: latePick,
  };
  saveToStorage(state);
  notify();
}

// 同行者ごとのアクション完了時固有報酬
// amount は基本量（同行ボーナスの2倍乗算は適用しない）
const COMPANION_REWARDS = {
  yuya: [{ resource: 'blue_fragment',      amount: 3 }],
  rabi:   [{ resource: 'red_fragment',       amount: 3 }],
  shizuku:[{ resource: 'clear_fragment',     amount: 3 }],
  kaoru:  [{ resource: 'bubble_fragment',    amount: 3 }],
  yukika: [{ resource: 'sky_fragment',       amount: 3 }],
};

// 同行者ごとのアクション中ランダム報酬
const COMPANION_RANDOM_REWARDS = {
  yuya: [{ resource: 'blue_fragment',   minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  rabi:   [{ resource: 'red_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  shizuku:[{ resource: 'clear_fragment',  minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  kaoru:  [{ resource: 'bubble_fragment', minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
  yukika: [{ resource: 'sky_fragment',    minAmount: 1, maxAmount: 2, minMs: 6000, maxMs: 14000 }],
};

// 同行者ごとの装備品(固有レリック)。装備すると固有報酬量が EQUIP_BONUS 分アップする
const COMPANION_RELICS = {
  yuya:    'guide_earring',
  rabi:    'polished_sheath',
  shizuku: 'art_room_key',
  kaoru:   'melon_keychain',
  yukika:  'sky_compass',
};
const EQUIP_BONUS = 5;

// ── 施設(FACILITIES) ──
// 通常の行動(時間経過)とは別の概念。入店すると専用メニューが開き、そこから個別の行動を選んだり、
// 買い物(SHOP)をしたりする。FACILITIES自体のidはLOCATION_DEFSの行動解放(unlockedActions)と
// 同じ仕組みで解放される(TOUTO_FACILITIES参照)が、ACTIONSには登録しない
const FACILITIES = {
  touto_inn: {
    id: 'touto_inn',
    label: '宿屋 尻尾亭',
    locationId: 'touto',
    description: '料理がおいしい旅の宿。',
    enterText: '宿屋 尻尾亭に入った。',
    options: [
      { id: 'rest', label: '休む', type: 'action', actionId: 'touto_inn_rest' },
    ],
  },
  touto_flower: {
    id: 'touto_flower',
    label: '花屋 竜の鱗',
    locationId: 'touto',
    description: '花や雑貨を扱う店。',
    enterText: '花屋 竜の鱗に入った。',
    options: [
      { id: 'help', label: '手伝う', type: 'action', actionId: 'touto_flower_help' },
      { id: 'shop', label: '買い物', type: 'shop', shopId: 'flower' },
    ],
  },
  touto_library: {
    id: 'touto_library',
    label: '塔都図書館',
    locationId: 'touto',
    description: '本に埋もれた静かな図書館。',
    enterText: '塔都図書館に入った。',
    options: [
      { id: 'research', label: '調査', type: 'action', actionId: 'touto_library_research' },
    ],
  },
  touto_antique: {
    id: 'touto_antique',
    label: '道具屋 リーリエ',
    locationId: 'touto',
    description: '道具や掘り出し物が並ぶ店。',
    enterText: '道具屋 リーリエに入った。',
    options: [
      { id: 'shop', label: '買い物', type: 'shop', shopId: 'antique' },
    ],
  },
};

// 花屋で買える品(マグコイン消費・在庫無限・効果は今のところ無し、収集アイテム)
const FLOWER_SHOP_ITEMS = [
  { id: 'pressed_flower_red',  price: 5 },
  { id: 'pressed_flower_blue', price: 5 },
];

// 道具屋で買える道具(マグコイン消費・1個だけ所持できる)。斧を買うと、はじまりの森で
// 木こり(forest_woodcut)が解放される(条件判定はrules.js)
const TOOL_SHOP_ITEMS = [
  { id: 'axe', price: 20 },
];

// shopId → 現在購入可能なアイテム一覧を返す
function getShopItems(shopId) {
  if (shopId === 'antique') {
    // すでに持っている道具は出さない(斧など1個きりの道具)
    const tools = TOOL_SHOP_ITEMS
      .filter(it => (state.resources[it.id] ?? 0) <= 0)
      .map(it => ({ ...it }));
    const relics = ANTIQUE_RELIC_COMPANIONS
      .filter(cid => state.unlockedCompanions.includes(cid) && (state.resources[COMPANION_RELICS[cid]] ?? 0) <= 0)
      .map(cid => ({ id: COMPANION_RELICS[cid], companionId: cid, price: ANTIQUE_RELIC_PRICE }));
    return [...tools, ...relics];
  }
  if (shopId === 'flower') {
    return FLOWER_SHOP_ITEMS.map(it => ({ ...it }));
  }
  return [];
}

// 指定アイテムを購入する。マグコインを消費し、リソースを1個増やす
function buyShopItem(shopId, itemId) {
  const item = getShopItems(shopId).find(it => it.id === itemId);
  if (!item) return { ok: false, reason: 'unavailable' };
  if ((state.resources.magcoin ?? 0) < item.price) return { ok: false, reason: 'magcoin', price: item.price };
  const newDiscovered = state.discoveredResources.includes(itemId)
    ? state.discoveredResources
    : [...state.discoveredResources, itemId];
  state = {
    ...state,
    resources: {
      ...state.resources,
      magcoin: state.resources.magcoin - item.price,
      [itemId]: (state.resources[itemId] ?? 0) + 1,
    },
    discoveredResources: newDiscovered,
  };
  saveToStorage(state);
  notify();
  return { ok: true, itemId, price: item.price, companionId: item.companionId };
}

// 同行者レベル(ELv)。固有フラグメントを消費して上げる。上限・コストは仮値
const ELV_MAX = 10;
const ELV_COSTS = Array.from({ length: ELV_MAX }, (_, n) => 10 * (n + 1));

// 同行者ごとの異能。ELvが指定Lvに達すると解放される
const COMPANION_SKILLS = {
  yuya: [
    { id: 'fragment_convert', label: 'フラグメント変換', lv: 5, desc: 'フラグメントを互いに変換できる。' },
  ],
  rabi: [
    { id: 'combat_evade', label: '戦闘技能', lv: 5, desc: '亡者の群れに遭遇しても、確率で被害を回避できる。' },
  ],
};

// フラグメント変換で対象になり得る固有フラグメント一覧(同行者の固有報酬リソースをすべて集める)
const UNIQUE_FRAGMENTS = Object.values(COMPANION_REWARDS).map(r => r[0].resource);

// ── 同行者の特性(成長型パラメータ) ──
// COMPANION_SKILLS(ELvで解放するアクティブ異能)とは別物。同行者ごとに専用の行動を完了するたびに
// 育っていく数値。現状は「育つ・表示される」までが範囲(効果は未定、後で肉付けする)
// growBy: この行動IDが完了したとき、その同行者が同行中(activeCompanions)なら+1される
const COMPANION_TRAITS = {
  shizuku: { id: 'knowledge',     label: '知識', growBy: 'touto_library_research' },
  rabi:    { id: 'swordsmanship', label: '剣術', growBy: 'knights_explore' },
};

// 完了した行動(actionId)に対応する特性を持つ同行者が同行中なら、その特性を+1する
function _growCompanionTraits(actionId) {
  for (const [companionId, trait] of Object.entries(COMPANION_TRAITS)) {
    if (trait.growBy !== actionId) continue;
    if (!state.activeCompanions.includes(companionId)) continue;
    const current = state.companionTraits?.[companionId]?.[trait.id] ?? 0;
    state = {
      ...state,
      companionTraits: {
        ...state.companionTraits,
        [companionId]: { ...(state.companionTraits?.[companionId] ?? {}), [trait.id]: current + 1 },
      },
    };
  }
}

// 同行者レベルを1上げる。固有フラグメントをコスト分消費する
function levelUpCompanion(companionId) {
  const lv = state.ELv[companionId] ?? 0;
  if (lv >= ELV_MAX) return { ok: false };
  const cost = ELV_COSTS[lv];
  const uniqueResource = COMPANION_REWARDS[companionId]?.[0]?.resource;
  if (!uniqueResource) return { ok: false };
  if ((state.resources[uniqueResource] ?? 0) < cost) return { ok: false };
  state = {
    ...state,
    resources: { ...state.resources, [uniqueResource]: state.resources[uniqueResource] - cost },
    ELv: { ...state.ELv, [companionId]: lv + 1 },
  };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// フラグメント変換の異能。direction: 'toUnique'(ノーマル→固有) または 'toNormal'(固有→ノーマル)。レートは1:1
// 個数に応じて時間がかかる(時間中は別行動扱い=同行できない)。同行中の仲間は使用不可
const FRAGMENT_CONVERT_MS_PER_UNIT = 200;
const _companionTaskTimers = {};

function getCompanionTaskProgress(companionId) {
  const task = state.companionTasks?.[companionId];
  if (!task) return null;
  const now = Date.now();
  const total = task.endsAt - task.startedAt;
  const elapsed = now - task.startedAt;
  return Math.min(Math.max(elapsed / total, 0), 1);
}

function startFragmentConvert(companionId, direction, amount, uniqueResource) {
  if (amount <= 0) return { ok: false };
  if (!UNIQUE_FRAGMENTS.includes(uniqueResource)) return { ok: false };
  if (state.activeCompanions.includes(companionId)) return { ok: false };
  if (state.companionTasks?.[companionId]) return { ok: false };
  const lv = state.ELv[companionId] ?? 0;
  const skill = (COMPANION_SKILLS[companionId] ?? []).find(s => s.id === 'fragment_convert');
  if (!skill || lv < skill.lv) return { ok: false };
  const fromRes = direction === 'toUnique' ? 'fragment' : uniqueResource;
  const toRes = direction === 'toUnique' ? uniqueResource : 'fragment';
  if ((state.resources[fromRes] ?? 0) < amount) return { ok: false };
  const now = Date.now();
  const duration = amount * FRAGMENT_CONVERT_MS_PER_UNIT;
  state = {
    ...state,
    resources: { ...state.resources, [fromRes]: state.resources[fromRes] - amount },
    companionTasks: {
      ...state.companionTasks,
      [companionId]: { type: 'convert', fromRes, toRes, amount, startedAt: now, endsAt: now + duration },
    },
  };
  saveToStorage(state);
  notify();
  _scheduleCompanionTask(companionId, duration);
  return { ok: true };
}

function _scheduleCompanionTask(companionId, delay) {
  clearTimeout(_companionTaskTimers[companionId]);
  _companionTaskTimers[companionId] = setTimeout(() => _completeCompanionTask(companionId), delay);
}

function _completeCompanionTask(companionId) {
  const task = state.companionTasks?.[companionId];
  if (!task) return;
  const newTasks = { ...state.companionTasks };
  delete newTasks[companionId];
  state = {
    ...state,
    resources: { ...state.resources, [task.toRes]: (state.resources[task.toRes] ?? 0) + task.amount },
    companionTasks: newTasks,
    lastCompanionTaskResult: { companionId, fromRes: task.fromRes, toRes: task.toRes, amount: task.amount, doneAt: Date.now() },
  };
  saveToStorage(state);
  notify();
}

// 世界LVの閾値（フラグメント総獲得数）
// インデックス i → Lv i+1 に上がるのに必要な累計数（25段階・計算式で自動生成・仮）
// 上限=worldLv のため、wherever を Lv25 まで上げる＝worldLv25 が必要。終盤の場所発見までの長い道のりを形成する
// LocationLvより上がるペースを大きくゆっくりにするため、専用の(より急な)計算式を使う
const _worldLvCostFormula = (n) => 200 * (n * n + n + 1) + 40 * n * n * n;
const WORLD_LV_THRESHOLDS = Array.from({ length: 25 }, (_, n) => _worldLvCostFormula(n));

// 行動レベル(ActionLv)の閾値(仮値)。実行回数の累計でレベルアップ。LocationLvとは別管理。
const ACTION_LV_THRESHOLDS = [
  10,   // Lv 0 → 1
  30,   // Lv 1 → 2
  60,   // Lv 2 → 3
  100,  // Lv 3 → 4
  150,  // Lv 4 → 5
];

const INITIAL_STATE = {
  resources: {
    fragment: 0,
    blue_fragment: 0,
    red_fragment: 0,
    clear_fragment: 0,
    bubble_fragment: 0,
    sky_fragment: 0,
    forest_voice: 0,
    branch: 0,
    wood: 0,
    axe: 0,
    magcoin: 0,
    old_text: 0,
  },
  activeAction: null,
  unlockedStories: [],
  storyProgress: {},
  unlockedLocations: ['wherever'],
  unlockedActions: ['explore'],
  tutorialDone: false,
  logSt1Done: false,
  logSt2Done: false,
  logSt3Done: false,
  logSt4Done: false,
  guideUnlocked: false,
  playerName: '',
  unlockedCompanions: [],
  activeCompanions: [],
  ELv: {},
  companionTraits: {},
  companionEquipment: {},
  titleRevealed: {},
  discoveredResources: ['fragment'],
  appearedStories: [],
  worldLv: 0,
  totalFragments: 0,
  LocationLv: {},
  actionCount: {},
  ActionLv: {},
  discoveryStep: 0,
  discoveryLatePick: null,
  toutoFacilityOrder: null,
  toutoLastFacilityLv: 0,
  companionTasks: {},
  lastCompanionTaskResult: null,
  encounterStreak: {},
};

const SAVE_KEY = 'fr_save_v1';

function saveToStorage(s) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let devMode = false;

function setDevMode(enabled) {
  devMode = enabled;
}

function isDevMode() {
  return devMode;
}

// リソースを追加し、初入手なら discoveredResources にも登録する
function _addToResources(resources, resourceId, amount) {
  resources[resourceId] = (resources[resourceId] ?? 0) + amount;
}

function _markDiscovered(resourceId) {
  if (state.discoveredResources.includes(resourceId)) return false;
  state = { ...state, discoveredResources: [...state.discoveredResources, resourceId] };
  return true;
}

// フラグメント累計を加算し、世界LVアップを判定して返す
// 戻り値: 新しいLv（上がらなかった場合は現在Lvと同じ）
function _addTotalFragments(amount) {
  const newTotal = state.totalFragments + amount;
  let newLv = state.worldLv;
  while (newLv < WORLD_LV_THRESHOLDS.length && newTotal >= WORLD_LV_THRESHOLDS[newLv]) {
    newLv++;
  }
  state = { ...state, totalFragments: newTotal, worldLv: newLv };
  return newLv;
}

// 行動の実行回数を加算し、ActionLvアップを判定する
function _addActionCount(actionId) {
  const newCount = (state.actionCount[actionId] ?? 0) + 1;
  let newLv = state.ActionLv[actionId] ?? 0;
  while (newLv < ACTION_LV_THRESHOLDS.length && newCount >= ACTION_LV_THRESHOLDS[newLv]) {
    newLv++;
  }
  state = {
    ...state,
    actionCount: { ...state.actionCount, [actionId]: newCount },
    ActionLv: { ...state.ActionLv, [actionId]: newLv },
  };
}

function addResources(resource, amount) {
  const newResources = { ...state.resources, [resource]: (state.resources[resource] ?? 0) + amount };
  state = { ...state, resources: newResources };
  _markDiscovered(resource);
  saveToStorage(state);
  notify();
}

function unlockAllStories() {
  const allIds = Object.keys(STORIES);
  const progress = { ...state.storyProgress };
  for (const id of allIds) {
    progress[id] = 999; // 全ページ解放
  }
  state = { ...state, appearedStories: [], unlockedStories: allIds, storyProgress: progress };
  saveToStorage(state);
  notify();
}

function lockAllStories() {
  state = { ...state, appearedStories: [], unlockedStories: [], storyProgress: {} };
  saveToStorage(state);
  notify();
}

function unlockLocation(locationId, actionIds = []) {
  const newLocations = state.unlockedLocations.includes(locationId)
    ? state.unlockedLocations
    : [...state.unlockedLocations, locationId];
  const newActions = [...state.unlockedActions];
  for (const id of actionIds) {
    if (!newActions.includes(id)) newActions.push(id);
  }
  state = { ...state, unlockedLocations: newLocations, unlockedActions: newActions };
  saveToStorage(state);
  notify();
}

function unlockAction(actionId) {
  if (state.unlockedActions.includes(actionId)) return;
  state = { ...state, unlockedActions: [...state.unlockedActions, actionId] };
  saveToStorage(state);
  notify();
}

function unlockGuide() {
  if (state.guideUnlocked) return;
  state = { ...state, guideUnlocked: true };
  saveToStorage(state);
  notify();
}

function setAutoRepeat(v) {
  state = { ...state, autoRepeat: !!v };
  saveToStorage(state);
  notify();
}

function unlockAllActions() {
  state = { ...state, unlockedLocations: Object.keys(LOCATIONS), unlockedActions: Object.keys(ACTIONS) };
  saveToStorage(state);
  notify();
}

function lockAllActions() {
  state = { ...state, unlockedLocations: ['wherever'], unlockedActions: ['explore'] };
  saveToStorage(state);
  notify();
}

let state = structuredClone(INITIAL_STATE);
let listeners = [];

function getState() {
  return state;
}

function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
  listeners.forEach(fn => fn(state));
}

let _timer = null;
let _randomRewardTimers = [];
let _savedCallbacks = { onRandomReward: null, onCompanionRandomReward: null };

// ── エンカウントシステム ──
// 行動(探索など)を中断なく連続で続けるほど遭遇確率が上がっていく汎用機構。
// actionIdごとにENCOUNTERSへ1エントリ追加するだけで他の場所にも流用できる。
// 遭遇すると行動は強制中断され、そのactionIdのストリークは0に戻る。
// 指定された同行者の異能が解放されていれば、確率で被害を回避できる
const ENCOUNTERS = {
  forest_explore: {
    enemyLabel: '亡者の群れ',
    base: 0.05,
    step: 0.07,
    cap: 0.6,
    evadeCompanion: 'rabi',
    evadeSkillId: 'combat_evade',
    evadeChance: 0.5,
  },
};

let _encounterTimer = null;

function _clearEncounterTimer() {
  clearTimeout(_encounterTimer);
  _encounterTimer = null;
}

function _encounterChance(actionId) {
  const cfg = ENCOUNTERS[actionId];
  if (!cfg) return 0;
  const streak = state.encounterStreak?.[actionId] ?? 0;
  return Math.min(cfg.base + streak * cfg.step, cfg.cap);
}

// 指定エンカウントの回避同行者が、いま回避可能な状態(同行中・異能解放済み)かどうか
function _canEvadeEncounter(cfg) {
  if (!cfg?.evadeCompanion) return false;
  if (!state.activeCompanions.includes(cfg.evadeCompanion)) return false;
  const skill = (COMPANION_SKILLS[cfg.evadeCompanion] ?? []).find(s => s.id === cfg.evadeSkillId);
  if (!skill) return false;
  return (state.ELv[cfg.evadeCompanion] ?? 0) >= skill.lv;
}

// 行動開始時に1回だけ判定。当たれば、durationの30%〜80%地点でエンカウントが発生するよう予約する
function _scheduleEncounterIfNeeded(actionId, duration, onEncounter) {
  if (!ENCOUNTERS[actionId]) return;
  // 1回目の探索では発生させない。オート(autoRepeat)で連続している2回目以降のみ抽選する。
  // (オートが解放されていない序盤に突然発生するとノイズになるため。streakは中断なく完了するたび+1)
  if (!state.autoRepeat) return;
  if ((state.encounterStreak?.[actionId] ?? 0) < 1) return;
  if (Math.random() >= _encounterChance(actionId)) return;
  const delay = Math.floor(duration * 0.3 + Math.random() * duration * 0.5);
  const encounterAt = Date.now() + delay;
  state = { ...state, activeAction: { ...state.activeAction, encounterAt } };
  saveToStorage(state);
  _encounterTimer = setTimeout(() => _triggerEncounter(actionId, onEncounter), delay);
}

// エンカウント発生。行動を強制終了し、そのactionIdのストリークをリセットして結果をコールバックで返す
function _triggerEncounter(actionId, onEncounter) {
  if (!state.activeAction) return;
  clearTimeout(_timer);
  clearRandomRewardTimers();
  _clearEncounterTimer();
  const cfg = ENCOUNTERS[actionId] ?? {};
  const canEvade = _canEvadeEncounter(cfg);
  const evaded = canEvade && Math.random() < (cfg.evadeChance ?? 0.5);
  state = {
    ...state,
    activeAction: null,
    encounterStreak: { ...state.encounterStreak, [actionId]: 0 },
  };
  saveToStorage(state);
  notify();
  onEncounter?.({ actionId, evaded, canEvade, enemyLabel: cfg.enemyLabel, companionId: cfg.evadeCompanion });
}

// ランダム報酬1件を、minMs〜maxMsの間隔で繰り返しactiveAction中に付与し続けるループを仕掛ける
// applyExtra: 報酬付与時に追加で行う処理(worldLv加算など)。onReward: 付与後の通知コールバック
function _scheduleRandomRewardLoop(reward, onReward, applyExtra) {
  const { minMs, maxMs } = reward;

  function schedule() {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const t = setTimeout(() => {
      if (!state.activeAction) return;
      const amount = Math.floor(Math.random() * (reward.maxAmount - reward.minAmount + 1)) + reward.minAmount;
      const newResources = { ...state.resources };
      newResources[reward.resource] = (newResources[reward.resource] ?? 0) + amount;
      _markDiscovered(reward.resource);
      state = { ...state, resources: newResources };
      applyExtra?.(amount);
      saveToStorage(state);
      notify();
      onReward?.(amount);
      schedule();
    }, delay);
    _randomRewardTimers.push(t);
  }

  schedule();
}

function scheduleRandomRewards(action, onReward) {
  const allRandom = [...resolveTable(action.rewardTableRandom, action.locationId, action.id), ...(action.randomRewards ?? [])];
  for (const reward of allRandom) {
    _scheduleRandomRewardLoop(
      reward,
      (amount) => onReward?.({ resource: reward.resource, amount }),
      (amount) => { if (reward.resource === 'fragment') _addTotalFragments(amount); }
    );
  }
}

function clearRandomRewardTimers() {
  _randomRewardTimers.forEach(t => clearTimeout(t));
  _randomRewardTimers = [];
}

function scheduleCompanionRandomRewards(onReward) {
  for (const companionId of state.activeCompanions) {
    const rewards = COMPANION_RANDOM_REWARDS[companionId];
    if (!rewards) continue;
    for (const reward of rewards) {
      _scheduleRandomRewardLoop(
        reward,
        (amount) => onReward?.({ companionId, resource: reward.resource, amount })
      );
    }
  }
}

function startAction(actionId, { onRandomReward, onCompanionRandomReward, onComplete, onEncounter } = {}) {
  if (state.activeAction) return { ok: false, reason: 'already_active' };
  _savedCallbacks = { onRandomReward, onCompanionRandomReward, onComplete, onEncounter };
  const action = ACTIONS[actionId];
  if (!action) return { ok: false, reason: 'unknown_action' };

  const now = Date.now();
  const duration = devMode ? 1000 : action.duration;
  state = {
    ...state,
    activeAction: { actionId, startedAt: now, endsAt: now + duration },
  };
  saveToStorage(state);
  notify();

  _timer = setTimeout(() => completeAction(actionId, _savedCallbacks.onComplete), duration);
  scheduleRandomRewards(action, onRandomReward);
  scheduleCompanionRandomRewards(onCompanionRandomReward);
  _scheduleEncounterIfNeeded(actionId, duration, onEncounter);
  return { ok: true };
}

function cancelAction() {
  if (!state.activeAction) return { ok: false, reason: 'no_active_action' };
  clearTimeout(_timer);
  clearRandomRewardTimers();
  _clearEncounterTimer();
  state = { ...state, activeAction: null };
  saveToStorage(state);
  notify();
  return { ok: true };
}

function pauseAction() {
  if (!state.activeAction || state.activeAction.pausedAt) return;
  clearTimeout(_timer);
  clearRandomRewardTimers();
  _clearEncounterTimer();
  state = { ...state, activeAction: { ...state.activeAction, pausedAt: Date.now() } };
  saveToStorage(state);
  notify();
}

function resumeAction() {
  if (!state.activeAction || !state.activeAction.pausedAt) return;
  const pauseDuration = Date.now() - state.activeAction.pausedAt;
  const newEndsAt = state.activeAction.endsAt + pauseDuration;
  const newEncounterAt = state.activeAction.encounterAt != null ? state.activeAction.encounterAt + pauseDuration : undefined;
  const actionId = state.activeAction.actionId;
  state = {
    ...state,
    activeAction: { ...state.activeAction, endsAt: newEndsAt, encounterAt: newEncounterAt, pausedAt: undefined },
  };
  saveToStorage(state);
  notify();
  const remaining = newEndsAt - Date.now();
  if (remaining <= 0) {
    completeAction(actionId, _savedCallbacks.onComplete);
  } else {
    _timer = setTimeout(() => completeAction(actionId, _savedCallbacks.onComplete), remaining);
    const action = ACTIONS[actionId];
    scheduleRandomRewards(action, _savedCallbacks.onRandomReward);
    scheduleCompanionRandomRewards(_savedCallbacks.onCompanionRandomReward);
    if (newEncounterAt != null) {
      const encRemaining = newEncounterAt - Date.now();
      if (encRemaining <= 0) {
        _triggerEncounter(actionId, _savedCallbacks.onEncounter);
      } else {
        _encounterTimer = setTimeout(() => _triggerEncounter(actionId, _savedCallbacks.onEncounter), encRemaining);
      }
    }
  }
}

function completeAction(actionId, onComplete) {
  const action = ACTIONS[actionId];
  if (!action) return;

  const newResources = { ...state.resources };
  const multiplier = 1 + state.activeCompanions.length;
  const allRewards = [...resolveTable(action.rewardTable, action.locationId, action.id), ...(action.rewards ?? [])];
  let fragmentsGained = 0;
  for (const reward of allRewards) {
    const gained = reward.amount * multiplier;
    newResources[reward.resource] = (newResources[reward.resource] ?? 0) + gained;
    if (reward.resource === 'fragment') fragmentsGained += gained;
  }

  // 同行者固有報酬
  const companionRewardsList = [];
  for (const companionId of state.activeCompanions) {
    const rewards = COMPANION_REWARDS[companionId];
    if (!rewards) continue;
    const level = state.ELv[companionId] ?? 0;
    const isEquipped = state.companionEquipment?.[companionId] === COMPANION_RELICS[companionId];
    const bonus = level + (isEquipped ? EQUIP_BONUS : 0);
    for (const reward of rewards) {
      const total = reward.amount + bonus;
      newResources[reward.resource] = (newResources[reward.resource] ?? 0) + total;
      companionRewardsList.push({ companionId, resource: reward.resource, amount: total });
    }
  }

  // レアドロップ判定（一度だけ・加入トリガー）
  let rareDrop = null;
  if (action.rareDrop) {
    const { resource, companionId, chance } = action.rareDrop;
    const alreadyHas = (state.resources[resource] ?? 0) > 0;
    if (!alreadyHas && Math.random() < (chance ?? 0.05)) {
      newResources[resource] = (newResources[resource] ?? 0) + 1;
      rareDrop = { resource, companionId };
    }
  }

  // 発見判定
  const newLocations = [...state.unlockedLocations];
  const newActions = [...state.unlockedActions];
  const discovered = [];

  for (const disc of (action.discoveries ?? [])) {
    if (Math.random() > disc.chance) continue;
    if (disc.type === 'location' && !newLocations.includes(disc.id)) {
      newLocations.push(disc.id);
      discovered.push({ type: 'location', id: disc.id });
    } else if (disc.type === 'action' && !newActions.includes(disc.id)) {
      newActions.push(disc.id);
      discovered.push({ type: 'action', id: disc.id });
    }
  }

  // 新規入手リソースを discoveredResources に登録
  const newDiscovered = [...state.discoveredResources];
  for (const key of Object.keys(newResources)) {
    if (!newDiscovered.includes(key) && (newResources[key] ?? 0) > (state.resources[key] ?? 0)) {
      newDiscovered.push(key);
    }
  }

  clearRandomRewardTimers();
  state = {
    ...state,
    resources: newResources,
    activeAction: null,
    unlockedLocations: newLocations,
    unlockedActions: newActions,
    discoveredResources: newDiscovered,
  };
  const prevLv = state.worldLv;
  if (fragmentsGained > 0) _addTotalFragments(fragmentsGained);
  const lvedUp = state.worldLv > prevLv;
  _addActionCount(actionId);
  _growCompanionTraits(actionId);

  // エンカウント対象の行動: 中断なく完了するたびにストリークを+1(遭遇確率の上昇に使う)
  if (ENCOUNTERS[actionId]) {
    state = {
      ...state,
      encounterStreak: { ...state.encounterStreak, [actionId]: (state.encounterStreak?.[actionId] ?? 0) + 1 },
    };
  }

  // 塔都の探索: 探索ごとに抽選で施設を発見する。見つからないままActionLvが上がるほど確率が上昇し、
  // 1つ見つかると確率はベースに戻る（ランダムな順）
  if (actionId === 'touto_explore') {
    let order = state.toutoFacilityOrder;
    if (!order) {
      order = [...TOUTO_FACILITIES];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      state = { ...state, toutoFacilityOrder: order };
    }
    const next = order.find(id => !state.unlockedActions.includes(id));
    if (next) {
      const actionLv = state.ActionLv['touto_explore'] ?? 0;
      const diff = actionLv - (state.toutoLastFacilityLv ?? 0);
      const chance = Math.min(0.05 + diff * 0.1, 0.5);
      if (Math.random() < chance) {
        state = {
          ...state,
          unlockedActions: [...state.unlockedActions, next],
          toutoLastFacilityLv: actionLv,
        };
        discovered.push({ type: 'action', id: next });
      }
    }
  }

  // 同行者の解放(unlockCompanion)は加入イベント(ui.js側の演出)完了後に行う。ここではアイテム入手のみ。
  saveToStorage(state);
  notify();
  const result = { discovered, allRewards, companionRewards: companionRewardsList, worldLvUp: lvedUp ? state.worldLv : null, rareDrop };
  onComplete?.(result);
  return result;
}

function getProgress() {
  if (!state.activeAction) return null;
  const { startedAt, endsAt, pausedAt } = state.activeAction;
  const now = pausedAt ?? Date.now();
  const elapsed = now - startedAt;
  const total = endsAt - startedAt;
  return Math.min(elapsed / total, 1);
}

// 物語を解放する(1ページ目が読めるようになる)
// コスト消費なしで物語をリストに出現させる（チュートリアル用）
function forceAppearStory(storyId) {
  if (state.appearedStories.includes(storyId) || state.unlockedStories.includes(storyId)) return;
  state = { ...state, appearedStories: [...state.appearedStories, storyId] };
  saveToStorage(state);
  notify();
}

function unlockStory(storyId) {
  const story = STORIES[storyId];
  if (!story) return { ok: false, reason: 'unknown_story' };
  if (state.unlockedStories.includes(storyId)) return { ok: false, reason: 'already_unlocked' };

  const newResources = { ...state.resources };
  for (const cost of story.unlockCost) {
    if ((newResources[cost.resource] ?? 0) < cost.amount) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    newResources[cost.resource] -= cost.amount;
  }

  // appeared状態から解放状態に移行
  const newAppeared = state.appearedStories.filter(id => id !== storyId);
  state = {
    ...state,
    resources: newResources,
    appearedStories: newAppeared,
    unlockedStories: [...state.unlockedStories, storyId],
    storyProgress: { ...state.storyProgress, [storyId]: 1 },
  };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// 次のページを解放する
function unlockNextPage(storyId) {
  const story = STORIES[storyId];
  if (!story) return { ok: false, reason: 'unknown_story' };
  if (!state.unlockedStories.includes(storyId)) return { ok: false, reason: 'story_locked' };

  const current = state.storyProgress[storyId] ?? 0;
  const cost = getCostForParagraph(story, current);
  const newResources = { ...state.resources };
  for (const c of cost) {
    if ((newResources[c.resource] ?? 0) < c.amount) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    newResources[c.resource] -= c.amount;
  }
  state = {
    ...state,
    resources: newResources,
    storyProgress: { ...state.storyProgress, [storyId]: current + 1 },
  };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// 起動時にセーブデータを復元し、進行中のアクションがあれば再スケジュール
function init() {
  const saved = loadFromStorage();
  if (!saved) return;

  state = {
    ...INITIAL_STATE,
    ...saved,
    resources: { ...INITIAL_STATE.resources, ...saved.resources },
    storyProgress: { ...INITIAL_STATE.storyProgress, ...saved.storyProgress },
    unlockedLocations: saved.unlockedLocations ?? INITIAL_STATE.unlockedLocations,
    unlockedActions: saved.unlockedActions ?? INITIAL_STATE.unlockedActions,
    activeCompanions: saved.activeCompanions ?? INITIAL_STATE.activeCompanions,
    ELv:  saved.ELv  ?? INITIAL_STATE.ELv,
    companionTraits: saved.companionTraits ?? INITIAL_STATE.companionTraits,
    companionEquipment: saved.companionEquipment ?? INITIAL_STATE.companionEquipment,
    titleRevealed: saved.titleRevealed ?? INITIAL_STATE.titleRevealed,
    discoveredResources: saved.discoveredResources ?? INITIAL_STATE.discoveredResources,
    appearedStories: saved.appearedStories ?? INITIAL_STATE.appearedStories,
    logSt2Done: saved.logSt2Done ?? INITIAL_STATE.logSt2Done,
    logSt3Done: saved.logSt3Done ?? INITIAL_STATE.logSt3Done,
    logSt4Done: saved.logSt4Done ?? INITIAL_STATE.logSt4Done,
    guideUnlocked: saved.guideUnlocked ?? INITIAL_STATE.guideUnlocked,
    autoRepeat: saved.autoRepeat ?? INITIAL_STATE.autoRepeat,
    worldLv: saved.worldLv ?? INITIAL_STATE.worldLv,
    totalFragments: saved.totalFragments ?? INITIAL_STATE.totalFragments,
    LocationLv: saved.LocationLv ?? INITIAL_STATE.LocationLv,
    actionCount: saved.actionCount ?? INITIAL_STATE.actionCount,
    ActionLv: saved.ActionLv ?? INITIAL_STATE.ActionLv,
    discoveryStep: saved.discoveryStep ?? INITIAL_STATE.discoveryStep,
    discoveryLatePick: saved.discoveryLatePick ?? INITIAL_STATE.discoveryLatePick,
    toutoFacilityOrder: saved.toutoFacilityOrder ?? INITIAL_STATE.toutoFacilityOrder,
    toutoLastFacilityLv: saved.toutoLastFacilityLv ?? INITIAL_STATE.toutoLastFacilityLv,
    companionTasks: saved.companionTasks ?? INITIAL_STATE.companionTasks,
    lastCompanionTaskResult: saved.lastCompanionTaskResult ?? INITIAL_STATE.lastCompanionTaskResult,
    encounterStreak: saved.encounterStreak ?? INITIAL_STATE.encounterStreak,
  };

  if (state.activeAction) {
    const remaining = state.activeAction.endsAt - Date.now();
    if (remaining > 0) {
      _timer = setTimeout(() => completeAction(state.activeAction.actionId), remaining);
    } else {
      completeAction(state.activeAction.actionId);
    }
  }

  for (const [companionId, task] of Object.entries(state.companionTasks ?? {})) {
    const remaining = task.endsAt - Date.now();
    if (remaining > 0) {
      _scheduleCompanionTask(companionId, remaining);
    } else {
      _completeCompanionTask(companionId);
    }
  }
}

init();

function setTutorialDone() {
  state = { ...state, tutorialDone: true };
  saveToStorage(state);
}

function setLogSt1Done() {
  state = { ...state, logSt1Done: true };
  saveToStorage(state);
}

function setLogSt2Done() {
  state = { ...state, logSt2Done: true };
  saveToStorage(state);
}

function setLogSt3Done() {
  state = { ...state, logSt3Done: true };
  saveToStorage(state);
}

function setLogSt4Done() {
  state = { ...state, logSt4Done: true };
  saveToStorage(state);
}

function setPlayerName(name) {
  state = { ...state, playerName: name };
  saveToStorage(state);
  notify();
}

function unlockCompanion(id) {
  if (state.unlockedCompanions.includes(id)) return;
  state = { ...state, unlockedCompanions: [...state.unlockedCompanions, id] };
  saveToStorage(state);
  notify();
}

function setCompanionLevel(companionId, level) {
  state = { ...state, ELv: { ...state.ELv, [companionId]: level } };
  saveToStorage(state);
  notify();
}

function setCompanionEquipment(companionId, itemId) {
  state = { ...state, companionEquipment: { ...state.companionEquipment, [companionId]: itemId } };
  saveToStorage(state);
  notify();
}

function revealStoryTitle(storyId) {
  if (state.titleRevealed[storyId]) return;
  state = { ...state, titleRevealed: { ...state.titleRevealed, [storyId]: true } };
  saveToStorage(state);
  notify();
}

// LocationLvの上限。worldLvが天井になる（worldLv0なら0、最大はLOCATION_LV_MAX=5）
function getLocationLvCap() {
  return Math.min(LOCATION_LV_MAX, state.worldLv);
}

function levelUpLocation(locationId, prepaid = 0, { silent = false } = {}) {
  const currentLv = state.LocationLv?.[locationId] ?? 0;
  if (currentLv >= LOCATION_LV_MAX) return { ok: false, reason: 'max_level' };
  if (currentLv >= getLocationLvCap()) return { ok: false, reason: 'world_lv_cap' };
  const cost = LOCATION_LV_COSTS[currentLv];
  const remaining = cost - prepaid;
  if ((state.resources.fragment ?? 0) < remaining) return { ok: false, reason: 'insufficient_resources' };
  const newResources = { ...state.resources, fragment: state.resources.fragment - remaining };
  const newLv = currentLv + 1;
  state = { ...state, resources: newResources, LocationLv: { ...state.LocationLv, [locationId]: newLv } };
  saveToStorage(state);
  if (!silent) notify();
  return { ok: true, newLv };
}

function setActiveCompanion(id, active) {
  if (active && state.companionTasks?.[id]) return { ok: false };
  const current = state.activeCompanions;
  const next = active
    ? (current.includes(id) ? current : [...current, id])
    : current.filter(c => c !== id);
  state = { ...state, activeCompanions: next };
  saveToStorage(state);
  notify();
  return { ok: true };
}

// ログストーリーnへジャンプするための前提状態を整える(開発用)
// nを直接再生するための、ここまでに本来達成されているはずのフラグ・進捗をまとめて反映する
function jumpToLogSt(n) {
  const prologueTotal = STORIES['prologue']?.pageCount ?? 0;

  const next = {
    ...state,
    tutorialDone: true,
    logSt1Done: false,
    logSt2Done: false,
    logSt3Done: false,
    logSt4Done: false,
    guideUnlocked: false,
    unlockedStories: [...state.unlockedStories],
    storyProgress: { ...state.storyProgress },
    unlockedCompanions: [...state.unlockedCompanions],
    activeCompanions: [...state.activeCompanions],
    unlockedLocations: [...state.unlockedLocations],
    unlockedActions: [...state.unlockedActions],
  };

  if (!next.unlockedStories.includes('prologue')) next.unlockedStories.push('prologue');
  next.storyProgress['prologue'] = prologueTotal;

  if (n >= 2) {
    next.logSt1Done = true;
    if (!next.unlockedCompanions.includes('yuya')) next.unlockedCompanions.push('yuya');
    if (!next.activeCompanions.includes('yuya')) next.activeCompanions.push('yuya');
  }
  if (n >= 3) {
    next.logSt2Done = true;
    if (!next.unlockedStories.includes('yuya_1')) next.unlockedStories.push('yuya_1');
    next.storyProgress['yuya_1'] = Math.max(next.storyProgress['yuya_1'] ?? 0, 3);
  }
  if (n >= 4) {
    next.logSt3Done = true;
    if (!next.unlockedLocations.includes('forest')) next.unlockedLocations.push('forest');
    if (!next.unlockedActions.includes('forest_explore')) next.unlockedActions.push('forest_explore');
    next.storyProgress['yuya_1'] = Math.max(next.storyProgress['yuya_1'] ?? 0, 13);
  }

  state = next;
  saveToStorage(state);
  notify();
}

function resetTutorial() {
  state = { ...state, tutorialDone: false, logSt1Done: false, logSt2Done: false, logSt3Done: false, logSt4Done: false, guideUnlocked: false, playerName: '', unlockedCompanions: [], activeCompanions: [] };
  saveToStorage(state);
  notify();
}

export { LOCATIONS, ACTIONS, FACILITIES, getShopItems, buyShopItem, STORIES, COMPANION_REWARDS, COMPANION_RANDOM_REWARDS, COMPANION_RELICS, EQUIP_BONUS, WORLD_LV_THRESHOLDS, LOCATION_LV_COSTS, LOCATION_LV_MAX, ACTION_LV_THRESHOLDS, DISCOVERY_LABELS, DISCOVERY_STEP_LV, TOUTO_FACILITIES, ELV_MAX, ELV_COSTS, COMPANION_SKILLS, COMPANION_TRAITS, levelUpCompanion, startFragmentConvert, getCompanionTaskProgress, FRAGMENT_CONVERT_MS_PER_UNIT, UNIQUE_FRAGMENTS, getPendingDiscovery, resolveDiscovery, getLocationLvCap, levelUpLocation, getState, forceAppearStory, subscribe, notify, startAction, cancelAction, pauseAction, resumeAction, getProgress, unlockStory, unlockNextPage, setDevMode, isDevMode, addResources, unlockAllStories, lockAllStories, unlockLocation, unlockAction, unlockAllActions, lockAllActions, unlockGuide, setAutoRepeat, setTutorialDone, setLogSt1Done, setLogSt2Done, setLogSt3Done, setLogSt4Done, setPlayerName, unlockCompanion, setCompanionLevel, setCompanionEquipment, revealStoryTitle, setActiveCompanion, resetTutorial, jumpToLogSt };
