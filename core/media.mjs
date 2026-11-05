// 媒体进度处理：视频 / 音频 / 文档
import { sleep } from '../cdp.mjs';
import { CONFIG } from '../config.mjs';

const VIDEO_KEY = 'ananas/modules/video';
const PDF_KEY = 'ananas/modules/pdf';
// 文档正文实际渲染在内层 panView 帧里，滚动必须打到这个帧上
const PAN_KEY = 'pan-yz.chaoxing.com';

// 检查任务点完成状态
export async function taskStatus(page) {
  const frames = await page.frames();
  const cards = frames.find(f => (f.url || '').includes('knowledge/cards'));
  if (!cards) return null;

  return page.evalInFrame('knowledge/cards', `(() => {
    const boxes = [...document.querySelectorAll('.ans-attach-ct')];
    if (!boxes.length) return null;
    return {
      total: boxes.length,
      finished: boxes.filter(e => /ans-job-finished/.test(e.className || '')).length,
      allFinished: boxes.every(e => /ans-job-finished/.test(e.className || '')),
    };
  })()`).catch(() => null);
}

// 倍速候选：从配置上限往下试
function rateCandidates() {
  const want = Number(CONFIG.rate) || 2.0;
  const src = Array.isArray(CONFIG.rateSteps) && CONFIG.rateSteps.length
    ? CONFIG.rateSteps
    : [want, 1.5, 1.25, 1.0];
  const out = [];
  for (const r of src) {
    const v = Number(r);
    if (!(v > 0)) continue;
    if (v > want + 0.001) continue;
    if (out.some(x => Math.abs(x - v) < 0.01)) continue;
    out.push(v);
  }
  if (!out.length) out.push(1.0);
  out.sort((a, b) => b - a);
  return out;
}

// 探测实际可用的倍速：设置后既要求 playbackRate 不被重置，
// 也要求 currentTime 真的按该倍率前进。两条都满足才算可用。
export async function negotiateRate(page, index, log = () => {}) {
  const steps = rateCandidates();
  const r = await page.evalInFrame(VIDEO_KEY, `(async () => {
    const v = document.querySelector('video');
    if (!v) return { err: 'no-video' };
    v.muted = true; v.volume = 0;
    if (v.paused) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }

    const steps = ${JSON.stringify(steps)};
    const tries = [];
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    for (const target of steps) {
      try { v.playbackRate = target; } catch (e) {}
      await sleep(300);
      const c0 = v.currentTime;
      const t0 = performance.now();
      await sleep(1200);
      const dt = Math.max(0.001, (performance.now() - t0) / 1000);
      const dc = Math.max(0, v.currentTime - c0);
      const held = Math.abs(v.playbackRate - target) < 0.05;
      const eff = dc / dt;
      tries.push({ target, held, eff: +eff.toFixed(2), paused: v.paused });
      // 倍速守住 + 进度确实按这个速度在走（留 30% 缓冲的余量）
      if (held && eff >= target * 0.7) return { ok: target, tries };
    }

    try { v.playbackRate = 1.0; } catch (e) {}
    return { ok: 1.0, locked: true, tries };
  })()`, { frameIndex: index, timeoutMs: 40000 }).catch(() => null);

  if (!r || r.err) {
    log(`   视频${index + 1} 倍速探测失败，按 1.0x 处理`);
    return { rate: 1.0, locked: true, tries: [] };
  }

  const detail = (r.tries || []).map(t => `${t.target}x${t.held ? '' : '(被重置)'}`).join(' ');
  if (r.locked || Math.abs(r.ok - steps[0]) > 0.01) {
    log(`   视频${index + 1} 课程限制倍速，自动降到 ${r.ok.toFixed(2)}x`);
    if (detail) log(`     探测结果: ${detail}`);
  } else {
    log(`   视频${index + 1} 倍速 ${r.ok.toFixed(2)}x 生效`);
  }
  return { rate: r.ok, locked: !!r.locked, tries: r.tries || [] };
}

