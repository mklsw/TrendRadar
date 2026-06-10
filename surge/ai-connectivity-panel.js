// Surge Panel: AI Connectivity Pro
// Focused on AI development operations: AI reachability, exit info,
// lightweight Surge traffic, and recent policy hints.

const VERSION = 'v3.3.1';

const CORE_AI = ['OpenAI', 'Claude', 'Gemini'];
const CORE_AI_SHORT = {
  OpenAI: 'OAI',
  Claude: 'Cl',
  Gemini: 'Gem',
};
const DASHBOARD_GROUPS = ['ai', 'ops', 'dev', 'work', 'dns'];
const GROUP_ORDER = ['ai', 'ops', 'dev', 'work', 'china', 'dns'];
const DEFAULT_POLICIES = [
  'Homelab-Access',
  'CN-Direct',
  'WeChat-Homelab-SG',
  'USHome',
  'Global',
  'AI-Bwg-USHome-Auto',
  'Homelab-Core',
  'Homelab-Backup',
  'Homelab-SG',
];
const IGNORED_POLICY_NAMES = ['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP', 'REJECT-TINYGIF'];

const DEFAULT_CONFIG = {
  title: 'AI Connectivity Pro',
  icon: 'network',
  color: '#00AEEF',
  timeout: 6000,
  mode: 'dashboard', // dashboard | full | ai-only
  group: 'all',
  showStatus: true,
  showIP: true,
  ipLookup: 'cloudflare-ipapi', // off | cloudflare | cloudflare-ipapi
  showTraffic: false,
  showNode: true,
  mask: false,
  event: false,
  eventDelay: 3,
  policies: DEFAULT_POLICIES,
  customChecks: [],
};

