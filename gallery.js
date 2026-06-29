const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogg']);

const state = {
  items: [],
  visible: [],
  filter: 'all',
  query: '',
  current: -1,
};

const els = {};

function mediaType(path) {
  const ext = path.split('.').pop().toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

function titleFor(path) {
  const name = path.split('/').pop() || path;
  return name.replace(/\.[^.]+$/, '');
}

async function loadManifest() {
  try {
    const response = await fetch('./resource/gallery/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const entries = await response.json();
    state.items = entries
      .map(entry => typeof entry === 'string' ? { src: entry } : entry)
      .map(entry => ({
        ...entry,
        src: `./resource/gallery/${entry.src.replace(/^\.?\//, '')}`,
        type: entry.type || mediaType(entry.src),
        title: entry.title || titleFor(entry.src),
      }))
      .filter(entry => entry.type);
  } catch (error) {
    console.warn('Gallery manifest could not be loaded.', error);
    state.items = [];
  }
}

function render() {
  const query = state.query.trim().toLocaleLowerCase('ja');
  state.visible = state.items.filter(item => {
    const matchesType = state.filter === 'all' || item.type === state.filter;
    const matchesQuery = !query || item.title.toLocaleLowerCase('ja').includes(query);
    return matchesType && matchesQuery;
  });

  els.grid.replaceChildren();
  els.empty.hidden = state.visible.length > 0;

  state.visible.forEach((item, index) => {
    const button = document.createElement('button');
    button.className = 'gallery-item';
    button.type = 'button';
    button.title = item.title;
    button.setAttribute('aria-label', item.title);

    if (item.type === 'image') {
      const image = document.createElement('img');
      image.src = item.src;
      image.alt = item.title;
      image.loading = 'lazy';
      button.appendChild(image);
    } else {
      const video = document.createElement('video');
      video.src = item.src;
      video.preload = 'metadata';
      video.muted = true;
      button.appendChild(video);
      const mark = document.createElement('span');
      mark.className = 'gallery-video-mark';
      mark.textContent = '▶';
      button.appendChild(mark);
    }

    button.addEventListener('click', () => openViewer(index));
    els.grid.appendChild(button);
  });
}

function showCurrent() {
  const item = state.visible[state.current];
  if (!item) return closeViewer();

  els.stage.replaceChildren();
  const media = document.createElement(item.type === 'image' ? 'img' : 'video');
  media.src = item.src;
  if (item.type === 'image') {
    media.alt = item.title;
  } else {
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
  }
  els.stage.appendChild(media);
  els.title.textContent = item.title;
  els.count.textContent = `${state.current + 1} / ${state.visible.length}`;
  els.prev.disabled = state.current === 0;
  els.next.disabled = state.current === state.visible.length - 1;
}

function openViewer(index) {
  state.current = index;
  els.overlay.classList.add('open');
  els.overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  showCurrent();
}

function closeViewer() {
  els.overlay.classList.remove('open');
  els.overlay.setAttribute('aria-hidden', 'true');
  els.stage.replaceChildren();
  document.body.style.overflow = '';
  state.current = -1;
}

function move(delta) {
  const next = state.current + delta;
  if (next < 0 || next >= state.visible.length) return;
  state.current = next;
  showCurrent();
}

export async function initGallery() {
  Object.assign(els, {
    grid: document.getElementById('gallery-grid'),
    empty: document.getElementById('gallery-empty'),
    search: document.getElementById('gallery-search'),
    overlay: document.getElementById('gallery-overlay'),
    stage: document.getElementById('gallery-stage'),
    title: document.getElementById('gallery-viewer-title'),
    count: document.getElementById('gallery-viewer-count'),
    prev: document.getElementById('gallery-prev'),
    next: document.getElementById('gallery-next'),
    close: document.getElementById('gallery-close'),
  });
  if (!els.grid) return;

  els.search.addEventListener('input', event => {
    state.query = event.target.value;
    render();
  });
  document.querySelectorAll('[data-gallery-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.galleryFilter;
      document.querySelectorAll('[data-gallery-filter]').forEach(candidate => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });
  els.prev.addEventListener('click', () => move(-1));
  els.next.addEventListener('click', () => move(1));
  els.close.addEventListener('click', closeViewer);
  document.addEventListener('keydown', event => {
    if (!els.overlay.classList.contains('open')) return;
    if (event.key === 'Escape') closeViewer();
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
  });

  await loadManifest();
  render();
}
