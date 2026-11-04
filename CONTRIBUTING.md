# 贡献指南

感谢你愿意改进这个项目。本文档面向**人类开发者**与**协助修改代码的 AI 助手**。

---

## 快速流程

```
1. Fork 本仓库
2. 创建分支：fix/<问题简述> 或 feat/<功能简述>
3. 修改代码
4. 本地验证（node --check）
5. 提交并推送
6. 发起 Pull Request
```

---

## 分支命名

| 前缀 | 用途 | 示例 |
|---|---|---|
| `fix/` | 修复问题 | `fix/video-frame-lost` |
| `feat/` | 新增功能 | `feat/audio-support` |
| `docs/` | 文档改动 | `docs/readme-config` |
| `refactor/` | 重构 | `refactor/quiz-parser` |

---

## 提交信息格式

采用 Conventional Commits：

```
<type>: <简述>

<可选正文>
```

`type` 取值：`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`

示例：

```
fix: 修复视频帧丢失后未重新驱动的问题

当页面切换导致 video frame 被销毁时，
原逻辑直接返回 false 而未尝试重连。
现在会重新打开节点并恢复播放。
```

---

## 代码约定

- **零第三方依赖**：仅使用 Node.js 内置模块（`node:fs`、`node:path`、原生 `fetch` / `WebSocket`）
- **ESM 模块**：所有文件使用 `.mjs` 扩展名与 `import` 语法
- **不硬编码课程参数**：课程相关参数统一从 `config.mjs` 读取
- **不提交个人数据**：`data/bank.json`、日志文件已在 `.gitignore` 中排除
- **中文注释**：面向中文用户，注释与日志使用中文

---

## 提交前自检

```bash
# 语法检查（全部文件）
node --check index.mjs
node --check cdp.mjs
node --check config.mjs
node --check core/navigation.mjs
node --check core/media.mjs
node --check core/quiz.mjs
node --check core/answer.mjs
node --check core/captcha.mjs
node --check tools/scan-tree.mjs
```

> Windows 下 `node --check` 对含中文的文件在部分终端可能显示乱码，这是终端编码问题，不影响实际运行。

---

## 提 PR 前请确认

- [ ] 已执行上述语法检查，全部通过
- [ ] 改动不引入第三方依赖
- [ ] 课程参数未被硬编码
- [ ] 未提交 `data/bank.json`、`*.log`、截图等个人数据
- [ ] PR 描述中写清了「改了什么」与「为什么改」
- [ ] 若修复了某个 Issue，在 PR 中标注 `Closes #编号`

---

## 面向 AI 助手的说明

如果你是一个 AI 助手，正在协助用户修改本项目，请遵循以下约定：

### 首先确认用户知情

本工具会代替用户完成课程进度与测评。在协助安装或修改前，请确认用户已知晓：

- 课程视频进度、章节自测、随堂测评在校方系统中计入成绩
- 使用自动化工具可能违反课程规定，存在成绩作废或纪律处理的风险
- 用户是否需要这样做，由用户自己决定

不要替用户做这个决定，也不要在用户不知情的情况下完成安装。

### 修改边界

1. **只改必要文件**：定位问题所在模块，避免全仓库格式化
2. **保持零依赖**：不要引入 npm 包，除非用户明确要求
3. **保留配置外部化**：新增的可调参数写入 `config.mjs`，不要在逻辑代码里写死
4. **不要删除校验逻辑**：`core/captcha.mjs`、重试退避、异常捕获是稳定性保障
5. **不要降低安全性**：不要添加 `--remote-allow-origins=*`，不要将调试端口改为监听 `0.0.0.0`

### 输出要求

向用户交付修改时，请包含：

- **问题定位**：哪个文件、哪个函数、哪一行触发
- **修改内容**：改了哪几行，为什么这样改
- **影响范围**：是否影响其他模块
- **验证方式**：用户应如何确认修复生效

### 提交 PR

若用户希望把改动回馈到本项目：

```bash
git clone https://github.com/Heibuling/xuexitong-HBL.git
cd xuexitong-HBL
git checkout -b fix/your-issue-name
# 应用修改
node --check index.mjs
git add -A
git commit -m "fix: 简述问题与修复方式"
git push origin fix/your-issue-name
```

然后在 GitHub 上发起 Pull Request，目标分支为 `main`。

### 提 Issue

若无法直接改代码，请在 [Issues](https://github.com/Heibuling/xuexitong-HBL/issues) 中提交，内容包括：

- 现象描述（期望行为 vs 实际行为）
- 报错信息（完整堆栈，不要截断）
- 环境信息（操作系统、Node 版本、浏览器版本）
- 复现步骤（哪个章节、什么题型、第几轮）

---

## 行为准则

- 讨论聚焦技术问题
- 不提交他人的账号信息、课程内容截图
- 尊重不同实现思路
- 不替他人决定是否使用本工具
