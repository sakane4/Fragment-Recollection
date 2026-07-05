// scenario.js — シナリオフロー・タイプライターエンジン

// 施設メニューのカード用フォールバックアイコン(個別アイコンはui.js側からoptionに付与される)
const _ICON_FACILITY_DEFAULT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`;
const _ICON_FACILITY_EXIT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const _ICON_FACILITY_CART = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
const _ICON_FACILITY_LOCK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

// ── タイプライター ──
// 指定要素にテキストを1文字ずつ表示。skip()で即時完了
function typewriter(el, text, { speed = 45, onDone, onStep } = {}) {
  el.textContent = '';
  let i = 0;
  let stopped = false;
  let isDone = false;

  function step() {
    if (stopped) return;
    if (i >= text.length) {
      isDone = true;
      onDone?.();
      return;
    }
    el.textContent += text[i++];
    onStep?.();
    setTimeout(step, speed);
  }

  step();

  return {
    skip() {
      if (isDone) return;
      stopped = true;
      el.textContent = text;
      isDone = true;
      onStep?.();
      onDone?.();
    },
    get done() { return isDone; },
  };
}

// ── オープニングチュートリアル ページ定義 ──
const OPENING_PAGES = [
  {
    text: 'そこにはもう、なにもない。\nすべてが失われた世界には、\n空も、海も、大地も、命も。\n　もう、なにも。\n　でも、"ここ"にはあなたがいる。',
    advance: 'tap',
  },
  {
    text: 'この世界を再生しますか？',
    advance: 'button',
    buttonLabel: 'はい',
  },
  {
    text: 'もしも、同じことが繰り返されるとしても？',
    advance: 'button',
    buttonLabel: 'はい',
  },
  {
    text: 'それでも、あなたは、この世界を再生しますか？',
    advance: 'button',
    buttonLabel: 'はい',
  },
];

// ── オープニングチュートリアル ──
function startOpeningTutorial({ onComplete } = {}) {
  const overlay   = document.getElementById('tutorial-overlay');
  const textEl    = document.getElementById('tutorial-text');
  const indicator = document.getElementById('tutorial-indicator');
  const btn       = document.getElementById('tutorial-btn');

  overlay.classList.add('open');

  let pageIndex = 0;
  let tw = null;

  function showPage(index) {
    const page = OPENING_PAGES[index];
    btn.hidden = true;
    indicator.hidden = true;
    textEl.textContent = '';

    tw = typewriter(textEl, page.text, {
      onDone: () => {
        if (page.advance === 'tap') {
          indicator.hidden = false;
        } else {
          setTimeout(() => {
            btn.textContent = page.buttonLabel;
            btn.hidden = false;
          }, 1000);
        }
      },
    });
  }

  function advance() {
    if (tw && !tw.done) { tw.skip(); return; }
    pageIndex++;
    if (pageIndex >= OPENING_PAGES.length) {
      overlay.classList.remove('open');
      // アクションバーへのガイドを表示
      showActionGuide();
      onComplete?.();
      return;
    }
    showPage(pageIndex);
  }

  function handleOverlayClick(e) {
    if (e.target === btn) return;
    const page = OPENING_PAGES[pageIndex];
    if (page.advance === 'tap') advance();
    else if (tw && !tw.done) tw.skip();
  }

  overlay.addEventListener('click', handleOverlayClick);
  btn.addEventListener('click', advance);

  // 隠しスキップ：右上コーナーをタップで即完了
  const skipZone = document.createElement('div');
  skipZone.style.cssText = 'position:absolute;top:0;right:0;width:60px;height:60px;z-index:10;';
  overlay.appendChild(skipZone);
  skipZone.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tw && !tw.done) tw.skip();
    overlay.classList.remove('open');
    skipZone.remove();
    showActionGuide();
    onComplete?.();
  });

  showPage(0);
}

// ── アクションバー ガイド表示 ──
function showActionGuide() {
  const guide = document.getElementById('action-guide');
  guide.classList.add('visible');
  guide.addEventListener('click', () => guide.classList.remove('visible'), { once: true });
  setTimeout(() => guide.classList.remove('visible'), 6000);
}

// ── スクリプトパーサー ──
// 空行を無視し、特殊タグを変換してステップ配列を返す
// [name_input]         → { type: 'name_input' }
// [end: ラベル]        → { type: 'end_button', label: 'ラベル' }
// ${name} を含む行     → { type: 'text', text: (name) => `...` }
// それ以外の行         → { type: 'text', text: '...' }
function parseScript(src) {
  return src
    .split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim() !== '')
    .map(line => {
      if (line === '[name_input]') return { type: 'name_input' };
      const endMatch = line.match(/^\[end:\s*(.+)\]$/);
      if (endMatch) return { type: 'end_button', label: endMatch[1] };
      const btnMatch = line.match(/^\[button:\s*(.+)\]$/);
      if (btnMatch) return { type: 'advance_button', label: btnMatch[1] };
      if (line.includes('${name}')) return { type: 'text', text: (name) => line.replace(/\$\{name\}/g, name) };
      return { type: 'text', text: line };
    });
}

// ── ログストーリー001 ──
// メインパネルにタイプライター式でテキストを順番に流す
const LOG_STORY_STEPS = parseScript(`
001
何もない世界をしばらくさまよった。
「あれ？」
後ろから、声が聞こえた。
「きみは誰？」
振り向くと一人の少年がいて、あなたを見ている。
[name_input]
「\${name}さんって言うんだ」
「僕は、ユウヤ」
「気づいたらここにいて」
「何も思い出せないんだ」
「きみは？」
首を横に振る。
「そっか……とりあえず、少し一緒に歩いてみる？」
[end: 頷く]
`);

// ── ログストーリー共通エンジン ──
function runLogSt(steps, mainPanel, { onNameDecided, onComplete, initialName = '' } = {}) {
  let stepIndex = 0;
  let playerName = initialName;
  let currentTw = null;
  let waitingForTap = false;
  let indicator = null;

  function addEntry() {
    const el = document.createElement('div');
    el.className = 'log-entry story-log center';
    mainPanel.appendChild(el);
    mainPanel.scrollTop = mainPanel.scrollHeight;
    return el;
  }

  function removeIndicator() {
    if (indicator) { indicator.remove(); indicator = null; }
  }

  function showTapIndicator() {
    removeIndicator();
    indicator = document.createElement('div');
    indicator.className = 'story-tap-indicator';
    indicator.textContent = '▼';
    mainPanel.appendChild(indicator);
    mainPanel.scrollTop = mainPanel.scrollHeight;
  }

  function nextStep() {
    if (stepIndex >= steps.length) return;
    removeIndicator();
    waitingForTap = false;
    const step = steps[stepIndex];

    if (step.type === 'text') {
      const text = typeof step.text === 'function' ? step.text(playerName) : step.text;
      const el = addEntry();
      currentTw = typewriter(el, text, {
        speed: 55,
        onStep: () => { mainPanel.scrollTop = mainPanel.scrollHeight; },
        onDone: () => { waitingForTap = true; showTapIndicator(); },
      });
      stepIndex++;

    } else if (step.type === 'name_input') {
      currentTw = null;
      const wrap = addEntry();
      const defaultName = Math.random() < 0.5 ? 'アサ' : 'ヨル';
      wrap.innerHTML = `
        <div class="story-name-prompt">〈あなたのなまえは…〉</div>
        <div class="story-name-row">
          <input id="story-name-input" type="text" maxlength="10" value="${defaultName}">
          <button id="story-name-btn">名乗る</button>
        </div>`;
      mainPanel.scrollTop = mainPanel.scrollHeight;
      document.getElementById('story-name-btn').addEventListener('click', () => {
        const val = document.getElementById('story-name-input').value.trim();
        if (!val) return;
        playerName = val;
        onNameDecided?.(playerName);
        wrap.querySelector('input').disabled = true;
        wrap.querySelector('#story-name-btn').disabled = true;
        stepIndex++;
        nextStep();
      });

    } else if (step.type === 'advance_button') {
      currentTw = null;
      const wrap = addEntry();
      const btn = document.createElement('button');
      btn.className = 'story-end-btn';
      btn.textContent = step.label;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        stepIndex++;
        nextStep();
      });
      wrap.appendChild(btn);
      mainPanel.scrollTop = mainPanel.scrollHeight;

    } else if (step.type === 'end_button') {
      currentTw = null;
      const wrap = addEntry();
      const btn = document.createElement('button');
      btn.className = 'story-end-btn';
      btn.textContent = step.label;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        removeIndicator();
        onComplete?.();
      });
      wrap.appendChild(btn);
      mainPanel.scrollTop = mainPanel.scrollHeight;
    }
  }

  function handleClick() {
    if (currentTw && !currentTw.done) { currentTw.skip(); return; }
    if (waitingForTap) nextStep();
  }

  mainPanel.addEventListener('click', handleClick);
  nextStep();
  return () => mainPanel.removeEventListener('click', handleClick);
}

// ── ログストーリー002 ──
const LOG_STORY_2_STEPS = parseScript(`
002
「これ、いったいなんだろう」
ユウヤの手には、不思議な物質がある。
さきほどから、あなたも見つけていたものだ。
「なにかの、かけらみたい」
「見つめていると、なんだか、懐かしい気持ちになる」
「あそこにも、あるよ」
「行ってみよう」
[end: ついていく]
`);

const WORLD_CHRONICLE_INTRO_STEPS = parseScript(`
図書館には多くの本がある。
だが、そのタイトルも内容も、曖昧にぼやけたものばかりだった。
一冊の古びた本を手に取り、開いてみる。
文字は擦り切れ、ほとんど読むことができない。
ふと足音が聞こえ、あなたの隣で止まった。
顔を上げると、本を抱えた少年が立っている。
「その本は、大陸誌の写本です」
「“喪失”以来……この図書館にあった多くの資料は、失われてしまいました」
「今、復元の協力をお願いしているのです」
「僕たちは、ここを離れられませんから……」
彼は、司書の一人だという。
「この図書館は、過ぎ行く世界を記録するために、世界中の資料を保存しています」
「ただ失われていくだけの世界を、せめてほんの少しでも、残していくために……」
[end: 引き受ける]
`);

// ── ログストーリー003 ──
const LOG_STORY_3_STEPS = parseScript(`
003
集めた欠片が、青い光をはなつ。
強まる光を見ていたあなたの頭に浮かんだ、その記憶……。
あなたは直感的にわかる。それは、今隣にいる少年のものだと。
青い光は、少年の身体に吸い込まれるように、やがて消えていった。
「今のは……僕の記憶だ」
「そうだ、……僕には、双子の弟がいた……」
あなたはうなずく。
「でも、会えなくなった…」
ユウヤは少しの間なにか考えていたが、しばらくするとまた口を開く。
「そうだ、あの時――」
その時あなたは、木々と土の匂いを感じた。
葉のこすれる音。
視界を埋め尽くす、新緑の色。
いつの間にか、ユウヤも言葉を失っている。
あなたたちは、森の中にいた。
[end: 先へ進む]
`);

function runLogSt_1(mainPanel, opts) { return runLogSt(LOG_STORY_STEPS,   mainPanel, opts); }
function runLogSt_2(mainPanel, opts) { return runLogSt(LOG_STORY_2_STEPS, mainPanel, opts); }
function runLogSt_3(mainPanel, opts) { return runLogSt(LOG_STORY_3_STEPS, mainPanel, opts); }
function runWorldChronicleIntro(mainPanel, opts) { return runLogSt(WORLD_CHRONICLE_INTRO_STEPS, mainPanel, opts); }

// 5人全員が揃ったときの顔合わせシーン(仮文。あとで本文を書き直す)
const ALL_COMPANIONS_MET_STEPS = parseScript(`
「」
[end: 再生を続ける]
`);
function runAllCompanionsMet(mainPanel, opts) { return runLogSt(ALL_COMPANIONS_MET_STEPS, mainPanel, opts); }

const LOG_STORY_4_STEPS =parseScript(`
004
森の中、あなたはユウヤと足を止める。
「あのとき、誰かが……」
ユウヤはそうして記憶を探る様子だったが、
しばらくして首を振る。
「だめだー……思い出せないや」
何となく、という様子でユウヤは辺りを見渡す。
そこは少し開けている。
地面は短く柔らかい草に覆われ、中心に一本の木があり、日陰を作っている。
「ん？あれはなんだろう」
ユウヤが指さすのは木の根本だ。
なにか陽の光を反射するものがある。
近づいてみると、落ちていたのは、星をかたどったようなイヤリングだった。
「どうしてこんなところに？……」
あなたはそれを拾い上げる。
すると、そのイヤリングはほのかに光った。
「――」
まるであなたを導くように。
「どうしたの？」
ユウヤは不思議そうだ。
[end: 星の導きに従う]

