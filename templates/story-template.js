// ストーリー追加用テンプレート
// 1. このファイルを stories フォルダへコピーする
// 2. ファイル名と id を同じストーリーIDへ変更する
// 3. stories/index.js の import と _rawStories へ登録する
//
// 本文の区切り:
//   ---   段落区切り
//   ----- ページ区切り
// pageCount は自動計算されるため、ここには書かない。

export default {
  id: 'sample_story',
  title: '正式なタイトル',
  lockedTitle: '曖昧に光る記憶',

  // 同行者と無関係な物語では、この行を削除する。
  companionId: 'yuya',

  // この素材を指定数持つと、記憶一覧に現れる。
  showCondition: { resource: 'blue_fragment', amount: 9 },

  // 記憶を開き始めるためのコスト。
  unlockCost: [
    { resource: 'blue_fragment', amount: 10 },
  ],

  // 本文を1段落復元するための基本コスト。
  pageCost: [
    { resource: 'blue_fragment', amount: 3 },
  ],

  body: `最初の段落を書く。
同じ段落内なら、普通に改行できる。
---
ここから次の段落。
会話や地の文を書く。
-----
ここから次のページ。
---
[pagecost: blue_fragment×5]
---
この段落から、復元コストが青のフラグメント5片に変わる。`,
};