// 安装播放保持器：倍速纠正有次数上限，播放纠偏有节流上限
function installKeeper(page, index, rate) {
  const cooldown = Number(CONFIG.playNudgeCooldown) || 5000;
  const limit = Number(CONFIG.playNudgeLimit) || 20;
  return page.evalInFrame(VIDEO_KEY, `(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    v.muted = true; v.volume = 0;

    window.__hblRate = ${rate};
    window.__hblRateTries = 0;
    window.__hblPlayTries = 0;
    window.__hblLastNudge = 0;

    if (window.__hblKeeper) { try { clearInterval(window.__hblKeeper); } catch (e) {} }
    window.__hblKeeper = setInterval(() => {
      const vv = document.querySelector('video');
      if (!vv) return;
      vv.muted = true; vv.volume = 0;

      // 倍速纠正：最多试 6 次，还不行就退回 1x，不和课程策略死磕
      if (!vv.paused && window.__hblRate > 1.001
          && Math.abs(vv.playbackRate - window.__hblRate) > 0.05
          && window.__hblRateTries < 6) {
        window.__hblRateTries++;
        try { vv.playbackRate = window.__hblRate; } catch (e) {}
        if (window.__hblRateTries >= 6) window.__hblRate = 1.0;
      }

      // 播放纠偏：全局限流 + 次数上限，避免抖动触发风控
      const now = Date.now();
      if (vv.paused && !vv.ended && vv.readyState >= 2
          && window.__hblPlayTries < ${limit}
          && now - window.__hblLastNudge > ${cooldown}) {
        window.__hblLastNudge = now;
        window.__hblPlayTries++;
        try { const p = vv.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      }
    }, 1000);

    if (v.paused && v.readyState >= 2) {
      try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
    return { rate: window.__hblRate };
  })()`, { frameIndex: index }).catch(() => null);
}

// 视频播放推进
export async function playVideo(page, index, log = () => {}) {
  const neg = await negotiateRate(page, index, log);
  await installKeeper(page, index, neg.rate);
  await sleep(1500);

  const state = () => page.evalInFrame(VIDEO_KEY, `(() => {
    const v = document.querySelector('video');
    if (!v) return { noVideo: true };
    return {
      cur: +v.currentTime.toFixed(2),
      dur: +(v.duration || 0).toFixed(2),
      paused: v.paused,
      ended: v.ended,
      rate: +v.playbackRate.toFixed(2),
      nudges: window.__hblPlayTries || 0,
    };
  })()`, { frameIndex: index }).catch(() => null);

  const t0 = Date.now();
  let last = -1, stagnant = 0, thrash = 0, seenNudges = 0, passive = false;

  for (let n = 0; n < 2000; n++) {
    const s = await state();
    if (!s) { log(`   视频${index + 1} 帧丢失`); return false; }
    if (s.noVideo) return true;

    if (s.dur > 0 && (s.ended || s.cur >= s.dur - 1.2)) {
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      log(`   视频${index + 1} 完成 ${s.cur}/${s.dur} (${mins}min, ${s.rate}x)`);
      return true;
    }

    if (Math.abs(s.cur - last) < 0.3) stagnant++; else { stagnant = 0; thrash = 0; }
    last = s.cur;

    // 抖动判定：刚纠偏完立刻又被暂停，连续 3 次说明课程在对抗我们的播放控制
    if (s.nudges > seenNudges) {
      seenNudges = s.nudges;
      if (s.paused) thrash++; else thrash = 0;
      if (thrash >= 3 && !passive) {
        passive = true;
        log(`   视频${index + 1} 播放被反复打断，停止纠偏并退回 1.0x（被动等待，避免触发风控）`);
        await page.evalInFrame(VIDEO_KEY,
          `(() => { window.__hblPlayTries = 1e9; window.__hblRate = 1.0; return 1; })()`,
          { frameIndex: index }).catch(() => null);
      }
    }

    // 长时间卡住：放开一次节流让 keeper 轻推一下（不会高频重试）
    if (stagnant >= 15 && !passive) {
      await page.evalInFrame(VIDEO_KEY, `(() => { window.__hblLastNudge = 0; return 1; })()`,
        { frameIndex: index }).catch(() => null);
      stagnant = 0;
    }

    if (s.dur > 0) {
      const pct = Math.round(s.cur / s.dur * 100);
      if (pct % 25 === 0) log(`   视频${index + 1} ${pct}%`);
    }
    await sleep(CONFIG.poll);
  }
  return false;
}

// 音频播放推进
export async function playAudio(page, index, log = () => {}) {
  const cooldown = Number(CONFIG.playNudgeCooldown) || 5000;
  const limit = Number(CONFIG.playNudgeLimit) || 20;
  let lastNudge = 0, nudges = 0;

  const drive = () => page.evalInFrame('ananas/modules/audio', `(() => {
    const a = document.querySelector('audio') || document.querySelector('video');
    if (!a) return { err: 'no-audio' };
    a.muted = true;
    if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
    return { cur: +a.currentTime.toFixed(1), dur: a.duration };
  })()`, { frameIndex: index }).catch(() => null);

  await drive();
  await sleep(2000);

  for (let n = 0; n < 1200; n++) {
    const s = await page.evalInFrame('ananas/modules/audio', `(() => {
      const a = document.querySelector('audio') || document.querySelector('video');
      if (!a) return { noAudio: true };
      return { cur: +a.currentTime.toFixed(1), dur: +(a.duration || 0).toFixed(1), ended: a.ended, paused: a.paused };
    })()`, { frameIndex: index }).catch(() => null);

    if (!s) return false;
    if (s.noAudio) return true;
    if (s.dur > 0 && (s.ended || s.cur >= s.dur - 1)) {
      log(`   音频${index + 1} 完成 ${s.cur}/${s.dur}`);
      return true;
    }
    // 与视频一致：纠偏限流，避免高频 play() 触发风控
    if (s.paused && nudges < limit && Date.now() - lastNudge > cooldown) {
      lastNudge = Date.now();
      nudges++;
      await drive();
    }
    await sleep(CONFIG.poll);
  }
  return false;
}

