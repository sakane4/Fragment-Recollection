// logs.js — アクション中に表示するフレーバーテキスト定義

const ACTION_LOGS = {
  explore: [
    '探索を行っています...',
    'なにかが見つかりそうです...',
    '風が吹いています...',
  ],
};

// minMs〜maxMsの間でランダムなミリ秒を返す
function randomInterval(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// アクション中にランダムなタイミングでコールバックを呼び続けるスケジューラー
// stop() を呼ぶまで繰り返す
function startFlavorScheduler(actionId, onLog, { minMs = 3000, maxMs = 7000 } = {}) {
  const texts = ACTION_LOGS[actionId];
  if (!texts || texts.length === 0) return () => {};

  let timer = null;
  let stopped = false;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      if (stopped) return;
      const text = texts[Math.floor(Math.random() * texts.length)];
      onLog(text);
      schedule();
    }, randomInterval(minMs, maxMs));
  }

  schedule();

  return function stop() {
    stopped = true;
    clearTimeout(timer);
  };
}

export { ACTION_LOGS, startFlavorScheduler };
