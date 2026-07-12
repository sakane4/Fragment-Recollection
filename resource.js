// resource.js — リソースの表示定義と整形

const RESOURCES = {
  fragment:        { label: 'フラグメント',       color: '#7ec8d8', category: 'fragment', unit: '片' },
  blue_fragment:   { label: '月光のフラグメント', color: '#B2C8D4', category: 'fragment', unit: '片' },
  red_fragment:    { label: '月影のフラグメント', color: '#5f6a9c', category: 'fragment', unit: '片' },
  clear_fragment:  { label: '無色のフラグメント', color: '#cdd6f4', category: 'fragment', unit: '片' },
  bubble_fragment: { label: '泡のフラグメント',   color: '#cba6f7', category: 'fragment', unit: '片' },
  sky_fragment:    { label: '空のフラグメント',   color: '#89dceb', category: 'fragment', unit: '片' },
  crescent_fragment: { label: '三日月のフラグメント', color: '#f6d98b', category: 'fragment', unit: '片' },
  herb:            { label: '薬草', color: '#a6e3a1', unit: '束' },
  forest_voice:    { label: '木々の声', color: '#a8d8a8', category: 'element', unit: 'かけら' },
  branch:          { label: '木の枝', color: '#c8a97e', unit: '本', acquireVerb: '拾った' },
  wood:            { label: '木材', color: '#a47d4e', unit: '本', acquireVerb: '手に入れた' },
  axe:             { label: '鉄の斧', color: '#9aa0a6', category: 'tool', unit: '振' },
  magcoin:         {
    label: 'マグコイン',
    color: '#e6c200',
    unit: '枚',
    acquireVerbByAction: { nostalgia_flower_help: 'もらった' },
  },
  nostalgia_rumor:     { label: 'ノスタルジアの噂話', color: '#c6a7d8', category: 'rumor', unit: 'つ', acquireVerb: '耳にした' },
  observatory_rumor:   { label: '星空研究所の噂', color: '#8fcfe3', category: 'rumor', unit: 'つ', acquireVerb: '耳にした', highlight: true },
  star_constellation_magic: {
    label: '星と星座の魔法',
    color: '#9fc9ef',
    category: 'information',
    highlight: true,
    info: {
      title: '星と星座の魔法',
      body: [
        '星の並びに名前を与え、意味を結び、魔法として扱うための古い知識。',
        '星座はただの図形ではなく、記憶や願いの輪郭を夜空に固定するためのしるしでもある。',
      ],
    },
  },
  old_text:        { label: '古文書', color: '#bba16a', unit: '冊' },
  survey_wherever: { label: '再生された世界の調査記録', color: '#9eb7c4', unit: '部', category: 'survey', highlight: true },
  survey_forest:   { label: 'はじまりの森の調査記録', color: '#8fb59a', unit: '部', category: 'survey', highlight: true },
  survey_kyusha:   { label: '黄昏の旧校舎の調査記録', color: '#c2a68d', unit: '部', category: 'survey', highlight: true },
  survey_renril:   { label: '翼竜の都の調査記録', color: '#8fb5c8', unit: '部', category: 'survey', highlight: true },
  survey_mephisto: { label: '魔界王都の調査記録', color: '#ad91c4', unit: '部', category: 'survey', highlight: true },
  survey_knights:  { label: '王立騎士団本部の調査記録', color: '#aeb4bd', unit: '部', category: 'survey', highlight: true },
  survey_nostalgia:    { label: 'ノスタルジアの調査記録', color: '#c4b68f', unit: '部', category: 'survey', highlight: true },
  dream_fragment:  { label: '夢の欠片', color: '#b8a6e8', category: 'element', unit: '片' },
  mondo_leaf:      { label: 'モンド', color: '#9bc48a', category: 'flower' },
  rescure:         { label: 'レスキュア', color: '#e8e8dc', category: 'flower' },
  berylune:        { label: 'ベリルーン', color: '#83cfd0', category: 'flower' },
  iria:            { label: 'イリア', color: '#9d8fe0', category: 'flower' },
  andorsia:        { label: 'アンドルシア', color: '#e6ecf2', category: 'flower' },
  orsis:           { label: 'オルシス', color: '#cfe9f0', category: 'flower' },
  rakusekisou:        { label: '落赤花', color: '#aeb6b8', category: 'flower' },
  koganegusa:      { label: 'こがね草', color: '#e0a832', category: 'flower' },
  sennengusa:      { label: '千年草', color: '#d88a6a', category: 'flower' },
  dark_lily:       { label: 'ダークリリー', color: '#8e78a8', category: 'flower' },
  milkys:          { label: 'ミルキース', color: '#cbbede', category: 'flower' },
  crystal_lily:    { label: 'クリスタルリリー', color: '#f0c8d8', category: 'flower' },
  orsis_seed:      { label: 'オルシスの種', color: '#cfe9f0', acquireVerb: '見つけた' },
  old_paint:          { label: '古びた絵具', color: '#e0a96d' },
  torn_page:          { label: '破れたページ', color: '#d8cba0' },
  broken_piano_sound: { label: '少し狂ったピアノの音', color: '#b0a8c8' ,category:'element'},
  art_room_key:       { label: '旧美術室の鍵', color: '#d6336c', category: 'relic' },
  wyvern_claw:        { label: '翼竜の爪', color: '#c0c4cc' },
  wyvern_scale:       { label: '翼竜の鱗', color: '#7fb0c8' },
  melon_keychain:     { label: 'もっふりん', color: '#d6336c', category: 'relic' },
  spellbook_page:     { label: '魔術書のページ', color: '#b89cd8' },
  magic_circle_shard: { label: '魔法陣の欠片', color: '#a98cd8' },
  astard_fragment:    { label: 'アスタード文字の破片', color: '#9a8cc8' },
  sky_compass:        { label: '天空の羅針盤', color: '#d6336c', category: 'relic' },
  subjugation_report: { label: '討伐報告書', color: '#d8cba0' },
  old_armband:        { label: '古びた腕章', color: '#b0926a' },
  chipped_insignia:   { label: '欠けた記章', color: '#c0c4cc' },
  polished_sheath:    { label: '美しい細身の剣', color: '#d6336c', category: 'relic' },
  guide_earring:      { label: '導きのイヤリング', color: '#d6336c', category: 'relic' },
  kinomi:           { label: '木の実', color: '#85652c', unit: '個', acquireVerb: '拾った' },
};