// 读取任务点自身状态（按 DOM 顺序，含类型与完成标记）
export async function tileStates(page) {
  const frames = await page.frames();
  const cards = frames.find(f => (f.url || '').includes('knowledge/cards'));
  if (!cards) return null;
  const r = await page.evalInFrameId(cards.id ?? cards.frameId, `(() => {
    const tiles = [...document.querySelectorAll('.ans-attach-ct')];
    return JSON.stringify(tiles.map(e => {
      const ifr = e.querySelector('iframe');
      const src = ifr ? (ifr.getAttribute('src') || '') : '';
      const m = src.match(/modules\\/(\\w+)/);
      return {
        kind: m ? m[1] : 'none',
        finished: /ans-job-finished/.test(e.className || ''),
        jobid: ifr ? (ifr.getAttribute('jobid') || '') : '',
      };
    }));
  })()`, { timeoutMs: 12000 }).catch(() => null);
  const v = r?.result?.value ?? r;
  try { return JSON.parse(v); } catch { return null; }
}

// 单个视频帧是否已播完
export async function isVideoDone(page, index) {
  const s = await page.evalInFrame(VIDEO_KEY, `(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return { cur: +v.currentTime.toFixed(2), dur: +(v.duration || 0).toFixed(2), ended: v.ended };
  })()`, { frameIndex: index }).catch(() => null);
  if (!s) return false;
  if (s.ended) return true;
  return s.dur > 0 && s.cur >= s.dur - 1.2;
}

// 文档阅读：正文在内层 panView 帧（pan-yz.chaoxing.com），
// 外层 ananas/modules/pdf 帧滚动不会推进阅读进度。
// 因此滚动内层帧，并轮询该任务点的完成状态，完成即返回。
export async function readDocument(page, index, log = () => {}) {
  const maxMs = (Number(CONFIG.docMaxMinutes) || 10) * 60000;
  const stepMs = Number(CONFIG.docScrollStepMs) || 1500;
  const t0 = Date.now();
  let step = 0;

  const pdfOrder = async () => {
    const st = await tileStates(page);
    if (!st) return -1;
    const pdfs = st.filter(x => x.kind === 'pdf');
    return pdfs.length;
  };

  const pdfFinished = async () => {
    const st = await tileStates(page);
    if (!st) return null;
    const pdfs = st.filter(x => x.kind === 'pdf');
    return pdfs[index] ? pdfs[index].finished : null;
  };

  const total = await pdfOrder();
  log(`   文档${index + 1} 阅读中${total > 0 ? ` (共${total}个)` : ''}`);

  while (Date.now() - t0 < maxMs) {
    // 从头到尾扫一遍，模拟真实翻阅
    for (let s = 0; s < 10; s++) {
      const frac = s / 9;
      await page.evalInFrame(PAN_KEY, `(() => {
        const sc = document.scrollingElement || document.documentElement;
        const h = sc.scrollHeight, ch = sc.clientHeight;
        if (h > ch) sc.scrollTop = Math.round((h - ch) * ${frac});
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        return Math.round(sc.scrollTop);
      })()`, { frameIndex: index }).catch(() => null);
      await sleep(stepMs);
    }
    step++;

    const fin = await pdfFinished();
    if (fin === true) {
      log(`   文档${index + 1} 已完成 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      return true;
    }
    if (fin === null) { log(`   文档${index + 1} 状态不可读，停止`); return false; }
    if (step % 2 === 0) {
      log(`   文档${index + 1} 仍在计时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  log(`   文档${index + 1} 超时未完成（${(maxMs / 60000).toFixed(0)}min），留给下一轮`);
  return false;
}

// 查找页面内媒体帧
export async function findMedia(page) {
  const frames = await page.frames();
  return {
    videos: frames.filter(f => (f.url || '').includes('ananas/modules/video')),
    audios: frames.filter(f => (f.url || '').includes('ananas/modules/audio')),
    pdfs:   frames.filter(f => (f.url || '').includes('ananas/modules/pdf')),
    doc:    frames.filter(f => (f.url || '').includes('ananas/modules/doc')),
    work:   frames.filter(f => /mooc-ans\/work|ananas\/modules\/work/.test(f.url || '')),
  };
}
