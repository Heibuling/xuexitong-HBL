// 章节树解析与导航
import { sleep } from '../cdp.mjs';
import { CONFIG } from '../config.mjs';

const TREE_FRAME = 'studentcourse';

// 打开课程章节页并读取树结构
export async function getTree(page, log = () => {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/visit/stucoursemiddle`
      + `?courseid=${CONFIG.courseId}&clazzid=${CONFIG.clazzId}&vc=1&cpi=${CONFIG.cpi}&ismooc2=1&v=2`;

    await page.goto(url, { settle: 5000 });

    // 点击"章节"标签
    await sleep(1500);
    for (let k = 0; k < 2; k++) {
      const clicked = await page.eval(`(() => {
        const li = [...document.querySelectorAll('li,a,span')]
          .find(e => (e.innerText || '').trim() === '章节' && e.offsetParent);
        if (li) { li.click(); return true; }
        return false;
      })()`).catch(() => false);
      await sleep(4200);
      const fr = await page.frames();
      if (fr.some(f => (f.url || '').includes(TREE_FRAME))) break;
    }

    const tree = await page.evalInFrame(TREE_FRAME, `(() => {
      // enc 参数从页面脚本中提取
      const scripts = [...document.querySelectorAll('script:not([src])')]
        .map(x => x.textContent || '').join('\\n');
      const em = scripts.match(/var enc = "([a-f0-9]+)"/);

      const rows = [...document.querySelectorAll('.chapter_item')].map((el, i) => {
        const state = el.querySelector('.catalog_state');
        const input = el.querySelector('input[type=checkbox]');
        const num = ((el.querySelector('.catalog_sbar') || {}).textContent || '').trim();
        return {
          index: i,
          num,
          id: input ? input.value : '',
          done: state ? /icon_yiwanc/.test(state.className) : false,
          inProgress: state ? /catalog_jindu/.test(state.className) : false,
          title: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        };
      }).filter(r => /^\\d+(\\.\\d+)+/.test(r.num) && /^\\d{6,}$/.test(r.id));

      const progress = (document.body.innerText || '').match(/已完成任务点[:：]\\s*(\\d+)\\/(\\d+)/);

      return {
        enc: em ? em[1] : null,
        rows,
        progress: progress ? progress[1] + '/' + progress[2] : null,
      };
    })()`).catch(() => null);

    if (tree && tree.rows.length) return tree;
    log('   章节树为空，重试');
  }
  return null;
}

// 打开指定章节节点
export async function openNode(page, enc, nodeId) {
  const refer = `https://mooc1.chaoxing.com/mycourse/studentstudy`
    + `?chapterId=${nodeId}&courseId=${CONFIG.courseId}&clazzid=${CONFIG.clazzId}`
    + `&cpi=${CONFIG.cpi}&enc=${enc}&mooc2=1&hidetype=0&fanyaVersion=0`;

  const transfer = `https://mooc1.chaoxing.com/mycourse/transfer`
    + `?moocId=${CONFIG.courseId}&clazzid=${CONFIG.clazzId}`
    + `&linkTime=${Date.now()}&ut=s&refer=${encodeURIComponent(refer)}`;

  await page.goto(transfer, { settle: 5500 });
  await page.bringFront();
  await page.keepVisible();
  await sleep(2000);

  const base = await page.eval(`(() => {
    const text = (document.body.innerText || '').slice(0, 300);
    return {
      locked: /章节未开放|提交失败/.test(document.title + text),
      hasQuizTab: !!document.querySelector('#dct2'),
      hasVideoTab: !!document.querySelector('#dct1'),
    };
  })()`);

  // 纯测验节点没有 #dct2 标签页，测验是内层 iframe 直接挂进来的
  // （ananas/modules/work -> mooc-ans/work）。只看标签页会漏判，
  // 导致节点永远不被处理、反复重进、进度不动。
  const workFrameRe = /mooc-ans\/work|ananas\/modules\/work/;
  const findWorkFrame = async () => {
    const frames = await page.frames().catch(() => []);
    return frames.some(f => workFrameRe.test(f.url || ''));
  };

  let hasWorkFrame = await findWorkFrame();

  // 既没视频标签页也没测验标签页，多半是纯测验节点：等内层帧加载完
  if (!hasWorkFrame && !base.hasQuizTab && !base.hasVideoTab) {
    for (let i = 0; i < 10 && !hasWorkFrame; i++) {
      await sleep(600);
      hasWorkFrame = await findWorkFrame();
    }
  }

  return {
    ...base,
    hasWorkFrame,
    hasQuizTab: base.hasQuizTab || hasWorkFrame,
  };
}

// 提取区间节点
export function sliceRange(tree, startId, endId) {
  const rows = tree.rows;
  const si = startId ? rows.findIndex(r => r.id === startId) : 0;
  const ei = endId ? rows.findIndex(r => r.id === endId) : rows.length - 1;
  if (si < 0 || ei < 0 || ei < si) return [];
  return rows.slice(si, ei + 1);
}
