// 导出章节树结构，便于排查与配置 startId / endId
import { attachPage, sleep } from '../cdp.mjs';
import { CONFIG } from '../config.mjs';
import { getTree } from '../core/navigation.mjs';

const page = await attachPage(CONFIG.port, t => /chaoxing/.test(t.url || ''));
console.log('已连接');

const tree = await getTree(page, console.log);
if (!tree) { console.log('读取失败'); process.exit(1); }

console.log('\n进度:', tree.progress);
console.log('节点总数:', tree.rows.length);
console.log('已完成:', tree.rows.filter(r => r.done).length);
console.log('\n序号 | 编号 | 节点ID | 状态 | 标题');
console.log('-'.repeat(100));

for (const r of tree.rows) {
  const st = r.done ? 'DONE' : (r.inProgress ? 'PART' : '    ');
  console.log(`${String(r.index).padStart(3)}  | ${r.num.padEnd(9)} | ${r.id} | ${st} | ${r.title}`);
}

page.close();
process.exit(0);
