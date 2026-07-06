// constellation-editor.js — 星図盤の天球を利用する星座編集画面
import { BACKGROUND_STARS, STAR_POSITIONS, createStarChart } from './star-chart.js';
import { effectSummary, resolveConstellationEffect } from './constellation-effects.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function vector(lon, lat) {
  const a = lon * Math.PI / 180;
  const b = lat * Math.PI / 180;
  const c = Math.cos(b);
  return { x: c * Math.sin(a), y: Math.sin(b), z: c * Math.cos(a) };
}

function openConstellationEditor({
  companions,
  unlocked,
  initialPath = [],
  lockedId = null,
  knownEffectIds = [],
  onComplete,
}) {
  document.querySelector('.constellation-editor-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'constellation-editor-overlay';

  // pathはstar-chart側と参照を共有するので、常にin-placeで更新する。
  const path = [...initialPath];
  let name = '';
  let confirmOpen = false;
  const knownEffects = new Set(knownEffectIds);

  overlay.innerHTML = `
    <div class="constellation-editor-head">
      <div><b>星座を作る</b><small>CONSTELLATION EDITOR</small></div>
      <span>テリシアの星から、星を結んでください</span>
    </div>
    <div class="constellation-editor-chart">
      <div class="constellation-editor-chart-tools">
        <button type="button" data-editor-action="undo">ひとつ戻す</button>
        <button type="button" data-editor-action="clear">最初から</button>
      </div>
    </div>
    <div class="constellation-editor-controls"></div>
    <div class="constellation-editor-modal-host"></div>`;

  const chartWrap = overlay.querySelector('.constellation-editor-chart');
  const chart = createStarChart({
    companions,
    unlocked: lockedId && !unlocked.includes(lockedId) ? [...unlocked, lockedId] : unlocked,
    active: [],
    constellations: [],
    onToggle: () => {},
    editor: { path, lockedId, onToggle: toggle },
  });
  chartWrap.prepend(chart);

  const controls = overlay.querySelector('.constellation-editor-controls');
  const modalHost = overlay.querySelector('.constellation-editor-modal-host');

  function companionMembers() {
    return [...new Set(path
      .filter(id => id.startsWith('companion:'))
      .map(id => id.slice(10)))];
  }

  function selectionHtml() {
    const members = companionMembers();
    return members
      .map(id => `<span>${escapeHtml(companions[id]?.name ?? id)}${lockedId && id === lockedId ? ' ✦' : ''}</span>`)
      .join('');
  }

  function pathVector(id) {
    if (id.startsWith('companion:')) {
      const position = STAR_POSITIONS[id.slice(10)];
      return position ? vector(position.lon, position.lat) : null;
    }
    if (id.startsWith('background:')) return BACKGROUND_STARS[Number(id.slice(11))]?.point ?? null;
    return null;
  }

  function constellationPreviewSvg() {
    const rawPoints = path.map(pathVector).filter(Boolean);
    if (rawPoints.length === 0) return '';

    const points = rawPoints.map(point => ({ x: point.x, y: -point.y }));
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const width = Math.max(.001, maxX - minX);
    const height = Math.max(.001, maxY - minY);
    const size = 132;
    const padding = 20;
    const scale = Math.min((size - padding * 2) / width, (size - padding * 2) / height);
    const offsetX = (size - width * scale) / 2;
    const offsetY = (size - height * scale) / 2;
    const projected = points.map(point => ({
      x: offsetX + (point.x - minX) * scale,
      y: offsetY + (point.y - minY) * scale,
    }));
    const polyline = projected.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const stars = projected.map((point, index) => {
      const id = path[index];
      const isCompanion = id?.startsWith('companion:');
      const radius = isCompanion ? 3.7 : 2.2;
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius}" class="${isCompanion ? 'main' : 'minor'}"/>`;
    }).join('');
    return `
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <polyline points="${polyline}"/>
        ${stars}
      </svg>`;
  }

  function renderControls() {
    const members = companionMembers();
    controls.innerHTML = `
      <div class="constellation-editor-selection">${selectionHtml()}</div>
      <div class="constellation-editor-actions edit-actions">
        <button type="button" class="constellation-editor-complete">星座を作る</button>
      </div>`;

    const makeButton = controls.querySelector('.constellation-editor-complete');
    makeButton.disabled = members.length < 2;
    makeButton.addEventListener('click', () => {
      if (makeButton.disabled) return;
      openConfirmModal();
    });
  }

  function toggle(id) {
    if (confirmOpen) return;
    const companionId = id.startsWith('companion:') ? id.slice(10) : null;
    if (lockedId && companionId === lockedId) return;

    const index = path.indexOf(id);
    if (index >= 0) path.splice(index, 1);
    else if (path.length < 12) path.push(id);

    chart.chartApi?.refreshEditorState();
    renderControls();
  }

  function undo() {
    if (confirmOpen || path.length <= 1) return;
    path.pop();
    chart.chartApi?.refreshEditorState();
    renderControls();
  }

  function clear() {
    if (confirmOpen) return;
    path.splice(1);
    chart.chartApi?.refreshEditorState();
    renderControls();
  }

  function openConfirmModal() {
    confirmOpen = true;
    const resolvedEffect = resolveConstellationEffect(companionMembers());
    const effectKnown = knownEffects.has(resolvedEffect.id);
    let effectRevealed = effectKnown;
    modalHost.innerHTML = `
      <div class="constellation-editor-modal-backdrop">
        <section class="constellation-editor-modal" role="dialog" aria-modal="true">
          <div class="constellation-editor-confirm-title">作った星座を確認する</div>
          <div class="constellation-editor-confirm-note">この星座に参加する仲間</div>
          <div class="constellation-editor-preview">${constellationPreviewSvg()}</div>
          <div class="constellation-editor-selection">${selectionHtml()}</div>
          <div class="constellation-editor-name-row">
            <label class="constellation-editor-name-field">
              <small>名前を付ける</small>
              <input maxlength="16" placeholder="星座名" value="${escapeHtml(name)}">
            </label>
            <button type="button" class="constellation-editor-complete">${effectKnown ? 'OK' : '名前を付ける'}</button>
          </div>
          <div class="constellation-editor-effect-space">
            <small>星座の効果</small>
            <strong>${escapeHtml(effectKnown ? resolvedEffect.name : '？？？')}</strong>
            <p>${escapeHtml(effectKnown ? effectSummary(resolvedEffect) : 'まだ知らない星座の力。名前を付けると判明する。')}</p>
          </div>
          <div class="constellation-editor-confirm-actions single">
            <button type="button" data-editor-action="back">戻る</button>
          </div>
        </section>
      </div>`;

    const input = modalHost.querySelector('input');
    const complete = modalHost.querySelector('.constellation-editor-complete');
    const backButton = modalHost.querySelector('[data-editor-action="back"]');
    const effectName = modalHost.querySelector('.constellation-editor-effect-space strong');
    const effectBody = modalHost.querySelector('.constellation-editor-effect-space p');
    complete.disabled = !name.trim();

    input.addEventListener('input', () => {
      name = input.value;
      complete.disabled = !name.trim();
    });
    backButton.addEventListener('click', () => {
      if (input.disabled) {
        completeConstellation();
        return;
      }
      closeConfirmModal();
    });
    complete.addEventListener('click', () => {
      if (complete.disabled) return;
      if (!effectRevealed) {
        effectRevealed = true;
        knownEffects.add(resolvedEffect.id);
        input.disabled = true;
        effectName.textContent = resolvedEffect.name;
        effectBody.textContent = effectSummary(resolvedEffect);
        complete.textContent = 'OK';
        backButton.textContent = 'OK';
        return;
      }
      completeConstellation();
    });
  }

  function closeConfirmModal() {
    confirmOpen = false;
    modalHost.innerHTML = '';
  }

  function completeConstellation() {
    if (!name.trim()) return;
    const finalMembers = companionMembers();
    const resolvedEffect = resolveConstellationEffect(finalMembers);
    const connections = path.slice(1).map((id, index) => [path[index], id]);

    overlay.classList.add('completing');
    setTimeout(() => {
      overlay.remove();
      onComplete?.({ name: name.trim(), members: finalMembers, path: [...path], connections, effect: resolvedEffect });
    }, 900);
  }

  overlay.querySelector('[data-editor-action="undo"]').addEventListener('click', undo);
  overlay.querySelector('[data-editor-action="clear"]').addEventListener('click', clear);

  document.body.appendChild(overlay);
  renderControls();
  return () => overlay.remove();
}

export { openConstellationEditor };
