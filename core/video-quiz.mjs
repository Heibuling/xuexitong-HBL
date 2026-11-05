// 视频内弹题处理
// 关键设计：
//   1) 点击选项后必须校验 aria-checked / checked 是否生效
//   2) 提交后必须校验弹题是否消失
//   3) 记录已试选项，避免死循环
//   4) 重试上限 = 选项数 × 2，超过强制跳过
import { sleep } from '../cdp.mjs';

const KEY = 'ananas/modules/video';

// 读取弹题
export async function readPopup(page, frameIndex = 0) {
  return page.evalInFrame(KEY, `(() => {
    const box = document.querySelector('.tkTopic');
    if (!box) return null;
    const btn = (id) => {
      const e = document.getElementById(id);
      return e && e.offsetParent ? { id, txt: (e.innerText || '').trim() } : null;
    };
    const r = box.querySelector('.tkTopic_numbar');
    const t = box.querySelector('.tkTopic_title');
    const it = box.querySelector('.tkItem_title');

    return {
      numbar: r ? (r.innerText || '') : '',
      type: t ? (t.innerText || '').trim() : '',
      title: it ? (it.innerText || '').trim() : '',
      options: [...box.querySelectorAll('li.ans-videoquiz-opt')].map((li, i) => {
        const inp = li.querySelector('input');
        return {
          i,
          txt: (li.innerText || '').replace(/\\s+/g, ' ').replace(/^[A-Z]、\\s*/, '').trim(),
          raw: (li.innerText || '').replace(/\\s+/g, ' ').trim(),
          checked: inp ? !!inp.checked : false,
          aria: li.getAttribute('aria-checked'),
          cls: (typeof li.className === 'string' ? li.className : '').slice(0, 60),
        };
      }),
      buttons: {
        submit: btn('videoquiz-submit'),
        submitting: btn('videoquiz-submitting'),
        continue: btn('videoquiz-continue'),
        back: btn('knowledgeBack'),
        analysis: btn('viewAnalysis'),
      },
      feedback: (() => {
        const x = box.innerText || '';
        if (/回答错误|答错了/.test(x)) return 'wrong';
        if (/回答正确|答对了/.test(x)) return 'correct';
        return null;
      })(),
      fullText: (box.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
    };
  })()`, { frameIndex }).catch(() => null);
}

// 点击选项（带校验，两次尝试）
async function pickOption(page, idx, frameIndex = 0) {
  const r1 = await page.evalInFrame(KEY, `(() => {
    const lis = [...document.querySelectorAll('.tkTopic li.ans-videoquiz-opt')];
    const li = lis[${idx}];
    if (!li) return { err: 'no-opt' };

    const inp = li.querySelector('input');
    if (inp) {
      inp.checked = true;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const label = li.querySelector('label');
    if (label) label.click();

    for (const e of ['pointerdown','mousedown','pointerup','mouseup','click'])
      li.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }));

    const now = li.querySelector('input');
    return {
      ok: now ? !!now.checked : li.getAttribute('aria-checked') === 'true',
      checked: now ? !!now.checked : null,
      aria: li.getAttribute('aria-checked'),
    };
  })()`, { frameIndex }).catch(e => ({ err: e.message }));

  if (r1 && r1.ok) return r1;

  await sleep(400);
  const r2 = await page.evalInFrame(KEY, `(() => {
    const lis = [...document.querySelectorAll('.tkTopic li.ans-videoquiz-opt')];
    const li = lis[${idx}];
    if (!li) return { err: 'no-opt' };
    const inp = li.querySelector('input');
    if (inp) { inp.click(); inp.checked = true; }
    const now = li.querySelector('input');
    return {
      ok: now ? !!now.checked : li.getAttribute('aria-checked') === 'true',
      checked: now ? !!now.checked : null,
      aria: li.getAttribute('aria-checked'),
    };
  })()`, { frameIndex }).catch(e => ({ err: e.message }));

  return r2 || { err: 'failed' };
}

// 点击按钮
async function clickBtn(page, id, frameIndex = 0) {
  return page.evalInFrame(KEY, `(() => {
    const b = document.getElementById(${JSON.stringify(id)});
    if (!b) return 'no-btn';
    if (!b.offsetParent) return 'hidden';
    for (const e of ['pointerdown','mousedown','pointerup','mouseup','click'])
      b.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }));
    try { b.click(); } catch (x) {}
    return 'clicked';
  })()`, { frameIndex }).catch(() => null);
}

