# 学习通网页学习助手

一个基于 Chrome DevTools Protocol 的学习通（超星）网页**学习进度管理工具**。

通过 CDP 连接本地 Edge 浏览器，自动化处理学习通课程页面中的常规学习流程：章节内容浏览、媒体进度记录、自测题作答、结果回填等。

## 功能

- **章节导航**：自动读取课程章节树，按顺序遍历未完成任务点
- **媒体进度**：支持视频 / 音频 / 文档（PDF、PPT）类内容的学习进度记录
- **交互式测评**：自动识别视频中的随堂互动题、章节自测题，按题型（单选 / 多选 / 判断 / 案例组题）作答
- **答案库**：本地缓存已确认的题目答案，减少重复计算
- **断点续跑**：状态持久化，中断后可从上次位置继续
- **异常恢复**：遇到页面校验页自动识别处理，失败自动重试

## 环境要求

- Windows 10 / 11
- Edge 或 Chrome（支持 CDP）
- Node.js ≥ 18
- Python 3.10+（可选，用于验证码识别）

## 快速开始

### 1. 启动带调试端口的浏览器

```powershell
$exe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$ud  = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
Start-Process -FilePath $exe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--remote-allow-origins=*",
  "--user-data-dir=$ud",
  "--profile-directory=Default"
)
```

### 2. 登录

在弹出的浏览器窗口中正常登录学习通。

### 3. 配置课程

编辑 `config.mjs`：

```js
export const CONFIG = {
  courseId: 'YOUR_COURSE_ID',
  clazzId:  'YOUR_CLAZZ_ID',
  cpi:      'YOUR_CPI',
  rate:     2.0,
};
```

这些参数可从课程页面 URL 中获取：

```
https://mooc1.chaoxing.com/mycourse/studentstudy?
  chapterId=xxx&courseId=123456&clazzid=789012&cpi=345678
```

### 4. 运行

```bash
node index.mjs
```

## 目录结构

```
.
├── index.mjs            # 主程序入口
├── cdp.mjs              # Chrome DevTools Protocol 客户端
├── config.mjs           # 课程配置
├── core/
│   ├── navigation.mjs   # 章节树解析与跳转
│   ├── media.mjs        # 视频/音频/文档进度处理
│   ├── quiz.mjs         # 测评解析与作答
│   ├── answer.mjs       # 答案匹配策略
│   └── captcha.mjs      # 校验页识别
└── data/
    └── bank.json        # 本地答案缓存
```

## 模块说明

| 模块 | 职责 |
|---|---|
| `cdp.mjs` | 封装 CDP WebSocket 会话，提供 `attach` / `eval` / `evalInFrame` / `frames` 等能力 |
| `navigation.mjs` | 解析章节树 DOM，提取节点编号、ID、完成状态 |
| `media.mjs` | 处理 `<video>` / `<audio>` 元素，管理播放进度与倍速 |
| `quiz.mjs` | 解析测评页题型结构，生成作答计划，回填结果 |
| `answer.mjs` | 基于题干与选项的文本匹配、语义评分 |
| `captcha.mjs` | 识别页面校验状态，触发对应处理流程 |

## 配置项

| 键 | 说明 | 默认 |
|---|---|---|
| `courseId` | 课程 ID | 必填 |
| `clazzId` | 班级 ID | 必填 |
| `cpi` | 用户标识 | 必填 |
| `port` | CDP 调试端口 | `9222` |
| `rate` | 媒体播放速率 | `2.0` |
| `poll` | 轮询间隔（毫秒） | `2200` |
| `retries` | 单项最大重试次数 | `5` |
| `startId` | 起始章节 ID，留空则从第一个未完成节点开始 | `null` |
| `endId` | 结束章节 ID，留空则处理到最后一节 | `null` |

## 工作原理

1. 通过 CDP 附加到浏览器页面上下文
2. 读取课程章节树 DOM，构建节点列表与完成状态
3. 逐个进入未完成节点，识别页面内可交互元素
4. 对媒体类元素维持播放并记录进度
5. 对测评类内容解析题干与选项，生成作答计划并回填
6. 提交结果，读取反馈，必要时调整策略
7. 状态写入本地，供下次继续

## 常见问题

**Q: 连接失败 / 找不到页面？**
确认浏览器以 `--remote-debugging-port=9222` 启动，且已打开目标页面。

**Q: 页面卡在校验页？**
工具会尝试自动处理；若持续失败，可在浏览器中手动完成后重跑。

**Q: 如何只处理部分章节？**
默认会处理课程内全部章节，无需额外配置。若只需处理某一段，在 `config.mjs` 中填入 `startId` / `endId`（章节 ID），可用 `node tools/scan-tree.mjs` 导出章节树查看各节点的 ID 与完成状态。

**Q: 章节 ID 从哪里获取？**
运行 `node tools/scan-tree.mjs`，会打印完整的章节编号、节点 ID、完成状态与标题，直接复制需要的 ID 填入 `config.mjs` 即可。

**Q: 答案缓存如何清理？**
删除 `data/bank.json` 即可重置。

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

MIT License
