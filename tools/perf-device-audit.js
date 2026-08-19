#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(v => v.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const ADB = arg('adb', process.env.ADB || '/home/emadh/Android/Sdk/platform-tools/adb');
const SERIAL = arg('serial', process.env.DEVICE_SERIAL || '');
const PACKAGE = arg('package', process.env.APP_PACKAGE || 'com.folcen.app');
const ACTIVITY = arg('activity', process.env.APP_ACTIVITY || '.MainActivity');
const RUNS = Math.max(1, Number(arg('runs', process.env.PERF_RUNS || '3')) || 3);
const SCROLLS = Math.max(0, Number(arg('scrolls', process.env.PERF_SCROLLS || '1')) || 1);
const PORT = Math.max(1024, Number(arg('port', process.env.PERF_DEVTOOLS_PORT || '9222')) || 9222);
const OUT_DIR = path.resolve(arg('out', process.env.PERF_OUT || 'perf-results'));
const QUIET_MS = Math.max(200, Number(arg('quiet', process.env.PERF_QUIET_MS || '450')) || 450);
const TIMEOUT_MS = Math.max(3000, Number(arg('timeout', process.env.PERF_TIMEOUT_MS || '12000')) || 12000);
const DO_STARTUP = arg('startup', 'true') !== 'false';

if (!SERIAL) {
  console.error('Missing Android serial. Example:');
  console.error('  node tools/perf-device-audit.js --serial=mbeq9tkrt8izwwpb');
  process.exit(2);
}

function adb(args, options = {}) {
  return execFileSync(ADB, ['-s', SERIAL, ...args], {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function round(v, digits = 1) {
  if (!Number.isFinite(v)) return 0;
  const factor = 10 ** digits;
  return Math.round(v * factor) / factor;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function csvEscape(value) {
  const s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(1500, () => req.destroy(new Error('timeout')));
  });
}

async function waitForDevtools() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const version = await httpJson(`http://127.0.0.1:${PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) return version;
    } catch (err) {
      lastErr = err;
    }
    await sleep(250);
  }
  throw new Error(`WebView DevTools endpoint not reachable on port ${PORT}: ${lastErr ? lastErr.message : 'timeout'}`);
}

function parseStartup(raw) {
  const get = key => {
    const m = raw.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  return {
    stage: 'startup',
    name: 'android_activity_launch',
    run: 1,
    totalMs: get('TotalTime'),
    waitMs: get('WaitTime'),
    thisTimeMs: get('ThisTime'),
    raw: raw.trim(),
  };
}

function getPid() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const pid = adb(['shell', 'pidof', PACKAGE]);
      if (pid) return pid.split(/\s+/)[0];
    } catch (_) {}
  }
  throw new Error(`Could not find running process for ${PACKAGE}`);
}

function forwardWebView(pid) {
  try {
    adb(['forward', '--remove', `tcp:${PORT}`]);
  } catch (_) {}

  const preferred = `webview_devtools_remote_${pid}`;
  try {
    adb(['forward', `tcp:${PORT}`, `localabstract:${preferred}`]);
    return preferred;
  } catch (_) {}

  const unix = adb(['shell', 'cat', '/proc/net/unix']);
  const sockets = [...unix.matchAll(/@(webview_devtools_remote[^\s]*)/g)].map(m => m[1]);
  const socket = sockets.find(s => s.includes(pid)) || sockets[0];
  if (!socket) {
    throw new Error('No webview_devtools_remote socket found. Ensure a debug APK is installed and the app is open.');
  }
  adb(['forward', `tcp:${PORT}`, `localabstract:${socket}`]);
  return socket;
}

function metricDelta(before, after, key, scale = 1) {
  const a = Number(before && before[key]);
  const b = Number(after && after[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return round((b - a) * scale, 2);
}

async function installDomProbe(page) {
  await page.evaluate(() => {
    if (window.__folcenPerfProbeInstalled) return;
    window.__folcenPerfProbeInstalled = true;
    window.__folcenPerfLastMutation = performance.now();
    window.__folcenPerfMutationCount = 0;
    const observer = new MutationObserver(() => {
      window.__folcenPerfLastMutation = performance.now();
      window.__folcenPerfMutationCount += 1;
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
}

async function visibleTabs(page) {
  return page.$$eval('ion-tab-button[data-tour^="tab-"]', els => els
    .filter(el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    })
    .map(el => String(el.getAttribute('data-tour') || '').replace(/^tab-/, ''))
    .filter(Boolean));
}

async function clickTab(page, tab) {
  const selector = `ion-tab-button[data-tour="tab-${tab}"]`;
  await page.waitForSelector(selector, { timeout: TIMEOUT_MS, visible: true });
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing tab ${sel}`);
    el.click();
  }, selector);
}

