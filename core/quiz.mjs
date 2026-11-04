// 测评解析与作答
import { sleep } from '../cdp.mjs';
import { CONFIG } from '../config.mjs';

const WORK_KEY = 'mooc-ans/work';

// 解析测评页全部题目
export async function parseQuiz(page) {
  return page.evalInFrame(WORK_KEY, `(() => {
    const strip = s => (s || '').replace(/\\s+/g, ' ').replace(/我的答案[:：]/, '').trim();
    const txt = (document.body.innerText || '').replace(/\\s+/g, ' ');
    const blocks = [...document.querySelectorAll('.TiMu')];
    const groups = [];

    for (let ti = 0; ti < blocks.length; ti++) {
      const tm = blocks[ti];
      const uls = [...tm.querySelectorAll('ul')].filter(u => u.querySelector(':scope > li[qid]'));
      const myAnswerEls = [...tm.querySelectorAll('.myAnswer')];
      const markEls = [...tm.querySelectorAll('.CorrectOrNot')];
      const tmText = (tm.innerText || '').replace(/\\s+/g, ' ');

      for (let ui = 0; ui < uls.length; ui++) {
        const ul = uls[ui];
        const lis = [...ul.querySelectorAll(':scope > li[qid]')];
        if (!lis.length) continue;

        const qid = lis[0].getAttribute('qid');
        const onclick = lis[0].getAttribute('onclick') || '';
        const qtype = lis[0].getAttribute('qtype') || '';
        const isJudge = qtype === '3';
        const isMulti = !isJudge && /addMultipleChoice/.test(onclick);

        let subType = isJudge ? '判断题' : (isMulti ? '多选题' : '单选题');
        if (uls.length > 1) {
          const m = tmText.match(new RegExp('\\\\(' + (ui + 1) + '\\\\)\\\\s*\\\\[([^\\\\]]{1,12})\\\\]'));
          if (m) subType = m[1];
        } else {
          const m = tmText.match(/\\[([^\\]]{1,12})\\]/);
          if (m) subType = m[1];
        }

        const options = lis.map((li, oi) => {
          const numEl = li.querySelector('.num_option_dx, .num_option');
          return {
            order: oi,
            letter: (numEl ? numEl.innerText : '').trim() || String.fromCharCode(65 + oi),
            value: (numEl ? numEl.getAttribute('data') : '') || '',
            text: ((li.querySelector('a.after,.after') || {}).innerHTML || '').replace(/<[^>]+>/g, '').trim(),
            checked: li.getAttribute('aria-checked') === 'true',
          };
        });

        let myAnswer = '';
        if (myAnswerEls.length > ui) myAnswer = strip(myAnswerEls[ui].innerText);
        else if (myAnswerEls.length === 1 && uls.length === 1) myAnswer = strip(myAnswerEls[0].innerText);

        let result = null;
        const scope = markEls.length > ui ? markEls[ui] : (markEls[0] || tm);
        const mark = scope.querySelector
          ? scope.querySelector('.marking_dui, .marking_cuo, .marking_bandui')
          : null;
        if (mark) {
          if (/marking_bandui/.test(mark.className)) result = 'partial';
          else if (/marking_dui/.test(mark.className)) result = 'correct';
          else if (/marking_cuo/.test(mark.className)) result = 'wrong';
        }

        const scoreEl = tm.querySelector('.answerScore');
        const scoreText = scoreEl ? (scoreEl.innerText || '').replace(/\\s+/g, ' ').trim() : '';
        const inputEl = tm.querySelector('input[id="answer' + qid + '"]');

        groups.push({
          index: groups.length,
          blockIndex: ti,
          subIndex: ui,
          qid,
          qtype,
          isJudge,
          isMulti,
          subType,
          title: tmText.slice(0, 90),
          options,
          myAnswer,
          result,
          scoreText,
          inputValue: inputEl ? inputEl.value : '',
        });
      }
    }

    const scoreMatch = txt.match(/(\\d+(?:\\.\\d+)?)\\s*分/);

    // 重做入口
    const retryEls = [...document.querySelectorAll('a,button,input[type=button],div[onclick]')]
      .filter(e => {
        if (!e.offsetParent) return false;
        const t = (e.innerText || e.value || '').trim();
        return /重做|重新答题|再次作答/.test(t);
      })
      .map(e => ({
        tag: e.tagName,
        text: (e.innerText || e.value || '').trim(),
        className: (typeof e.className === 'string' ? e.className : '').slice(0, 60),
      }));

    return {
      blockCount: blocks.length,
      groups,
      retryEls,
      hasSubmit: !!document.querySelector('.btnSubmit'),
      completed: /已完成/.test(txt),
      needsRedo: /未达到及格线|请重做/.test(txt),
      score: scoreMatch ? scoreMatch[1] : null,
      isFull: /本次成绩\\s*100/.test(txt) || (scoreMatch && parseFloat(scoreMatch[1]) >= 100),
      text: txt.slice(0, 250),
    };
  })()`).catch(() => null);
}

