// 配置 — 从课程页面 URL 提取参数填入
export const CONFIG = {
  // 课程参数（必填）
  courseId: 'YOUR_COURSE_ID',
  clazzId:  'YOUR_CLAZZ_ID',
  cpi:      'YOUR_CPI',

  // CDP 端口
  port: 9222,

  // 媒体播放速率（1.0 ~ 2.0，过高会被页面策略拒绝）
  rate: 2.0,

  // 轮询间隔（毫秒）
  poll: 2200,

  // 单项最大重试次数
  retries: 5,

  // 区间限定（留空表示处理全部章节）
  startId: null,
  endId:   null,

  // 数据目录
  dataDir: './data',
};
