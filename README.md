# 学习通网页学习助手

一个基于 Chrome DevTools Protocol（CDP）的浏览器页面自动化工具，用于学习通（超星）课程页面。

## 功能

- **章节导航**：读取课程章节树，按顺序遍历未完成任务点
- **媒体进度**：支持视频 / 音频 / 文档（PDF、PPT）类内容的学习进度记录
- **交互式测评**：识别页面内的自测题与随堂题，按题型（单选 / 多选 / 判断 / 案例组题）解析并回填
- **答案库**：本地缓存已确认的题目答案，减少重复计算
- **断点续跑**：状态持久化，中断后可从上次位置继续
- **异常恢复**：遇到页面校验页自动识别处理，失败自动重试

## ⚠️ 使用前请阅读

**本工具会代替你完成课程视频进度、章节自测和随堂测评。**

这些内容在校方系统中均计入学习记录与成绩。使用本工具等同于将学习过程和测评答案交由程序代做。若被平台检测或学校核查，可能面临课程成绩作废、纪律处理等后果。

**请在使用前自行确认：**

- 你的课程是否允许此类辅助工具
- 你是否能承担相应后果

本项目仅提供技术实现，不对使用后果负责。**如果你不确定，请不要使用。**

## 环境要求

- Windows 10 / 11
- Edge 或 Chrome（支持 CDP）
- Node.js ≥ 18

本项目**零第三方依赖**，不需要 `npm install`。

## 安装

### 方式一：一键脚本（推荐）

```powershell
# 下载后右键「使用 PowerShell 运行」
.\install.ps1
```

脚本会自动完成：检查环境 → 下载代码 → 配置参数 → 启动浏览器。

### 方式二：手动安装

```bash
git clone https://github.com/Heibuling/xuexitong-HBL.git
cd xuexitong-HBL
```

## 配置

### 1. 启动带调试端口的浏览器

**安全提示**：调试端口会让本机进程能够控制该浏览器实例。建议使用**独立的用户数据目录**，不要复用日常使用的浏览器配置。

```powershell
# 创建独立配置目录（首次）
$profile = "$env:LOCALAPPDATA\HBL-Browser"
New-Item -ItemType Directory -Force -Path $profile | Out-Null

# 启动 Edge（仅监听本机回环地址）
$exe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
Start-Process -FilePath $exe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--remote-debugging-address=127.0.0.1",
  "--user-data-dir=$profile",
  "--no-first-run",
  "--no-default-browser-check"
)
```

在这个独立窗口中登录学习通即可。

> **不要**添加 `--remote-allow-origins=*`。该参数会关闭 CDP 的来源校验，让任意网页都能接管浏览器。

### 2. 填写课程参数

编辑 `config.mjs`：

```js
export const CONFIG = {
  courseId: 'YOUR_COURSE_ID',
  clazzId:  'YOUR_CLAZZ_ID',
  cpi:      'YOUR_CPI',
  ...
};
```

三个参数从课程页面 URL 中获取：

```
https://mooc1.chaoxing.com/mycourse/studentstudy?
  chapterId=xxx&courseId=123456&clazzid=789012&cpi=345678
```

对应关系：`courseId` → 123456，`clazzId` → 789012，`cpi` → 345678

### 3. 运行

```bash
node index.mjs
```

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

## 目录结构

```
.
├── index.mjs              # 主程序入口
├── cdp.mjs                # Chrome DevTools Protocol 客户端
├── config.mjs             # 课程配置
├── install.ps1            # 一键安装脚本
├── core/
│   ├── navigation.mjs     # 章节树解析与跳转
│   ├── media.mjs          # 视频 / 音频 / 文档进度处理
│   ├── quiz.mjs           # 测评解析与作答
│   ├── answer.mjs         # 答案匹配策略
│   └── captcha.mjs        # 校验页识别
├── tools/
│   └── scan-tree.mjs      # 导出章节树结构
└── data/
    └── bank.json          # 本地答案缓存（不纳入版本控制）
```

## 模块说明

| 模块 | 职责 |
|---|---|
| `cdp.mjs` | 封装 CDP WebSocket 会话，提供 `attach` / `eval` / `evalInFrame` / `frames` |
| `navigation.mjs` | 解析章节树 DOM，提取节点编号、ID、完成状态 |
| `media.mjs` | 处理 `<video>` / `<audio>` 元素，管理播放进度 |
| `quiz.mjs` | 解析测评页题型结构，生成作答计划，回填结果 |
| `answer.mjs` | 基于题干与选项的文本匹配、语义评分 |
| `captcha.mjs` | 识别页面校验状态，触发对应处理流程 |

## 工作原理

1. 通过 CDP 附加到浏览器页面上下文
2. 读取课程章节树，构建节点列表与完成状态
3. 逐个进入未完成节点，识别页面内可交互元素
4. 对媒体类元素维持播放并记录进度
5. 对测评类内容解析题干与选项，生成作答计划并回填
6. 提交结果，读取反馈，必要时调整策略
7. 状态写入本地，供下次继续

## 常见问题

**Q: 连接失败 / 找不到页面？**
确认浏览器以 `--remote-debugging-port=9222` 启动，且已打开目标页面。检查端口是否在监听：`Get-NetTCPConnection -LocalPort 9222`

**Q: 页面卡在校验页？**
工具会尝试自动处理；若持续失败，在浏览器中手动完成后重跑。

**Q: 如何只处理部分章节？**
默认处理课程内全部章节。若只需处理某一段，在 `config.mjs` 中填入 `startId` / `endId`。

**Q: 章节 ID 从哪里获取？**
运行 `node tools/scan-tree.mjs`，会打印完整的章节编号、节点 ID、完成状态与标题。

**Q: 答案缓存如何清理？**
删除 `data/bank.json` 即可重置。

## 安全说明

- **独立浏览器实例**：建议使用专用 `--user-data-dir`，不要复用日常浏览器配置
- **仅本机监听**：调试端口应限制在 `127.0.0.1`，不要监听 `0.0.0.0`
- **不要开启 `--remote-allow-origins=*`**：会允许任意来源通过 CDP 控制浏览器
- **用完即关**：任务结束后关闭该浏览器实例，释放调试端口

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 参与贡献

- **提交 Issue** — [新建 Issue](https://github.com/Heibuling/xuexitong-HBL/issues/new/choose)
- **提交 Pull Request** — Fork 后修改，`node --check` 验证，发起 PR 到 `main`
- 详细规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可

MIT License
