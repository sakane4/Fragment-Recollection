// companion-ui.js — 同行タブの一覧表示

const COMPANION_DATA = {
  yuya:   { name: 'ユウヤ', desc: '記憶を失った少年。何かを探している。' },
  rabi:   { name: 'ラビ', desc: '盲目の剣士。' },
  shizuku:{ name: 'シズク', desc: '寡黙な青年。' },
  kaoru:  { name: 'カオル', desc: 'いつも笑顔のお姉さん。' },
  yukika: { name: '雪架', desc: 'なにか秘密を知っているようだ。' },
};

function createCompanionTabRenderer({
  getState,
  rewards,
  resLabel,
  levelTagHtml,
  buildDetail,
  attachDragHandlers,
  showTabToast,
}) {
  let previousUnlocked = null;
  const expandedIds = new Set();

  function createCard(id, state, active) {
    const data = COMPANION_DATA[id];
    if (!data) return null;
    const card = document.createElement('div');
    card.className = active ? 'companion-card companion-card--active' : 'companion-card';
    card.innerHTML = `<div class="companion-name">${data.name}${levelTagHtml(state.ELv?.[id] ?? 0)}</div><div class="companion-desc">${data.desc}</div>`;

    if (!active) {
      const detailBtn = document.createElement('button');
      detailBtn.className = 'companion-btn companion-btn--skill';
      detailBtn.textContent = '詳細';
      detailBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        expandedIds.add(id);
        renderCharTab(getState());
      });
      card.appendChild(detailBtn);
    }

    const handle = document.createElement('div');
    handle.className = 'party-drag-handle';
    handle.textContent = '⠿';
    card.appendChild(handle);
    attachDragHandlers(handle, card, id);
    card.addEventListener('click', () => {
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderCharTab(getState());
    });
    return card;
  }

  function appendCompanions(section, ids, state, active) {
    for (const id of ids) {
      const card = createCard(id, state, active);
      if (!card) continue;
      section.appendChild(card);
      if (expandedIds.has(id)) section.appendChild(buildDetail(id, state));
    }
  }

  function renderCharTab(state) {
    const view = document.getElementById('view-chars');
    view.innerHTML = '<div class="sub-title">同行</div>';
    const active = state.activeCompanions ?? [];
    const unlocked = state.unlockedCompanions ?? [];
    const bench = unlocked.filter(id => !active.includes(id));

    const activeSection = document.createElement('div');
    activeSection.className = 'party-section';
    activeSection.dataset.partyZone = 'active';
    activeSection.innerHTML = '<div class="party-label">同行中</div>';
    const playerCard = document.createElement('div');
    playerCard.className = 'companion-card companion-card--fixed';
    playerCard.innerHTML = `<div class="companion-name">${state.playerName || 'あなた'}</div><div class="companion-desc">（あなた）</div>`;
    activeSection.appendChild(playerCard);
    appendCompanions(activeSection, active, state, true);

    if (active.length > 0) {
      const bonusLines = [`探索報酬 ×${1 + active.length}`];
      for (const id of active) {
        for (const reward of rewards[id] ?? []) {
          const discovered = (state.discoveredResources ?? []).includes(reward.resource);
          bonusLines.push(discovered ? `${resLabel(reward.resource)} ` : '???');
        }
      }
      const bonus = document.createElement('div');
      bonus.className = 'party-bonus';
      bonus.innerHTML = bonusLines.map((line, index) =>
        index === 0 ? line : `<span class="party-bonus-extra">${line}</span>`
      ).join('<span class="party-bonus-sep"> / </span>');
      activeSection.appendChild(bonus);
    }
    view.appendChild(activeSection);

    const benchSection = document.createElement('div');
    benchSection.className = 'party-section';
    benchSection.dataset.partyZone = 'bench';
    benchSection.innerHTML = '<div class="party-label">別行動</div>';
    if (bench.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'party-empty';
      empty.textContent = unlocked.length === 0 ? 'まだ誰もいない' : '全員が同行中';
      benchSection.appendChild(empty);
    }
    appendCompanions(benchSection, bench, state, false);
    view.appendChild(benchSection);

    if (previousUnlocked !== null) {
      const newlyUnlocked = unlocked.filter(id => !previousUnlocked.includes(id));
      if (newlyUnlocked.length > 0) {
        showTabToast('.tab-btn[data-view="view-chars"]', '同行者を選択できます');
      }
    }
    previousUnlocked = [...unlocked];
  }

  return renderCharTab;
}

export { COMPANION_DATA, createCompanionTabRenderer };
