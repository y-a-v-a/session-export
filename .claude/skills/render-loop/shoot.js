#!/usr/bin/env node
// shoot.js — headless-Chrome screenshotter for the render-loop dev skill.
// Drives Chrome via the DevTools Protocol using Node's built-in WebSocket/fetch
// (no npm deps). Expands all collapsible cards, then captures either a focused
// crop around a matched element or the (height-capped) full page.
//
// Usage:
//   node shoot.js <file.html|file://…> [--find "text"] [--selector "css"]
//                 [--out out.png] [--full] [--index N]
//   --find "text"  screenshot the card whose text contains "text"
//   --selector css screenshot the first element matching this CSS selector
//   --index N      when --find matches several, pick the Nth (0-based)
//   --full         whole page (capped height); default when no find/selector
// Prints the PNG path on stdout; warnings on stderr.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
function flag(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
const htmlArg = argv.find(a => !a.startsWith('--'));
const find = flag('--find');
const selector = flag('--selector');
const index = parseInt(flag('--index') || '0', 10) || 0;
const full = argv.includes('--full');
let out = flag('--out');

if (!htmlArg) {
  console.error('usage: shoot.js <file.html> [--find "text"|--selector css] [--out png] [--index N] [--full]');
  process.exit(2);
}
const fileUrl = htmlArg.startsWith('file://') ? htmlArg : 'file://' + path.resolve(htmlArg);
if (!out) out = path.join(os.tmpdir(), 'render-loop-' + path.basename(htmlArg).replace(/\W+/g, '_') + '.png');

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let wsurl = null, buf = '';
const timer = setTimeout(() => fail('timed out waiting for Chrome / page render'), 30000);
chrome.stderr.on('data', d => {
  buf += d.toString();
  const m = buf.match(/ws:\/\/[^\s]+/);
  if (m && !wsurl) { wsurl = m[0]; start().catch(e => fail(e.message)); }
});
chrome.on('error', e => fail('cannot launch Chrome: ' + e.message + ' (set CHROME_BIN)'));

function cleanup() { clearTimeout(timer); try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
function fail(msg) { console.error('shoot: ' + msg); cleanup(); process.exit(1); }

async function start() {
  const ws = new WebSocket(wsurl);
  let id = 0; const pending = new Map(); const events = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method && events.has(msg.method)) {
      const h = events.get(msg.method); events.delete(msg.method); h(msg.params);
    }
  };
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const waitEvent = method => new Promise(res => events.set(method, res));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('devtools websocket error')); });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
  const loaded = waitEvent('Page.loadEventFired');
  await S('Page.navigate', { url: fileUrl });
  await loaded;
  await new Promise(r => setTimeout(r, 300)); // let the client renderer run

  const mode = selector ? 'selector' : (find && !full ? 'find' : 'full');
  const prep = '(() => {' +
    "document.querySelectorAll('.thinking,.tool,.subagent,.askq,.context,.command').forEach(e=>e.classList.add('open'));" +
    'const mode=' + JSON.stringify(mode) + ', q=' + JSON.stringify(find || selector || '') + ', idx=' + index + ';' +
    "if(mode==='full') return JSON.stringify({full:true});" +
    'let el=null;' +
    "if(mode==='selector'){ el=document.querySelectorAll(q)[idx]||document.querySelector(q); }" +
    "else { const c=[...document.querySelectorAll('.tool,.askq,.subagent,.context,.command,.entry')].filter(n=>n.textContent.includes(q)); el=c[idx]||c[0]; }" +
    'if(!el) return JSON.stringify({found:false});' +
    "el.scrollIntoView({block:'start'});" +
    'const r=el.getBoundingClientRect();' +
    'return JSON.stringify({found:true,x:Math.max(0,r.left+scrollX-12),y:Math.max(0,r.top+scrollY-12),w:r.width+24,h:r.height+24});' +
    '})()';
  const ev = await S('Runtime.evaluate', { expression: prep, returnByValue: true });
  const info = JSON.parse(ev.result.value);
  if (info.found === false) fail('no element matched ' + JSON.stringify(selector || find) + ' — try different text or --full');

  const metrics = await S('Page.getLayoutMetrics');
  const cs = metrics.cssContentSize || metrics.contentSize;
  const MAXH = 4000;
  let clip;
  if (info.full) {
    clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.min(Math.ceil(cs.height), MAXH), scale: 1 };
    if (cs.height > MAXH) console.error('shoot: page is ' + Math.ceil(cs.height) + 'px tall; captured top ' + MAXH + 'px — use --find to focus a card.');
  } else {
    clip = { x: Math.floor(info.x), y: Math.floor(info.y), width: Math.ceil(info.w), height: Math.min(Math.ceil(info.h), MAXH), scale: 1 };
  }
  const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(out);
  cleanup();
  process.exit(0);
}
