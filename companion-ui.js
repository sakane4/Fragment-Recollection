// companion-ui.js — 同行タブの一覧表示
import { CONSTELLATIONS, sameMembers } from './constellations.js';
import { createStarChart } from './star-chart.js';

const COMPANION_DATA = {
  yuya:   { name: 'ユウヤ', starName: 'salvus',     mark:'✧', color: '#3a8fff', desc: '記憶を失った少年。何かを探している。' },
  rabi:   { name: 'ラビ',   starName: 'Salvis',     mark:'◇', color: '#ff3f3f', desc: '盲目の剣士。' },
  shizuku:{ name: 'シズク', starName: 'Helianthus', mark:'□', color: '#b0bac4', desc: '寡黙な青年。' },
  kaoru:  { name: 'カオル', starName: 'pensée',     mark:'○', color: '#ff6fa8', desc: 'いつも笑顔のお姉さん。' },
  yukika: { name: '雪架',   starName: 'Pieris',     mark:'△', color: '#3fd4ff', desc: 'なにか秘密を知っているようだ。' },
  tericia:{ name: 'テリシア',starName: '未命名星',   mark:'✦', color: '#9d8cff', desc: '星に名前をつけることを愛する少女。' },
};

function createCompanionTabRenderer({
  getState,
  buildDetail,
  showTabToast,
  changeCompanion,
  replaceParty,
}) {
  let previousUnlocked = null;
  let openSection = null;
  let selectedRecordId = null;
  document.addEventListener('fr:close-companion-lower', () => {
    if (!openSection) return;
    openSection = null;
    renderCharTab(getState());
  });

  function renderCharTab(state) {
    const view = document.getElementById('view-chars');
    const active = (state.activeCompanions ?? []).slice(0, 5);
    const busy = Object.keys(state.companionTasks ?? {});
    const unlocked = state.unlockedCompanions ?? [];
    const discovered = [
      ...CONSTELLATIONS.filter(item => state.discoveredConstellations?.includes(item.id)),
      ...(state.customConstellations ?? []).map(item => ({
        mark:'✦',
        description:'あなたが星を結び、名前を与えた星座',
        ...item,
      })),
    ];

    view.innerHTML = '';
    view.classList.toggle('lower-section-open', !!openSection);

    const chart = createStarChart({
      companions: COMPANION_DATA,
      unlocked,
      active,
      busy,
      constellations: discovered,
      onToggle: (id, makeActive) => changeCompanion(id, makeActive),
      inspectMode: openSection === 'records',
      inspectedId: selectedRecordId,
      onInspect: (id) => {
        selectedRecordId = id;
        renderCharTab(getState());
        document.getElementById('sub-panel')?.scrollTo({ top: 0, behavior: 'auto' });
      },
    });
    view.appendChild(chart);

    const tabs = document.createElement('div');
    tabs.className = 'companion-lower-tabs';
    tabs.innerHTML = `
      <button type="button" data-section="constellations" class="${openSection === 'constellations' ? 'active' : ''}">発見した星座 <small>${discovered.length}</small></button>
      <button type="button" data-section="records" class="${openSection === 'records' ? 'active' : ''}">人物詳細</button>`;
    tabs.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        const next = button.dataset.section;
        openSection = openSection === next ? null : next;
        if (openSection === 'records') selectedRecordId = null;
        const mainPanelWrap = document.getElementById('main-panel-wrap');
        if (openSection) {
          if (mainPanelWrap) mainPanelWrap.style.height = '60px';
        } else if (mainPanelWrap) {
          const app = document.getElementById('app');
          mainPanelWrap.style.height = `${(app?.clientHeight ?? window.innerHeight) * 0.45}px`;
        }
        renderCharTab(getState());
        document.getElementById('sub-panel')?.scrollTo({ top:0, behavior:'auto' });
      });
    });
    view.appendChild(tabs);

    if (openSection === 'constellations') {
      const list = document.createElement('div');
      list.className = 'star-chart-discovered-list companion-lower-content';
      if (!discovered.length) list.innerHTML = '<div class="party-empty">まだ星座は見つかっていない</div>';
      for (const constellation of discovered) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `star-chart-preset${sameMembers(active,constellation.members) ? ' active' : ''}`;
        const names = constellation.members.map(id => COMPANION_DATA[id]?.name ?? id).join('・');
        button.innerHTML = `<span class="star-chart-preset-mark">${constellation.mark}</span><span><b>${constellation.name}</b><small>${constellation.description}</small></span><em>${names}</em>`;
        button.addEventListener('click', () => replaceParty(constellation.members));
        list.appendChild(button);
      }
      view.appendChild(list);
    } else if (openSection === 'records') {
      const detailArea = document.createElement('div');
      detailArea.className = 'companion-record-detail companion-lower-content';
      if (selectedRecordId && unlocked.includes(selectedRecordId)) {
        detailArea.appendChild(buildDetail(selectedRecordId, state));
      } else {
        detailArea.innerHTML = '<div class="party-empty companion-inspect-hint">星図盤の星、または右側の人物ボタンを選んでください</div>';
      }
      view.appendChild(detailArea);
    }

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
