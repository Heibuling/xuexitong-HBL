// 媒体进度处理：视频 / 音频 / 文档
import { sleep } from '../cdp.mjs';
import { CONFIG } from '../config.mjs';

const VIDEO_KEY = 'ananas/modules/video';
const PDF_KEY = 'ananas/modules/pdf';

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

// 视频播放推进
export async function playVideo(page, index, log = () => {}) {
  const rate = CONFIG.rate;

  const drive = () => page.evalInFrame(VIDEO_KEY, `(() => {
    const v = document.querySelector('video');
    if (!v) return { err: 'no-video' };
    v.muted = true;
    v.volume = 0;

    const playBtn = document.querySelector('.vjs-big-play-button');
    if (playBtn && v.paused) { try { playBtn.click(); } catch (e) {} }

    window.__hblRate = ${rate};
    if (!window.__hblKeeper) {
      window.__hblKeeper = setInterval(() => {
        const vv = document.querySelector('video');
        if (!vv) return;
        vv.muted = true; vv.volume = 0;
        if (!vv.paused && Math.abs(vv.playbackRate - window.__hblRate) > 0.05) {
          try { vv.playbackRate = window.__hblRate; } catch (e) {}
        }
        if (vv.paused && !vv.ended && vv.readyState >= 2) {
          const p = vv.play(); if (p && p.catch) p.catch(() => {});
        }
      }, 250);
    }
    if (v.paused && v.readyState >= 2) {
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
    return { cur: +v.currentTime.toFixed(1), dur: v.duration, rate: v.playbackRate };
  })()`, { frameIndex: index }).catch(() => null);

  const state = () => page.evalInFrame(VIDEO_KEY, `(() => {
    const v = document.querySelector('video');
    if (!v) return { noVideo: true };
    return {
      cur: +v.currentTime.toFixed(2),
      dur: +(v.duration || 0).toFixed(2),
      paused: v.paused,
      ended: v.ended,
    };
  })()`, { frameIndex: index }).catch(() => null);

  await drive();
  await sleep(2000);

  const t0 = Date.now();
  let last = -1, stagnant = 0;

  for (let n = 0; n < 1500; n++) {
    const s = await state();
    if (!s) { log(`   视频${index + 1} 帧丢失`); return false; }
    if (s.noVideo) return true;

    if (s.dur > 0 && (s.ended || s.cur >= s.dur - 1.2)) {
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      log(`   视频${index + 1} 完成 ${s.cur}/${s.dur} (${mins}min)`);
      return true;
    }

    if (Math.abs(s.cur - last) < 0.3) stagnant++;
    else stagnant = 0;

    if (stagnant >= 4) { await drive(); stagnant = 0; }

    last = s.cur;
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
    if (s.paused) await drive();
    await sleep(CONFIG.poll);
  }
  return false;
}

// 文档滚动
export async function readDocument(page, index, log = () => {}) {
  log(`   文档${index + 1} 阅读中`);
  for (let i = 0; i < 12; i++) {
    const ok = await page.evalInFrame(PDF_KEY, `(() => {
      const sc = document.scrollingElement || document.body;
      sc.scrollTop = sc.scrollHeight * ${i + 1} / 12;
      window.dispatchEvent(new Event('scroll'));
      return { top: Math.round(sc.scrollTop), height: sc.scrollHeight };
    })()`, { frameIndex: index }).catch(() => null);
    if (!ok) return false;
    await sleep(1700);
  }
  return true;
}

// 查找页面内媒体帧
export async function findMedia(page) {
  const frames = await page.frames();
  return {
    videos: frames.filter(f => (f.url || '').includes('ananas/modules/video')),
    audios: frames.filter(f => (f.url || '').includes('ananas/modules/audio')),
    pdfs:   frames.filter(f => (f.url || '').includes('ananas/modules/pdf')),
    doc:    frames.filter(f => (f.url || '').includes('ananas/modules/doc')),
  };
}
