// 学习通网页学习助手 — 主程序入口
import { attachPage, sleep } from './cdp.mjs';
import { CONFIG } from './config.mjs';
import { getTree, openNode, sliceRange } from './core/navigation.mjs';
import { taskStatus, playVideo, playAudio, readDocument, findMedia, tileStates, isVideoDone } from './core/media.mjs';
import {
  parseQuiz, applyAnswer, syncFields, submit, confirmDialogs,
  clickRetry, openQuizTab, combinations, normalizeAnswer,
} from './core/quiz.mjs';
import { solve, remember } from './core/answer.mjs';
import { isVerifyPage } from './core/captcha.mjs';


// HBL 进度条（纯 ASCII，避免 CJK 字体下 Ambiguous 字符宽度错位）
const BAR_WIDTH = 28;
function renderBar(done, total) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.min(BAR_WIDTH, Math.round(pct * BAR_WIDTH));
  const empty = Math.max(0, BAR_WIDTH - filled);
  const bar = '='.repeat(filled) + '-'.repeat(empty);
  const pctStr = (pct * 100).toFixed(1).padStart(5);
  return `[${bar}] ${pctStr}%  ${done}/${total}`;
}

// 终端标题显示 HBL
try {
  if (process.stdout.isTTY) process.stdout.write('\x1b]0;[HBL] XueXiTong Helper\x07');
} catch {}

