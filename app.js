const form = document.querySelector('#request-form');
const requesterInput = document.querySelector('#requester-input');
const input = document.querySelector('#song-input');
const queue = document.querySelector('#queue-list');
const queueCount = document.querySelector('#queue-count');
const toast = document.querySelector('#toast');
let toastTimer;
let queueItems = [];
let showMineOnly = false;
let currentRequester = '';

const palette = ['art-one', 'art-two', 'art-three', 'art-four', 'art-five', 'art-six'];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function parseSongRequest(value) {
  const match = value.match(/\s+-\s+|\s+by\s+/i);
  if (!match) return { title: value.trim(), artist: 'Artist not specified' };
  const [title, artist] = value.split(match[0]);
  return { title: title.trim(), artist: artist.trim() || 'Artist not specified' };
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function updateQueueSummary() {
  queueCount.textContent = String(queueItems.length).padStart(2, '0');
}

function renderSong(song) {
  const item = document.createElement('article');
  const artClass = palette[queueItems.indexOf(song) % palette.length];
  item.className = 'queue-item';
  item.dataset.requester = song.requester;
  item.innerHTML = `<span class="drag-handle">⁙</span><span class="track-art ${artClass}">${escapeHtml(song.artist.slice(0, 2).toUpperCase())}</span><div class="track-info"><strong>${escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist)}</span></div><span class="requester">${escapeHtml(song.requester)}</span><button class="more-button" type="button" aria-label="More options">•••</button>`;
  item.hidden = showMineOnly && song.requester !== currentRequester;
  queue.append(item);
  const remaining = Math.max(0, song.expiresAt - Date.now());
  setTimeout(() => {
    queueItems = queueItems.filter((currentSong) => currentSong.id !== song.id);
    renderQueue();
  }, remaining);
}

function renderQueue() {
  queue.innerHTML = '';
  queueItems.forEach(renderSong);
  updateQueueSummary();
}

async function loadQueue() {
  try {
    const response = await fetch('/api/queue');
    if (!response.ok) throw new Error('Queue unavailable');
    const data = await response.json();
    queueItems = data.queue;
    renderQueue();
  } catch (error) {
    queueItems = [];
    renderQueue();
  }
}

async function notifyDiscord(title, artist, requester) {
  try {
    const response = await fetch('/api/discord/song-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist, requester })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.error || 'Song request failed');
      return;
    }
    await loadQueue();
    showToast(`Added “${title}” to the queue`);
  } catch (error) {
    showToast('Added locally, but Discord is unavailable');
  }
}

function addSong(title, artist, requester = currentRequester) {
  notifyDiscord(title, artist, requester);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const requester = requesterInput.value.trim().replace(/^@+/, '');
  const { title, artist } = parseSongRequest(input.value);
  if (!requester || !title || artist === 'Artist not specified') {
    showToast('Enter your name, song title, and artist');
    return;
  }
  currentRequester = `@${requester}`;
  addSong(title, artist, currentRequester);
  input.value = '';
});

document.querySelectorAll('.suggestion').forEach((button) => {
  button.addEventListener('click', () => addSong(button.dataset.song, button.dataset.artist, button.dataset.time));
});

document.querySelector('#clear-button').addEventListener('click', () => {
  fetch('/api/queue', { method: 'DELETE' })
    .then(() => { queueItems = []; renderQueue(); showToast('Queue cleared'); })
    .catch(() => showToast('Unable to clear queue'));
});

document.querySelector('#filter-button').addEventListener('click', (event) => {
  const filter = event.currentTarget;
  showMineOnly = !showMineOnly;
  filter.firstChild.textContent = showMineOnly ? 'MY REQUESTS ' : 'ALL ';
  renderQueue();
});

loadQueue();