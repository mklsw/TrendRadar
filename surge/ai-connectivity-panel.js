// Surge Panel: AI Connectivity Pro v2
// 2026-oriented AI/dev/work network diagnostics for Surge.
//
// Raw URL:
// https://raw.githubusercontent.com/mklsw/TrendRadar/master/surge/ai-connectivity-panel.js
//
// Surge config example:
// AI_Connectivity = type=generic,timeout=10,script-path=https://raw.githubusercontent.com/mklsw/TrendRadar/master/surge/ai-connectivity-panel.js,argument=title=AI%20Connectivity%20Pro&icon=network&color=%2300AEEF&timeout=5500&group=all&showStatus=true&showUrl=false&showIP=true&showNode=true
//
// Supported arguments:
// title=AI Connectivity Pro
// icon=network
// color=%2300AEEF              // encode # as %23
// timeout=5500                 // per request timeout, 1000-15000 ms
// group=all|ai|dev|work|china|network|dns   // comma-separated allowed: group=ai,dev,dns
// showStatus=true|false
// showUrl=false|true
// showIP=true|false
// showNode=true|false
// compact=false|true

const VERSION = 'v2.0.0';

const DEFAULT_CONFIG = {
  title: 'AI Connectivity Pro',
  icon: 'network',
  color: '#00AEEF',
  timeout: 5500,
  group: 'all',
  showStatus: true,
  showUrl: false,
  showIP: true,
  showNode: true,
  compact: false,
};

