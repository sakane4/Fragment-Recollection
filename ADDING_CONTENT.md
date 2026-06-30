# コンテンツ追加ガイド

ゲームへ新しい内容を追加するときの手順書です。
まずは、もっとも単純な「素材の追加」だけを扱います。

## 素材を追加する

例として「星砂」を追加し、「塔都の探索中に時々拾う」状態を作ります。

### 1. IDを決める

素材のIDは、半角英小文字とアンダースコアで付けます。

```text
star_sand
```

- 表示名とは別物です。あとから名前を変えても、IDはなるべく変えません。
- 既存のIDと重複させないでください。
- セーブデータにもこのIDが記録されます。

### 2. `resource.js` に表示定義を追加する

`RESOURCES` の中へ1行追加します。

```js
star_sand: {
  label: '星砂',
  color: '#d9c7ff',
  unit: '粒',
  acquireVerb: '拾った',
},
```

これで、持ち物・獲得ログ・依頼の報酬などに同じ名前と色が使われます。

設定できる主な項目：

| 項目 | 意味 | 例 |
| --- | --- | --- |
| `label` | ゲーム内の表示名 | `'星砂'` |
| `color` | 表示色 | `'#d9c7ff'` |
| `unit` | 数量の単位。不要なら省略 | `'粒'` |
| `category` | 持ち物の分類。省略時は素材 | `'tool'`, `'relic'` |
| `acquireVerb` | 獲得ログの動詞 | `'拾った'` |
| `highlight` | 獲得ログを強調するか | `true` |

通常の素材なら `category` は書かなくて構いません。

行動ごとに動詞を変えたい場合：

```js
acquireVerbByAction: {
  touto_explore: '拾った',
  touto_flower_help: 'もらった',
},
```

`acquireVerbByAction` → `acquireVerb` → `見つけた` の順に使われます。

### 3. 入手先を追加する

素材を定義しただけでは入手できません。用途に合う方法を1つ選びます。

初期所持数は `resource.js` の全定義から自動生成されるため、`game.js` へ同じIDを追加する必要はありません。
既存セーブにも、未所持の新素材が所持数0として自動的に補われます。

#### 行動完了時に必ず入手

対象行動の `rewards` に追加します。

```js
rewards: [
  { resource: 'star_sand', amount: 2 },
],
```

行動完了時に2粒入手します。同行人数や宿屋の報酬倍化の影響を受けます。

#### 行動中に時々入手

対象行動の `randomRewards` に追加します。

```js
randomRewards: [
  {
    resource: 'star_sand',
    minAmount: 1,
    maxAmount: 2,
    minMs: 8000,
    maxMs: 18000,
    chance: 0.2,
  },
],
```

- `minAmount` / `maxAmount`: 一度に得る数量
- `minMs` / `maxMs`: 次の抽選までの時間（ミリ秒）
- `chance`: 抽選に当たる確率。`0.2` は20%

`chance` を省略すると、タイマーが来るたび必ず入手します。

#### 依頼の報酬にする

`quests.js` の対象依頼へ追加します。

```js
rewards: [
  { resource: 'star_sand', amount: 3 },
],
```

#### 店の商品にする

花なら `FLOWER_SHOP_ITEMS`、道具なら `TOOL_SHOP_ITEMS` に追加できます。

```js
{ id: 'star_sand', price: 5 },
```

店ごとに商品として扱える種類や表示が異なるため、新しい店へ置く場合は相談推奨です。

### 4. 動作確認

1. ページをリロードする
2. 開発タブから必要な場所・行動を解放する
3. 対象行動を実行する
4. 獲得ログの名前・色・単位・動詞を見る
5. 持ち物の「素材」に表示されることを確認する
6. リロード後も所持数が残ることを確認する

うまく動かない場合は、まず次を確認します。

- `resource.js` と入手先で、素材IDの綴りが完全に一致しているか
- オブジェクトの行末にカンマがあるか
- 色が `#` から始まる6桁のカラーコードになっているか
- `minAmount` が `maxAmount` より大きくなっていないか
- `chance` が0から1の範囲か

## ストーリーを追加する

例として、同行者ユウヤの3番目の記憶 `yuya_3` を追加します。

### 1. テンプレートをコピーする

[`templates/story-template.js`](templates/story-template.js) を `stories` フォルダへコピーし、
ファイル名をストーリーIDに合わせて変更します。

```text
stories/yuya_3.js
```

IDとファイル名は、半角英小文字・数字・アンダースコアで揃えると管理しやすくなります。

### 2. 基本情報を設定する