// 简单语义评分（判断题/单选题的兜底）
function quickPick(popup) {
  const opts = popup.options || [];
  if (!opts.length) return 0;

  // 判断题默认选"错"
  if (/判断/.test(popup.type || '')) {
    const b = opts.findIndex(o => /^(错|错误|×|否)/.test((o.txt || '').trim()));
    return b >= 0 ? b : (opts.length > 1 ? 1 : 0);
  }

  // 安全类关键词评分
  const POS = ['核对','确认','记住','牢记','告知','分享','观察','留意','报警','求助','拒绝','后排','及时','第一时间'];
  const NEG = ['不系','不戴','闯红灯','逆行','超速','酒驾','疲劳','玩手机','低头','独自','偏僻','黑车'];
  let best = 0, bestScore = -999;
  opts.forEach((o, i) => {
    const t = o.txt || '';
    let s = 0;
    for (const k of POS) if (t.includes(k)) s++;
    for (const k of NEG) if (t.includes(k)) s -= 2;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

// 主处理函数
// bank: 用于缓存答案的对象，含 __tried 记录已试选项
export async function handleVideoQuiz(page, frameIndex, log, bank, answerFn) {
  const p = await readPopup(page, frameIndex);
  if (!p) return false;

  // A. 已完成
  if (p.buttons.continue) {
    log && log('     弹题已完成，点「继续学习」');
    await clickBtn(page, 'videoquiz-continue', frameIndex);
    await sleep(1500);
    return true;
  }

  // B. 提交中
  if (p.buttons.submitting) {
    log && log('     弹题提交中，等待…');
    await sleep(2000);
    return true;
  }

  // C. 需要作答
  if (!p.buttons.submit) return false;

  const norm = s => (s || '').replace(/[\s\u3000]+/g, '').replace(/[，。、；：？！]/g, '').toLowerCase();
  const bankKey = 'V:' + norm(p.title).slice(0, 100) + '|' + p.options.map(o => norm(o.txt)).join('|');

  if (!bank.__tried) bank.__tried = {};
  if (!bank.__tried[bankKey]) bank.__tried[bankKey] = [];
  const tried = bank.__tried[bankKey];

  let ansIdx, method;

  if (tried.length === 0 && bank[bankKey] !== undefined && p.options[bank[bankKey]]) {
    ansIdx = bank[bankKey];
    method = 'cache';
  } else if (tried.length > 0) {
    const remain = p.options.map((_, i) => i).filter(i => !tried.includes(i));
    ansIdx = remain.length ? remain[0] : (tried.length % p.options.length);
    method = 'retry-next';
  } else {
    if (typeof answerFn === 'function') {
      const r = await answerFn(p.options.map(o => ({ text: o.txt })), p.type || p.fullText);
      ansIdx = r.indices[0] ?? 0;
      method = r.method || 'semantic';
    } else {
      ansIdx = quickPick(p);
      method = 'quick';
    }
    if (!/判断/.test(p.type)) bank[bankKey] = ansIdx;
  }

  log && log(`     弹题[${p.type}] ${p.title.slice(0, 36)} → 选 ${p.options[ansIdx] ? p.options[ansIdx].raw : ansIdx} (${method}, 第${tried.length + 1}次)`);

  const pick = await pickOption(page, ansIdx, frameIndex);
  if (!pick || !pick.ok) {
    log && log(`     ⚠ 选项未选中，重试`);
    await sleep(1200);
    const pick2 = await pickOption(page, ansIdx, frameIndex);
    if (!pick2 || !pick2.ok) {
      log && log(`     ⚠ 仍未选中，本轮跳过`);
      tried.push(ansIdx);
      return true;
    }
  }

  if (!tried.includes(ansIdx)) tried.push(ansIdx);
  await sleep(900);

  const sub = await clickBtn(page, 'videoquiz-submit', frameIndex);
  log && log(`     提交: ${sub}`);
  await sleep(2500);

  const p2 = await readPopup(page, frameIndex);

  if (!p2) {
    log && log('     ✓ 弹题已消失，视频继续');
    delete bank.__tried[bankKey];
    return true;
  }

  if (p2.buttons.continue) {
    log && log(`     ✓ 弹题完成 (${p2.feedback || 'ok'})，点继续学习`);
    await clickBtn(page, 'videoquiz-continue', frameIndex);
    await sleep(1200);
    delete bank.__tried[bankKey];
    return true;
  }

  if (p2.buttons.submitting) {
    log && log('     提交中，等待结果…');
    await sleep(3000);
    const p3 = await readPopup(page, frameIndex);
    if (p3 && p3.buttons.continue) {
      log && log('     ✓ 完成，点继续学习');
      await clickBtn(page, 'videoquiz-continue', frameIndex);
      delete bank.__tried[bankKey];
      return true;
    }
  }

  if (p2.feedback === 'wrong') {
    log && log('     ✗ 答错，下轮换选项');
    if (bank[bankKey] !== undefined && bank[bankKey] === ansIdx) delete bank[bankKey];
  } else {
    log && log(`     ⚠ 弹题仍在，继续尝试`);
  }

  // 强制跳过保护
  if (tried.length >= p.options.length * 2) {
    log && log(`     ⚠ 已试 ${tried.length} 次，强制跳过`);
    await clickBtn(page, 'videoquiz-continue', frameIndex);
    await sleep(1500);
    delete bank.__tried[bankKey];
  }

  await sleep(1200);
  return true;
}