const TARGETS = [
  { group: 'ai', name: 'OpenAI', url: 'https://api.openai.com/v1/models', ok: [200, 401, 403] },
  { group: 'ai', name: 'Claude', url: 'https://api.anthropic.com/v1/messages', ok: [200, 400, 401, 403, 404, 405] },
  { group: 'ai', name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models', ok: [200, 400, 401, 403] },
  { group: 'ai', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models', ok: [200, 401, 403] },
  { group: 'ai', name: 'HuggingFace', url: 'https://huggingface.co', ok: [200, 301, 302, 403] },

  { group: 'dev', name: 'GitHub', url: 'https://github.com', ok: [200] },
  { group: 'dev', name: 'GitHub API', url: 'https://api.github.com/rate_limit', ok: [200, 403] },
  { group: 'dev', name: 'GitHub Raw', url: 'https://raw.githubusercontent.com', ok: [200, 301, 302, 400, 404] },
  { group: 'dev', name: 'NPM', url: 'https://registry.npmjs.org/-/ping', ok: [200, 404] },
  { group: 'dev', name: 'Docker Hub', url: 'https://registry-1.docker.io/v2/', ok: [200, 401] },

  { group: 'work', name: 'Feishu', url: 'https://open.feishu.cn', ok: [200, 301, 302, 403] },
  { group: 'work', name: 'Lark', url: 'https://open.larksuite.com', ok: [200, 301, 302, 403] },
  { group: 'work', name: 'Microsoft 365', url: 'https://login.microsoftonline.com', ok: [200, 301, 302, 400, 401, 403] },

  { group: 'china', name: 'Baidu', url: 'https://www.baidu.com', ok: [200] },
  { group: 'china', name: 'Bilibili', url: 'https://www.bilibili.com', ok: [200] },
  { group: 'china', name: 'Aliyun', url: 'https://www.aliyun.com', ok: [200, 301, 302, 403] },

  { group: 'dns', name: 'CF DoH', url: 'https://cloudflare-dns.com/dns-query?name=api.openai.com&type=A', ok: [200], accept: 'application/dns-json' },
  { group: 'dns', name: 'Google DoH', url: 'https://dns.google/resolve?name=api.anthropic.com&type=A', ok: [200] },
];

const GROUP_NAMES = {
  ai: '🤖 AI',
  dev: '💻 Dev',
  work: '🏢 Work',
  china: '🇨🇳 China',
  dns: '🧭 DoH',
  ops: '🛠 Ops',
  network: '📍 Network',
};

const GROUP_STATUS_NAMES = {
  ai: 'AI',
  dev: 'Dev',
  work: 'Work',
  china: 'China',
  dns: 'DoH',
  ops: 'Ops',
};

const config = normalizeConfig(Object.assign(
  {},
  DEFAULT_CONFIG,
  parseArgument(typeof $argument !== 'undefined' ? $argument : '')
));

(async () => {
  if (config.event && config.eventDelay > 0) await wait(config.eventDelay * 1000);

  const started = Date.now();
  const allTargets = buildTargets(config);
  const targets = pickTargets(allTargets, config);
  const metaPromise = getMeta(config);
  const trafficPromise = shouldLoadTraffic(config) ? getTraffic() : Promise.resolve(null);
  const policyPromise = config.showNode ? getPolicySnapshot(config) : Promise.resolve(null);
  const rowsPromise = Promise.all(targets.map(target => (
    probe(target, config.timeout).catch(() => failRow(target))
  )));

  const meta = await metaPromise;
  const traffic = await trafficPromise;
  const policy = await policyPromise;
  const rows = await rowsPromise;

  $done({
    title: config.title,
    content: render(meta, traffic, policy, rows, Date.now() - started),
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

    const headers = {
      'User-Agent': 'Surge AI Connectivity Pro',
      'Cache-Control': 'no-cache',
    };
    if (target.accept) headers.Accept = target.accept;

    const request = { url: target.url, headers, method: target.method || 'GET' };
    $httpClient.get(request, (err, resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const cost = Date.now() - start;
      if (err) {
        resolve({ group: target.group, name: target.name, ok: false, cost, status: shortError(err) });
        return;
      }

      const status = Number((resp && (resp.status || resp.statusCode)) || 0);
      resolve({
        group: target.group,
        name: target.name,
        ok: target.ok.indexOf(status) !== -1,
        cost,
        status: status || 'no-status',
      });
    });
  });
}

function getMeta(cfg) {
  return new Promise(resolve => {
    const meta = createMeta();
    readLocalNetwork(meta);

    if (!cfg.showIP || isLookupOff(cfg.ipLookup)) {
      resolve(meta);
      return;
    }

    let finished = false;
    const timer = setTimeout(() => finish(meta), cfg.timeout);

    function finish(value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    }

    $httpClient.get({
      url: 'https://1.1.1.1/cdn-cgi/trace',
      headers: { 'User-Agent': 'Surge AI Connectivity Pro' },
    }, (err, resp, data) => {
      if (finished) return;
      if (!err && data) parseCloudflareTrace(meta, data);

      if (!meta.ip || !usesIpApi(cfg.ipLookup)) {
        finish(meta);
        return;
      }

      const url = `http://ip-api.com/json/${meta.ip}?fields=status,country,city,isp,as,query`;
      $httpClient.get({ url, headers: { 'User-Agent': 'Surge AI Connectivity Pro' } }, (err2, resp2, body) => {
        if (finished) return;
        if (!err2 && body) parseIpApi(meta, body);
        finish(meta);
      });
    });
  });
}

function createMeta() {
  return {
    ip: '',
    loc: '',
    colo: '',
    isp: '',
    as: '',
    city: '',
    country: '',
    wifi: '',
    cellular: '',
    deviceIP: '',
  };
}

function readLocalNetwork(meta) {
  try {
    if (typeof $network === 'undefined') return;
    if ($network.wifi) meta.wifi = $network.wifi.ssid || $network.wifi.bssid || '';
    meta.cellular = cellularNetworkText($network);
    if ($network.v4) meta.deviceIP = $network.v4.primaryAddress || '';
  } catch (e) {}
}

function cellularNetworkText(network) {
  const cellular = network['cellular-data'] || network.cellular || {};
  const radio = cellular.radio || '';
  const carrier = cellular.carrier || '';
  if (!radio && !carrier) return '';
  const generation = radioGenerationName(radio);
  const parts = [];
  if (generation) parts.push(generation);
  if (carrier && !/^\d+-\d+$/.test(carrier)) parts.push(carrier);
  return parts.join(' · ') || '蜂窝网络';
}

function radioGenerationName(radio) {
  const key = String(radio || '').toUpperCase();
  const map = {
    GPRS: '2.5G',
    CDMA1X: '2.5G',
    EDGE: '2.75G',
    WCDMA: '3G',
    HSDPA: '3.5G',
    HSUPA: '3.75G',
    CDMAEVDOREV0: '3.5G',
    CDMAEVDOREVA: '3.5G',
    CDMAEVDOREVB: '3.75G',
    EHRPD: '3.9G',
    LTE: '4G-LTE',
    NRNSA: '5G-NSA',
    NR: '5G-NR',
  };
  return map[key] || radio;
}

function parseCloudflareTrace(meta, data) {
  String(data).split('\n').forEach(line => {
    const index = line.indexOf('=');
    if (index === -1) return;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (key === 'ip') meta.ip = value;
    if (key === 'loc') meta.loc = value;
    if (key === 'colo') meta.colo = value;
  });
}

function parseIpApi(meta, body) {
  try {
    const json = JSON.parse(body || '{}');
    if (json.status !== 'success') return;
    meta.country = json.country || '';
    meta.city = json.city || '';
    meta.isp = json.isp || '';
    meta.as = json.as || '';
  } catch (e) {}
}

function buildTargets(cfg) {
  return TARGETS.concat(cfg.customChecks || []);
}

function getTraffic() {
  return callHttpAPI('/v1/traffic').then(normalizeTraffic);
}

function normalizeTraffic(data) {
  if (!data) return null;
  const source = data.interface || data.interfaces || data;
  const rows = Object.keys(source || {}).map(key => {
    const item = source[key] || {};
    return {
      name: mapInterfaceName(key),
      raw: key,
      in: numberFrom(item.in, item.download, item.rx, item.bytesIn),
      out: numberFrom(item.out, item.upload, item.tx, item.bytesOut),
      inSpeed: numberFrom(item.inCurrentSpeed, item.downloadSpeed, item.rxSpeed, item.currentInSpeed),
      outSpeed: numberFrom(item.outCurrentSpeed, item.uploadSpeed, item.txSpeed, item.currentOutSpeed),
      inMaxSpeed: numberFrom(item.inMaxSpeed, item.downloadMaxSpeed, item.rxMaxSpeed),
      outMaxSpeed: numberFrom(item.outMaxSpeed, item.uploadMaxSpeed, item.txMaxSpeed),
    };
  }).filter(row => row.in || row.out || row.inSpeed || row.outSpeed);

  return rows.sort((a, b) => interfaceWeight(a.raw) - interfaceWeight(b.raw)).slice(0, 5);
}

function mapInterfaceName(name) {
  if (name === 'en0') return 'Wi-Fi';
  if (name === 'en7') return 'USB/扩展网卡';
  if (/^pdp_ip/i.test(name)) return '蜂窝网络';
  if (/^lo/i.test(name)) return '回环网络';
  if (/^en\d+$/i.test(name)) return `以太网 ${name}`;
  return name;
}

function interfaceWeight(name) {
  if (name === 'en0') return 1;
  if (name === 'en7') return 2;
  if (/^pdp_ip/i.test(name)) return 3;
  if (/^lo/i.test(name)) return 9;
  return 5;
}

function getPolicySnapshot(cfg) {
  return callHttpAPI('/v1/requests/recent').then(data => {
    const recent = extractRecentPolicies(data, cfg.policies);
    return {
      recent,
      preferred: cfg.policies || [],
    };
  }).catch(() => ({
    recent: [],
    preferred: cfg.policies || [],
  }));
}

function callHttpAPI(path) {
  return new Promise(resolve => {
    try {
      if (typeof $httpAPI === 'undefined') {
        resolve(null);
        return;
      }
      $httpAPI('GET', path, null, data => resolve(data));
    } catch (e) {
      resolve(null);
    }
  });
}

function extractRecentPolicies(data, preferred) {
  const items = recentItems(data).slice(0, 80);
  const counts = {};
  items.forEach(item => {
    const name = policyRouteFrom(item, preferred) || policyNameFrom(item, preferred);
    if (!name || isIgnoredPolicyName(name)) return;
    counts[name] = (counts[name] || 0) + 1;
  });

  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 3);
}

function recentItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.requests)) return data.requests;
  if (Array.isArray(data.recentRequests)) return data.recentRequests;
  if (Array.isArray(data.records)) return data.records;
  if (data.data && Array.isArray(data.data.requests)) return data.data.requests;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