// 点击选项
export async function applyAnswer(page, groupIndex, letters) {
  return page.evalInFrame(WORK_KEY, `(() => {
    const blocks = [...document.querySelectorAll('.TiMu')];
    let count = 0;
    for (let ti = 0; ti < blocks.length; ti++) {
      const uls = [...blocks[ti].querySelectorAll('ul')].filter(u => u.querySelector(':scope > li[qid]'));
      for (let ui = 0; ui < uls.length; ui++) {
        if (count !== ${groupIndex}) { count++; continue; }
        const lis = [...uls[ui].querySelectorAll(':scope > li[qid]')];
        const want = new Set(('${letters}').split(''));

        for (const li of lis) {
          const numEl = li.querySelector('.num_option_dx, .num_option');
          const letter = (numEl ? numEl.innerText : '').trim();
          const should = want.has(letter);
          const now = li.getAttribute('aria-checked') === 'true';
          if (should !== now) {
            for (const e of ['pointerdown','mousedown','pointerup','mouseup','click'])
              li.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }));
          }
        }
        return {
          groupIndex: ${groupIndex},
          after: lis.map(li => ({
            letter: (li.querySelector('.num_option_dx, .num_option') || {}).innerText || '',
            checked: li.getAttribute('aria-checked') === 'true',
          })),
        };
      }
    }
    return { err: 'not-found' };
  })()`).catch(() => null);
}

// 同步隐藏字段（判断题写入 true/false，选择题写入字母）
export async function syncFields(page) {
  return page.evalInFrame(WORK_KEY, `(() => {
    const out = [];
    for (const tm of document.querySelectorAll('.TiMu')) {
      const uls = [...tm.querySelectorAll('ul')].filter(u => u.querySelector(':scope > li[qid]'));
      for (const ul of uls) {
        const lis = [...ul.querySelectorAll(':scope > li[qid]')];
        if (!lis.length) continue;
        const qid = lis[0].getAttribute('qid');
        const qtype = lis[0].getAttribute('qtype') || '';
        const isJudge = qtype === '3';
        const checked = lis.filter(li => li.getAttribute('aria-checked') === 'true');

        const value = checked.map(li => {
          const numEl = li.querySelector('.num_option_dx,.num_option');
          if (!numEl) return '';
          return isJudge ? (numEl.getAttribute('data') || '') : (numEl.innerText || '').trim();
        }).join('');

        const input = tm.querySelector('input[id="answer' + qid + '"]');
        if (input) { input.value = value; out.push({ id: input.id.slice(0, 24), value }); }
      }
    }

    const wqbid = document.querySelector('#answerwqbid');
    if (wqbid) {
      const qids = [...new Set([...document.querySelectorAll('li[qid]')].map(li => li.getAttribute('qid')))];
      wqbid.value = qids.map(x => x + ',').join('');
    }
    return out;
  })()`).catch(() => null);
}

