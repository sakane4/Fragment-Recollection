// flowers.js — 象徴花の正典データ
//
// 各キャラクターには誕生日の誕生花に由来する「象徴花」が1種ずつ対応する(双子は1種を共有)。
// idはresource.jsのリソースIDと同一(花そのものが所持アイテム＝プレゼントになる)。
// companions: 現在ゲームに登場している同行者ID。未登場キャラの分は加入時に追記する。
// desc: 花屋の商品説明・花の図鑑の頁で共用するフレーバー。
// 並び順は誕生日順(1月→12月)。図鑑・贈り物リストもこの順で表示する。

export const FLOWERS = [
  { id: 'rescure',      label: 'レスキュア',       birthday: '1月16日',  realFlower: 'パンジー',
    companions: ['kaoru'],          desc: '白く可憐な花' },
  { id: 'iria',         label: 'イリア',           birthday: '2月14日',  realFlower: 'シネラリア',
    companions: [],                 desc: '寒い季節にも鮮やかに咲く花' },
  { id: 'andorsia',     label: 'アンドルシア',     birthday: '3月15日',  realFlower: 'ホワイトレースフラワー',
    companions: [],                 desc: 'レース編みのように繊細な白い花' },
  { id: 'orsis',        label: 'オルシス',         birthday: '4月4日',   realFlower: '馬酔木',
    companions: ['yukika'],         desc: '小さな鈴を連ねたように咲く花' },
  { id: 'hairenka',     label: '灰冷花',           birthday: '5月24日',  realFlower: 'ソリダゴ',
    companions: [],                 desc: '灰白色の小花が穂のように集まって咲く花' },
  { id: 'koganegusa',   label: 'こがね草',         birthday: '6月5日',   realFlower: 'マリーゴールド',
    companions: [],                 desc: '黄金色に燃えるように咲く花' },
  { id: 'berylune',     label: 'ベリルーン',       birthday: '7月6日',   realFlower: 'ヒマワリ',
    companions: ['shizuku'],        desc: '涼しげな香りを漂わせる花' },
  { id: 'sennengusa',   label: '千年草',           birthday: '8月6日',   realFlower: '百日草',
    companions: [],                 desc: 'いつまでも枯れないと言われる花' },
  { id: 'dark_lily',    label: 'ダークリリー',     birthday: '9月7日',   realFlower: '黒百合',
    companions: [],                 desc: '闇のような深い色をした百合' },
  { id: 'milkys',       label: 'ミルキース',       birthday: '10月28日', realFlower: 'ノコンギク',
    companions: [],                 desc: '乳白色を帯びた素朴な野の花' },
  { id: 'crystal_lily', label: 'クリスタルリリー', birthday: '11月17日', realFlower: 'ダイヤモンドリリー',
    companions: [],                 desc: '花びらが結晶のようにきらめく百合' },
  { id: 'mondo_leaf',   label: 'モンド',           birthday: '12月18日', realFlower: 'セージ',
    companions: ['yuya', 'rabi'],   desc: 'モコモコとした葉をもつ花' },
];

// 同行者に対応する象徴花を返す(未定義ならnull)
export function getSymbolicFlower(companionId) {
  return FLOWERS.find(flower => flower.companions.includes(companionId)) ?? null;
}

export function getFlowerDefinition(flowerId) {
  return FLOWERS.find(flower => flower.id === flowerId) ?? null;
}