function policyNameFrom(item, preferred) {
  if (!item || typeof item !== 'object') return '';
  const keys = ['policyName', 'policy', 'proxy', 'proxyName', 'node', 'nodeName', 'outboundMode'];
  for (let i = 0; i < keys.length; i++) {
    const value = item[keys[i]];
    if (typeof value === 'string' && safePolicyName(value)) return value;
  }

  for (let j = 0; j < preferred.length; j++) {
    const name = preferred[j];
    const text = JSON.stringify(item);
    if (text.indexOf(name) !== -1) return name;
  }

  return '';
}

function policyRouteFrom(item, preferred) {
  const notes = Array.isArray(item && item.notes) ? item.notes : [];
  for (let i = 0; i < notes.length; i++) {
    const match = String(notes[i]).match(/Policy decision path:\s*(.+)$/);
    if (!match) continue;
    const parts = match[1]
      .split(/\s*->\s*/)
      .map(part => part.trim())
      .filter(part => part && !isIgnoredPolicyName(part));
    if (!parts.length) continue;
    const preferredRoute = parts.filter(part => preferred.indexOf(part) !== -1);
    const route = preferredRoute.length ? preferredRoute.concat(parts.slice(-1)) : parts;
    return uniqueList(route).slice(0, 4).join(' › ');
  }
  return '';
}

