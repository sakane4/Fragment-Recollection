// tutorial.js — チュートリアルフロー・タイプライターエンジン

// ── タイプライター ──
// 指定要素にテキストを1文字ずつ表示。skip()で即時完了
function typewriter(el, text, { speed = 45, onDone } = {}) {
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
    setTimeout(step, speed);
  }

  step();

  return {
    skip() {
      if (isDone) return;
      stopped = true;
      el.textContent = text;
      isDone = true;
      onDone?.();
    },
    get done() { return isDone; },
  };
}

// ── オープニングチュートリアル ページ定義 ──
const OPENING_PAGES = [
  {
    text: '　そこにはもう、なにもない。\n　すべてが失われた世界には、\n　空も、海も、大地も、命も。\n　もう、なにも。\n　でも、"ここ"にはあなたがいる。',
    advance: 'tap',
  },
  {
    text: '　この世界を再生しますか？',
    advance: 'button',
    buttonLabel: 'はい',
  },
  {
    text: '　もしも、同じことが繰り返されるとしても？',
    advance: 'button',
    buttonLabel: 'はい',
  },
  {
    text: '　それでも、あなたは、この世界を再生しますか？',
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
「俺は、ユウヤ」
「気づいたらここにいて」
「何も思い出せないんだ」
「きみは？」
首を横に振る。
「そっか……とりあえず、少し一緒に歩いてみる？」
[end: 頷く]
`);

function startLogStory1(mainPanel, { onNameDecided, onComplete } = {}) {
  let stepIndex = 0;
  let playerName = '';
  let currentTw = null;
  let waitingForTap = false;
  let indicator = null;

  function addEntry(html = '', center = true) {
    const el = document.createElement('div');
    el.className = 'log-entry story-log' + (center ? ' center' : '');
    if (html) el.innerHTML = html;
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
    if (stepIndex >= LOG_STORY_STEPS.length) return;
    removeIndicator();
    waitingForTap = false;

    const step = LOG_STORY_STEPS[stepIndex];

    if (step.type === 'text') {
      const text = typeof step.text === 'function' ? step.text(playerName) : step.text;
      const el = addEntry();
      currentTw = typewriter(el, text, {
        speed: 55,
        onDone: () => {
          waitingForTap = true;
          showTapIndicator();
        },
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
    if (currentTw && !currentTw.done) {
      currentTw.skip();
      return;
    }
    if (waitingForTap) {
      nextStep();
    }
  }

  mainPanel.addEventListener('click', handleClick);

  nextStep();

  // クリーンアップ関数を返す
  return () => mainPanel.removeEventListener('click', handleClick);
}

// ── ログストーリー002 ──
const LOG_STORY_2_STEPS = parseScript(`
002
「これ、いったいなんだろう」
ユウヤの手には、不思議な物体がある。
さきほどから、あなたも見つけていたものだ。
「なにかの、かけらみたい」
「見つめていると、なんだか、懐かしい気持ちになる」
「あそこにも、あるよ」
「行ってみよう」
[end: ついていく]
`);

function startLogStory2(mainPanel, { onComplete } = {}) {
  let stepIndex = 0;
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
    if (stepIndex >= LOG_STORY_2_STEPS.length) return;
    removeIndicator();
    waitingForTap = false;

    const step = LOG_STORY_2_STEPS[stepIndex];

    if (step.type === 'text') {
      const el = addEntry();
      currentTw = typewriter(el, step.text, {
        speed: 55,
        onDone: () => {
          waitingForTap = true;
          showTapIndicator();
        },
      });
      stepIndex++;

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

// ── ログストーリー003 ──
const LOG_STORY_3_STEPS = parseScript(`
003
集めた欠片が、光をはなち、互いに引き寄せられていく。
そして強まる光を見ていたあなたの頭に浮かんだ、その記憶……。
あなたは直感的にわかる。それは、今隣にいる少年のものだと。
青い光は、少年の身体に吸い込まれるように、やがて消えていった。
「今のは……おれの記憶だ」
「そうだ、……おれには、双子の弟がいた……」
ユウヤはつぶやく。
「でも、会えなくなった」
あなたはうなずく。
ユウヤは考えていたが、しばらくするとまた口を開く。
「そうだ、あの時――」
その時あなたは、木々と土の匂いを感じた。
葉のこすれる音。
視界を埋め尽くす、新緑の色。
いつの間にか、ユウヤも言葉を失っている。
あなたたちは、森の中にいた。
[end: 探索する]
`);

function startLogStory3(mainPanel, { onComplete } = {}) {
  let stepIndex = 0;
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
    if (stepIndex >= LOG_STORY_3_STEPS.length) return;
    removeIndicator();
    waitingForTap = false;
    const step = LOG_STORY_3_STEPS[stepIndex];
    if (step.type === 'text') {
      const el = addEntry();
      currentTw = typewriter(el, step.text, {
        speed: 55,
        onDone: () => { waitingForTap = true; showTapIndicator(); },
      });
      stepIndex++;
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

export { typewriter, startOpeningTutorial, startLogStory1, startLogStory2, startLogStory3 };