```js
export default {
  id: 'yuya_3',
  title: '復元後に見える正式タイトル',
  lockedTitle: '青く揺らめく記憶',
  companionId: 'yuya',
  showCondition: { resource: 'blue_fragment', amount: 9 },
  unlockCost: [{ resource: 'blue_fragment', amount: 10 }],
  pageCost: [{ resource: 'blue_fragment', amount: 3 }],
  body: `ここに本文を書く。`,
};
```

| 項目 | 意味 |
| --- | --- |
| `id` | ストーリー固有ID。ファイル名と同じにする |
| `title` | 最後まで復元したあとに表示される正式タイトル |
| `lockedTitle` | 復元前に一覧へ表示される仮タイトル |
| `companionId` | 関連する同行者ID。人物と無関係なら行ごと省略可能 |
| `showCondition` | 記憶が一覧へ現れる条件 |
| `unlockCost` | 記憶を開き始めるための消費素材 |
| `pageCost` | 本文を1段落ずつ復元するための基本コスト |
| `body` | ストーリー本文 |

`companionId` を設定したストーリーは、その人物の「関連する記憶」に表示されます。
また、ページを読み終えるごとに同行者の存在Lvが上がる対象になります。

### 3. 本文を書く

通常の改行は、同じ段落内の改行です。

```text
一行目。
同じ段落の二行目。
```

段落を分けるときは、`---` だけの行を挟みます。

```text
最初の段落。
---
次の段落。
```

ページを分けるときは、`-----` だけの行を挟みます。

```text
一ページ目の最後。
-----
二ページ目の最初。
```

`pageCount` は本文から自動計算されるため、自分で数えたり設定したりする必要はありません。

途中から復元コストを変える場合は、適用したい段落の直前へマーカーを置きます。

```text
最初の段落。
---
[pagecost: blue_fragment×5]
---
ここから青のフラグメント5片。
```

複数素材も指定できます。

```text
[pagecost: blue_fragment×5, fragment×10]
```

### 4. `stories/index.js` へ登録する

先頭のimport群へ追加します。

```js
import yuya_3 from './yuya_3.js';
```

続いて `_rawStories` へ追加します。

```js
const _rawStories = {
  // 既存ストーリー
  yuya_3,
};
```

この2か所へ登録すると、ゲーム全体の `STORIES` から参照されます。

### 5. 動作確認

1. `node --check stories/yuya_3.js` で構文を確認する
2. ページをリロードする
3. 開発タブで条件素材を付与する
4. 記憶一覧に `lockedTitle` が現れることを確認する
5. 記憶を開き、段落・ページ区切りと消費量を確認する
6. 最後まで復元し、正式タイトルへ変わることを確認する
7. `companionId` を設定した場合は、その同行者の関連する記憶にも表示されることを確認する

表示されない場合は、次を確認します。