`);

function runLogSt_4(mainPanel, opts) { return runLogSt(LOG_STORY_4_STEPS, mainPanel, opts); }

// ── 同行者加入イベント ──
const JOIN_KAORU_STEPS = parseScript(`
あなたは不思議な生き物を拾った。
もきゅもきゅと鳴いている。
手のひらに収まる、毛玉のような生き物だ。
「あ！そこにいるのは！！」
という声がして、向こうから一人の女性が走ってくる。
「もっふりん！！」
もきゅっと鳴きながら、その生き物は彼女の方へ飛んでいく。
「思い出した、キミはあたしの友達！」
もっふりんと呼ばれた生き物は嬉しそうだ。
そしてその女性は顔を上げてあなたの方を見る。
「ねぇ、なんだかあたし、気づいたらここにいて、何も覚えてなくて……」
「何か、だいじなことを忘れてる気がするんだ」
[button: 自分も同じだと伝える]
「そうなの！？　じゃあ……一緒に行こうよ！」
「あたしはカオル！　キミは？」
\${name}と名乗る。
[end: 再生を続ける]
`);

const JOIN_SHIZUKU_STEPS = parseScript(`
旧美術室の鍵を開けると、そこには一人の青年が立っていた。
彼は振り向く。
その瞳にはかすかに戸惑いが浮かんでいる。
[button: 何か憶えている？]
「……いや、何も」
「君もそうなの？」
うなずくと、彼は教室を見渡した。
「ずっと昔……ここに来たことがあるような気がする」
「けど、何も思い出せない」
[button: 一緒に行こう]
「わかった……」
彼はしばらく考えてから、そう答えた。
「オレはシズク……君は？」
\${name}と名乗った。
[end: 再生を続ける]
`);

const JOIN_YUKIKA_STEPS = parseScript(`
暗い光に満ちた王都で、精巧な羅針盤を拾った。
ただの羅針盤ではないようだが、造りが複雑すぎて、
使い方はまったくわからない。
するとそんなあなたを、一人の少女がじっと見ている。
「…………」
目が合うと、少女は口を開いた。
「それは、なに？」
[button: わからない]
「……なんだか、すごく懐かしい気がするの」
「見たことがあるような、ずっと使っていたような……」
少女に羅針盤を見せてみる。
「私はなにをしていたのか、誰だったのか、思い出せないの」
「何か夢を見ていた気がするんだ、長い夢を……」
羅針盤を手にとって少女はつぶやいた。
「そう……雪架。私の名前は、雪架」
「あなたといたら、なにか思い出せるような気がする」
「ついていってもいい？」
[end: うなずく]
`);

const JOIN_RABI_STEPS = parseScript(`
騎士団の本部はとても広い建物で、どこまで歩いても終わりがない。
赤い絨毯の敷かれた廊下に、一振りの剣が落ちていた。
鞘まで丁寧に磨き抜かれ、抜いてみると刀身は澄んだ銀色だ。
しかし、光を反射すると赤く光っているように見える。
「その剣は……」
不意に声が聞こえ、あなたは顔を上げる。
「悪い。何か、思い出せそうな気がしたんだ」
そこには目元を布で覆った一人の少年がいた。
着ている服には、周囲で見かけるのと同じ、騎士団の記章が描かれている。
[button: 剣を渡す]
感触を確かめるように、彼は剣を抜き、その音に耳を澄ませている。
「オレの剣だ。そうだ……ずっとこの剣とともに戦ってきた」
「でもそれ以外は……思い出せない」
「この剣をオレに返してもらえないか？」
[button: うなずく]
彼は礼を言うと、剣を腰に差し、立ち去ろうとした。
「――待って！」
その時、ユウヤが呼び止めた。
「僕たちも同じなんだ」
「気づいたらここにいて、何も思い出せない」
「よかったら、何か思い出すまで……僕たちと一緒に来ない？」
少年は少し考えるように首を傾ける。
「……わかった。それなら、この剣で力になろう」
「――！　ありがとう！　僕は、ユウヤ。キミは？」
「オレは……ラビ、そう……ラビだ」
[end: ラビと一緒に行く]
`);

const JOIN_SCENARIOS = {
  kaoru:   JOIN_KAORU_STEPS,
  shizuku: JOIN_SHIZUKU_STEPS,
  yukika:  JOIN_YUKIKA_STEPS,
  rabi:    JOIN_RABI_STEPS,
};

// companionId に対応する加入イベントを再生する。該当が無ければ何もせずnullを返す
function runCompanionJoin(companionId, mainPanel, opts) {
  const steps = JOIN_SCENARIOS[companionId];
  return steps ? runLogSt(steps, mainPanel, opts) : null;
}

// ── 場所選択プロンプト ──
// メインパネルに「新しい場所が見つかりそうだ・・・」とプロンプトを流し、
// その下に場所候補ボタンを並べる。選択すると onPick(id) を呼ぶ。
// options: [{ id, label }]
// 戻り値: cleanup()（リスナー解除）
function runLocationChoice(mainPanel, { prompt = '新しい場所が見つかりそうだ・・・', options = [], onPick } = {}) {
  let tw = null;

  function addEntry(cls) {
    const el = document.createElement('div');
    el.className = cls;
    mainPanel.appendChild(el);
    mainPanel.scrollTop = mainPanel.scrollHeight;
    return el;
  }

  function handleClick() {
    if (tw && !tw.done) tw.skip();
  }
  mainPanel.addEventListener('click', handleClick);

  function cleanup() {
    mainPanel.removeEventListener('click', handleClick);
  }

  const promptEl = addEntry('log-entry story-log center');
  tw = typewriter(promptEl, prompt, {
    speed: 55,
    onStep: () => { mainPanel.scrollTop = mainPanel.scrollHeight; },
    onDone: () => {
      const wrap = addEntry('story-choice-wrap');
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'story-choice-btn';
        btn.textContent = opt.label;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          wrap.querySelectorAll('button').forEach(b => b.disabled = true);
          cleanup();
          onPick?.(opt.id);
        });
        wrap.appendChild(btn);
      }
      mainPanel.scrollTop = mainPanel.scrollHeight;
    },
  });

  return cleanup;
}

// ── 施設メニュー ──
// メインパネルに入店演出＋メニュー(行動を選ぶ/買い物する/出る)を表示する。
// options: [{ id, label, type: 'action'|'shop'|'submenu'|'talk', actionId?, shopId?, options?, dialogue? }]
// （「出る」は自動で追加）
// 戻り値: cleanup()（リスナー解除）
function runFacilityMenu(mainPanel, {
  label,
  description,
  icon,
  enterText,
  options = [],
  getShopItems,
  formatShopItem,
  getCurrency,
  onBuy,
  onSelectAction,
  onSelectOption,
  onTrigger,
  onLeave,
} = {}) {
  let tw = null;

  function addEntry(cls) {
    const el = document.createElement('div');
    el.className = cls;
    mainPanel.appendChild(el);
    mainPanel.scrollTop = mainPanel.scrollHeight;
    return el;
  }

  function handleClick() {
    if (tw && !tw.done) tw.skip();
  }
  mainPanel.addEventListener('click', handleClick);

  function cleanup() {
    mainPanel.removeEventListener('click', handleClick);
  }

  function _makeCard(cardLabel, cardIcon) {
    const btn = document.createElement('button');
    btn.className = 'facility-card';
    btn.innerHTML = `<span class="facility-card-icon">${cardIcon ?? _ICON_FACILITY_DEFAULT}</span><span class="facility-card-label">${cardLabel}</span>`;
    return btn;
  }

  function _makeListRow(rowLabel, rowIcon) {
    const btn = document.createElement('button');
    btn.className = 'facility-list-row';
    btn.innerHTML = `<span class="facility-card-icon">${rowIcon ?? _ICON_FACILITY_DEFAULT}</span><span class="facility-list-row-label">${rowLabel}</span>`;
    return btn;
  }

  function _makeBook(bookLabel, bookIcon, tone = 'world', width = null) {
    const btn = document.createElement('button');
    btn.className = 'facility-book';
    btn.dataset.bookTone = tone;
    if (width) btn.style.setProperty('--book-width', `${width}px`);
    const titleLength = Math.max(1, [...bookLabel].length);
    btn.style.setProperty('--book-font-size', `${Math.max(7, Math.min(11.5, 82 / titleLength))}px`);
    btn.title = bookLabel;
    btn.innerHTML = `<span class="facility-book-ornament"></span><span class="facility-book-label">${bookLabel}</span><span class="facility-book-icon">${bookIcon ?? _ICON_FACILITY_DEFAULT}</span>`;
    return btn;
  }

  // 施設パネル(アイコン+名前+説明+出る/戻るボタンのヘッダー)は施設に入っている間1つだけ保持し、
  // メニュー⇔買い物の切り替えは中身(body)を作り直すだけで同じパネルを上書きする
  let panel = null;
  let exitBtn = null;
  let body = null;

  function _ensurePanel() {
    if (panel) return;
    panel = addEntry('facility-panel');
    const header = document.createElement('div');
    header.className = 'facility-panel-header';
    header.innerHTML = `
      <span class="facility-panel-icon">${icon ?? _ICON_FACILITY_DEFAULT}</span>
      <div class="facility-panel-titlewrap">
        <div class="facility-panel-title">${label ?? ''}</div>
        <div class="facility-panel-desc">${description ?? ''}</div>
      </div>
    `;
    exitBtn = document.createElement('button');
    exitBtn.className = 'facility-panel-exit';
    header.appendChild(exitBtn);
    panel.appendChild(header);

    body = document.createElement('div');
    panel.appendChild(body);
  }

  function _setExit(exitLabel, onExit) {
    exitBtn.innerHTML = `${_ICON_FACILITY_EXIT}<span>${exitLabel}</span>`;
    exitBtn.onclick = (e) => {
      e.stopPropagation();
      if (exitLabel === '出る') {
        panel.remove();
        panel = null;
        const exitEl = addEntry('log-entry story-log center');
        tw = typewriter(exitEl, `${label ?? ''}を出た。`, {
          speed: 55,
          onStep: () => { mainPanel.scrollTop = mainPanel.scrollHeight; },
        });
      }
      onExit();
    };
  }

  // 施設内行動の開始時、操作パネルを上下から中央へ畳み、ログの区切り線として残す
  function collapsePanelToDivider(onCollapsed) {
    const closingPanel = panel;
    if (!closingPanel) return;
    panel = null;

    closingPanel.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
    const startHeight = closingPanel.getBoundingClientRect().height;
    closingPanel.style.boxSizing = 'border-box';
    closingPanel.style.height = `${startHeight}px`;
    // 明示した開始heightを描画へ反映してから、CSSトランジションを開始する
    closingPanel.getBoundingClientRect();
    requestAnimationFrame(() => {
      // 第1段階: 上下の線だけを中央へ寄せる
      closingPanel.classList.add('facility-panel-closing');
      // 第2段階: 線が重なってから、空いたパネルの高さを畳む
      setTimeout(() => {
        if (closingPanel.isConnected) closingPanel.classList.add('facility-panel-collapse-height');
      }, 480);
    });

    let finalized = false;
    const finalize = () => {
      if (finalized || !closingPanel.isConnected) return;
      finalized = true;
      closingPanel.className = 'facility-panel-divider';
      // メインログのflexレイアウトで空要素が潰れないよう、最終線の寸法を明示する
      closingPanel.style.cssText = 'display:block;flex:0 0 1px;width:100%;height:1px;min-height:1px;margin:0.8rem 0 0.35rem;background:var(--accent);opacity:0.58;box-shadow:0 0 4px rgba(126,200,216,0.24);pointer-events:none;';
      closingPanel.replaceChildren();
      closingPanel.setAttribute('aria-hidden', 'true');
      onCollapsed?.();
    };
    closingPanel.addEventListener('transitionend', (e) => {
      if (e.target === closingPanel && e.propertyName === 'height') finalize();
    });
    // 背景タブ化などでtransitionendが発火しなかった場合の保険
    setTimeout(finalize, 850);
  }

  // 行動選択肢が「買い物」1つだけの施設は、メニューを経由せず入店時に直接商品リストを開く
  const _soloShop = options.length === 1 && options[0].type === 'shop' ? options[0] : null;

  function renderMenu() {
    _ensurePanel();
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'facility-grid';
    body.appendChild(grid);
    _setExit('出る', () => { cleanup(); onLeave?.(); });
    for (const opt of options) {
      if (opt.locked) {
        const btn = _makeCard('？？？', _ICON_FACILITY_LOCK);
        btn.disabled = true;
        grid.appendChild(btn);
        continue;
      }
      const btn = _makeCard(opt.label, opt.icon);
      if (opt.disabled) {
        btn.disabled = true;
        grid.appendChild(btn);
        continue;
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.type === 'shop') {
          renderShop(opt.shopId);
        } else if (opt.type === 'submenu') {
          renderSubmenu(opt);
        } else if (opt.type === 'talk') {
          renderTalk(opt);
        } else if (opt.type === 'action') {
          // 入店ログは履歴として残し、操作パネルは中央線へ畳んで以後操作できない区切りにする。
          collapsePanelToDivider();
          cleanup();
          onSelectAction?.(opt.actionId);
        } else {
          cleanup();
          onSelectOption?.(opt);
        }
      });
      grid.appendChild(btn);
    }
    mainPanel.scrollTop = mainPanel.scrollHeight;
  }

  // 施設内の人物との短い会話。パネルを閉じず、「戻る」で元の施設メニューへ戻れる。
  function renderTalk(option) {
    _ensurePanel();
    if (tw && !tw.done) tw.skip();
    body.innerHTML = '';
    const speaker = document.createElement('div');
    speaker.className = 'facility-talk-speaker';
    speaker.textContent = option.speaker ?? '';
    const dialogue = document.createElement('div');
    dialogue.className = 'facility-talk-dialogue';
    body.append(speaker, dialogue);
    _setExit('戻る', renderMenu);
    tw = typewriter(dialogue, option.dialogue ?? '「……」', {
      speed: 38,
      onStep: () => { mainPanel.scrollTop = mainPanel.scrollHeight; },
      onDone: () => option.onDone?.(),
    });
  }

  // 「復元」など、施設内の選択肢をさらに分類する二段目のカードメニュー
  function renderSubmenu(parentOption) {
    _ensurePanel();
    body.innerHTML = '';
    const subheading = document.createElement('div');
    subheading.className = 'facility-shop-balance';
    subheading.textContent = parentOption.heading ?? parentOption.label;
    body.appendChild(subheading);
    const shelf = document.createElement('div');
    shelf.className = parentOption.style === 'bookshelf' ? 'facility-bookshelf' : 'facility-grid';
    body.appendChild(shelf);
    _setExit('戻る', renderMenu);

    for (const opt of (parentOption.options ?? [])) {
      if (opt.locked) {
        const btn = parentOption.style === 'bookshelf'
          ? _makeBook('？？？', _ICON_FACILITY_LOCK, 'locked', opt.bookWidth)
          : _makeCard('？？？', _ICON_FACILITY_LOCK);
        btn.disabled = true;
        shelf.appendChild(btn);
        continue;
      }
      const btn = parentOption.style === 'bookshelf'
        ? _makeBook(opt.label, opt.icon, opt.bookTone, opt.bookWidth)
        : _makeCard(opt.label, opt.icon);
      if (opt.disabled) {
        btn.disabled = true;
        shelf.appendChild(btn);
        continue;
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.type === 'submenu') {
          renderSubmenu(opt);
        } else {
          cleanup();
          onSelectOption?.(opt);
        }
      });
      shelf.appendChild(btn);
    }
    mainPanel.scrollTop = mainPanel.scrollHeight;
  }

  function renderShop(shopId, { exitLabel = '戻る', onExit = renderMenu } = {}) {
    _ensurePanel();
    body.innerHTML = '';
    const balance = document.createElement('div');
    balance.className = 'facility-shop-balance';
    body.appendChild(balance);
    const grid = document.createElement('div');
    grid.className = 'facility-list';
    body.appendChild(grid);
    // 購入するたびに1行ずつ積み重ねる(上書きすると連続購入時に直前の結果が見えなくなるため)
    const noteList = document.createElement('div');
    body.appendChild(noteList);
    _setExit(exitLabel, onExit);

    // 購入してもパネルを作り直さず、残高・商品リストだけをその場で更新する
    function refresh(message = '') {
      const currency = getCurrency?.();
      balance.innerHTML = currency
        ? `ポケットの中: <span style="color:${currency.color ?? 'var(--accent)'};font-weight:bold">${currency.label}</span> <span style="color:var(--text)">${currency.amount}</span>`
        : '';
      const items = getShopItems?.(shopId) ?? [];
      grid.innerHTML = '';
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'facility-list-empty';
        empty.textContent = '今は買えそうな品がない…';
        grid.appendChild(empty);
      } else {
        for (const item of items) {
          const btn = _makeListRow(formatShopItem ? formatShopItem(item) : item.id, _ICON_FACILITY_CART);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const result = onBuy?.(shopId, item.id);
            if (result?.closeFacility) {
              collapsePanelToDivider(() => {
                cleanup();
                onTrigger?.(result.trigger);
              });
              return;
            }
            refresh(result?.message ?? '');
          });
          grid.appendChild(btn);
        }
      }
      if (message) {
        const line = document.createElement('div');
        line.className = 'log-entry story-log center';
        line.textContent = message;
        noteList.appendChild(line);
      }
      mainPanel.scrollTop = mainPanel.scrollHeight;
    }

    refresh();
  }

  function renderEntry() {
    if (_soloShop) {
      renderShop(_soloShop.shopId, { exitLabel: '出る', onExit: () => { cleanup(); onLeave?.(); } });
    } else {
      renderMenu();
    }
  }

  const promptEl = addEntry('log-entry story-log center');
  tw = typewriter(promptEl, enterText ?? `${label}に入った。`, {
    speed: 55,
    onStep: () => { mainPanel.scrollTop = mainPanel.scrollHeight; },
    onDone: renderEntry,
  });

  return cleanup;
}

// ── ノスタルジア発見シーン ──
// 「再生された世界」が「ノスタルジア」へと変化する瞬間の演出
const NOSTALGIA_DISCOVERY_STEPS = parseScript(`
（仮）気がつくと、街の輪郭が滲んでいた。
（仮）ここはどこだろう。なにもなかったはずなのに。
（仮）石畳。路地。明かりのない窓。
（仮）まるで、誰かがここにいたことを、世界が覚えているようだ。
（仮）―― ノスタルジア。
[end: 先へ進む]
`);

function runNostalgiaDiscovery(mainPanel, opts) { return runLogSt(NOSTALGIA_DISCOVERY_STEPS, mainPanel, opts); }

export { typewriter, startOpeningTutorial, runLogSt_1, runLogSt_2, runLogSt_3, runLogSt_4, runWorldChronicleIntro, runAllCompanionsMet, runLocationChoice, runCompanionJoin, runFacilityMenu, runNostalgiaDiscovery };
