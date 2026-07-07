const MYMEMORY_API = 'https://api.mymemory.translated.net/get'
const GOOGLE_API = 'https://translate.googleapis.com/translate_a/single'

interface MyMemoryResponse {
  responseData: { translatedText: string }
  quotaFinished: boolean
}

/** 运行内翻译缓存：原文 → 译文 */
const translationCache = new Map<string, string>()

async function translateWithMyMemory(text: string): Promise<string | null> {
  try {
    const url = `${MYMEMORY_API}?q=${encodeURIComponent(text)}&langpair=en%7Czh-CN`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = (await res.json()) as MyMemoryResponse
    if (data.quotaFinished) {
      console.warn('\n[警告] MyMemory 翻译配额已用完')
      return null
    }
    const result = data.responseData?.translatedText
    // MyMemory 有时失败但返回原文
    if (!result || result === text) return null
    return result
  } catch {
    return null
  }
}

async function translateWithGoogle(text: string): Promise<string | null> {
  try {
    const url = `${GOOGLE_API}?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    // Google 返回格式: [[["translated","original",...],...],...]
    const first = (data as any[])?.[0]?.[0]?.[0]
    return typeof first === 'string' ? first : null
  } catch {
    return null
  }
}

/** 英译中（带缓存 + 自动降级） */
export async function translateToChinese(text: string): Promise<string> {
  if (!text || text.length < 2) return text

  // 缓存命中
  const cached = translationCache.get(text)
  if (cached !== undefined) return cached

  // 先试 MyMemory，失败则降级到 Google Translate
  let result = await translateWithMyMemory(text)
  if (!result) {
    result = (await translateWithGoogle(text)) || text
  }

  translationCache.set(text, result)
  return result
}

/** 批量翻译（串行，间隔 1200ms 避免限流） */
export async function batchTranslate(
  texts: { index: number; text: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  const results = new Map<number, string>()

  for (let i = 0; i < texts.length; i++) {
    const { index, text } = texts[i]
    // 仅非末项且非缓存命中才等间隔（缓存命中不调 API，无需等）
    const needsDelay = i < texts.length - 1 && !translationCache.has(text)
    results.set(index, await translateToChinese(text))
    // 无论是否成功都更新进度
    onProgress?.(i + 1, texts.length)
    if (needsDelay) {
      await new Promise((r) => setTimeout(r, 1200))
    }
  }

  return results
}
