// resource.js — リソースの表示定義と整形

const RESOURCES = {
  fragment:        { label: 'フラグメント',       color: '#7ec8d8', category: 'fragment', unit: '片' },
  blue_fragment:   { label: '青のフラグメント',   color: '#89b4fa', category: 'fragment', unit: '片' },
  red_fragment:    { label: '赤のフラグメント',   color: '#f38ba8', category: 'fragment', unit: '片' },
  clear_fragment:  { label: '無色のフラグメント', color: '#cdd6f4', category: 'fragment', unit: '片' },
  bubble_fragment: { label: '泡のフラグメント',   color: '#cba6f7', category: 'fragment', unit: '片' },
  sky_fragment:    { label: '空のフラグメント',   color: '#89dceb', category: 'fragment', unit: '片' },
  herb:            { label: '薬草', color: '#a6e3a1', unit: '束' },
  forest_voice:    { label: '木々の声', color: '#a8d8a8', unit: 'かけら' },
  branch:          { label: '木の枝', color: '#c8a97e', unit: '本', acquireVerb: '拾った' },
  wood:            { label: '木材', color: '#a47d4e', unit: '本', acquireVerb: '手に入れた' },
  axe:             { label: '鉄の斧', color: '#9aa0a6', category: 'tool', unit: '振' },
  magcoin:         {
    label: 'マグコイン',
    color: '#e6c200',
    unit: '枚',
    acquireVerbByAction: { nostalgia_flower_help: 'もらった' },
  },
  nostalgia_rumor:     { label: 'ノスタルジアの噂話', color: '#c6a7d8', unit: 'つ', acquireVerb: '耳にした' },
  old_text:        { label: '古文書', color: '#bba16a', unit: '冊' },
  survey_wherever: { label: '再生された世界の調査記録', color: '#9eb7c4', unit: '部', category: 'survey', highlight: true },
  survey_forest:   { label: 'はじまりの森の調査記録', color: '#8fb59a', unit: '部', category: 'survey', highlight: true },
  survey_kyusha:   { label: '黄昏の旧校舎の調査記録', color: '#c2a68d', unit: '部', category: 'survey', highlight: true },
  survey_renril:   { label: '翼竜の都の調査記録', color: '#8fb5c8', unit: '部', category: 'survey', highlight: true },
  survey_mephisto: { label: '魔界王都の調査記録', color: '#ad91c4', unit: '部', category: 'survey', highlight: true },
  survey_knights:  { label: '王立騎士団本部の調査記録', color: '#aeb4bd', unit: '部', category: 'survey', highlight: true },
  survey_nostalgia:    { label: 'ノスタルジアの調査記録', color: '#c4b68f', unit: '部', category: 'survey', highlight: true },
  dream_fragment:  { label: '夢の欠片', color: '#b8a6e8', unit: '片' },
  mondo_leaf:      { label: 'モンドの葉', color: '#9bc48a' },
  rescure:         { label: 'レスキュア', color: '#e8e8dc' },
  berylune:        { label: 'ベリルーン', color: '#83cfd0' },
  iria:            { label: 'イリア', color: '#9d8fe0' },
  andorsia:        { label: 'アンドルシア', color: '#e6ecf2' },
  orsis:           { label: 'オルシス', color: '#cfe9f0' },
  rakusekisou:        { label: '落赤花', color: '#aeb6b8' },
  koganegusa:      { label: 'こがね草', color: '#e0a832' },
  sennengusa:      { label: '千年草', color: '#d88a6a' },
  dark_lily:       { label: 'ダークリリー', color: '#8e78a8' },
  milkys:          { label: 'ミルキース', color: '#cbbede' },
  crystal_lily:    { label: 'クリスタルリリー', color: '#f0c8d8' },
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

const RESOURCE_CATEGORY_ORDER = ['fragment', 'element', 'material', 'tool', 'relic'];
const RESOURCE_CATEGORY_LABELS = {
  fragment: 'フラグメント',
  element:'エレメント',
  material: '素材',
  tool: '道具',
  relic: 'レリック',
};

function resLabel(resource) { return RESOURCES[resource]?.label ?? resource; }
function resColor(resource) { return RESOURCES[resource]?.color ?? 'var(--text)'; }
function resCategory(resource) { return RESOURCES[resource]?.category ?? 'material'; }
function resUnit(resource) { return RESOURCES[resource]?.unit ?? ''; }

function resourceSpan(resource, text) {
  return `<span style="color:${resColor(resource)};font-weight:bold">${text}</span>`;
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
