// 校验 install.ps1 的编码要求：必须带 UTF-8 BOM + CRLF
// 背景：Windows PowerShell 5.1 读取无 BOM 的 UTF-8 文件时按 ANSI 解码，
// 中文注释里的多字节序列会吞掉紧随其后的 ASCII 字符（包括 } 和 "），
// 表现为「意外的标记 }」这种看不懂的 ParserError。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

const targets = [
  { file: 'install.ps1', needBom: true, needCrlf: true },
  { file: 'install.bat', needBom: false, needCrlf: true },
];

let bad = 0;
for (const { file, needBom, needCrlf } of targets) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.log(`  SKIP  ${file} 不存在`); continue; }

  const buf = fs.readFileSync(full);
  const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  const lf = (text.match(/\n/g) || []).length;
  const crlf = (text.match(/\r\n/g) || []).length;
  const pureLf = lf - crlf;

  const problems = [];
  if (needBom && !hasBom) problems.push('缺少 UTF-8 BOM（PowerShell 5.1 会按 ANSI 解析导致语法报错）');
  if (!needBom && hasBom) problems.push('不应带 BOM（cmd 会把 BOM 当命令输出）');
  if (needCrlf && pureLf > 0) problems.push(`有 ${pureLf} 处裸 LF，应为 CRLF`);

  if (problems.length) {
    bad++;
    console.log(`  FAIL  ${file}  ${buf.length}B`);
    for (const p of problems) console.log(`        - ${p}`);
  } else {
    console.log(`  OK    ${file}  ${buf.length}B  BOM=${hasBom}  CRLF=${crlf}`);
  }
}

if (bad) {
  console.log('\n编码校验未通过。修复方式：');
  console.log('  $t = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) -replace "`r?`n", "`r`n"');
  console.log('  [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding($true)))');
  process.exit(1);
}
console.log('\n编码校验全部通过');