const RESOURCE_CATEGORY_ORDER = ['fragment', 'element', 'flower', 'material', 'tool', 'rumor', 'survey', 'relic', 'information'];
const RESOURCE_CATEGORY_LABELS = {
  fragment: 'フラグメント',
  element:'エレメント',
  flower: '花',
  material: '素材',
  tool: '道具',
  rumor: '噂話',
  survey: '調査記録',
  relic: 'レリック',
  information: '情報',
};

function resLabel(resource) { return RESOURCES[resource]?.label ?? resource; }
function resColor(resource) { return RESOURCES[resource]?.color ?? 'var(--text)'; }
function resCategory(resource) { return RESOURCES[resource]?.category ?? 'material'; }
function resUnit(resource) { return RESOURCES[resource]?.unit ?? ''; }

function resourceSpan(resource, text) {
  return `<span class="resource-inline-name" style="color:${resColor(resource)};font-weight:bold">${text}</span>`;
}

function resourceLog(resource, amount, actionId = null) {
  const definition = RESOURCES[resource];
  const verb = definition?.acquireVerbByAction?.[actionId]
    ?? definition?.acquireVerb
    ?? '見つけた';
  return `${resourceSpan(resource, resLabel(resource))}を${amount}${resUnit(resource)}${verb}`;
}

function maskedResLabel(resource, state) {
  if (state && !(state.discoveredResources ?? []).includes(resource)) return '???';
  return resLabel(resource);
}

function formatCostLabel(costs, state) {
  return costs.map(c => `${maskedResLabel(c.resource, state)} ×${c.amount}`).join(', ');
}

export {
  RESOURCES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CATEGORY_LABELS,
  resLabel,
  resColor,
  resCategory,
  resUnit,
  resourceSpan,
  resourceLog,
  maskedResLabel,
  formatCostLabel,
};