async function waitForRoute(page, tab) {
  await page.waitForFunction(
    t => location.pathname.includes(`/tabs/${t}`),
    { timeout: TIMEOUT_MS },
    tab
  );
}

async function activePageInfo(page) {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('ion-router-outlet .ion-page'));
    const active = [...candidates].reverse().find(el => {
      const s = getComputedStyle(el);
      return !el.classList.contains('ion-page-hidden') && s.display !== 'none' && s.visibility !== 'hidden';
    }) || document.querySelector('ion-router-outlet') || document.body;

    const visible = el => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };

    const loaders = Array.from(active.querySelectorAll('app-loader, app-sandglass-loader, ion-loading, .loading-overlay'));
    const loading = loaders.some(visible);
    const text = String(active.innerText || '').replace(/\s+/g, ' ').trim();
    const hasVisual = !!active.querySelector('img, .creative-card, ion-item, ion-card, app-avatar, form, textarea, input');
    const itemSelectors = [
      '.creative-card', 'ion-item', 'ion-card', '.message-item', '.friend-card',
      '.channel-card', '.product-card', '.job-card', '.service-card', '.post-card'
    ];
    const items = itemSelectors.reduce((sum, sel) => sum + active.querySelectorAll(sel).length, 0);
    return {
      loading,
      textLength: text.length,
      hasVisual,
      items,
      lastMutation: Number(window.__folcenPerfLastMutation || performance.now()),
      mutationCount: Number(window.__folcenPerfMutationCount || 0),
      now: performance.now(),
      url: location.pathname + location.search + location.hash,
    };
  });
}

async function waitForMeaningfulContent(page) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    last = await activePageInfo(page);
    if (!last.loading && (last.textLength >= 20 || last.hasVisual)) return last;
    await sleep(60);
  }
  return last || {};
}

function createNetworkMonitor(page) {
  const starts = new Map();
  let activeWindow = null;

  function category(req) {
    const type = req.resourceType();
    const url = req.url();
    const api = /\/api\//i.test(url) || /folcenv6-production\.up\.railway\.app/i.test(url);
    const media = ['image', 'media', 'font'].includes(type);
    return { type, url, api, media };
  }

  page.on('request', req => {
    const started = Date.now();
    starts.set(req, started);
    if (!activeWindow || started < activeWindow.startedAt) return;
    const c = category(req);
    activeWindow.inflight += 1;
    if (c.api) activeWindow.inflightApi += 1;
    activeWindow.lastActivity = started;
    if (c.api) activeWindow.lastApiActivity = started;
  });

  const finish = (req, failed) => {
    const ended = Date.now();
    const started = starts.get(req);
    starts.delete(req);
    if (!activeWindow || !started || started < activeWindow.startedAt) return;
    const c = category(req);
    const duration = ended - started;
    activeWindow.inflight = Math.max(0, activeWindow.inflight - 1);
    if (c.api) activeWindow.inflightApi = Math.max(0, activeWindow.inflightApi - 1);
    activeWindow.lastActivity = ended;
    if (c.api) activeWindow.lastApiActivity = ended;
    activeWindow.requests.push({
      url: c.url,
      type: c.type,
      api: c.api,
      media: c.media,
      durationMs: duration,
      failed: !!failed,
    });
  };

  page.on('requestfinished', req => finish(req, false));
  page.on('requestfailed', req => finish(req, true));

  return {
    begin(label) {
      activeWindow = {
        label,
        startedAt: Date.now(),
        requests: [],
        inflight: 0,
        inflightApi: 0,
        lastActivity: Date.now(),
        lastApiActivity: Date.now(),
      };
      return activeWindow;
    },
    current() {
      return activeWindow;
    },
    end() {
      const w = activeWindow;
      activeWindow = null;
      return w;
    },
  };
}

async function waitForStable(page, monitor) {
  const started = Date.now();
  let info = null;
  while (Date.now() - started < TIMEOUT_MS) {
    const w = monitor.current();
    info = await activePageInfo(page);
    const domQuiet = Number(info.now) - Number(info.lastMutation) >= QUIET_MS;
    const apiQuiet = !w || (w.inflightApi === 0 && Date.now() - w.lastApiActivity >= QUIET_MS);
    if (!info.loading && domQuiet && apiQuiet) return info;
    await sleep(80);
  }
  return info || {};
}

