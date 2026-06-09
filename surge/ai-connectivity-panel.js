// Surge Panel: AI & Dev Connectivity Test
// 2026 version for AI/dev workflow diagnostics.
//
// Usage example in Surge:
// AI_Connectivity = type=generic,timeout=8,script-path=https://raw.githubusercontent.com/mklsw/TrendRadar/master/surge/ai-connectivity-panel.js,argument=title=AI%20Connectivity&icon=network&color=%2300AEEF&timeout=5000&showStatus=true
//
// Supported arguments:
// title=AI Connectivity
// icon=network
// color=%2300AEEF              // # must be encoded as %23 in Surge argument
// timeout=5000                 // per target timeout in ms
// showStatus=true|false
// showUrl=false|true
// group=all|ai|dev|china|work|network

const DEFAULT_CONFIG = {
  title: 'AI Connectivity',
  icon: 'network',
  color: '#00AEEF',
  timeout: 5000,
  showStatus: true,
  showUrl: false,
  group: 'all',
};

const TARGETS = [
  // AI services. 401/403/404 can still mean the endpoint is reachable without credentials.
  { group: 'ai', name: 'OpenAI API', url: 'https://api.openai.com/v1/models', ok: [200, 401, 403], method: 'GET' },
  { group: 'ai', name: 'Claude API', url: 'https://api.anthropic.com/v1/messages', ok: [400, 401, 403], method: 'GET' },
  { group: 'ai', name: 'Gemini API', url: 'https://generativelanguage.googleapis.com/v1beta/models', ok: [200, 400, 401, 403], method: 'GET' },
  { group: 'ai', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models', ok: [200, 401, 403], method: 'GET' },

  // Developer services.
  { group: 'dev', name: 'GitHub', url: 'https://github.com', ok: [200], method: 'GET' },
  { group: 'dev', name: 'GitHub Raw', url: 'https://raw.githubusercontent.com', ok: [200, 301, 302, 400, 404], method: 'GET' },
  { group: 'dev', name: 'NPM', url: 'https://registry.npmjs.org/-/ping', ok: [200, 404], method: 'GET' },
  { group: 'dev', name: 'Docker Hub', url: 'https://registry-1.docker.io/v2/', ok: [200, 401], method: 'GET' },
  { group: 'dev', name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace', ok: [200], method: 'GET' },

  // China/common services.
  { group: 'china', name: 'Baidu', url: 'https://www.baidu.com', ok: [200], method: 'GET' },
  { group: 'china', name: 'Bilibili', url: 'https://www.bilibili.com', ok: [200], method: 'GET' },

  // Work/collaboration.
  { group: 'work', name: 'Feishu', url: 'https://open.feishu.cn', ok: [200, 301, 302, 403], method: 'GET' },

  // Generic connectivity probes.
  { group: 'network', name: 'Google 204', url: 'https://www.google.com/generate_204', ok: [204], method: 'GET' },
  { group: 'network', name: 'Apple 204', url: 'https://www.apple.com/library/test/success.html', ok: [200], method: 'GET' },
];

const config = Object.assign(
  {},
  DEFAULT_CONFIG,
  parseArgument(typeof $argument !== 'undefined' ? $argument : '')
);

(async () => {
  const startedAt = Date.now();
  const targets = pickTargets(TARGETS, config.group);

  const results = await Promise.allSettled(
    targets.map(target => probe(target, config.timeout))
  );

  const rows = results.map(result => {
    if (result.status === 'fulfilled') return result.value;
    return { ok: false, group: 'unknown', name: 'Unknown', cost: config.timeout, status: 'error', url: '' };
  });

  const content = render(rows, Date.now() - startedAt);

  $done({
    title: config.title,
    content,
    icon: config.icon,
    'icon-color': config.color,
  });
})();

function probe(target, timeout) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({
        ok: false,
        group: target.group,
        name: target.name,
        cost: timeout,
        status: 'timeout',
        url: target.url,
      });
    }, timeout);

    const request = {
      url: target.url,
      headers: {
        'User-Agent': 'Surge AI Connectivity Panel/2026',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    };

    const callback = (err, resp, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const cost = Date.now() - startedAt;

      if (err) {
        resolve({
          ok: false,
          group: target.group,
          name: target.name,
          cost,
          status: 'error',
          url: target.url,
        });
        return;
      }

      const status = resp && resp.status ? Number(resp.status) : 0;
      const ok = target.ok.indexOf(status) !== -1;

      resolve({
        ok,
        group: target.group,
        name: target.name,
        cost,
        status,
        url: target.url,
      });
    };

    try {
      if (target.method === 'POST') {
        $httpClient.post(request, callback);
      } else {
        $httpClient.get(request, callback);
      }
    } catch (e) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        group: target.group,
        name: target.name,
        cost: Date.now() - startedAt,
        status: 'exception',
        url: target.url,
      });
    }
  });
}

function render(rows, totalCost) {
  const order = ['ai', 'dev', 'china', 'work', 'network'];
  const names = {
    ai: '🤖 AI',
    dev: '💻 Dev',
    china: '🇨🇳 China',
    work: '🏢 Work',
    network: '🌐 Network',
  };

  const grouped = {};
  rows.forEach(row => {
    if (!grouped[row.group]) grouped[row.group] = [];
    grouped[row.group].push(row);
  });

  const lines = [];

  order.forEach(group => {
    if (!grouped[group]) return;
    if (lines.length) lines.push('');
    lines.push(names[group] || group);
    grouped[group].forEach(row => lines.push(formatRow(row)));
  });

  const okCount = rows.filter(row => row.ok).length;
  lines.push('');
  lines.push(`✅ ${okCount}/${rows.length} reachable · total ${totalCost} ms`);

  return lines.join('\n');
}

function formatRow(row) {
  const icon = row.ok ? '✅' : '❌';
  const name = padRight(row.name, 12);
  let text = `${icon} ${name} ${padLeft(row.cost, 5)} ms`;

  if (config.showStatus) {
    text += ` · ${row.status}`;
  }

  if (config.showUrl) {
    text += `\n   ${row.url}`;
  }

  return text;
}

function pickTargets(targets, group) {
  if (!group || group === 'all') return targets;
  const allow = String(group)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return targets.filter(target => allow.indexOf(target.group) !== -1);
}

function parseArgument(argument) {
  const result = {};
  if (!argument) return result;

  argument.split('&').forEach(pair => {
    const index = pair.indexOf('=');
    if (index === -1) return;

    const key = decodeURIComponent(pair.slice(0, index));
    const value = decodeURIComponent(pair.slice(index + 1));

    if (key === 'title') result.title = value;
    if (key === 'icon') result.icon = value;
    if (key === 'color') result.color = value;
    if (key === 'showStatus') result.showStatus = value !== 'false';
    if (key === 'showUrl') result.showUrl = value === 'true';
    if (key === 'group') result.group = value;
    if (key === 'timeout') {
      const timeout = Number(value);
      if (!Number.isNaN(timeout) && timeout >= 1000 && timeout <= 15000) {
        result.timeout = timeout;
      }
    }
  });

  return result;
}

function padRight(input, length) {
  let str = String(input);
  while (str.length < length) str += ' ';
  return str;
}

function padLeft(input, length) {
  let str = String(input);
  while (str.length < length) str = ' ' + str;
  return str;
}