- ファイル名、`id`、import名の綴りが一致しているか
- `stories/index.js` のimportと `_rawStories` の両方へ追加したか
- `showCondition.resource` が `resource.js` に存在するか
- `---` と `-----` の前後に余分な文字や空白がないか
- 本文を囲むバッククォート `` ` `` を閉じているか

## 依頼を追加する

標準的な依頼は、`quests.js` の `QUESTS` 配列へ定義を1つ追加するだけで作れます。
依頼状態の初期値を `game.js` へ追加する必要はありません。

### 1. 依頼IDを決める

半角英小文字とアンダースコアで、内容が分かるIDを付けます。

```text
need_berries
```

このIDはセーブデータへ記録されるため、公開後はなるべく変更しません。

### 2. 共通の表示内容を書く

```js
{
  id: 'need_berries',
  title: '木の実を探して',
  rumorText: '森で採れるものを欲しがっている人がいるらしい……',
  requester: '塔都の住民',
  description: '木の実を必要としている人がいる。5個集めて届けよう。',
  requestComment: '「森で採れる木の実を、5個ほど分けてもらえませんか？」',
  completeComment: '「こんなに瑞々しい木の実を……ありがとうございます」',
  goalLabel: '木の実を5個集める',
  // この下に出現条件・達成条件・報酬を書く
},
```

| 項目 | 意味 |
| --- | --- |
| `title` | 詳細解放後の依頼名 |
| `rumorText` | 詳細解放前に灰色で表示する噂 |
| `requester` | 依頼主 |
| `description` | システム上の依頼説明 |
| `requestComment` | 受注中に吹き出しへ表示する依頼主の言葉 |
| `completeComment` | 報告後に吹き出しへ表示する言葉 |
| `goalLabel` | 右側の目標欄に表示する短い文 |

### 3. 噂の出現・受注条件を書く

```js
reveal: {
  requirements: [{ resource: 'touto_rumor', amount: 2 }],
},
unlock: {
  requirements: [{ resource: 'touto_rumor', amount: 2 }],
},
```

- `reveal`: 依頼タブへ噂が現れる条件。素材は消費しない
- `unlock`: 「引き受ける」を押せる条件。押したとき素材を消費する

上の例では、噂話を2個持つと表示され、2個消費して受注します。
一度表示された噂は、その後ほかの依頼で噂話を消費しても消えません。

### 4. 達成方法を選ぶ

#### 素材を納品する依頼

```js
requirements: [
  { resource: 'kinomi', amount: 5 },
],
```

必要数を所持すると自動的に「完了」状態になり、依頼UIから納品できます。
報告時に指定素材が消費されます。

#### 特定の行動で何かを発見する依頼

```js
objective: {
  type: 'action_chance',
  actionId: 'forest_gather',
  chance: 0.2,
},
progressLog: '探していた珍しい木の実を見つけた',
activeLabel: 'まだ目的の木の実は見つかっていない',
turnInLabel: '報告する',
```

受注後、指定した行動が完了するたびに抽選します。`chance: 0.2` は20%です。
当選すると「完了」状態になり、`progressLog` が強調ログとして表示されます。

素材納品の `requirements` と探索型の `objective` は、標準的な依頼ではどちらか一方を使います。

#### 特定の行動を決まった回数行う依頼

```js
objective: {
  type: 'action_count',
  actionId: 'touto_flower_help',
  target: 10,
  unitLabel: '回',
},
```

指定した行動の完了回数が `target` に達すると「完了」になります。
依頼UIには `回 3/10` のように進捗が表示されます。

施設やイベントの解放と同時に自動受注させる場合は、次も追加します。

```js
autoStart: { stateFlag: 'flowerHelpUnlocked' },
```

この形式では `reveal` と `unlock` は不要です。

### 5. 報酬と報告方法を書く

```js
rewards: [
  { resource: 'magcoin', amount: 15 },
],
turnIn: 'quest_ui',
```

複数報酬も指定できます。

```js
rewards: [
  { resource: 'magcoin', amount: 15 },
  { resource: 'herb', amount: 3 },
],
```

報酬がない依頼では `rewards: []` とします。
現在の標準依頼は、すべて `turnIn: 'quest_ui'` にして依頼画面から報告します。

### 6. `QUESTS` 配列へ追加する

完成した依頼オブジェクトを、`quests.js` の `QUESTS` 配列内へ追加します。

```js
export const QUESTS = [
  // 既存依頼
  {
    id: 'need_berries',
    // ...
  },
];
```

別ファイルへのimportや、初期状態への登録は不要です。

### 7. 動作確認

1. `node --check quests.js` で構文を確認する
2. ページをリロードする
3. 開発タブで噂話や必要素材を付与する
4. 指定数で「噂」に現れることを確認する
5. 「引き受ける」で噂話が消費され、「受注中」へ移ることを確認する
6. 納品または指定行動で「完了」になることを確認する
7. 報告後に台詞が変わり、報酬が付与されることを確認する
8. リロード後も報告済み状態が残ることを確認する

うまく動かない場合は、次を確認します。

- `resource` のIDが `resource.js` と一致しているか
- `actionId` が `game.js` の行動IDと一致しているか
- `chance` が0から1の範囲か
- `QUESTS` 配列内で依頼IDが重複していないか
- 各オブジェクト・配列の末尾にカンマがあるか

### ランダム発見と同時に直接受注する旧形式

噂を介さず、行動完了時の抽選で直接受注する形式も利用できます。

```js
discover: {
  actionId: 'touto_explore',
  chance: 0.1,
  requirements: [],
},
```

この場合は `reveal` と `unlock` を書きません。
ただし、現在の基本方針は「噂をプレイヤーが選んで解放する形式」です。

## コピペ用テンプレート

- 素材追加：[`templates/resource-template.js`](templates/resource-template.js)
- ストーリー追加：[`templates/story-template.js`](templates/story-template.js)
- 依頼追加：[`templates/quest-template.js`](templates/quest-template.js)

素材テンプレートは必要な部分を対象ファイルへコピーします。
ストーリーテンプレートはファイル全体を `stories` フォルダへコピーして使います。
依頼テンプレートは、使いたい形式のオブジェクトを `quests.js` の `QUESTS` 配列へコピーします。