function summarizeNetwork(window) {
  const requests = window ? window.requests : [];
  const api = requests.filter(r => r.api);
  const media = requests.filter(r => r.media);
  const apiDur = api.map(r => r.durationMs);
  return {
    requestCount: requests.length,
    apiCount: api.length,
    mediaCount: media.length,
    failedCount: requests.filter(r => r.failed).length,
    apiMedianMs: round(median(apiDur)),
    apiP90Ms: round(percentile(apiDur, 90)),
    apiMaxMs: round(apiDur.length ? Math.max(...apiDur) : 0),
    slowApis: api
      .slice()
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map(r => ({ durationMs: r.durationMs, url: r.url })),
  };
}

async function measureTab(page, monitor, tab, run) {
  const beforeMetrics = await page.metrics();
  const started = Date.now();
  monitor.begin(`tab:${tab}:${run}`);

  await clickTab(page, tab);
  await waitForRoute(page, tab);
  const routeMs = Date.now() - started;

  const first = await waitForMeaningfulContent(page);
  const contentMs = Date.now() - started;

  const stable = await waitForStable(page, monitor);
  const stableMs = Date.now() - started;
  const networkWindow = monitor.end();
  const afterMetrics = await page.metrics();
  const net = summarizeNetwork(networkWindow);

  return {
    stage: 'tab',
    name: tab,
    run,
    cache: run === 1 ? 'first-pass' : 'warm',
    routeMs,
    contentMs,
    stableMs,
    totalMs: stableMs,
    textLength: stable.textLength || first.textLength || 0,
    items: stable.items || first.items || 0,
    ...net,
    taskDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'TaskDuration', 1000),
    scriptDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'ScriptDuration', 1000),
    layoutDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'LayoutDuration', 1000),
    recalcStyleDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'RecalcStyleDuration', 1000),
    heapDeltaMB: metricDelta(beforeMetrics, afterMetrics, 'JSHeapUsedSize', 1 / (1024 * 1024)),
    nodesDelta: metricDelta(beforeMetrics, afterMetrics, 'Nodes', 1),
    url: stable.url || first.url || '',
  };
}

async function scrollOnce(page, monitor, tab, run, scrollIndex) {
  const beforeInfo = await activePageInfo(page);
  const beforeMetrics = await page.metrics();
  const started = Date.now();
  monitor.begin(`scroll:${tab}:${run}:${scrollIndex}`);

  const scrollResult = await page.evaluate(async () => {
    const candidates = Array.from(document.querySelectorAll('ion-router-outlet .ion-page'));
    const active = [...candidates].reverse().find(el => {
      const s = getComputedStyle(el);
      return !el.classList.contains('ion-page-hidden') && s.display !== 'none' && s.visibility !== 'hidden';
    }) || document.body;
    const content = active.querySelector('ion-content') || document.querySelector('ion-content');
    if (!content) return { ok: false, reason: 'no-ion-content' };
    try {
      if (typeof content.scrollToBottom === 'function') {
        await content.scrollToBottom(350);
      } else {
        const scroller = content.shadowRoot && content.shadowRoot.querySelector('.inner-scroll');
        if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    }
  });

  await sleep(450);
  const stable = await waitForStable(page, monitor);
  const totalMs = Date.now() - started;
  const networkWindow = monitor.end();
  const afterMetrics = await page.metrics();
  const net = summarizeNetwork(networkWindow);

  return {
    stage: 'scroll',
    name: tab,
    run,
    scrollIndex,
    totalMs,
    itemsBefore: beforeInfo.items || 0,
    itemsAfter: stable.items || 0,
    itemsAdded: Math.max(0, (stable.items || 0) - (beforeInfo.items || 0)),
    scrollOk: !!scrollResult.ok,
    scrollReason: scrollResult.reason || '',
    ...net,
    taskDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'TaskDuration', 1000),
    scriptDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'ScriptDuration', 1000),
    layoutDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'LayoutDuration', 1000),
    recalcStyleDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'RecalcStyleDuration', 1000),
    heapDeltaMB: metricDelta(beforeMetrics, afterMetrics, 'JSHeapUsedSize', 1 / (1024 * 1024)),
    nodesDelta: metricDelta(beforeMetrics, afterMetrics, 'Nodes', 1),
    url: stable.url || '',
  };
}

function printRanking(results) {
  const tabs = results.filter(r => r.stage === 'tab');
  const byName = new Map();
  for (const r of tabs) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r.totalMs);
  }
  const rows = [...byName.entries()].map(([name, values]) => ({
    tab: name,
    medianMs: round(median(values)),
    p90Ms: round(percentile(values, 90)),
    maxMs: round(Math.max(...values)),
  })).sort((a, b) => b.medianMs - a.medianMs);
  console.log('\n===== TAB LATENCY RANKING =====');
  console.table(rows);
}

