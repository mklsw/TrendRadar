// Surge Panel: AI Connectivity Pro v2.1
const VERSION = 'v2.1.0';

const DEFAULT_CONFIG = {
  title: 'AI Connectivity Pro',
  icon: 'network',
  color: '#00AEEF',
  timeout: 5500,
  group: 'all',
  showStatus: true,
  showIP: true,
  showNode: true,
};

const TARGETS = [
  { group: 'ai', name: 'OpenAI', url: 'https://api.openai.com/v1/models', ok: [200, 401, 403] },
  { group: 'ai', name: 'Claude', url: 'https://api.anthropic.com/v1/messages', ok: [200, 400, 401, 403, 404, 405] },
  { group: 'ai', name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models', ok: [200, 400, 401, 403] },
  { group: 'ai', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models', ok: [200, 401, 403] },
  { group: 'ai', name: 'HuggingFace', url: 'https://huggingface.co', ok: [200, 301, 302, 403] },

  { group: 'dev', name: 'GitHub', url: 'https://github.com', ok: [200] },
  { group: 'dev', name: 'GitHub Raw', url: 'https://raw.githubusercontent.com', ok: [200, 301, 302, 400, 404] },
  { group: 'dev', name: 'GitHub API', url: 'https://api.github.com/rate_limit', ok: [200, 403] },
  { group: 'dev', name: 'NPM', url: 'https://registry.npmjs.org/-/ping', ok: [200, 404] },
  { group: 'dev', name: 'Docker Hub', url: 'https://registry-1.docker.io/v2/', ok: [200, 401] },
  { group: 'dev', name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace', ok: [200] },

  { group: 'work', name: 'Feishu', url: 'https://open.feishu.cn', ok: [200, 301, 302, 403] },
  { group: 'work', name: 'Lark', url: 'https://open.larksuite.com', ok: [200, 301, 302, 403] },
  { group: 'work', name: 'Microsoft 365', url: 'https://login.microsoftonline.com', ok: [200, 301, 302, 400, 401, 403] },

  { group: 'china', name: 'Baidu', url: 'https://www.baidu.com', ok: [200] },
  { group: 'china', name: 'Bilibili', url: 'https://www.bilibili.com', ok: [200] },
  { group: 'china', name: 'Aliyun', url: 'https://www.aliyun.com', ok: [200, 301, 302, 403] },

  { group: 'network', name: 'Google 204', url: 'https://www.google.com/generate_204', ok: [204] },
  { group: 'network', name: 'Apple', url: 'https://www.apple.com/library/test/success.html', ok: [200] },
  { group: 'dns', name: 'CF DoH', url: 'https://cloudflare-dns.com/dns-query?name=api.openai.com&type=A', ok: [200], accept: 'application/dns-json' },
  { group: 'dns', name: 'Google DoH', url: 'https://dns.google/resolve?name=api.anthropic.com&type=A', ok: [200] },
];

const GROUP_ORDER = ['ai', 'dev', 'work', 'china', 'network', 'dns'];
const GROUP_NAMES = { ai: '🤖 AI', dev: '💻 Dev', work: '🏢 Work', china: '🇨🇳 China', network: '🌐 Network', dns: '🧭 DoH' };
const config = Object.assign({}, DEFAULT_CONFIG, parseArgument(typeof $argument !== 'undefined' ? $argument : ''));

(async () => {
  const started = Date.now();
  const targets = pickTargets(TARGETS, config.group);
  const meta = await getMeta();
  const rows = (await Promise.allSettled(targets.map(t => probe(t, config.timeout)))).map(r => r.status === 'fulfilled' ? r.value : failRow());

  $done({
    title: config.title,
    content: render(meta, rows, Date.now() - started),
    icon: config.icon,
    'icon-color': config.color,
  });
})();

function probe(target, timeout) {
  return new Promise(resolve => {
    const start = Date.now();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ group: target.group, name: target.name, ok: false, cost: timeout, status: 'timeout' });
    }, timeout);

    const headers = { 'User-Agent': 'Surge AI Connectivity Pro', 'Cache-Control': 'no-cache' };
    if (target.accept) headers.Accept = target.accept;

    $httpClient.get({ url: target.url, headers }, (err, resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const cost = Date.now() - start;
      if (err) return resolve({ group: target.group, name: target.name, ok: false, cost, status: 'error' });
      const status = resp && resp.status ? Number(resp.status) : 0;
      resolve({ group: target.group, name: target.name, ok: target.ok.indexOf(status) !== -1, cost, status });
    });
  });
}

