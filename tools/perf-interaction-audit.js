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
const PORT = Math.max(1024, Number(arg('port', process.env.PERF_DEVTOOLS_PORT || '9223')) || 9223);
const TIMEOUT_MS = Math.max(3000, Number(arg('timeout', process.env.PERF_TIMEOUT_MS || '12000')) || 12000);
const QUIET_MS = Math.max(200, Number(arg('quiet', process.env.PERF_QUIET_MS || '450')) || 450);
const WRITES = String(arg('writes', 'false')).toLowerCase() === 'true';
const OUT_DIR = path.resolve(arg('out', process.env.PERF_OUT || 'perf-results'));
const MARKER = `PERF-AUDIT-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const POST_TEXT = `${MARKER} post latency measurement`;
const COMMENT_TEXT = `${MARKER} comment latency measurement`;

if (!SERIAL) {
  console.error('Missing --serial=<android-device-serial>');
  process.exit(2);
}

function adb(args) {
  return execFileSync(ADB, ['-s', SERIAL, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function round(v, digits = 1) {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function metricDelta(before, after, key, scale = 1) {
  const a = Number(before && before[key]);
  const b = Number(after && after[key]);
  return Number.isFinite(a) && Number.isFinite(b) ? round((b - a) * scale, 2) : 0;
}

function csvEscape(value) {
  const s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.setTimeout(1500, () => req.destroy(new Error('timeout')));
  });
}

function getPid() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const pid = adb(['shell', 'pidof', PACKAGE]);
      if (pid) return pid.split(/\s+/)[0];
    } catch (_) {}
  }
  throw new Error(`App ${PACKAGE} is not running. Open Folcen first.`);
}

function forwardWebView(pid) {
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}

  try {
    const preferred = `webview_devtools_remote_${pid}`;
    adb(['forward', `tcp:${PORT}`, `localabstract:${preferred}`]);
    return preferred;
  } catch (_) {}

  const unix = adb(['shell', 'cat', '/proc/net/unix']);
  const sockets = [...unix.matchAll(/@(webview_devtools_remote[^\s]*)/g)].map(m => m[1]);
  const socket = sockets.find(s => s.includes(pid)) || sockets[0];
  if (!socket) throw new Error('No Android WebView DevTools socket found');
  adb(['forward', `tcp:${PORT}`, `localabstract:${socket}`]);
  return socket;
}

async function waitForDevtools() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const v = await httpJson(`http://127.0.0.1:${PORT}/json/version`);
      if (v && v.webSocketDebuggerUrl) return v;
    } catch (err) { lastError = err; }
    await sleep(200);
  }
  throw new Error(`DevTools unavailable: ${lastError ? lastError.message : 'timeout'}`);
}

async function installProbe(page) {
  await page.evaluate(() => {
    if (window.__folcenInteractionProbe) return;
    window.__folcenInteractionProbe = true;
    window.__folcenInteractionMutation = performance.now();
    const observer = new MutationObserver(() => {
      window.__folcenInteractionMutation = performance.now();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });
}

function createNetworkMonitor(page) {
  const starts = new Map();
  let current = null;

  page.on('request', req => {
    const t = Date.now();
    starts.set(req, t);
    if (!current || t < current.startedAt) return;
    current.inflight += 1;
    current.lastActivity = t;
  });

  const finish = (req, failed) => {
    const end = Date.now();
    const start = starts.get(req);
    starts.delete(req);
    if (!current || !start || start < current.startedAt) return;
    const url = req.url();
    const type = req.resourceType();
    const api = /\/api\//i.test(url) || /folcenv6-production\.up\.railway\.app/i.test(url);
    current.inflight = Math.max(0, current.inflight - 1);
    current.lastActivity = end;
    current.requests.push({
      url,
      type,
      api,
      failed: !!failed,
      durationMs: end - start,
    });
  };

  page.on('requestfinished', req => finish(req, false));
  page.on('requestfailed', req => finish(req, true));

  return {
    begin(label) {
      current = { label, startedAt: Date.now(), lastActivity: Date.now(), inflight: 0, requests: [] };
    },
    current() { return current; },
    end() { const done = current; current = null; return done; },
  };
}

function summarizeNetwork(w) {
  const reqs = (w && w.requests) || [];
  const api = reqs.filter(r => r.api);
  const durations = api.map(r => r.durationMs).sort((a, b) => a - b);
  return {
    requestCount: reqs.length,
    apiCount: api.length,
    apiMaxMs: durations.length ? Math.max(...durations) : 0,
    apiMedianMs: durations.length ? durations[Math.floor((durations.length - 1) / 2)] : 0,
    failedCount: reqs.filter(r => r.failed).length,
    slowApis: api.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 5),
  };
}

async function activeInfo(page) {
  return page.evaluate(() => {
    const visible = el => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('ion-router-outlet .ion-page'));
    const active = [...candidates].reverse().find(el =>
      !el.classList.contains('ion-page-hidden') && visible(el)
    ) || document.body;
    const loaders = Array.from(document.querySelectorAll('app-loader, app-sandglass-loader, ion-loading'));
    const loading = loaders.some(visible);
    const text = String(active.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      loading,
      textLength: text.length,
      now: performance.now(),
      lastMutation: Number(window.__folcenInteractionMutation || performance.now()),
      url: location.pathname + location.search + location.hash,
    };
  });
}