const log = (...a) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [HBL]`, ...a);
};

let page = null;

// ---------- 测评作答 ----------
async function runQuiz(label) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!(await openQuizTab(page))) { log('   测评页打开失败'); return 'fail'; }

    let quiz = await parseQuiz(page);
    if (!quiz) { log('   解析失败'); continue; }

    log(`   题目块=${quiz.blockCount} 组=${quiz.groups.length} 分数=${quiz.score ?? '-'} 完成=${quiz.completed}`);

    // 已完成且满分
    if (quiz.completed && quiz.isFull) { log('   已满分'); return 'pass'; }

    // 已完成未满分 → 重做
    if (!quiz.groups.length || (quiz.completed && !quiz.isFull)) {
      if (quiz.score && parseFloat(quiz.score) >= 100) return 'pass';
      const r = await clickRetry(page, log);
      if (r) { await sleep(4000); await confirmDialogs(page, log); await sleep(3000); continue; }
      log('   无重做入口，分数=' + quiz.score);
      await sleep(3000);
      continue;
    }

    if (quiz.needsRedo) {
      await confirmDialogs(page, log);
      await sleep(2000);
      if (!(await openQuizTab(page))) break;
      quiz = await parseQuiz(page);
      if (!quiz || !quiz.groups.length) continue;
    }

    // 构建作答计划
    const plans = quiz.groups.map(g => {
      const letters = g.options.map(o => o.letter);
      const known = g.result === 'correct' ? normalizeAnswer(g, g.myAnswer) : '';
      const partial = g.result === 'partial' ? normalizeAnswer(g, g.myAnswer) : '';
      return {
        group: g,
        candidates: g.isMulti ? combinations(letters) : letters,
        locked: known || null,
        base: partial || '',
        cursor: 0,
        tried: [],
      };
    });

    for (const p of plans) {
      const cur = normalizeAnswer(p.group, p.group.myAnswer);
      p.tried = cur ? [cur] : [];
      if (p.group.isMulti && p.base) {
        const idx = p.candidates.indexOf(p.base);
        if (idx >= 0) p.cursor = idx + 1;
      } else if (cur) {
        const idx = p.candidates.indexOf(cur);
        if (idx >= 0) p.cursor = idx + 1;
      }
    }

    // 多轮作答
    for (let round = 0; round < 150; round++) {
      if (!(await openQuizTab(page))) break;
      let cur = await parseQuiz(page);
      if (!cur) continue;

      if (cur.completed && cur.isFull) { log('   已满分通过'); return 'pass'; }

      if (!cur.groups.length || (cur.completed && !cur.isFull)) {
        if (cur.score && parseFloat(cur.score) >= 100) return 'pass';
        const r = await clickRetry(page, log);
        if (r) { await sleep(4000); await confirmDialogs(page, log); await sleep(3000); }
        else { log('   无重做入口，分数=' + cur.score); break; }
        if (!(await openQuizTab(page))) break;
        continue;
      }

      if (cur.needsRedo) { await confirmDialogs(page, log); await sleep(2000); }
      if (!cur.hasSubmit) continue;

      // 生成本轮答案
      const answerList = plans.map(p => {
        if (p.locked) return p.locked;
        let guard = 0;
        while (guard++ < p.candidates.length && p.tried.includes(p.candidates[p.cursor % p.candidates.length])) p.cursor++;
        return p.candidates[p.cursor % p.candidates.length];
      });

      log(`   轮${round + 1}: ${answerList.map((a, i) => plans[i].locked ? `[${a}]` : a).join('|')}`);

      // 回填
      for (let gi = 0; gi < cur.groups.length; gi++) {
        if (plans[gi].locked) continue;
        await applyAnswer(page, gi, answerList[gi]);
        await sleep(320);
      }
      const fields = await syncFields(page);
      log(`     字段: ${JSON.stringify(fields)}`);
      await sleep(1000);

      await submit(page, log);
      await sleep(2200);
      await confirmDialogs(page, log);
      await sleep(3000);
      await confirmDialogs(page, log);
      await sleep(2500);

      if (!(await openQuizTab(page))) break;
      const st = await parseQuiz(page);
      if (!st) continue;
      log(`     => ${st.groups.map(g => `${g.myAnswer || '-'}/${g.result || '?'}`).join(' ')} 分数=${st.score} 完成=${st.completed}`);

      if (st.completed && st.isFull) {
        log('   满分通过');
        for (let i = 0; i < plans.length; i++) {
          if (st.groups[i] && st.groups[i].myAnswer) remember(plans[i].group.qid, st.groups[i].myAnswer);
        }
        return 'pass';
      }

      if (!st.groups.length || (st.completed && !st.isFull)) {
        if (st.score && parseFloat(st.score) >= 100) return 'pass';
        const r = await clickRetry(page, log);
        if (r) { await sleep(4000); await confirmDialogs(page, log); await sleep(3000); if (!(await openQuizTab(page))) break; continue; }
        log('   无重做入口，分数=' + st.score);
        break;
      }

      // 更新计划
      for (let i = 0; i < plans.length; i++) {
        const g = st.groups[i];
        if (!g) continue;
        const letters = normalizeAnswer(g, g.myAnswer);
        if (letters) plans[i].tried.push(letters);

        if (g.result === 'correct') {
          if (letters) plans[i].locked = letters;
        } else if (g.result === 'partial') {
          plans[i].base = letters;
          const supers = plans[i].candidates.filter(c =>
            letters.split('').every(ch => c.includes(ch)) && c.length > letters.length && !plans[i].tried.includes(c));
          if (supers.length) {
            const idx = plans[i].candidates.indexOf(supers[0]);
            if (idx >= 0) plans[i].cursor = idx;
          } else plans[i].cursor++;
        } else if (g.result === 'wrong') {
          const idx = plans[i].candidates.indexOf(letters);
          if (idx >= 0) { if (plans[i].cursor <= idx) plans[i].cursor = idx + 1; }
          else plans[i].cursor++;
        } else plans[i].cursor++;
      }
      for (const p of plans) {
        let guard = 0;
        while (guard++ < p.candidates.length && p.tried.includes(p.candidates[p.cursor % p.candidates.length])) p.cursor++;
      }
      if (plans.every(p => p.locked || p.cursor >= p.candidates.length)) { log('   候选耗尽'); break; }
    }
  }
  return 'fail';
}

// ---------- 单节点处理 ----------
// 一个章节节点里往往同时挂着多个任务点：视频在最上面，往下还有文档和测验。
// 旧逻辑只按打开页面那一刻扫到的媒体帧处理一次，文档又滚错了帧，
// 于是任务点永远差几个没完成，节点被反复重进——表现就是「只循环播视频」。
// 这里改成多轮：每轮重新扫描、只处理未完成的，直到全部完成或没有进展。
async function runNode(enc, node) {
  const opened = await openNode(page, enc, node.id);
  if (opened.locked) { log('   章节未开放'); return 'locked'; }

  const maxPass = Number(CONFIG.nodePasses) || 6;
  let quizPassed = false;

  for (let pass = 1; pass <= maxPass; pass++) {
    const status = await taskStatus(page);
    const media = await findMedia(page);
    const tiles = await tileStates(page);

    const fin = status ? status.finished : 0;
    const total = status ? status.total : 0;

    if (status && status.allFinished) {
      log(`   任务点全部完成 ${fin}/${total}`);
      break;
    }

    log(`   第${pass}轮 | 视频${media.videos.length} 音频${media.audios.length} 文档${media.pdfs.length} 测验${media.work.length} | 任务点 ${fin}/${total}`);

    let acted = false;

    // 视频
    for (let i = 0; i < media.videos.length; i++) {
      if (await isVideoDone(page, i)) { log(`   视频${i + 1} 已播完，跳过`); continue; }
      log(`   视频 ${i + 1}/${media.videos.length}`);
      await playVideo(page, i, log);
      acted = true;
      if (isVerifyPage(await page.url())) return 'verify';
    }

    // 音频
    for (let i = 0; i < media.audios.length; i++) {
      log(`   音频 ${i + 1}/${media.audios.length}`);
      await playAudio(page, i, log);
      acted = true;
    }

    // 文档：按任务点状态跳过错过的，逐份滚动内层 panView
    const pdfTiles = (tiles || []).filter(x => x.kind === 'pdf');
    for (let i = 0; i < media.pdfs.length; i++) {
      if (pdfTiles[i] && pdfTiles[i].finished) { log(`   文档${i + 1} 已完成，跳过`); continue; }
      log(`   文档 ${i + 1}/${media.pdfs.length}`);
      await readDocument(page, i, log);
      acted = true;
    }

    // 测验：标签页或内嵌 work 帧任一存在
    if (!quizPassed && (media.work.length || opened.hasQuizTab)) {
      const r = await runQuiz(node.num);
      log(`   测评: ${r}`);
      acted = true;
      if (r === 'pass') quizPassed = true;
    }

    const after = await taskStatus(page);
    const afterFin = after ? after.finished : fin;
    if (after && after.allFinished) {
      log(`   任务点全部完成 ${after.finished}/${after.total}`);
      break;
    }
    if (!acted) { log('   本轮无可处理项，退出该节点'); break; }
    if (pass >= 2 && afterFin <= fin) {
      log(`   进度未变化 (${fin}→${afterFin})，退出该节点留给下一轮`);
      break;
    }
    await sleep(2500);
  }

  return 'ok';
}

// ---------- 主循环 ----------
async function main() {
  log('=== 学习通网页学习助手 v1.1.4 ===');
  log(`课程: ${CONFIG.courseId} | 班级: ${CONFIG.clazzId} | 倍速上限: ${CONFIG.rate}x`);

  page = await attachPage(CONFIG.port, t => /chaoxing/.test(t.url || ''));
  log('已连接浏览器');

  for (let round = 0; round < 500; round++) {
    // 风控校验页：停一会儿而不是继续猛刷，避免把封禁时间越拖越长
    if (isVerifyPage(await page.url())) {
      log('⚠ 进入风控校验页，暂停 60s 后重试');
      log('  建议：把 config.mjs 的 rate 改成 1.0，或直接刷新页面完成校验');
      await sleep(60000);
      continue;
    }

    const tree = await getTree(page, log);
    if (!tree) { log('章节树读取失败，重试'); await sleep(6000); continue; }

    const doneCount = tree.rows.filter(r => r.done).length;
    log(renderBar(doneCount, tree.rows.length));
    if (tree.progress) log('   任务点 ' + tree.progress);

    const range = CONFIG.startId || CONFIG.endId
      ? sliceRange(tree, CONFIG.startId, CONFIG.endId)
      : tree.rows;

    if (!range.length) { log('区间为空，检查 startId/endId 配置'); return; }

    const pending = range.filter(r => !r.done);
    log(`区间 ${range.length} 节点 | 待处理 ${pending.length}`);

    // 终点完成判定
    if (CONFIG.endId) {
      const endNode = tree.rows.find(r => r.id === CONFIG.endId);
      if (endNode && endNode.done) {
        log(`=== 目标节点已完成: ${endNode.num} ${endNode.title} ===`);
        return;
      }
    }

    if (!pending.length) {
      log('区间已处理完，等待状态同步');
      await sleep(15000);
      continue;
    }

    const next = pending[0];
    const pendingCount = range.filter(r => !r.done).length;
    log(`-> ${next.num} ${next.title}`);
    log(`   剩余 ${pendingCount} 个节点  ${renderBar(doneCount, tree.rows.length)}`);

    try {
      const r = await runNode(tree.enc, next);
      if (r === 'locked') { log('   锁定，等待'); await sleep(45000); continue; }
      if (r === 'verify') { log('   触发校验，暂停 60s'); await sleep(60000); continue; }
    } catch (e) {
      log('   异常:', e.message.slice(0, 140));
      await sleep(8000);
    }

    await sleep(2500);
  }
  log('=== 结束 ===');
}

main().catch(e => log('FATAL', e.message)).finally(() => process.exit(0));