function uniqueList(items) {
  const seen = {};
  return items.filter(item => {
    if (seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function safePolicyName(value) {
  return value && value.length <= 80 && value.indexOf('://') === -1 && value.indexOf('\n') === -1;
}

function isIgnoredPolicyName(value) {
  return IGNORED_POLICY_NAMES.indexOf(String(value || '').toUpperCase()) !== -1;
}

function render(meta, traffic, policy, rows, total) {
  if (config.mode === 'ai-only') return renderAiOnly(meta, rows, total);
  if (config.mode === 'full') return renderFull(meta, traffic, policy, rows, total);

  const explicit = explicitGroups(config);
  if (explicit.length) return renderGroupView(explicit, meta, traffic, policy, rows, total);

  return renderDashboard(meta, traffic, policy, rows, total);
}

function renderDashboard(meta, traffic, policy, rows, total) {
  const lines = [];
  const coreOk = coreAiOk(rows);
  const failed = rows.filter(row => !row.ok);
  const opsRows = rows.filter(row => row.group === 'ops');

  lines.push(`${coreOk ? '🟢 AI Reachable' : '🔴 AI Degraded'} · ${VERSION}`);
  lines.push(dashboardCoreLatencyText(rows));
  if (opsRows.length) lines.push(opsSummaryText(opsRows));

  dashboardNetworkLines(meta, policy).forEach(line => lines.push(line));
  dashboardTrafficLines(traffic).forEach(line => lines.push(line));

  lines.push(dashboardSummaryText(rows, total));
  if (failed.length) lines.push(`❌ ${failedListText(failed)}`);
  return compactLines(lines).join('\n');
}

function renderAiOnly(meta, rows, total) {
  const aiRows = rows.filter(row => row.group === 'ai');
  const lines = [];
  const ok = aiRows.length > 0 && aiRows.every(row => row.ok);

  lines.push(`${ok ? '🟢 AI Reachable' : '🔴 AI Degraded'} · ${VERSION}`);
  if (meta.ip) lines.push(exitLine(meta));
  lines.push('');
  aiRows.forEach(row => lines.push(rowText(row)));
  lines.push('');
  lines.push(summaryText(aiRows, total));
  return compactLines(lines).join('\n');
}

function renderFull(meta, traffic, policy, rows, total) {
  const lines = [];
  lines.push(`${coreAiOk(rows) ? '🟢 AI Reachable' : '🔴 AI Degraded'} · ${VERSION}`);
  lines.push(CORE_AI.map(name => costText(findRow(rows, name))).filter(Boolean).join(' · '));

  appendNetworkBlock(lines, meta, policy, false);
  appendTrafficBlock(lines, traffic, false);

  GROUP_ORDER.forEach(group => {
    const groupRows = rows.filter(row => row.group === group);
    if (!groupRows.length) return;
    lines.push('');
    lines.push(GROUP_NAMES[group] || group);
    groupRows.forEach(row => lines.push(rowText(row)));
  });

  lines.push('');
  lines.push(summaryText(rows, total));
  const failed = rows.filter(row => !row.ok);
  if (failed.length) lines.push(`❌ ${failed.map(row => row.name).join(', ')}`);
  return compactLines(lines).join('\n');
}

function renderGroupView(groups, meta, traffic, policy, rows, total) {
  const lines = [];
  const wantsNetwork = groups.indexOf('network') !== -1;
  const serviceGroups = groups.filter(group => group !== 'network');
  const serviceRows = rows.filter(row => serviceGroups.indexOf(row.group) !== -1);

  if (wantsNetwork) {
    lines.push(`📍 Network Snapshot · ${VERSION}`);
    appendNetworkBlock(lines, meta, policy, false);
    if (config.showTraffic) appendTrafficBlock(lines, traffic, true);
  }

  if (serviceRows.length) {
    if (lines.length) lines.push('');
    if (serviceGroups.length === 1) {
      const group = serviceGroups[0];
      const ok = serviceRows.every(row => row.ok);
      const label = GROUP_STATUS_NAMES[group] || 'Connectivity';
      lines.push(`${ok ? '🟢' : '🔴'} ${label} ${ok ? 'Reachable' : 'Degraded'} · ${VERSION}`);
      serviceRows.forEach(row => lines.push(rowText(row)));
    } else {
      const ok = serviceRows.every(row => row.ok);
      lines.push(`${ok ? '🟢 Connectivity Reachable' : '🔴 Connectivity Degraded'} · ${VERSION}`);
      GROUP_ORDER.forEach(group => {
        const groupRows = serviceRows.filter(row => row.group === group);
        if (!groupRows.length) return;
        lines.push('');
        lines.push(GROUP_NAMES[group] || group);
        groupRows.forEach(row => lines.push(rowText(row)));
      });
    }
    lines.push('');
    lines.push(summaryText(serviceRows, total));
  }

  if (!lines.length) {
    lines.push(`📍 Network Snapshot · ${VERSION}`);
    appendNetworkBlock(lines, meta, policy, false);
    appendTrafficBlock(lines, traffic, true);
  }

  return compactLines(lines).join('\n');
}

function appendNetworkBlock(lines, meta, policy, forceEmpty) {
  const before = lines.length;
  lines.push('');
  lines.push('📍 Network');
  if (meta.wifi) lines.push(`Wi-Fi ${meta.wifi}`);
  else if (meta.cellular) lines.push(`蜂窝 ${meta.cellular}`);
  if (meta.deviceIP) lines.push(`设备 ${maskIP(meta.deviceIP)}`);
  if (meta.ip) lines.push(exitLine(meta));
  if (meta.country || meta.city) lines.push([meta.country, meta.city].filter(Boolean).join(' · '));
  if (meta.isp || meta.as) lines.push([meta.isp, meta.as].filter(Boolean).join(' · '));

  const policyLine = policyText(policy);
  if (policyLine) lines.push(policyLine);

  if (!forceEmpty && lines.length === before + 2) {
    lines.splice(before, lines.length - before);
  } else if (forceEmpty && lines.length === before + 2) {
    lines.push('暂无本地网络信息');
  }
}

function appendTrafficBlock(lines, traffic, forceEmpty) {
  if (!traffic || !traffic.length) {
    if (forceEmpty) {
      lines.push('');
      lines.push('📊 Traffic');
      lines.push('暂无接口流量数据');
    }
    return;
  }

  lines.push('');
  lines.push('📊 Traffic');
  traffic.slice(0, 3).forEach(row => {
    lines.push(`${row.name} ↑ ${fmtBytes(row.out)} ↓ ${fmtBytes(row.in)}`);
  });

  const active = traffic.find(row => row.inSpeed || row.outSpeed);
  if (active) {
    lines.push(`速度 ↑ ${fmtBytes(active.outSpeed)}/s ↓ ${fmtBytes(active.inSpeed)}/s`);
  }

  const max = traffic.find(row => row.inMaxSpeed || row.outMaxSpeed);
  if (max) {
    lines.push(`最大 ↑ ${fmtBytes(max.outMaxSpeed)}/s ↓ ${fmtBytes(max.inMaxSpeed)}/s`);
  }
}

function dashboardNetworkLines(meta, policy) {
  const lines = [];
  const local = [];
  if (meta.wifi) local.push(`Wi-Fi ${meta.wifi}`);
  else if (meta.cellular) local.push(`蜂窝 ${meta.cellular}`);
  if (meta.deviceIP) local.push(meta.wifi || meta.cellular ? maskIP(meta.deviceIP) : `设备 ${maskIP(meta.deviceIP)}`);
  if (local.length) lines.push(`📍 ${local.join(' · ')}`);

  if (meta.ip) {
    const location = [meta.loc, meta.colo].filter(Boolean).join('/');
    lines.push(`出口 ${maskIP(meta.ip)}${location ? ' · ' + location : ''}`);
  }

  const place = [meta.country, meta.city].filter(Boolean).join(' · ');
  const isp = shortOrg(meta.isp);
  const asn = shortAsn(meta.as);
  const provider = [isp, asn].filter(Boolean).join(' · ');
  if (place || provider) lines.push([place, provider].filter(Boolean).join(' · '));

  const policyLine = compactPolicyText(policy);
  if (policyLine) lines.push(policyLine);
  return lines;
}

function dashboardTrafficLines(traffic) {
  if (!traffic || !traffic.length) return [];
  const lines = [];
  const primary = traffic.find(row => row.raw === 'en0')
    || traffic.find(row => !/^lo/i.test(row.raw))
    || traffic[0];
  const active = (primary && (primary.inSpeed || primary.outSpeed))
    ? primary
    : traffic.find(row => !/^lo/i.test(row.raw) && (row.inSpeed || row.outSpeed));
  const cellular = traffic.find(row => /^pdp_ip/i.test(row.raw));

  if (primary) {
    let line = `📊 ${primary.name} ↑${fmtBytes(primary.out)} ↓${fmtBytes(primary.in)}`;
    if (active) line += ` · ↑${fmtBytes(active.outSpeed)}/s ↓${fmtBytes(active.inSpeed)}/s`;
    lines.push(line);
  }

  if (cellular && cellular !== primary) {
    lines.push(`${cellular.name} ↑${fmtBytes(cellular.out)} ↓${fmtBytes(cellular.in)}`);
  }

  return lines;
}

function exitLine(meta) {
  const suffix = [meta.loc, meta.colo].filter(Boolean).join(' · ');
  return `出口 ${maskIP(meta.ip)}${suffix ? ' · ' + suffix : ''}`;
}

function policyText(policy) {
  if (!policy) return '';
  if (policy.recent && policy.recent.length) return `近期策略 ${policy.recent.join(' · ')}`;
  if (policy.preferred && policy.preferred.length) return `关注策略 ${policy.preferred.slice(0, 4).join(' · ')}`;
  return '';
}

function compactPolicyText(policy) {
  if (!policy) return '';
  if (policy.recent && policy.recent.length) return `策略 ${policy.recent.slice(0, 2).join(' · ')}`;
  if (policy.preferred && policy.preferred.length) return `关注 ${policy.preferred.slice(0, 3).join(' · ')}`;
  return '';
}

function summaryText(rows, total) {
  if (!rows.length) return `total ${total} ms`;
  const ok = rows.filter(row => row.ok).length;
  const icon = ok === rows.length ? '✅' : '⚠️';
  return `${icon} ${ok}/${rows.length} reachable · total ${total} ms`;
}

function dashboardSummaryText(rows, total) {
  const allOk = rows.filter(row => row.ok).length;
  const coreRows = CORE_AI.map(name => findRow(rows, name)).filter(Boolean);
  const coreOk = coreRows.filter(row => row.ok).length;
  const icon = allOk === rows.length && coreOk === coreRows.length ? '✅' : '⚠️';
  return `${icon} Core ${coreOk}/${coreRows.length} · All ${allOk}/${rows.length} · ${total}ms`;
}

function dashboardCoreLatencyText(rows) {
  const parts = CORE_AI.map(name => {
    const row = findRow(rows, name);
    if (!row) return '';
    return `${CORE_AI_SHORT[name] || name} ${row.cost}`;
  }).filter(Boolean);
  return parts.length ? `${parts.join(' · ')} ms` : '';
}

function opsSummaryText(rows) {
  const ok = rows.filter(row => row.ok).length;
  const failed = rows.filter(row => !row.ok);
  if (!failed.length) return `🛠 Ops ${ok}/${rows.length}`;
  return `🛠 Ops ${ok}/${rows.length} · ❌ ${failedListText(failed)}`;
}

function failedListText(rows) {
  const names = rows.slice(0, 4).map(row => row.name);
  if (rows.length > names.length) names.push(`+${rows.length - names.length}`);
  return names.join(', ');
}

function rowText(row) {
  let text = `${row.ok ? '✅' : '❌'} ${padRight(row.name, 13)} ${padLeft(row.cost, 5)} ms`;
  if (config.showStatus) text += ` · ${row.status}`;
  return text;
}

function costText(row) {
  if (!row) return '';
  return `${row.name} ${row.cost}ms`;
}

function coreAiOk(rows) {
  return CORE_AI.every(name => {
    const row = findRow(rows, name);
    return row && row.ok;
  });
}

function findRow(rows, name) {
  return rows.find(row => row.name === name);
}

function failRow(target) {
  return {
    group: target.group,
    name: target.name,
    ok: false,
    cost: config.timeout,
    status: 'error',
  };
}

function pickTargets(targets, cfg) {
  if (cfg.mode === 'ai-only') return targets.filter(target => target.group === 'ai');

  const explicit = explicitGroups(cfg);
  if (explicit.length) {
    return targets.filter(target => explicit.indexOf(target.group) !== -1);
  }

  const groups = cfg.mode === 'full' ? GROUP_ORDER : DASHBOARD_GROUPS;
  return targets.filter(target => groups.indexOf(target.group) !== -1);
}

function parseCustomChecks(value) {
  return String(value || '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const parts = item.split(',').map(part => part.trim());
      const name = parts[0];
      const url = parts[1];
      if (!name || !/^https?:\/\//i.test(url || '')) return null;
      const ok = parseStatusList(parts[2]) || [200, 204, 301, 302, 400, 401, 403, 404, 405];
      return {
        group: 'ops',
        name: name.slice(0, 24) || `Ops ${index + 1}`,
        url,
        ok,
      };
    })
    .filter(Boolean);
}

function parseStatusList(value) {
  if (!value) return null;
  const list = String(value)
    .split(/[+\/;:\s]+/)
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item) && item >= 100 && item <= 599);
  return list.length ? list : null;
}

function explicitGroups(cfg) {
  const groups = parseGroupList(cfg.group);
  if (!groups.length || groups.indexOf('all') !== -1) return [];
  return groups;
}

function parseGroupList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function shouldLoadTraffic(cfg) {
  if (!cfg.showTraffic || cfg.mode === 'ai-only') return false;
  return true;
}

function parseArgument(argument) {
  const out = {};
  if (!argument) return out;

  argument.split('&').forEach(pair => {
    const index = pair.indexOf('=');
    if (index === -1) return;
    const rawKey = safeDecode(pair.slice(0, index));
    const value = safeDecode(pair.slice(index + 1));
    const key = rawKey.replace(/[-_]/g, '').toLowerCase();

    if (key === 'title') out.title = value;
    if (key === 'icon') out.icon = value;
    if (key === 'color' || key === 'iconcolor') out.color = value;
    if (key === 'group') out.group = value;
    if (key === 'mode') out.mode = value;
    if (key === 'iplookup') out.ipLookup = value;
    if (key === 'showstatus') out.showStatus = parseBoolean(value, true);
    if (key === 'showip') out.showIP = parseBoolean(value, true);
    if (key === 'showtraffic') out.showTraffic = parseBoolean(value, true);
    if (key === 'shownode') out.showNode = parseBoolean(value, true);
    if (key === 'mask') out.mask = parseBoolean(value, false);
    if (key === 'event') out.event = parseBoolean(value, false);
    if (key === 'eventdelay') {
      const delay = Number(value);
      if (!Number.isNaN(delay)) out.eventDelay = delay;
    }
    if (key === 'policies') out.policies = splitPolicies(value);
    if (key === 'customchecks') out.customChecks = parseCustomChecks(value);
    if (key === 'timeout') {
      const timeout = Number(value);
      if (!Number.isNaN(timeout)) out.timeout = timeout;
    }
  });

  return out;
}

function normalizeConfig(cfg) {
  const mode = String(cfg.mode || '').toLowerCase();
  cfg.mode = ['dashboard', 'full', 'ai-only'].indexOf(mode) !== -1 ? mode : 'dashboard';

  cfg.timeout = clamp(Number(cfg.timeout) || DEFAULT_CONFIG.timeout, 1000, 15000);
  cfg.eventDelay = clamp(Number(cfg.eventDelay) || 0, 0, 30);
  cfg.ipLookup = String(cfg.ipLookup || DEFAULT_CONFIG.ipLookup).toLowerCase();
  if (['off', 'none', 'false'].indexOf(cfg.ipLookup) !== -1) cfg.ipLookup = 'off';
  if (['cloudflare', 'cf'].indexOf(cfg.ipLookup) !== -1) cfg.ipLookup = 'cloudflare';
  if (['cloudflare-ipapi', 'cloudflare-ip-api', 'cf-ipapi', 'ipapi'].indexOf(cfg.ipLookup) !== -1) {
    cfg.ipLookup = 'cloudflare-ipapi';
  }

  if (!Array.isArray(cfg.policies) || !cfg.policies.length) cfg.policies = DEFAULT_POLICIES;
  return cfg;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].indexOf(normalized) !== -1) return false;
  if (['true', '1', 'yes', 'on'].indexOf(normalized) !== -1) return true;
  return fallback;
}

