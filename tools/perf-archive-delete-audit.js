#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find(v => v.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const SERIAL = arg('serial');
const MARKER = arg('marker');
const OUT_DIR = path.resolve(
  arg('out', process.env.PERF_OUT || 'perf-results')
);
const ADB = '/home/emadh/Android/Sdk/platform-tools/adb';
const PACKAGE = 'com.folcen.app';
const PORT = 9224;
const TIMEOUT = 12000;
const QUIET = 450;

if (!SERIAL || !MARKER) {
  throw new Error('Use --serial=<device> --marker=<PERF-AUDIT-marker>');
}

function adb(args) {
  return execFileSync(ADB, ['-s', SERIAL, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function classify(url) {
  if (/\/socket\.io\//i.test(url)) return 'socket';
  if (/\/api\//i.test(url)) return 'rest';
  if (/folcenv6-production\.up\.railway\.app/i.test(url)) return 'asset';
  return 'other';
}

async function main() {
  console.log('===== ARCHIVE + DELETE PERFORMANCE AUDIT =====');
  console.log(`marker=${MARKER}`);

  const pid = adb(['shell', 'pidof', PACKAGE]).split(/\s+/)[0];
  if (!pid) throw new Error('Folcen is not running');

  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
  adb(['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);

  for (let i = 0; i < 30; i++) {
    try {
      await httpJson(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch (_) {
      await sleep(200);
    }
  }

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.find(p => /^https?:\/\//.test(p.url())) || pages[0];
  page.setDefaultTimeout(TIMEOUT);

  await page.evaluate(() => {
    window.__archiveAuditMutation = performance.now();
    new MutationObserver(() => {
      window.__archiveAuditMutation = performance.now();
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  });

  let current = null;
  const starts = new Map();

  page.on('request', req => {
    const now = Date.now();
    starts.set(req, now);

    if (!current) return;
    const type = classify(req.url());

    current.inflight++;
    if (type === 'rest') current.inflightRest++;
  });

  const finish = req => {
    const start = starts.get(req);
    starts.delete(req);

    if (!current || !start) return;

    const url = req.url();
    const type = classify(url);

    current.inflight = Math.max(0, current.inflight - 1);
    if (type === 'rest') {
      current.inflightRest = Math.max(0, current.inflightRest - 1);
    }

    current.requests.push({
      type,
      url,
      durationMs: Date.now() - start
    });
  };

  page.on('requestfinished', finish);
  page.on('requestfailed', finish);

  async function stable(maxMs = 10000) {
    const started = Date.now();

    while (Date.now() - started < maxMs) {
      const state = await page.evaluate(() => {
        const visible = el => {
          if (!el) return false;
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' &&
                 s.visibility !== 'hidden' &&
                 r.width > 0 &&
                 r.height > 0;
        };

        const loaders = [
          ...document.querySelectorAll(
            'app-loader, app-sandglass-loader, ion-loading, .loading-state'
          )
        ];

        return {
          loading: loaders.some(visible),
          quietFor: performance.now() -
            Number(window.__archiveAuditMutation || performance.now())
        };
      });

      if (
        !state.loading &&
        state.quietFor >= QUIET &&
        (!current || current.inflightRest === 0)
      ) return;

      await sleep(70);
    }
  }

  const results = [];

  async function measure(name, action) {
    current = {
      requests: [],
      inflight: 0,
      inflightRest: 0
    };

    const started = Date.now();
    let extra = {};
    let error = '';

    try {
      extra = await action() || {};
    } catch (e) {
      error = e.message || String(e);
    }

    const totalMs = Date.now() - started;
    const reqs = current.requests.slice();

    const rest = reqs.filter(r => r.type === 'rest');
    const assets = reqs.filter(r => r.type === 'asset');
    const sockets = reqs.filter(r => r.type === 'socket');

    const row = {
      name,
      totalMs,
      rest: rest.length,
      assets: assets.length,
      sockets: sockets.length,
      restMaxMs: rest.length
        ? Math.max(...rest.map(r => r.durationMs))
        : 0,
      slowRest: rest
        .slice()
        .sort((a,b) => b.durationMs - a.durationMs)
        .slice(0,5),
      error,
      ...extra
    };

    results.push(row);
    current = null;

    console.log(
      `[AUDIT] ${name.padEnd(24)} total=${totalMs}ms ` +
      `rest=${row.rest} asset=${row.assets} socket=${row.sockets} ` +
      `restMax=${row.restMaxMs}ms` +
      (error ? ` ERROR=${error}` : '')
    );

    return row;
  }

  async function click(selector) {
    await page.waitForSelector(selector, { visible: true });
    await page.evaluate(sel => document.querySelector(sel).click(), selector);
  }

  async function waitRoute(part) {
    await page.waitForFunction(
      p => location.pathname.includes(p),
      { timeout: TIMEOUT },
      part
    );
  }

  // Return to own profile.
  await click('ion-tab-button[data-tour="tab-profile"]');
  await waitRoute('/tabs/profile');
  await stable();

  await measure('open_my_archive', async () => {
    await click('ion-button[title="My Archive"]');
    await waitRoute('/activity');
    await page.waitForSelector('.archive-container', { visible: true });
    await stable();

    const items = await page.$$eval('.activity-item', els => els.length);
    return { items };
  });

  async function filter(value) {
    await page.evaluate(v => {
      const el = document.querySelector(
        `ion-segment-button[value="${v}"]`
      );
      if (!el) throw new Error(`Archive filter ${v} missing`);
      el.click();
    }, value);

    await stable();

    return page.$$eval('.activity-item', els => els.length);
  }

  await measure('archive_posts_filter', async () => ({
    items: await filter('posts')
  }));

  await measure('archive_comments_filter', async () => ({
    items: await filter('comments')
  }));

  await measure('archive_everything', async () => ({
    items: await filter('my')
  }));

  await measure('archive_scroll', async () => {
    const before = await page.$$eval('.activity-item', els => els.length);

    await page.evaluate(async () => {
      const c = document.querySelector('ion-content');
      if (c && c.scrollToBottom) await c.scrollToBottom(350);
    });

    await sleep(600);
    await stable();

    const after = await page.$$eval('.activity-item', els => els.length);
    return { before, after, added: Math.max(0, after - before) };
  });

  await filter('posts');

  const markerExists = await page.evaluate(marker =>
    [...document.querySelectorAll('.activity-item')].some(item => {
      const type = String(
        item.querySelector('.item-type')?.textContent || ''
      ).trim().toLowerCase();

      return type === 'post' &&
        String(item.textContent || '').includes(marker);
    }), MARKER
  );

  if (!markerExists) {
    throw new Error(`Audit post not found in My Archive: ${MARKER}`);
  }

  let postId = '';

  await measure('archive_open_audit_post', async () => {
    const clicked = await page.evaluate(marker => {
      const item = [...document.querySelectorAll('.activity-item')]
        .find(el => {
          const type = String(
            el.querySelector('.item-type')?.textContent || ''
          ).trim().toLowerCase();

          return type === 'post' &&
            String(el.textContent || '').includes(marker);
        });

      if (!item) return false;
      item.click();
      return true;
    }, MARKER);

    if (!clicked) throw new Error('Could not click audit post');

    await waitRoute('/tabs/channels/post/');
    await page.waitForSelector('.comments-page', { visible: true });
    await stable();

    postId = locationFromUrl(page.url());

    return { postId };
  });

  function locationFromUrl(url) {
    const m = url.match(/\/tabs\/channels\/post\/([^?#/]+)/);
    return m ? m[1] : '';
  }

  await measure('delete_audit_post', async () => {
    const opened = await page.evaluate(() => {
      const buttons = [
        ...document.querySelectorAll(
          '.post-focus app-post .jdl-top-rail ion-button'
        )
      ];

      const btn = buttons.find(b => b.querySelector('.fa-ellipsis-v'));
      if (!btn) return false;

      btn.click();
      return true;
    });

    if (!opened) throw new Error('Owner post menu button not found');

    await page.waitForFunction(() =>
      [...document.querySelectorAll('.dropdown-item')]
        .some(el => String(el.textContent || '').includes('Delete'))
    );

    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.dropdown-item')]
        .find(x => String(x.textContent || '').includes('Delete'));

      if (!el) throw new Error('Delete option missing');
      el.click();
    });

    await page.waitForSelector('ion-alert');

    const confirmed = await page.evaluate(() => {
      const alert = document.querySelector('ion-alert');
      if (!alert) return false;

      const root = alert.shadowRoot || alert;
      const btn = [...root.querySelectorAll('button')]
        .find(b => String(b.textContent || '').trim() === 'Yes');

      if (!btn) return false;
      btn.click();
      return true;
    });

    if (!confirmed) throw new Error('Delete confirmation Yes not found');

    await sleep(250);
    await stable();

    return { postId };
  });

  await measure('verify_deleted_reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    await page.waitForSelector('.comments-page', { timeout: TIMEOUT });

    await page.waitForFunction(() => {
      const txt = String(document.body.innerText || '');
      return txt.includes('Content is Hidden') ||
             txt.includes('has been removed');
    }, { timeout: TIMEOUT });

    await stable();

    return {
      deletedConfirmed: true,
      postId
    };
  });

  console.log('\n===== ARCHIVE / DELETE RESULTS =====');
  console.table(results.map(r => ({
    name: r.name,
    totalMs: r.totalMs,
    rest: r.rest,
    assets: r.assets,
    sockets: r.sockets,
    restMaxMs: r.restMaxMs,
    error: r.error
  })));

  console.log('\n===== SLOW REST REQUESTS =====');
  for (const r of results) {
    if (!r.slowRest?.length) continue;

    console.log(`\n${r.name}`);
    for (const req of r.slowRest) {
      console.log(`${req.durationMs}ms  ${req.url}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const out = path.join(
    OUT_DIR,
    `archive-delete-${SERIAL}-` +
      `${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );

  fs.writeFileSync(out, JSON.stringify({
    marker: MARKER,
    postId,
    results
  }, null, 2));

  console.log(`\n${out}`);

  await browser.disconnect();
  try { adb(['forward', '--remove', `tcp:${PORT}`]); } catch (_) {}
}

main().catch(err => {
  console.error('\nARCHIVE/DELETE AUDIT FAILED');
  console.error(err.stack || err);
  process.exitCode = 1;
});
