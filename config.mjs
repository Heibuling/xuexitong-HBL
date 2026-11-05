// 配置 — 从课程页面 URL 提取参数填入
export const CONFIG = {
  // 课程参数（必填）
  courseId: 'YOUR_COURSE_ID',
  clazzId:  'YOUR_CLAZZ_ID',
  cpi:      'YOUR_CPI',

  // CDP 端口
  port: 9222,

  // 媒体播放速率上限（1.0 ~ 2.0）
  // 部分课程把倍速锁死在 1.0，脚本会自动逐级回退到可用的档位，
  // 不会硬顶 2.0 造成「播放→被暂停→再播放」的抖动。
  rate: 2.0,

  // 倍速候选序列：从 rate 往下试，第一个真正生效的档位就用它
  rateSteps: [2.0, 1.5, 1.25, 1.0],

  // 播放纠偏限流：两次纠偏的最小间隔（毫秒）与单个视频的最大次数
  // 限流是为了避免高频 play() 触发平台风控（9010 / 验证码）
  playNudgeCooldown: 5000,
  playNudgeLimit: 20,

  // 轮询间隔（毫秒）
  poll: 2200,

  // 文档任务点：单个文档最长等待分钟数与每次翻页间隔（毫秒）
  // 文档完成条件由平台按阅读时长判定，只能滚动 + 等待
  docMaxMinutes: 10,
  docScrollStepMs: 1500,

  // 单个节点内多任务点（视频 + 文档 + 测验）的最大处理轮次
  nodePasses: 6,

  // 单项最大重试次数
  retries: 5,

  // 区间限定（留空表示处理全部章节）
  startId: null,
  endId:   null,

  // 数据目录
  dataDir: './data',
};