function splitPolicies(value) {
  return String(value || '')
    .split(/[|,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, '%20'));
  } catch (e) {
    return String(value);
  }
}

function isLookupOff(value) {
  return String(value || '').toLowerCase() === 'off';
}

function usesIpApi(value) {
  return String(value || '').toLowerCase().indexOf('ipapi') !== -1;
}

function shortError(err) {
  const message = String((err && (err.message || err.error)) || err || 'error');
  if (message.length > 24) return 'error';
  return message;
}

function numberFrom() {
  for (let i = 0; i < arguments.length; i++) {
    const n = Number(arguments[i]);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

function fmtBytes(value) {
  const n = Number(value || 0);
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + 'GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + 'MB';
  if (n >= 1024) return (n / 1024).toFixed(2) + 'KB';
  return n.toFixed(0) + 'B';
}

function shortOrg(value) {
  return String(value || '')
    .replace(/,\s*(LLC|Inc\.?|Limited|Ltd\.?|Corporation|Corp\.?)$/i, '')
    .replace(/\s+(LLC|Inc\.?|Limited|Ltd\.?|Corporation|Corp\.?)$/i, '')
    .trim();
}

function shortAsn(value) {
  const match = String(value || '').match(/\bAS\d+\b/i);
  return match ? match[0].toUpperCase() : shortOrg(value);
}

function maskIP(value) {
  const text = String(value || '');
  if (!config.mask) return text;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split('.');
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (text.indexOf(':') !== -1) {
    const parts = text.split(':').filter(Boolean);
    if (parts.length <= 2) return text;
    return `${parts.slice(0, 2).join(':')}:…`;
  }
  return text;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactLines(lines) {
  const out = [];
  lines.forEach(line => {
    if (line !== '' || out[out.length - 1] !== '') out.push(line);
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function padRight(value, width) {
  let text = String(value);
  while (text.length < width) text += ' ';
  return text;
}

function padLeft(value, width) {
  let text = String(value);
  while (text.length < width) text = ' ' + text;
  return text;
}
