import { Article } from './types.js'

// ── 权重配置 ──

export const WEIGHTS = {
  time: 0.35,        // 时间新鲜度
  crossSource: 0.25, // 跨源重复度
  signalWord: 0.25,  // 信号词强度
  contentLength: 0.15, // 内容信息量
} as const

// ── 信号词表 ──

/** 强信号词（每条 +2 分） */
const STRONG_SIGNALS = [
  // 中文
  '发布', '推出', '开源', '首次', '首发', '首款',
  '突破', '重大突破', '击败', '超越',
  '登顶', '夺冠', '第一', '最佳',
  '警告', '颠覆', '变革', '革命', '新型', '新一代',
  '融资', '收购', '投资', '裁员',
  '发现', '揭示', '证明',
  '新模型', '新算法', '新框架',
  // 英文
  'launch', 'release', 'open.source', 'first',
  'breakthrough', 'beat', 'surpass', 'outperform',
  'state.of.the.art', 'sota', 'new model', 'next.gen',
  'warn', 'danger', 'revolution',
  'funding', 'acquisition', 'investment', 'layoff',
]

/** 中信号词（每条 +1 分） */
const MEDIUM_SIGNALS = [
  // 中文
  '升级', '更新', '宣布', '公布', '合作', '共建',
  '研究发现', '最新研究', '论文', '调查', '报告',
  '分析', '预测', '接入', '集成',
  '增长', '下降', '超过',
  // 英文
  'upgrade', 'update', 'announce', 'partner',
  'study', 'research', 'report', 'analysis',
  'predict', 'integrate',
  'grow', 'growth', 'increase', 'decline',
]

// ── 评分函数 ──

/** 将日期字符串转为距今小时数 */
function hoursAgo(pubDate: string): number {
  const ts = new Date(pubDate).getTime()
  if (isNaN(ts)) return 24 // 解析失败按最旧处理
  return (Date.now() - ts) / 3_600_000
}

/** 时间新鲜度分（0-1，线性衰减 24h → 0） */
function timeScore(pubDate: string): number {
  return Math.max(0, 1 - hoursAgo(pubDate) / 24)
}

/** 跨源重复度分（0-1） */
function crossSourceScore(sourceCount: number, maxSourceCount: number): number {
  if (maxSourceCount <= 1) return 0
  return Math.min(1, (sourceCount - 1) / (maxSourceCount - 1))
}

/** 信号词强度分（0-1，上限 6 分 = 约 3 个强信号词） */
function signalWordScore(text: string): number {
  const lower = text.toLowerCase()
  let points = 0
  for (const word of STRONG_SIGNALS) {
    if (lower.includes(word.replace(/\./g, ' '))) points += 2
  }
  for (const word of MEDIUM_SIGNALS) {
    if (lower.includes(word.replace(/\./g, ' '))) points += 1
  }
  return Math.min(1, points / 8)
}

/** 内容长度分（0-1，300 字为满分） */
function contentLengthScore(text: string): number {
  return Math.min(1, text.length / 300)
}

/**
 * 对一篇文章计算综合热度评分（0-1）。
 * 仅用于同批次文章内的相对排序，跨批次无意义。
 */
export function scoreArticle(
  article: Article,
  maxSourceCount: number,
): number {
  const sTime = timeScore(article.pubDate)
  const sCross = crossSourceScore(article.sourceCount ?? 1, maxSourceCount)
  const sSignal = signalWordScore(`${article.title} ${article.summary}`)
  const sLen = contentLengthScore(article.summary)

  return (
    sTime * WEIGHTS.time +
    sCross * WEIGHTS.crossSource +
    sSignal * WEIGHTS.signalWord +
    sLen * WEIGHTS.contentLength
  )
}

/**
 * 按综合热度降序排列文章。
 * 自动计算跨源统计信息中的最大值。
 */
export function sortByHotness(articles: Article[]): Article[] {
  if (articles.length === 0) return []

  const maxSourceCount = Math.max(
    1,
    ...articles.map((a) => a.sourceCount ?? 1),
  )

  const scored = articles.map((a) => ({
    article: a,
    score: scoreArticle(a, maxSourceCount),
  }))

  scored.sort((a, b) => b.score - a.score)

  if (scored.length > 0) {
    const topScore = scored[0].score.toFixed(3)
    const avgScore = (
      scored.reduce((s, x) => s + x.score, 0) / scored.length
    ).toFixed(3)
    console.log(`📊 热度排序完成 (top=${topScore}, avg=${avgScore}, n=${scored.length})`)
  }

  return scored.map((s) => s.article)
}