// 提交
export async function submit(page, log = () => {}) {
  const r = await page.evalInFrame(WORK_KEY, `(() => {
    const b = document.querySelector('.btnSubmit');
    if (!b) return 'no-button';
    b.click();
    return 'clicked';
  })()`).catch(() => 'error');
  log(`     提交: ${r}`);
  return r === 'clicked';
}

// 处理确认弹层
export async function confirmDialogs(page, log = () => {}) {
  let count = 0;
  for (let round = 0; round < 5; round++) {
    const hit = await page.eval(`(() => {
      const pops = [...document.querySelectorAll('.popBottom')].filter(p => p.offsetParent);
      for (const p of pops) {
        const btns = [...p.querySelectorAll('a.jb_btn, a')].filter(b => b.offsetParent);
        const target = btns.find(b => /^提交$|^确定$|^确认$/.test((b.innerText || '').trim()))
                    || btns.find(b => /jb_btn/.test(typeof b.className === 'string' ? b.className : ''));
        if (target) {
          const info = {
            text: (target.innerText || '').trim(),
            popText: (p.innerText || '').replace(/\\s+/g, ' ').slice(0, 50),
          };
          for (const e of ['pointerdown','mousedown','pointerup','mouseup','click'])
            target.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true, view: window }));
          try { target.click(); } catch (e) {}
          return info;
        }
      }
      return null;
    })()`).catch(() => null);

    if (!hit) break;
    count++;
    log(`     确认#${count}: ${hit.text} 「${hit.popText}」`);
    await sleep(2500);
  }
  return count;
}

// 点击重做
export async function clickRetry(page, log = () => {}) {
  const r = await page.evalInFrame(WORK_KEY, `(() => {
    const els = [...document.querySelectorAll('a,button,input[type=button],div[onclick]')]
      .filter(e => {
        if (!e.offsetParent) return false;
        const t = (e.innerText || e.value || '').trim();
        return /重做|重新答题|再次作答/.test(t);
      });
    if (!els.length) return null;
    const e = els[0];
    const info = { text: (e.innerText || e.value || '').trim() };
    for (const ev of ['pointerdown','mousedown','pointerup','mouseup','click'])
      e.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
    try { e.click(); } catch (x) {}
    return info;
  })()`).catch(() => null);
  if (r) log(`     重做: ${r.text}`);
  return r;
}

// 打开测评标签
export async function openQuizTab(page) {
  const has = async () => (await page.frames()).some(f => (f.url || '').includes(WORK_KEY));
  if (await has()) return true;

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.eval(`(() => {
      const tab = document.querySelector('#dct2');
      if (tab) { tab.click(); return true; }
      return false;
    })()`).catch(() => null);

    for (let i = 0; i < 20; i++) {
      await sleep(1200);
      if (await has()) { await sleep(2000); return true; }
    }
  }
  return false;
}

// 生成多选候选组合
export function combinations(letters) {
  const out = [];
  for (let len = 1; len <= letters.length; len++) {
    const gen = (start, prefix) => {
      if (prefix.length === len) { out.push(prefix.join('')); return; }
      for (let i = start; i < letters.length; i++) gen(i + 1, prefix.concat(letters[i]));
    };
    gen(0, []);
  }
  return out;
}

// 将页面显示的答案文本转为字母
export function normalizeAnswer(group, text) {
  if (!text) return '';
  const s = String(text).trim();
  const letters = group.options.map(o => o.letter);

  // 已是字母串
  if ([...s].every(ch => letters.includes(ch))) return s;

  // 判断题：对/错 → 对应 data 值的选项
  if (group.isJudge) {
    const isTrue = /对|正确|√|true|是/.test(s);
    const opt = group.options.find(o => (isTrue ? /true/i.test(o.value) : /false/i.test(o.value)));
    if (opt) return opt.letter;
  }

  // 选项文本匹配
  const matched = group.options.filter(o => o.text && s.includes(o.text));
  if (matched.length) return matched.map(o => o.letter).join('');

  return '';
}
