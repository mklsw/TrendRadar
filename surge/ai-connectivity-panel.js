// Surge Panel: AI Network Dashboard v3
// Combines AI reachability, public exit info, Wi-Fi info and Surge traffic API.

const VERSION = 'v3.0.0';

const DEFAULT_CONFIG = {
  title: 'AI Network Dashboard',
  icon: 'network',
  color: '#00AEEF',
  timeout: 5500,
  mode: 'dashboard', // dashboard | full | ai-only
  group: 'all',
  showStatus: true,
  showIP: true,
  showTraffic: true,
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
  const targets = pickTargets(TARGETS, config.group, config.mode);
  const metaPromise = getMeta(config.timeout);
  const trafficPromise = config.showTraffic ? getTraffic() : Promise.resolve(null);
  const rowsPromise = Promise.allSettled(targets.map(t => probe(t, config.timeout)));

  const meta = await metaPromise;
  const traffic = await trafficPromise;
  const rows = (await rowsPromise).map(r => r.status === 'fulfilled' ? r.value : failRow());

  $done({
    title: config.title,
    content: render(meta, traffic, rows, Date.now() - started),
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

    const headers = { 'User-Agent': 'Surge AI Network Dashboard', 'Cache-Control': 'no-cache' };
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

function getMeta(timeout) {
  return new Promise(resolve => {
    const meta = { ip: '', loc: '', colo: '', isp: '', as: '', city: '', country: '', wifi: '', deviceIP: '' };

    try {
      if (typeof $network !== 'undefined') {
        if ($network.wifi) meta.wifi = $network.wifi.ssid || '';
        if ($network.v4) meta.deviceIP = $network.v4.primaryAddress || '';
      }
    } catch (e) {}

    if (!config.showIP) return resolve(meta);

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(meta);
    }, timeout);

    $httpClient.get('https://1.1.1.1/cdn-cgi/trace', (err, resp, data) => {
      if (finished) return;
      if (!err && data) {
        String(data).split('\n').forEach(line => {
          const p = line.split('=');
          if (p[0] === 'ip') meta.ip = p[1];
          if (p[0] === 'loc') meta.loc = p[1];
          if (p[0] === 'colo') meta.colo = p[1];
        });
      }

      if (!meta.ip) {
        finished = true;
        clearTimeout(timer);
        resolve(meta);
        return;
      }

      const url = `http://ip-api.com/json/${meta.ip}?fields=status,country,city,isp,as,query`;
      $httpClient.get(url, (err2, resp2, body) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          const json = JSON.parse(body || '{}');
          if (json.status === 'success') {
            meta.country = json.country || '';
            meta.city = json.city || '';
            meta.isp = json.isp || '';
            meta.as = json.as || '';
          }
        } catch (e) {}
        resolve(meta);
      });
    });
  });
}

function getTraffic() {
  return new Promise(resolve => {
    try {
      if (typeof $httpAPI === 'undefined') return resolve(null);
      $httpAPI('GET', '/v1/traffic', null, data => resolve(normalizeTraffic(data)));
    } catch (e) {
      resolve(null);
    }
  });
}

function normalizeTraffic(data) {
  if (!data) return null;
  const rows = [];
  const source = data.interface || data.interfaces || data;
  Object.keys(source).forEach(key => {
    const item = source[key] || {};
    rows.push({
      name: mapInterfaceName(key),
      raw: key,
      in: Number(item.in || item.download || item.rx || item.bytesIn || 0),
      out: Number(item.out || item.upload || item.tx || item.bytesOut || 0),
      inSpeed: Number(item.inCurrentSpeed || item.downloadSpeed || item.rxSpeed || item.currentInSpeed || 0),
      outSpeed: Number(item.outCurrentSpeed || item.uploadSpeed || item.txSpeed || item.currentOutSpeed || 0),
    });
  });
  return rows.filter(r => r.in || r.out || r.inSpeed || r.outSpeed).slice(0, 4);
}

function mapInterfaceName(name) {
  if (/pdp_ip/i.test(name)) return '蜂窝网络';
  if (/en\d|bridge|awdl/i.test(name)) return 'Wi‑Fi/Ethernet';
  if (/lo/i.test(name)) return '回环网络';
  return name;
}

function render(meta, traffic, rows, total) {
  if (config.mode === 'full') return renderFull(meta, traffic, rows, total);
  if (config.mode === 'ai-only') return renderAiOnly(meta, rows, total);
  return renderDashboard(meta, traffic, rows, total);
}

