import { Article } from './types.js'

/**
 * AI / 科技相关关键词列表。
 * 文章标题或摘要命中任意一条即保留，否则过滤。
 * 匹配不区分大小写（仅英文部分）。
 */
const AI_KEYWORDS = [
  // ── 英文 · AI 核心 ──
  'artificial intelligence', 'machine learning', 'deep learning',
  'large language model', 'foundation model',
  'neural network', 'transformer', 'diffusion model',
  'natural language', 'computer vision', 'speech recognition',
  'reinforcement learning', 'recommendation system',
  'generative ai', 'generative model', 'genai', 'agi',
  'ai agent', 'autonomous agent', 'intelligent agent',
  'retrieval augmented generation', 'rag',
  'fine-tuning', 'fine tuning', 'prompt',
  'embedding', 'hallucination', 'alignment',
  'reasoning model', 'mixture of experts', 'moe',
  'multi-modal', 'multimodal',
  'open source model', 'open-source model',

  // ── 英文 · 应用场景 ──
  'robot', 'robotics', 'humanoid', 'drone', 'autonomous driving',
  'self-driving', 'copilot', 'code generation',
  'text to speech', 'tts', 'text-to-speech',
  'image generation', 'video generation',

  // ── 英文 · 基础设施 ──
  'gpu', 'gpus', 'semiconductor', 'data center', 'hpc',
  'high performance computing', 'quantum computing',
  'edge computing', 'ai chip', 'ai accelerator',

  // ── 英文 · 特定产品 / 公司 ──
  'openai', 'anthropic', 'deepmind', 'google ai', 'meta ai',
  'chatgpt', 'gpt-4', 'gpt-5', 'claude', 'gemini',
  'llama 4', 'llama 5', 'mistral', 'qwen', 'deepseek',

  // ── 中文 · AI 核心 ──
  '人工智能', 'ai', '机器学习', '深度学习',
  '大模型', '大语言模型', '多模态', '多模态模型',
  '神经网络', 'transformer',
  '自然语言处理', 'nlp', '计算机视觉', 'cv',
  '强化学习', '推荐系统',
  '生成式', '生成式ai', '生成式人工智能',
  '智能体', 'ai智能体', '自主智能', 'agent',
  '提示词', '微调', '幻觉', '对齐',
  '推理模型', '混合专家', 'moe',
  '检索增强', 'rag',

  // ── 中文 · 应用场景 ──
  '机器人', '人形机器人', '具身智能',
  '自动驾驶', '智能驾驶', '无人驾驶',
  '语音识别', '文字转语音', '图像生成', '视频生成',
  'ai编程', 'ai编码', 'ai代码',

  // ── 中文 · 基础设施 ──
  '芯片', 'ai芯片', '算力', 'gpu', '半导体', '数据中心',
  '量子计算', '边缘计算',

  // ── 中文 · 特定产品 / 公司 ──
  '深度求索', 'deepseek', '月之暗面', 'kimi',
  '智谱', 'glm', '百度文心', '文心一言',
  '阿里通义', '通义千问', 'qwen',
  '腾讯混元', '华为盘古', '字节豆包',
  'openai', 'chatgpt', 'anthropic', 'claude',
  'google gemini', 'meta llama',
]

/**
 * 检查一段文本是否命中 AI 关键词（大小写不敏感）
 */
function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

/**
 * AI / 科技内容过滤器。
 * 只保留标题或摘要中命中 AI 关键词的文章。
 * 统计过滤数量并通过 console 输出。
 */
export function filterAIArticles(articles: Article[]): Article[] {
  if (articles.length === 0) return []

  const kept = articles.filter((a) => {
    const titleMatch = matchesAny(a.title, AI_KEYWORDS)
    const summaryMatch = a.summary ? matchesAny(a.summary, AI_KEYWORDS) : false
    return titleMatch || summaryMatch
  })

  const filtered = articles.length - kept.length
  if (filtered > 0) {
    console.log(`🔍 垂直过滤器: 过滤 ${filtered} 篇非 AI/科技内容，保留 ${kept.length} 篇`)
  }

  return kept
}
