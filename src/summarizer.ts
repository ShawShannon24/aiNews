import { Article } from './types.js'

/** 关键词 → 话题标签 映射 */
const TOPIC_MAP: Record<string, string> = {
  // AI 核心
  '大模型': '大模型',
  '大语言模型': '大模型',
  'large language model': '大模型',
  'llm': '大模型',
  '多模态': '多模态',
  '多模态模型': '多模态',
  'multimodal': '多模态',
  '生成式': '生成式 AI',
  'generative ai': '生成式 AI',
  'genai': '生成式 AI',
  'agi': 'AGI',
  'ai agent': 'AI Agent',
  '智能体': 'AI Agent',
  '推理模型': '推理模型',
  'reasoning model': '推理模型',
  '开源模型': '开源模型',
  'open source model': '开源模型',

  // 应用
  '自动驾驶': '自动驾驶',
  '智能驾驶': '自动驾驶',
  'autonomous driving': '自动驾驶',
  '机器人': '机器人',
  '人形机器人': '人形机器人',
  '具身智能': '具身智能',
  'robotics': '机器人',
  'humanoid': '人形机器人',

  // 基础设施
  '芯片': '芯片 / 算力',
  'ai芯片': '芯片 / 算力',
  '算力': '芯片 / 算力',
  'gpu': 'GPU / 算力',
  '半导体': '半导体',
  'data center': '数据中心',
  '数据中心': '数据中心',

  // 公司动态
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'chatgpt': 'ChatGPT',
  'google': 'Google',
  'meta': 'Meta',
  'deepseek': 'DeepSeek',
  '深度求索': 'DeepSeek',
  '月之暗面': '月之暗面',
  'kimi': '月之暗面',
}

/** 优先匹配的长关键词（避免短词优先匹配导致语义丢失） */
const LONG_KEYWORDS = Object.keys(TOPIC_MAP).filter((k) => k.length > 4)

/** 检测文本中的话题 */
function detectTopics(text: string): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()

  // 优先匹配长关键词
  for (const kw of LONG_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      found.add(TOPIC_MAP[kw])
    }
  }
  // 再匹配短关键词（仅当尚未匹配到同类话题时）
  for (const [kw, topic] of Object.entries(TOPIC_MAP)) {
    if (found.has(topic)) continue
    if (lower.includes(kw.toLowerCase())) {
      found.add(topic)
    }
  }

  return [...found]
}

/** 从标题中提取最有信息量的「亮点」句子 */
function buildHighlight(topics: string[], articles: Article[]): string {
  // 寻找标题中最突出的新闻
  for (const article of articles) {
    const t = article.title
    // 寻找含有具体数字或产品名的文章作为亮点
    if (
      /发布|推出|开源|突破|超越|首发|首款|新型|击败/i.test(t) &&
      /[0-9]/.test(t)
    ) {
      return '其中 ' + t.replace(/^(【[^】]+】)?\s*/, '').replace(/\s+/g, ' ').slice(0, 60)
    }
  }
  // 回退：用第一个匹配话题的标题
  for (const article of articles) {
    const t = article.title
    for (const topic of topics) {
      if (t.toLowerCase().includes(topic.toLowerCase())) {
        return '重点关注 ' + t.replace(/^(【[^】]+】)?\s*/, '').slice(0, 60)
      }
    }
  }
  return ''
}

/**
 * 生成 ≤200 字的每日 AI 资讯速览。
 *
 * 策略：扫描所有文章的标题/摘要，检测高频话题 → 提取 top 3 热点
 * → 找一条亮点新闻 → 模板拼接。
 * 纯本地，零外部 API 调用。
 */
export function generateSummary(articles: Article[]): string {
  if (articles.length === 0) return ''

  // 1. 收集所有标题 + 摘要
  const texts = articles.map(
    (a) => `${a.title} ${a.summary} ${a.titleCn ?? ''} ${a.summaryCn ?? ''}`,
  )
  const allText = texts.join(' ')

  // 2. 检测话题，按出现频率排序
  const topicCounts = new Map<string, number>()
  for (const text of texts) {
    const topics = detectTopics(text)
    for (const t of topics) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
    }
  }

  const sortedTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic)

  // 3. 构建每个段落
  const parts: string[] = []

  // 开头：热点方向
  if (sortedTopics.length > 0) {
    parts.push(`今日 AI 领域聚焦 ${sortedTopics.join('、')}`)
  }

  // 中间：亮点新闻
  const highlight = buildHighlight(sortedTopics, articles)
  if (highlight) {
    parts.push(highlight)
  }

  // 结尾：汇总信息
  parts.push(`共收录 ${articles.length} 篇精选资讯`)

  // 4. 拼接并控制 ≤200 字
  let summary = parts.join('。')
  // 去掉开头的 "其中" 前的冗余
  summary = summary.replace(/^。（/, '。')
  // 确保结尾有句号
  if (!summary.endsWith('。') && !summary.endsWith('。\n')) {
    summary += '。'
  }

  // 截断到 200 字（按字符数）
  if ([...summary].length > 200) {
    summary = [...summary].slice(0, 197).join('') + '…'
  }

  return summary
}