const TARGETS = [
  // AI services. 401/403/404 often means reachable but no credential or wrong method.
  { group: 'ai', name: 'OpenAI', url: 'https://api.openai.com/v1/models', ok: [200, 401, 403], method: 'GET' },
  { group: 'ai', name: 'Claude', url: 'https://api.anthropic.com/v1/messages', ok: [400, 401, 403, 404], method: 'GET' },
  { group: 'ai', name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models', ok: [200, 400, 401, 403], method: 'GET' },
  { group: 'ai', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models', ok: [200, 401, 403], method: 'GET' },
  { group: 'ai', name: 'HuggingFace', url: 'https://huggingface.co', ok: [200, 301, 302, 403], method: 'GET' },

  // Developer infrastructure.
  { group: 'dev', name: 'GitHub', url: 'https://github.com', ok: [200], method: 'GET' },
  { group: 'dev', name: 'GitHub Raw', url: 'https://raw.githubusercontent.com', ok: [200, 301, 302, 400, 404], method: 'GET' },
  { group: 'dev', name: 'GitHub API', url: 'https://api.github.com/rate_limit', ok: [200, 403], method: 'GET' },
  { group: 'dev', name: 'NPM', url: 'https://registry.npmjs.org/-/ping', ok: [200, 404], method: 'GET' },
  { group: 'dev', name: 'Docker Hub', url: 'https://registry-1.docker.io/v2/', ok: [200, 401], method: 'GET' },
  { group: 'dev', name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace', ok: [200], method: 'GET' },

  // Work/collaboration.
  { group: 'work', name: 'Feishu', url: 'https://open.feishu.cn', ok: [200, 301, 302, 403], method: 'GET' },
  { group: 'work', name: 'Lark', url: 'https://open.larksuite.com', ok: [200, 301, 302, 403], method: 'GET' },

  // China/common services.
  { group: 'china', name: 'Baidu', url: 'https://www.baidu.com', ok: [200], method: 'GET' },
  { group: 'china', name: 'Bilibili', url: 'https://www.bilibili.com', ok: [200], method: 'GET' },
  { group: 'china', name: 'Aliyun', url: 'https://www.aliyun.com', ok: [200, 301, 302, 403], method: 'GET' },

  // Generic reachability.
  { group: 'network', name: 'Google 204', url: 'https://www.google.com/generate_204', ok: [204], method: 'GET' },
  { group: 'network', name: 'Apple', url: 'https://www.apple.com/library/test/success.html', ok: [200], method: 'GET' },
  { group: 'network', name: 'Microsoft', url: 'https://www.msftconnecttest.com/connecttest.txt', ok: [200], method: 'GET' },

  // DNS-over-HTTPS probes. This does not measure local DNS directly, but it tells whether public DoH paths are reachable.
  { group: 'dns', name: 'CF DoH', url: 'https://cloudflare-dns.com/dns-query?name=api.openai.com&type=A', ok: [200], method: 'GET', accept: 'application/dns-json' },
  { group: 'dns', name: 'Google DoH', url: 'https://dns.google/resolve?name=api.anthropic.com&type=A', ok: [200], method: 'GET' },
];

const IP_TARGETS = [
  { name: 'Cloudflare Trace', url: 'https://1.1.1.1/cdn-cgi/trace', parser: parseCloudflareTrace },
  { name: 'ipify', url: 'https://api.ipify.org?format=json', parser: parseIpify },
];

const config = Object.assign(
  {},
  DEFAULT_CONFIG,
  parseArgument(typeof $argument !== 'undefined' ? $argument : '')
);

(async () => {
  const startedAt = Date.now();

  const tasks = [];
  if (config.showIP) tasks.push(getPublicIP(config.timeout));
  if (config.showNode) tasks.push(Promise.resolve(getSurgeNodeInfo()));

  const metaResults = await Promise.allSettled(tasks);

  const targets = pickTargets(TARGETS, config.group);
  const probeResults = await Promise.allSettled(
    targets.map(target => probe(target, config.timeout))
  );

  const rows = probeResults.map(result => {
    if (result.status === 'fulfilled') return result.value;
    return { ok: false, group: 'unknown', name: 'Unknown', cost: config.timeout, status: 'error', url: '' };
  });

  const meta = extractMeta(metaResults);
  const content = render(meta, rows, Date.now() - startedAt);

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
      resolve(makeResult(target, false, timeout, 'timeout'));
    }, timeout);

    const headers = {
      'User-Agent': 'Surge AI Connectivity Pro/2026',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    if (target.accept) headers.Accept = target.accept;

    const request = { url: target.url, headers };

    const callback = (err, resp, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const cost = Date.now() - startedAt;

      if (err) {
        resolve(makeResult(target, false, cost, 'error'));
        return;
      }

      const status = resp && resp.status ? Number(resp.status) : 0;
      const ok = target.ok.indexOf(status) !== -1;
      resolve(makeResult(target, ok, cost, status));
    };

    try {
      if (target.method === 'POST') $httpClient.post(request, callback);
      else $httpClient.get(request, callback);
    } catch (e) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(makeResult(target, false, Date.now() - startedAt, 'exception'));
    }
  });
}

function makeResult(target, ok, cost, status) {
  return {
    ok,
    group: target.group,
    name: target.name,
    cost,
    status,
    url: target.url,
  };
}

function getPublicIP(timeout) {
  return new Promise(resolve => {
    const attempts = IP_TARGETS.map(item => ipProbe(item, timeout));
    Promise.allSettled(attempts).then(results => {
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.ip) {
          resolve(result.value);
          return;
        }
      }
      resolve({ ip: 'unknown', loc: '', colo: '', source: 'none' });
    });
  });
}

function ipProbe(target, timeout) {
  return new Promise(resolve => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ ip: '', loc: '', colo: '', source: target.name });
    }, timeout);

    $httpClient.get({ url: target.url, headers: { 'Cache-Control': 'no-cache' } }, (err, resp, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (err || !data) {
        resolve({ ip: '', loc: '', colo: '', source: target.name });
        return;
      }

      resolve(target.parser(data, target.name));
    });
  });
}

function parseCloudflareTrace(data, source) {
  const out = { ip: '', loc: '', colo: '', source };
  String(data).split('\n').forEach(line => {
    const index = line.indexOf('=');
    if (index === -1) return;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (key === 'ip') out.ip = value;
    if (key === 'loc') out.loc = value;
    if (key === 'colo') out.colo = value;
  });
  return out;
}