function getMeta() {
  return new Promise(resolve => {
    const meta = { ip: '', loc: '', colo: '', wifi: '' };
    try { if (typeof $network !== 'undefined' && $network.wifi) meta.wifi = $network.wifi.ssid || ''; } catch (e) {}

    if (!config.showIP) return resolve(meta);

    $httpClient.get('https://1.1.1.1/cdn-cgi/trace', (err, resp, data) => {
      if (!err && data) {
        String(data).split('\n').forEach(line => {
          const p = line.split('=');
          if (p[0] === 'ip') meta.ip = p[1];
          if (p[0] === 'loc') meta.loc = p[1];
          if (p[0] === 'colo') meta.colo = p[1];
        });
      }
      resolve(meta);
    });
  });
}

function render(meta, rows, total) {
  const lines = [];
  const aiRows = rows.filter(r => r.group === 'ai');
  const aiOk = aiRows.length > 0 && aiRows.every(r => r.ok);
  const openai = find(rows, 'OpenAI');
  const claude = find(rows, 'Claude');
  const gemini = find(rows, 'Gemini');

  lines.push(`${aiOk ? '🟢' : '🔴'} ${aiOk ? 'AI Ready' : 'AI Degraded'} · ${VERSION}`);
  lines.push([costText(openai), costText(claude), costText(gemini)].filter(Boolean).join(' · '));
  if (meta.ip) lines.push(`出口 ${meta.ip}${meta.loc ? ' · ' + meta.loc : ''}${meta.colo ? ' · ' + meta.colo : ''}`);
  if (meta.wifi) lines.push(`Wi‑Fi ${meta.wifi}`);
  lines.push('');

  const grouped = {};
  rows.forEach(r => { if (!grouped[r.group]) grouped[r.group] = []; grouped[r.group].push(r); });

  GROUP_ORDER.forEach(g => {
    if (!grouped[g]) return;
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push(GROUP_NAMES[g] || g);
    grouped[g].forEach(r => lines.push(rowText(r)));
  });

  const ok = rows.filter(r => r.ok).length;
  const failed = rows.filter(r => !r.ok);
  lines.push('');
  lines.push(`✅ ${ok}/${rows.length} reachable · total ${total} ms`);
  if (failed.length) lines.push(`❌ ${failed.map(r => r.name).join(', ')}`);
  return lines.join('\n');
}

function rowText(r) {
  let s = `${r.ok ? '✅' : '❌'} ${padRight(r.name, 13)} ${padLeft(r.cost, 5)} ms`;
  if (config.showStatus) s += ` · ${r.status}`;
  return s;
}

function costText(r) { return r ? `${r.name} ${r.cost}ms` : ''; }
function find(rows, name) { return rows.find(r => r.name === name); }
function failRow() { return { group: 'unknown', name: 'Unknown', ok: false, cost: config.timeout, status: 'error' }; }
function pickTargets(targets, group) { if (!group || group === 'all') return targets; const gs = String(group).split(',').map(s => s.trim()); return targets.filter(t => gs.indexOf(t.group) !== -1); }
function padRight(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function padLeft(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

function parseArgument(argument) {
  const out = {};
  if (!argument) return out;
  argument.split('&').forEach(pair => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    const k = decodeURIComponent(pair.slice(0, i));
    const v = decodeURIComponent(pair.slice(i + 1));
    if (k === 'title') out.title = v;
    if (k === 'icon') out.icon = v;
    if (k === 'color') out.color = v;
    if (k === 'group') out.group = v;
    if (k === 'showStatus') out.showStatus = v !== 'false';
    if (k === 'showIP') out.showIP = v !== 'false';
    if (k === 'showNode') out.showNode = v !== 'false';
    if (k === 'timeout') {
      const t = Number(v);
      if (!Number.isNaN(t) && t >= 1000 && t <= 15000) out.timeout = t;
    }
  });
  return out;
}
