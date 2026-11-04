// Chrome DevTools Protocol 客户端
import { setTimeout as sleep } from 'node:timers/promises';

export { sleep };

export async function httpJson(url, method = 'GET') {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(25000) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

export const version     = (port) => httpJson(`http://127.0.0.1:${port}/json/version`);
export const listTargets = (port) => httpJson(`http://127.0.0.1:${port}/json/list`);
export const newTarget   = (port, url = 'about:blank') => httpJson(`http://127.0.0.1:${port}/json/new?${url}`, 'PUT');
export const closeTarget = (port, id) => httpJson(`http://127.0.0.1:${port}/json/close/${id}`);

export async function waitForPort(port, timeoutMs = 30000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try { return await version(port); } catch (e) { last = e; }
    await sleep(400);
  }
  throw new Error(`CDP port ${port} not ready: ${last && last.message}`);
}

export class Page {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) for (const fn of list) { try { fn(msg.params, msg.sessionId); } catch {} }
      }
    });
  }

  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('ws connect failed: ' + wsUrl)), { once: true });
    });
    return new Page(ws);
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
    return this;
  }

  send(method, params = {}, timeoutMs = 45000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async enable() {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    return this;
  }

  // 保持页面可见，避免后台标签页节流
  async keepVisible() {
    const results = {};
    const trySend = async (m, p) => { try { await this.send(m, p); results[m] = 'ok'; } catch { results[m] = 'fail'; } };
    await trySend('Emulation.setFocusEmulationEnabled', { enabled: true });
    await trySend('Page.setWebLifecycleState', { state: 'active' });
    return results;
  }

  async bringFront() {
    try { await this.send('Page.bringToFront'); } catch {}
  }

  // 主世界执行上下文映射
  contexts() {
    if (this._ctxReady) return Promise.resolve(this._ctxs);
    this._ctxs = new Map();
    this.on('Runtime.executionContextCreated', ({ context }) => {
      const aux = context.auxData || {};
      if (aux.isDefault && aux.frameId) this._ctxs.set(aux.frameId, context.id);
    });
    this.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      for (const [k, v] of this._ctxs) if (v === executionContextId) this._ctxs.delete(k);
    });
    this.on('Runtime.executionContextsCleared', () => this._ctxs.clear());
    this._ctxReady = this.send('Runtime.enable').then(() => sleep(600)).then(() => this._ctxs);
    return this._ctxReady;
  }

  async evalMain(frameUrlPart, expression, opts = {}) {
    const ctxs = await this.contexts();
    const frames = await this.frames();
    const f = frames.find((x) => (x.url || '').includes(frameUrlPart));
    if (!f) throw new Error('frame not found: ' + frameUrlPart);
    let ctx = ctxs.get(f.id);
    if (!ctx) {
      await sleep(400);
      const again = await this.frames();
      const f2 = again.find((x) => (x.url || '').includes(frameUrlPart));
      ctx = f2 && ctxs.get(f2.id);
      if (!ctx) throw new Error('no main-world ctx for frame: ' + frameUrlPart);
    }
    return this.eval(expression, { ...opts, contextId: ctx });
  }

  async goto(url, { settle = 2500, timeoutMs = 60000 } = {}) {
    const loaded = new Promise((resolve) => {
      this.on('Page.loadEventFired', resolve);
      setTimeout(resolve, timeoutMs);
    });
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error('navigate failed: ' + r.errorText);
    await loaded;
    await sleep(settle);
    return r;
  }

  async eval(expression, { contextId, awaitPromise = true, timeoutMs = 30000 } = {}) {
    const params = { expression, returnByValue: true, awaitPromise, userGesture: true };
    if (contextId) params.contextId = contextId;
    const r = await this.send('Runtime.evaluate', params, timeoutMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('eval threw: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
    }
    return r.result ? r.result.value : undefined;
  }

  async frames() {
    const tree = await this.send('Page.getFrameTree');
    const out = [];
    (function walk(node) {
      out.push(node.frame);
      for (const c of node.childFrames || []) walk(c);
    })(tree.frameTree);
    return out;
  }

  // 按 frameId 精确求值
  async evalInFrameId(frameId, expression, opts = {}) {
    const { executionContextId } = await this.send('Page.createIsolatedWorld', {
      frameId, worldName: 'hbl-world', grantUniveralAccess: false,
    });
    return this.eval(expression, { ...opts, contextId: executionContextId });
  }

  // 按 URL 片段匹配 frame 求值，可用 frameIndex 指定同名帧中的第几个
  async evalInFrame(urlPart, expression, opts = {}) {
    const frames = await this.frames();
    const matches = frames.filter((x) => (x.url || '').includes(urlPart));
    if (!matches.length) {
      throw new Error('frame not found: ' + urlPart + ' | have: ' + frames.map((x) => (x.url || '').slice(0, 90)).join(' || '));
    }
    const f = matches[opts.frameIndex || 0];
    const { executionContextId } = await this.send('Page.createIsolatedWorld', {
      frameId: f.id, worldName: 'hbl-world', grantUniveralAccess: false,
    });
    return this.eval(expression, { ...opts, contextId: executionContextId });
  }

  async title() { return this.eval('document.title'); }
  async url()   { return this.eval('location.href'); }

  close() { try { this.ws.close(); } catch {} }
}

// 附加到已有页面
export async function attachPage(port, matchFn) {
  for (let i = 0; i < 30; i++) {
    const ts = await listTargets(port);
    const pages = ts.filter(t => t.type === 'page' && !/devtools/.test(t.url || ''));
    const t = pages.find(matchFn) || pages.find(x => x.url === 'about:blank') || pages[0];
    if (t) {
      const page = await Page.attach(t.webSocketDebuggerUrl);
      await page.enable();
      await page.keepVisible();
      await page.bringFront();
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(()=>{try{
          Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
          Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});
          document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
        }catch(e){}})();`,
      }).catch(() => {});
      return page;
    }
    await sleep(1000);
  }
  throw new Error('no page target');
}
