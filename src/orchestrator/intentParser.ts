/**
 * 意图解析模块
 *
 * 将用户自然语言 → 结构化 Intent 对象。
 * 优先使用 DeepSeek API，失败时降级为关键词匹配。
 */
import { loadConfig } from '../config.js'

export interface Intent {
  /** 模式 */
  mode: 'subscribe' | 'hotspot' | 'view' | 'cancel'
  /** 分类（科技/财经/体育/兜底） */
  category: string
  /** 主题词（2-10 字） */
  topic: string
  /** 是否需要总结/观点归纳 */
  needSummary: boolean
}

// ---- DeepSeek 意图解析 ----

const DEEPSEEK_SYSTEM_PROMPT = `你是一个意图解析助手。收到用户的一条消息，请判断：

1. mode: 用户想要长期追踪(subscribe)还是立即查看(hotspot)
   - "盯一下"、"关注"、"跟踪"、"订阅" → subscribe
   - "看看"、"最近"、"今天" → hotspot
   - "查看"、"列表" → view
   - "取消"、"停止" → cancel
   - 难以判断时默认 hotspot

2. category: 用户关心的领域
   - 涉及 AI、科技、计算机、机器人、半导体 → "科技"
   - 涉及公司、市场、投融资、股价 → "财经"
   - 涉及赛事、运动员 → "体育"
   - 不确定 → "兜底"

3. topic: 用 2-10 个字提炼主题词

4. needSummary: 是否需要总结/观点归纳（热点追踪默认 true）

请以 JSON 格式回复，不要输出任何额外内容。`

/**
 * 使用 DeepSeek API 解析意图。
 * 超时 10 秒，重试 1 次。
 */
async function parseWithDeepSeek(
  text: string,
  apiKey: string,
  baseUrl: string,
): Promise<Intent | null> {
  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    temperature: 0.1,
    max_tokens: 200,
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        console.warn(`[DeepSeek] API 返回 ${res.status}`)
        continue
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = data.choices?.[0]?.message?.content?.trim()
      if (!content) continue

      // 尝试解析 JSON
      const json = JSON.parse(content) as Partial<Intent>
      if (json.mode && json.topic) {
        // 补全字段
        return {
          mode: json.mode,
          category: json.category || '兜底',
          topic: json.topic,
          needSummary: json.needSummary ?? true,
        }
      }

      // JSON 格式不对，加提示重试
      console.warn('[DeepSeek] JSON 字段缺失，重试')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[DeepSeek] 意图解析失败 (attempt ${attempt + 1}): ${msg}`)
    }
  }

  return null
}

// ---- 关键词匹配降级 ----

/** 常见动词前缀 */
const SUBSCRIBE_VERBS = ['订阅', '关注', '跟踪', '盯一下', '追踪']
const HOTSPOT_VERBS = ['看看', '最近', '今天', '查一下', '搜索']
const VIEW_VERBS = ['查看', '列表', '清单', '有什么']
const CANCEL_VERBS = ['取消', '停止', '删除', '移除']

function parseWithKeywords(text: string): Intent {
  const trimmed = text.trim()

  // 取消
  for (const verb of CANCEL_VERBS) {
    if (trimmed.startsWith(verb)) {
      const topic = trimmed.slice(verb.length).trim() || ''
      return { mode: 'cancel', category: '兜底', topic, needSummary: false }
    }
  }

  // 查看
  if (VIEW_VERBS.some((v) => trimmed.startsWith(v) || trimmed === v)) {
    return { mode: 'view', category: '兜底', topic: '', needSummary: false }
  }

  // 订阅
  for (const verb of SUBSCRIBE_VERBS) {
    if (trimmed.startsWith(verb)) {
      const topic = trimmed.slice(verb.length).trim() || text
      return { mode: 'subscribe', category: '科技', topic, needSummary: true }
    }
  }

  // 热点追踪（默认）
  for (const verb of HOTSPOT_VERBS) {
    if (trimmed.includes(verb)) {
      const topic = trimmed.replace(verb, '').trim() || text
      return { mode: 'hotspot', category: '科技', topic, needSummary: true }
    }
  }

  // 兜底：整条消息作为 topic，hotspot 模式
  return { mode: 'hotspot', category: '兜底', topic: text, needSummary: true }
}

// ---- 对外接口 ----

/**
 * 解析用户消息为结构化意图。
 *
 * @param text 用户消息文本
 * @returns 解析结果
 */
export async function parseIntent(text: string): Promise<Intent> {
  const config = loadConfig()
  const deepseekConfig = config?.deepseek

  // 优先使用 DeepSeek
  if (deepseekConfig?.apiKey) {
    const result = await parseWithDeepSeek(
      text,
      deepseekConfig.apiKey,
      deepseekConfig.baseUrl || 'https://api.deepseek.com/v1',
    )
    if (result) return result
    console.warn('[意图解析] DeepSeek 失败，降级到关键词匹配')
  }

  // 降级到关键词匹配
  return parseWithKeywords(text)
}
