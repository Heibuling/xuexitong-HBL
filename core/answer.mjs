// 答案匹配策略：文本归一化 + 语义评分 + 本地缓存
import fs from 'node:fs';
import path from 'node:path';

const BANK_FILE = './data/bank.json';

function loadBank() {
  try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); } catch { return {}; }
}
function saveBank(bank) {
  try {
    fs.mkdirSync(path.dirname(BANK_FILE), { recursive: true });
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2), 'utf8');
  } catch {}
}

export function normalize(text) {
  return (text || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。、；：？！“”‘’（）《》【】·…—～~,.;:?!"'()\[\]{}]/g, '')
    .replace(/[A-Z]/g, m => m.toLowerCase())
    .trim();
}

// 正向关键词
const POSITIVE = [
  '核对', '确认', '记住', '牢记', '记下', '车牌', '号牌', '告知', '分享',
  '实时联系', '保持联系', '观察', '留意', '选择人多', '明亮', '正规平台',
  '报警', '求助', '拒绝', '不乘坐', '后排', '系安全带', '停车', '记录',
  '保留证据', '及时', '第一时间', '告知家人', '发送位置', '分享行程',
];

// 负向关键词
const NEGATIVE = [
  '副驾驶', '不系安全带', '不戴头盔', '闯红灯', '逆行', '超速', '酒驾', '醉驾',
  '疲劳驾驶', '随意变道', '占用应急车道', '玩手机', '低头', '攀谈过多',
  '不告知', '隐瞒', '独自', '偏僻', '黑车', '不核对', '不记住',
  '不观察', '不听劝阻', '翻越', '私自', '违规', '冒险', '跳下', '推搡',
];

function semanticScore(text) {
  const t = text || '';
  let pos = 0, neg = 0;
  for (const k of POSITIVE) if (t.includes(k)) pos++;
  for (const k of NEGATIVE) if (t.includes(k)) neg++;

  // 「不 + 危险动作」= 安全表述
  if (/不(暴露|透露|告知陌生人|轻易|随意|单独|独自)/.test(t)) pos++;
  // 明确危险开头
  if (/^(坐在副驾驶|不系|不戴|不核对|不记|不观察|不锁)/.test(t)) neg += 2;

  return pos - neg;
}

// 基于语义与缓存作答
export function solve(group) {
  const bank = loadBank();
  const key = 'Q:' + group.qid;

  // 缓存命中
  if (bank[key]) {
    return { letters: bank[key], method: 'cache' };
  }

  const opts = group.options || [];
  if (!opts.length) return { letters: '', method: 'empty' };

  // 判断题
  if (group.isJudge) {
    const falseOpt = opts.find(o => /false/i.test(o.value));
    const letters = falseOpt ? falseOpt.letter : opts[opts.length - 1].letter;
    return { letters, method: 'judge-default' };
  }

  // 语义评分
  const scored = opts.map(o => ({
    letter: o.letter,
    text: o.text,
    score: semanticScore(o.text),
  })).sort((a, b) => b.score - a.score);

  if (group.isMulti) {
    const picked = scored.filter(s => s.score >= 0).map(s => s.letter);
    if (!picked.length) picked.push(scored[0].letter);
    // 分差全同 → 全选
    const allSame = new Set(scored.map(s => s.score)).size === 1;
    if (allSame) return { letters: opts.map(o => o.letter).join(''), method: 'multi-all' };
    return { letters: picked.sort().join(''), method: 'multi-semantic' };
  }

  return { letters: scored[0].letter, method: 'single-semantic' };
}

// 记录已确认答案
export function remember(qid, letters) {
  const bank = loadBank();
  bank['Q:' + qid] = letters;
  saveBank(bank);
  return true;
}

export { loadBank, saveBank };
