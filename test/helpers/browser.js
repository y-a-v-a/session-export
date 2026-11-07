// Minimal headless-Chrome driver for render tests: DevTools Protocol over
// Node's built-in WebSocket, no npm deps (same approach as render-loop's
// shoot.js). One browser per test file; each page() loads an exported HTML
// file and evaluates functions against the live DOM.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  return CANDIDATES.find(p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;
}

async function launch() {
  const bin = findChrome();
  if (!bin) return null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'se-chrome-'));
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not expose a DevTools endpoint')), 20000);
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/ws:\/\/\S+/);
      if (m) { clearTimeout(t); resolve(m[0]); }
    });
    proc.on('error', e => { clearTimeout(t); reject(e); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('devtools websocket error')); });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.method === msg.method && w.sessionId === msg.sessionId) { waiters.splice(i, 1); w.res(msg.params); }
      }
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const waitFor = (method, sessionId) => new Promise(res => waiters.push({ method, sessionId, res }));

  async function page(htmlFile) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    const errors = [];
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__errors=[];addEventListener("error",e=>window.__errors.push(String(e.message)));',
    });
    const loaded = waitFor('Page.loadEventFired', sessionId);
    await S('Page.navigate', { url: 'file://' + path.resolve(htmlFile) });
    await loaded;
    const exc = await S('Runtime.evaluate', { expression: 'window.__errors || []', returnByValue: true });
    errors.push(...(exc.result.value || []));
    return {
      // fn is serialized and run in the page; it must be self-contained and
      // return JSON-serializable data.
      async eval(fn, ...args) {
        const expr = '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')';
        const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result.value;
      },
      errors,
      close: () => send('Target.closeTarget', { targetId }),
    };
  }

  async function close() {
    try { ws.close(); } catch {}
    try { proc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }

  return { page, close };
}

module.exports = { launch, findChrome };