function renderDashboard(meta, traffic, rows, total) {
  const lines = [];
  const coreAi = ['OpenAI', 'Claude', 'Gemini'];
  const coreAiOk = coreAi.every(name => find(rows, name) && find(rows, name).ok);
  const failed = rows.filter(r => !r.ok);

  lines.push(`${coreAiOk ? '🟢 AI Ready' : '🔴 AI Degraded'} · ${VERSION}`);
  lines.push(coreAi.map(n => costText(find(rows, n))).filter(Boolean).join(' · '));

  lines.push('');
  lines.push('📍 Network');
  if (meta.wifi) lines.push(`Wi‑Fi ${meta.wifi}`);
  if (meta.deviceIP) lines.push(`设备 ${meta.deviceIP}`);
  if (meta.ip) lines.push(`出口 ${meta.ip}${meta.loc ? ' · ' + meta.loc : ''}${meta.colo ? ' · ' + meta.colo : ''}`);
  if (meta.isp || meta.as) lines.push([meta.isp, meta.as].filter(Boolean).join(' · '));
  if (meta.country || meta.city) lines.push([meta.country, meta.city].filter(Boolean).join(' · '));

  if (traffic && traffic.length) {
    lines.push('');
    lines.push('📊 Traffic');
    traffic.slice(0, 2).forEach(t => lines.push(`${t.name} ↑ ${fmtBytes(t.out)} ↓ ${fmtBytes(t.in)}`));
    const active = traffic.find(t => t.inSpeed || t.outSpeed);
    if (active) lines.push(`速度 ↑ ${fmtBytes(active.outSpeed)}/s ↓ ${fmtBytes(active.inSpeed)}/s`);
  }

  lines.push('');
  lines.push('🤖 AI');
  rows.filter(r => r.group === 'ai').slice(0, 5).forEach(r => lines.push(rowText(r)));

  lines.push('');
  lines.push(`✅ ${rows.length - failed.length}/${rows.length} · total ${total} ms`);
  if (failed.length) lines.push(`❌ ${failed.map(r => r.name).join(', ')}`);
  return lines.join('\n');
}

function renderAiOnly(meta, rows, total) {
  const lines = [];
  const aiRows = rows.filter(r => r.group === 'ai');
  const ok = aiRows.every(r => r.ok);
  lines.push(`${ok ? '🟢 AI Ready' : '🔴 AI Degraded'} · ${VERSION}`);
  if (meta.ip) lines.push(`出口 ${meta.ip}${meta.loc ? ' · ' + meta.loc : ''}${meta.colo ? ' · ' + meta.colo : ''}`);
  lines.push('');
  aiRows.forEach(r => lines.push(rowText(r)));
  lines.push('');
  lines.push(`total ${total} ms`);
  return lines.join('\n');
}

function renderFull(meta, traffic, rows, total) {
  const lines = renderDashboard(meta, traffic, rows, total).split('\n');
  const grouped = {};
  rows.forEach(r => { if (r.group === 'ai') return; if (!grouped[r.group]) grouped[r.group] = []; grouped[r.group].push(r); });
  GROUP_ORDER.forEach(g => {
    if (g === 'ai' || !grouped[g]) return;
    lines.push('');
    lines.push(GROUP_NAMES[g] || g);
    grouped[g].forEach(r => lines.push(rowText(r)));
  });
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

function pickTargets(targets, group, mode) {
  if (mode === 'ai-only') return targets.filter(t => t.group === 'ai');
  if (!group || group === 'all') return mode === 'dashboard' ? targets.filter(t => ['ai', 'dev', 'work'].indexOf(t.group) !== -1) : targets;
  const gs = String(group).split(',').map(s => s.trim());
  return targets.filter(t => gs.indexOf(t.group) !== -1);
}

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
    if (k === 'mode') out.mode = v;
    if (k === 'showStatus') out.showStatus = v !== 'false';
    if (k === 'showIP') out.showIP = v !== 'false';
    if (k === 'showTraffic') out.showTraffic = v !== 'false';
    if (k === 'timeout') {
      const t = Number(v);
      if (!Number.isNaN(t) && t >= 1000 && t <= 15000) out.timeout = t;
    }
  });
  return out;
}

function fmtBytes(n) {
  n = Number(n || 0);
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB';
  return n.toFixed(0) + ' B';
}
function padRight(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function padLeft(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