function writeResults(results, metadata) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(OUT_DIR, `perf-${SERIAL}-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ metadata, results }, null, 2));

  const columns = [
    'stage','name','run','cache','scrollIndex','routeMs','contentMs','stableMs','totalMs',
    'apiCount','apiMedianMs','apiP90Ms','apiMaxMs','requestCount','mediaCount','failedCount',
    'items','itemsBefore','itemsAfter','itemsAdded','taskDeltaMs','scriptDeltaMs','layoutDeltaMs',
    'recalcStyleDeltaMs','heapDeltaMB','nodesDelta','url'
  ];
  const lines = [columns.join(',')];
  for (const row of results) {
    lines.push(columns.map(c => csvEscape(row[c])).join(','));
  }
  fs.writeFileSync(`${base}.csv`, lines.join('\n'));
  return { json: `${base}.json`, csv: `${base}.csv` };
}

async function main() {
  console.log('===== FOLCEN DEVICE PERFORMANCE AUDIT =====');
  console.log(`device=${SERIAL}`);
  console.log(`package=${PACKAGE}`);
  console.log(`runs=${RUNS} scrolls=${SCROLLS}`);

  const results = [];

  console.log('\n===== DEVICE =====');
  console.log(adb(['shell', 'getprop', 'ro.product.model']));
  console.log(adb(['shell', 'getprop', 'ro.build.version.release']));

  if (DO_STARTUP) {
    console.log('\n===== COLD ACTIVITY START =====');
    try { adb(['shell', 'am', 'force-stop', PACKAGE]); } catch (_) {}
    await sleep(500);
    const raw = adb(['shell', 'am', 'start', '-W', '-n', `${PACKAGE}/${ACTIVITY}`]);
    console.log(raw);
    results.push(parseStartup(raw));
    await sleep(1200);
  } else {
    console.log('\n===== ATTACH TO RUNNING APP =====');
    console.log('startup disabled: leaving the current app process and screen untouched');
  }

  const pid = getPid();
  const socket = forwardWebView(pid);
  console.log(`\nWebView pid=${pid} socket=${socket} forwarded=tcp:${PORT}`);
  await waitForDevtools();

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages.find(p => /^https?:\/\//i.test(p.url())) || pages[0];
  if (!page) throw new Error('No WebView page target found');

  page.setDefaultTimeout(TIMEOUT_MS);
  await installDomProbe(page);

  console.log(`page=${page.url()}`);
  const monitor = createNetworkMonitor(page);

  let tabs = [];
  const tabDeadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < tabDeadline) {
    tabs = await visibleTabs(page);
    if (tabs.length) break;
    await sleep(250);
  }

  if (!tabs.length) {
    throw new Error(
      'No visible tab buttons found after waiting. Keep the app logged in and on a main tab screen before running the audit.'
    );
  }

  console.log(`tabs=${tabs.join(', ')}`);

  for (let run = 1; run <= RUNS; run += 1) {
    console.log(`\n===== PASS ${run}/${RUNS} =====`);
    for (const tab of tabs) {
      try {
        const nav = await measureTab(page, monitor, tab, run);
        results.push(nav);
        console.log(`[TAB] ${tab.padEnd(14)} route=${nav.routeMs}ms content=${nav.contentMs}ms stable=${nav.stableMs}ms apiP90=${nav.apiP90Ms}ms api=${nav.apiCount}`);

        for (let s = 1; s <= SCROLLS; s += 1) {
          const scroll = await scrollOnce(page, monitor, tab, run, s);
          results.push(scroll);
          console.log(`[SCROLL] ${tab.padEnd(11)} #${s} total=${scroll.totalMs}ms items+${scroll.itemsAdded} apiP90=${scroll.apiP90Ms}ms api=${scroll.apiCount}`);
        }
      } catch (err) {
        console.error(`[ERROR] ${tab}: ${err.message}`);
        results.push({ stage: 'error', name: tab, run, error: err.message });
      }
    }
  }

  printRanking(results);

  const metadata = {
    createdAt: new Date().toISOString(),
    deviceSerial: SERIAL,
    deviceModel: adb(['shell', 'getprop', 'ro.product.model']),
    androidVersion: adb(['shell', 'getprop', 'ro.build.version.release']),
    package: PACKAGE,
    pid,
    pageUrl: page.url(),
    runs: RUNS,
    scrolls: SCROLLS,
    quietMs: QUIET_MS,
    timeoutMs: TIMEOUT_MS,
  };

  const files = writeResults(results, metadata);
  console.log('\n===== RESULTS =====');
  console.log(files.json);
  console.log(files.csv);
  console.log('\nRead-only baseline complete. No posts/comments/messages were created by this stage.');

  await browser.disconnect();
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
}

main().catch(err => {
  console.error('\nPERF AUDIT FAILED');
  console.error(err && err.stack || err);
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
  process.exit(1);
});