async function waitUiStable(page, maxMs = 6500) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < maxMs) {
    last = await activeInfo(page);
    if (!last.loading && last.textLength >= 10 && (last.now - last.lastMutation) >= QUIET_MS) return last;
    await sleep(70);
  }
  return last || {};
}

async function waitRoute(page, pattern) {
  await page.waitForFunction(
    p => location.pathname.includes(p),
    { timeout: TIMEOUT_MS },
    pattern
  );
}

async function isVisible(page, selector) {
  return page.$eval(selector, el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).catch(() => false);
}

async function clickSelector(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT_MS });
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing ${sel}`);
    el.click();
  }, selector);
}

async function clickVisibleText(page, selector, text) {
  const ok = await page.evaluate(({ selector, text }) => {
    const visible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const els = Array.from(document.querySelectorAll(selector));
    const target = els.find(el => visible(el) && String(el.textContent || '').trim().includes(text));
    if (!target) return false;
    target.click();
    return true;
  }, { selector, text });
  if (!ok) throw new Error(`Could not find visible ${selector} containing '${text}'`);
}

async function fillIonicTextarea(page, hostSelector, value) {
  await page.waitForSelector(hostSelector, { visible: true, timeout: TIMEOUT_MS });
  const handle = await page.evaluateHandle(sel => {
    const host = document.querySelector(sel);
    if (!host) return null;
    return (host.shadowRoot && host.shadowRoot.querySelector('textarea')) || host.querySelector('textarea') || host;
  }, hostSelector);
  const el = handle.asElement();
  if (!el) throw new Error(`Textarea not found inside ${hostSelector}`);
  await el.click();
  await page.keyboard.type(value, { delay: 2 });
  await handle.dispose();
}

async function measure(page, monitor, results, stage, name, action) {
  const beforeMetrics = await page.metrics();
  monitor.begin(`${stage}:${name}`);
  const started = Date.now();
  let extra = {};
  let error = '';
  try {
    extra = (await action()) || {};
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  }
  const totalMs = Date.now() - started;
  const network = summarizeNetwork(monitor.end());
  const afterMetrics = await page.metrics();
  const row = {
    stage,
    name,
    totalMs,
    error,
    ...network,
    taskDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'TaskDuration', 1000),
    scriptDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'ScriptDuration', 1000),
    layoutDeltaMs: metricDelta(beforeMetrics, afterMetrics, 'LayoutDuration', 1000),
    heapDeltaMB: metricDelta(beforeMetrics, afterMetrics, 'JSHeapUsedSize', 1 / (1024 * 1024)),
    url: page.url(),
    ...extra,
  };
  results.push(row);
  console.log(`[${stage.toUpperCase()}] ${name.padEnd(25)} total=${totalMs}ms api=${row.apiCount} apiMax=${row.apiMaxMs}ms${error ? ` ERROR=${error}` : ''}`);
  return row;
}

async function openTab(page, tab) {
  const selector = `ion-tab-button[data-tour="tab-${tab}"]`;
  await clickSelector(page, selector);
  await waitRoute(page, `/tabs/${tab}`);
  await waitUiStable(page);
}

async function historyBack(page, routeHint) {
  await page.evaluate(() => history.back());
  if (routeHint) await waitRoute(page, routeHint);
  await waitUiStable(page);
}

async function scrollActiveToBottom(page) {
  return page.evaluate(async () => {
    const visible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const contents = Array.from(document.querySelectorAll('ion-content')).filter(visible);
    const content = contents[contents.length - 1];
    if (!content) return false;
    if (typeof content.scrollToBottom === 'function') await content.scrollToBottom(350);
    return true;
  });
}

async function waitForText(page, text, timeout = TIMEOUT_MS) {
  await page.waitForFunction(
    t => String(document.body.innerText || '').includes(t),
    { timeout },
    text
  );
}

async function findPostableChannel(page, monitor, results) {
  await openTab(page, 'channels');
  await page.waitForSelector('.channel-card', { visible: true, timeout: TIMEOUT_MS });
  const count = await page.$$eval('.channel-card', els => els.length);
  const attempts = Math.min(count, 6);

  for (let i = 0; i < attempts; i += 1) {
    const row = await measure(page, monitor, results, 'channel', `open_channel_${i + 1}`, async () => {
      await page.evaluate(index => {
        const cards = Array.from(document.querySelectorAll('.channel-card'));
        if (!cards[index]) throw new Error(`Channel card ${index} missing`);
        cards[index].click();
      }, i);
      await page.waitForSelector('.channel-hero', { visible: true, timeout: TIMEOUT_MS });
      const stable = await waitUiStable(page);
      const postCount = await page.$$eval('app-post', els => els.length).catch(() => 0);
      const canPost = await isVisible(page, '.post-btn');
      const channelName = await page.$eval('.ch-name', el => String(el.textContent || '').trim()).catch(() => 'unknown');
      return { postCount, canPost, channelName, contentUrl: stable.url || '' };
    });

    if (!row.error && row.canPost) return row;

    await historyBack(page, '/tabs/channels');
    await page.waitForSelector('.channel-card', { visible: true, timeout: TIMEOUT_MS });
  }

  throw new Error('No postable channel found among the first visible followed channels');
}

function writeResults(results, metadata) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(OUT_DIR, `interaction-${SERIAL}-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ metadata, results }, null, 2));
  const columns = [
    'stage','name','totalMs','apiCount','apiMedianMs','apiMaxMs','requestCount','failedCount',
    'taskDeltaMs','scriptDeltaMs','layoutDeltaMs','heapDeltaMB','channelName','postCount','canPost',
    'marker','writes','url','error'
  ];
  const lines = [columns.join(',')];
  for (const row of results) lines.push(columns.map(c => csvEscape(row[c])).join(','));
  fs.writeFileSync(`${base}.csv`, lines.join('\n'));
  return { json: `${base}.json`, csv: `${base}.csv` };
}