function parseIpify(data, source) {
  try {
    const json = JSON.parse(data);
    return { ip: json.ip || '', loc: '', colo: '', source };
  } catch (e) {
    return { ip: '', loc: '', colo: '', source };
  }
}

function getSurgeNodeInfo() {
  // Surge availability differs by version/context. Try several known runtime fields without failing.
  const info = {
    policy: '',
    node: '',
  };

  try {
    if (typeof $environment !== 'undefined') {
      info.policy = $environment['policy-name'] || $environment.policy || '';
      info.node = $environment['server-name'] || $environment.server || $environment.node || '';
    }
  } catch (e) {}

  try {
    if (typeof $network !== 'undefined') {
      info.network = $network.wifi ? ($network.wifi.ssid || '') : '';
    }
  } catch (e) {}

  return info;
}

function extractMeta(results) {
  const meta = { ip: null, node: null };
  results.forEach(result => {
    if (result.status !== 'fulfilled') return;
    const value = result.value;
    if (!value) return;
    if (Object.prototype.hasOwnProperty.call(value, 'ip')) meta.ip = value;
    else meta.node = value;
  });
  return meta;
}

function render(meta, rows, totalCost) {
  const lines = [];

  if (!config.compact) {
    lines.push(`🧪 ${VERSION}`);

    if (config.showIP && meta.ip) {
      const ipParts = [`出口 ${meta.ip.ip || 'unknown'}`];
      if (meta.ip.loc) ipParts.push(meta.ip.loc);
      if (meta.ip.colo) ipParts.push(meta.ip.colo);
      lines.push(ipParts.join(' · '));
    }

    if (config.showNode && meta.node) {
      const nodeParts = [];
      if (meta.node.policy) nodeParts.push(`策略 ${meta.node.policy}`);
      if (meta.node.node) nodeParts.push(`节点 ${meta.node.node}`);
      if (meta.node.network) nodeParts.push(`Wi‑Fi ${meta.node.network}`);
      if (nodeParts.length) lines.push(nodeParts.join(' · '));
    }

    if (lines.length > 1) lines.push('');
  }

  const order = ['ai', 'dev', 'work', 'china', 'network', 'dns'];
  const names = {
    ai: '🤖 AI',
    dev: '💻 Dev',
    work: '🏢 Work',
    china: '🇨🇳 China',
    network: '🌐 Network',
    dns: '🧭 DoH',
  };

  const grouped = {};
  rows.forEach(row => {
    if (!grouped[row.group]) grouped[row.group] = [];
    grouped[row.group].push(row);
  });

  order.forEach(group => {
    if (!grouped[group]) return;
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    if (!config.compact) lines.push(names[group] || group);
    grouped[group].forEach(row => lines.push(formatRow(row)));
  });

  const okCount = rows.filter(row => row.ok).length;
  const failed = rows.filter(row => !row.ok);
  lines.push('');
  lines.push(`✅ ${okCount}/${rows.length} reachable · total ${totalCost} ms`);

  if (failed.length) {
    lines.push(`❌ ${failed.map(item => item.name).join(', ')}`);
  }

  return lines.join('\n');
}

function formatRow(row) {
  const icon = row.ok ? '✅' : '❌';
  const nameWidth = config.compact ? 10 : 12;
  const name = padRight(row.name, nameWidth);
  let text = `${icon} ${name} ${padLeft(row.cost, 5)} ms`;

  if (config.showStatus) text += ` · ${row.status}`;
  if (config.showUrl) text += `\n   ${row.url}`;

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
    if (key === 'group') result.group = value;
    if (key === 'showStatus') result.showStatus = value !== 'false';
    if (key === 'showUrl') result.showUrl = value === 'true';
    if (key === 'showIP') result.showIP = value !== 'false';
    if (key === 'showNode') result.showNode = value !== 'false';
    if (key === 'compact') result.compact = value === 'true';

    if (key === 'timeout') {
      const timeout = Number(value);
      if (!Number.isNaN(timeout) && timeout >= 1000 && timeout <= 15000) result.timeout = timeout;
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
