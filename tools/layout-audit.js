#!/usr/bin/env node
const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');

const DEFAULT_URL = process.env.APP_BASE || process.argv[2] || 'http://localhost:2300';

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(rgb1, rgb2) {
  const L1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  const L2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function runAudit() {
  const url = DEFAULT_URL;
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1366, height: 768 }
  ];

  console.log('Launching Puppeteer for', url);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], dumpio: true });
  const page = await browser.newPage();
  const results = { url, viewports: [], scanned: [] };

  // optional auth
  const AUDIT_USER = process.env.AUDIT_USER || process.argv[3];
  const AUDIT_PASS = process.env.AUDIT_PASS || process.argv[4];
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_EXPIRES = process.env.JWT_EXPIRES_TIME || process.env.JWT_EXPIRES || null;
  async function setJwtInPage(userEmail) {
    if (!JWT_SECRET || !userEmail) return false;
    try {
      const ms = JWT_EXPIRES ? Number(JWT_EXPIRES) : 3600000;
      const seconds = Math.max(1, Math.floor(ms / 1000));
      const payload = { email: userEmail };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: seconds });
      // set token in page localStorage
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
      await page.evaluate(t => { try { localStorage.setItem('token', t); localStorage.setItem('auth_token', t); } catch(e){} }, token);
      console.log('JWT set in localStorage for audit');
      return true;
    } catch (e) {
      console.warn('Failed to generate/set JWT:', e && e.message);
      return false;
    }
  }
  async function tryLogin() {
    if (!AUDIT_USER) return false;
    try {
      console.log('Attempting login for', AUDIT_USER);
      await page.goto(url + '/auth/signin', { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      const emailSelectors = ['input[type=email]', 'input[name=email]', 'input[formcontrolname=email]', 'input#email'];
      const passSelectors = ['input[type=password]', 'input[name=password]', 'input[formcontrolname=password]', 'input#password'];
      let emailSel = null, passSel = null;
      for (const s of emailSelectors) {
        if (await page.$(s)) { emailSel = s; break; }
      }
      for (const s of passSelectors) {
        if (await page.$(s)) { passSel = s; break; }
      }
      if (emailSel && passSel) {
        await page.click(emailSel);
        await page.focus(emailSel);
        await page.keyboard.type(AUDIT_USER, { delay: 20 });
        await page.click(passSel);
        await page.focus(passSel);
        await page.keyboard.type(AUDIT_PASS, { delay: 20 });
        // try common submit buttons
        const btns = ['button[type=submit]', 'button.ion-button', 'button', 'ion-button'];
        for (const b of btns) {
          const el = await page.$(b);
          if (el) {
            await el.click();
            break;
          }
        }
        // wait for token in localStorage or redirect
        for (let i=0;i<20;i++){
          const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('auth_token') || sessionStorage.getItem('token'));
          if (token) { console.log('Found token after login'); return true; }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (e) {
      console.warn('Login attempt failed:', e && e.message);
    }
    return false;
  }

  // try login if credentials provided
  // if JWT secret present, set JWT first (preferred)
  let loggedIn = false;
  if (JWT_SECRET && AUDIT_USER) {
    loggedIn = await setJwtInPage(AUDIT_USER);
  }
  if (!loggedIn) loggedIn = await tryLogin();
  if (loggedIn) {
    console.log('Login successful, proceeding to scan protected routes');
  } else if (AUDIT_USER) {
    console.log('Login not confirmed; continuing without auth');
  }

  // crawl seed routes + discovered links
  const seedRoutes = [
    url,
    url + '/auth/signin',
    url + '/auth/signup',
    url + '/tabs/home',
    url + '/tabs/messages',
    url + '/tabs/profile',
    url + '/new-friends',
    url + '/buy-and-sell',
    url + '/channels',
    url + '/settings'
  ];
  const toVisit = new Set(seedRoutes);
  const visited = new Set();

  while (toVisit.size > 0 && visited.size < 120) {
    const next = Array.from(toVisit)[0];
    toVisit.delete(next);
    if (visited.has(next)) continue;
    visited.add(next);
    console.log('Scanning', next);

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      try {
        await page.goto(next, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (e) {
        console.warn('Navigation failed for', next, e && e.message);
      }
      await new Promise(r => setTimeout(r, 900));

      // Run checks in page context, with Shadow DOM handling for Ionic
      const data = await page.evaluate(() => {
        function queryAllDeep(selector) {
          const results = Array.from(document.querySelectorAll(selector));
          // probe known shadow hosts (ion-content, ion-header, ion-footer)
          const hosts = Array.from(document.querySelectorAll('ion-content, ion-header, ion-footer'));
          for (const h of hosts) {
            try {
              if (h.shadowRoot) {
                results.push(...Array.from(h.shadowRoot.querySelectorAll(selector)));
              }
            } catch (e) {
              // ignore shadow access errors
            }
          }
          return results;
        }

        function getEl(selector) {
          const el = document.querySelector(selector);
          if (el) return el;
          const hosts = Array.from(document.querySelectorAll('ion-content, ion-header, ion-footer'));
          for (const h of hosts) {
            try {
              if (h.shadowRoot) {
                const found = h.shadowRoot.querySelector(selector);
                if (found) return found;
              }
            } catch (e) {}
          }
          return null;
        }

        function rectOf(el) {
          if (!el) return null;
          return el.getBoundingClientRect();
        }

        function visibleTextNodes(limit = 120) {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
          const nodes = [];
          while (walker.nextNode()) {
            const n = walker.currentNode;
            const txt = n.textContent.trim();
            if (!txt) continue;
            const p = n.parentElement;
            if (!p) continue;
            const style = window.getComputedStyle(p);
            if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) continue;
            nodes.push({ text: txt.slice(0, limit), el: p });
            if (nodes.length >= 500) break;
          }
          return nodes;
        }

        function colorToRgb(color) {
          if (!color) return null;
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.fillStyle = color;
          const computed = ctx.fillStyle; // normalizes color
          const m = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
          if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
          return null;
        }

        // locate header/footer/content using common Ionic selectors
        const header = getEl('ion-header') || getEl('header') || getEl('.app-header') || getEl('ion-toolbar');
        const footer = getEl('ion-footer') || getEl('footer') || getEl('.app-footer');
        const content = getEl('ion-content') || getEl('main') || getEl('.app-content') || getEl('.content') || document.body;

        const headerRect = rectOf(header);
        const footerRect = rectOf(footer);
        const contentRect = rectOf(content) || document.body.getBoundingClientRect();

        const overlaps = {
          headerContent: headerRect && contentRect ? !(headerRect.bottom <= contentRect.top) : false,
          footerContent: footerRect && contentRect ? !(footerRect.top >= contentRect.bottom) : false,
          headerFooter: headerRect && footerRect ? !(headerRect.bottom <= footerRect.top) : false
        };

        // contrast checks on general visible text and also elements of interest
        const nodes = visibleTextNodes();
        // elements of interest: cards, inputs, titles
        const cardSelectors = ['ion-card', '.card', '.ion-card'];
        const inputSelectors = ['input', 'textarea', 'ion-input', 'ion-textarea'];
        const titleSelectors = ['h1','h2','h3','h4','.title','.ion-title'];
        const cards = [];
        for (const s of cardSelectors) cards.push(...queryAllDeep(s));
        const inputs = [];
        for (const s of inputSelectors) inputs.push(...queryAllDeep(s));
        const titles = [];
        for (const s of titleSelectors) titles.push(...queryAllDeep(s));
        const contrastThreshold = 4.5;
        const lowContrast = [];
        for (const n of nodes) {
          const el = n.el;
          const style = window.getComputedStyle(el);
          const color = colorToRgb(style.color) || [0,0,0];
          // find effective background color by walking up until non-transparent
          let bg = null;
          let walkerEl = el;
          while (walkerEl && walkerEl !== document.documentElement) {
            const s = window.getComputedStyle(walkerEl);
            const bc = s.backgroundColor;
            if (bc && bc !== 'transparent' && bc !== 'rgba(0, 0, 0, 0)') {
              bg = colorToRgb(bc);
              break;
            }
            walkerEl = walkerEl.parentElement;
          }
          if (!bg) {
            // fallback to body background
            bg = colorToRgb(window.getComputedStyle(document.body).backgroundColor) || [255,255,255];
          }

          // compute contrast
          function luminance(r,g,b){
            const a = [r,g,b].map(v=>{v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
            return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
          }
          const L1 = luminance(color[0],color[1],color[2]);
          const L2 = luminance(bg[0],bg[1],bg[2]);
          const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
          if (ratio < contrastThreshold) {
            lowContrast.push({ text: n.text, selector: el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + (el.className?('.'+el.className.split(' ').join('.')):''), contrast: parseFloat(ratio.toFixed(2)) });
          }
          if (lowContrast.length >= 50) break;
        }

        // also compute contrast for titles, cards, inputs
        function elementDescriptor(el) {
          return el ? el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + (el.className?('.'+el.className.split(' ').join('.')):'') : '';
        }
        const details = {
          headerRect,
          footerRect,
          contentRect,
          overlaps,
          lowContrastCount: lowContrast.length,
          lowContrastSample: lowContrast.slice(0, 20),
          cards: [],
          titles: [],
          inputs: [],
          interactionIssues: []
        };

        // helper to test contrast for an element's computed style or inner text
        function testElContrast(el) {
          try {
            const s = window.getComputedStyle(el);
            const color = colorToRgb(s.color) || [0,0,0];
            let bg = null; let walkerEl = el;
            while (walkerEl && walkerEl !== document.documentElement) {
              const ss = window.getComputedStyle(walkerEl);
              const bc = ss.backgroundColor;
              if (bc && bc !== 'transparent' && bc !== 'rgba(0, 0, 0, 0)') { bg = colorToRgb(bc); break; }
              walkerEl = walkerEl.parentElement;
            }
            if (!bg) bg = colorToRgb(window.getComputedStyle(document.body).backgroundColor) || [255,255,255];
            const L1 = (function(r,g,b){const a=[r,g,b].map(v=>{v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];})(color[0],color[1],color[2]);
            const L2 = (function(r,g,b){const a=[r,g,b].map(v=>{v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];})(bg[0],bg[1],bg[2]);
            const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
            return { descriptor: elementDescriptor(el), contrast: parseFloat((isFinite(ratio)?ratio:0).toFixed(2)) };
          } catch (e) { return null; }
        }

        for (const c of cards) {
          const r = testElContrast(c);
          if (r) details.cards.push(r);
        }
        for (const t of titles) {
          const r = testElContrast(t);
          if (r) details.titles.push(r);
        }
        for (const i of inputs) {
          const r = testElContrast(i instanceof HTMLInputElement || i instanceof HTMLTextAreaElement ? i : (i.shadowRoot && i.shadowRoot.querySelector('input, textarea')) || i);
          if (r) details.inputs.push(r);
        }

        // interaction checks: touch target and font size
        try {
          const interactive = queryAllDeep('button, a, ion-button, .button, input, textarea, .ion-item');
          for (const el of interactive) {
            try {
              const rect = el.getBoundingClientRect();
              const cs = window.getComputedStyle(el);
              const fontSize = parseFloat(cs.fontSize) || 0;
              const width = rect.width || 0;
              const height = rect.height || 0;
              const issues = [];
              if (width < 44 || height < 44) issues.push('touch-target <44px');
              if (fontSize < 16) issues.push('font-size <16px');
              if (issues.length) {
                details.interactionIssues.push({ descriptor: elementDescriptor(el), width: Math.round(width), height: Math.round(height), fontSize, issues });
              }
            } catch (e) {}
          }
        } catch (e) {}

        return details;
      });

      results.viewports.push({ page: next, viewport: vp, data });
    }

    // collect internal links
    try {
      const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean));
      for (let l of links) {
        try {
          if (l.startsWith('/')) l = (new URL(location.origin)).origin + l;
          if (l.startsWith(location.origin) && !visited.has(l)) toVisit.add(l.split('#')[0].split('?')[0]);
        } catch (e) {}
      }
    } catch (e) {}

    results.scanned.push(next);
  }

  await browser.close();
  return results;
}

runAudit().then(res => {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Audit failed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
