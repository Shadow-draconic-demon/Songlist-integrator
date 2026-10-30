const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const queueLifetimeMs = 45 * 60 * 1000;
const queueLog = [];
const requestWindows = new Map();
const requestLimit = 10;
const requestWindowMs = 10 * 60 * 1000;
let queueDay = getDayKey();

function getDayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function cleanQueue() {
  const today = getDayKey();
  if (queueDay !== today) {
    queueLog.length = 0;
    queueDay = today;
  }
  const now = Date.now();
  for (let index = queueLog.length - 1; index >= 0; index -= 1) {
    if (queueLog[index].expiresAt <= now) queueLog.splice(index, 1);
  }
}

function addToQueue(payload) {
  cleanQueue();
  const song = {
    id: crypto.randomUUID(),
    title: payload.title,
    artist: payload.artist || 'Artist not specified',
    requester: payload.requester || '@viewer',
    expiresAt: Date.now() + queueLifetimeMs
  };
  queueLog.push(song);
  return song;
}

function isRateLimited(request) {
  const now = Date.now();
  const address = request.socket.remoteAddress || 'unknown';
  const recentRequests = (requestWindows.get(address) || []).filter((timestamp) => now - timestamp < requestWindowMs);
  if (recentRequests.length >= requestLimit) return true;
  recentRequests.push(now);
  requestWindows.set(address, recentRequests);
  return false;
}

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}

loadEnv();

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function discordMessage(payload) {
  return { content: `New song request from ${payload.requester || '@viewer'}: ${payload.title} - ${payload.artist}` };
}

async function postToDiscord(payload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL is not configured');
  const result = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordMessage(payload))
  });
  if (!result.ok) throw new Error(`Discord returned ${result.status}`);
}

function serveFile(request, response) {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/queue') {
    cleanQueue();
    return sendJson(response, 200, { queue: queueLog });
  }

  if (request.method === 'DELETE' && request.url === '/api/queue') {
    queueLog.length = 0;
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === 'POST' && request.url === '/api/discord/song-request') {
    if (isRateLimited(request)) return sendJson(response, 429, { error: 'Too many requests. Try again later.' });
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.title) return sendJson(response, 400, { error: 'Song title is required' });
        await postToDiscord(payload);
        const song = addToQueue(payload);
        sendJson(response, 200, { ok: true, song });
      } catch (error) {
        sendJson(response, 500, { error: 'Unable to send Discord message' });
      }
    });
    return;
  }
  serveFile(request, response);
});

server.listen(port, () => console.log(`WaveQueue running at http://localhost:${port}`));