async function main() {
  console.log('===== FOLCEN INTERACTION PERFORMANCE AUDIT =====');
  console.log(`device=${SERIAL}`);
  console.log(`writes=${WRITES}`);
  console.log(`marker=${MARKER}`);
  if (WRITES) {
    console.log('WRITE MODE: one labeled text post + one labeled comment will be created; profile Save is measured without changing profile values.');
  } else {
    console.log('READ-ONLY MODE: creation/update steps are skipped. Use --writes=true to include them.');
  }

  const pid = getPid();
  const socket = forwardWebView(pid);
  console.log(`pid=${pid} socket=${socket} tcp=${PORT}`);
  await waitForDevtools();

  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => /^https?:\/\//i.test(p.url())) || pages[0];
  if (!page) throw new Error('No WebView page found');
  page.setDefaultTimeout(TIMEOUT_MS);
  await installProbe(page);
  const monitor = createNetworkMonitor(page);
  const results = [];

  await measure(page, monitor, results, 'profile', 'open_profile', async () => {
    await openTab(page, 'profile');
    return {};
  });

  await measure(page, monitor, results, 'settings', 'open_settings', async () => {
    await clickSelector(page, '[routerlink="/tabs/profile/settings"]');
    await waitRoute(page, '/tabs/profile/settings');
    await page.waitForSelector('.settings-content', { visible: true, timeout: TIMEOUT_MS });
    await waitUiStable(page);
    return {};
  });

  await measure(page, monitor, results, 'settings', 'scroll_settings', async () => {
    const ok = await scrollActiveToBottom(page);
    await sleep(450);
    await waitUiStable(page, 3500);
    return { scrollOk: ok };
  });

  await historyBack(page, '/tabs/profile');

  await measure(page, monitor, results, 'profile', 'open_edit_profile', async () => {
    await clickSelector(page, '[routerlink="/tabs/profile/form"]');
    await waitRoute(page, '/tabs/profile/form');
    await page.waitForSelector('form', { visible: true, timeout: TIMEOUT_MS });
    await waitUiStable(page);
    return {};
  });

  if (WRITES) {
    await measure(page, monitor, results, 'profile', 'save_profile_unchanged', async () => {
      await clickVisibleText(page, 'ion-button', 'Save');
      await waitRoute(page, '/tabs/profile/display/null');
      await waitUiStable(page);
      return { writes: true };
    });
  } else {
    await historyBack(page, '/tabs/profile');
  }

  const channel = await findPostableChannel(page, monitor, results);
  console.log(`Selected channel: ${channel.channelName} posts=${channel.postCount}`);

  await measure(page, monitor, results, 'channel', 'scroll_channel_posts', async () => {
    const before = await page.$$eval('app-post', els => els.length).catch(() => 0);
    const ok = await scrollActiveToBottom(page);
    await sleep(500);
    await waitUiStable(page, 4500);
    const after = await page.$$eval('app-post', els => els.length).catch(() => 0);
    return { scrollOk: ok, postCountBefore: before, postCountAfter: after, postsAdded: Math.max(0, after - before) };
  });

  const existingPosts = await page.$$eval('app-post', els => els.length).catch(() => 0);
  if (existingPosts > 0) {
    await measure(page, monitor, results, 'post', 'open_existing_post_comments', async () => {
      const clicked = await page.evaluate(() => {
        const text = document.querySelector('app-post .jdl-text');
        if (!text) return false;
        text.click();
        return true;
      });
      if (!clicked) throw new Error('No existing post text found');
      await waitRoute(page, '/tabs/channels/post/');
      await page.waitForSelector('.comments-page', { visible: true, timeout: TIMEOUT_MS });
      await waitUiStable(page);
      const comments = await page.$$eval('.comments-list app-comment', els => els.length).catch(() => 0);
      return { comments };
    });

    await measure(page, monitor, results, 'comment', 'scroll_existing_comments', async () => {
      const before = await page.$$eval('.comments-list app-comment', els => els.length).catch(() => 0);
      const ok = await scrollActiveToBottom(page);
      await sleep(500);
      await waitUiStable(page, 4500);
      const after = await page.$$eval('.comments-list app-comment', els => els.length).catch(() => 0);
      return { scrollOk: ok, commentsBefore: before, commentsAfter: after, commentsAdded: Math.max(0, after - before) };
    });

    await historyBack(page, '/tabs/channels');
    await page.waitForSelector('.channel-hero', { visible: true, timeout: TIMEOUT_MS });
  }

  if (WRITES) {
    await measure(page, monitor, results, 'post', 'open_create_post', async () => {
      await clickSelector(page, '.post-btn');
      await page.waitForSelector('ion-modal .creative-textarea, .creative-textarea', { visible: true, timeout: TIMEOUT_MS });
      await waitUiStable(page, 3500);
      return { writes: true };
    });

    await measure(page, monitor, results, 'post', 'submit_text_post', async () => {
      const selector = await isVisible(page, 'ion-modal .creative-textarea') ? 'ion-modal .creative-textarea' : '.creative-textarea';
      await fillIonicTextarea(page, selector, POST_TEXT);
      await clickSelector(page, '.post-submit-btn');
      await waitForText(page, POST_TEXT, TIMEOUT_MS);
      await waitUiStable(page, 5000);
      return { writes: true, marker: MARKER };
    });

    await measure(page, monitor, results, 'post', 'open_created_post', async () => {
      const clicked = await page.evaluate(marker => {
        const els = Array.from(document.querySelectorAll('app-post .jdl-text'));
        const target = els.find(el => String(el.textContent || '').includes(marker));
        if (!target) return false;
        target.click();
        return true;
      }, MARKER);
      if (!clicked) throw new Error('Created post marker not found in channel list');
      await waitRoute(page, '/tabs/channels/post/');
      await page.waitForSelector('.comments-page', { visible: true, timeout: TIMEOUT_MS });
      await waitUiStable(page);
      return { writes: true, marker: MARKER };
    });

    await measure(page, monitor, results, 'comment', 'submit_text_comment', async () => {
      await fillIonicTextarea(page, '.comment-textarea', COMMENT_TEXT);
      await clickSelector(page, '.send-btn');
      await waitForText(page, COMMENT_TEXT, TIMEOUT_MS);
      await waitUiStable(page, 5000);
      return { writes: true, marker: MARKER };
    });
  }

  const metadata = {
    createdAt: new Date().toISOString(),
    deviceSerial: SERIAL,
    deviceModel: adb(['shell', 'getprop', 'ro.product.model']),
    androidVersion: adb(['shell', 'getprop', 'ro.build.version.release']),
    package: PACKAGE,
    pid,
    pageUrl: page.url(),
    writes: WRITES,
    marker: MARKER,
    note: WRITES
      ? 'The audit creates one labeled test post and one labeled test comment. Profile save is performed with unchanged values.'
      : 'Read-only interaction audit.',
  };

  const files = writeResults(results, metadata);
  console.log('\n===== INTERACTION RESULTS =====');
  console.table(results.map(r => ({ stage: r.stage, name: r.name, totalMs: r.totalMs, apiCount: r.apiCount, apiMaxMs: r.apiMaxMs, error: r.error || '' })));
  console.log(files.json);
  console.log(files.csv);
  if (WRITES) {
    console.log(`\nCreated audit content marker: ${MARKER}`);
    console.log('The test post/comment are intentionally labeled so they can be deleted after analysis.');
  }

  await browser.disconnect();
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
}

main().catch(err => {
  console.error('\nINTERACTION AUDIT FAILED');
  console.error(err && err.stack || err);
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
  process.exit(1);
});
