import { Article } from '../types.js'

// ---- 飞书 post 消息类型 ----

/** 飞书自定义机器人不支持 style，仅支持 text 和 a tag */
interface FeishuInline {
  tag: 'text' | 'a'
  text: string
  href?: string
}

type FeishuParagraph = FeishuInline[]

interface FeishuPostContent {
  zh_cn: {
    title?: string
    content: FeishuParagraph[]
  }
}

interface FeishuPostBody {
  msg_type: 'post'
  content: {
    post: FeishuPostContent
  }
}

// ---- 格式化 ----

/** 生成一条飞书 post 格式消息的完整 body */
export function formatFeishuMessage(
  articles: Article[],
  zhCount: number,
  dailySummary?: string,
  date?: string,
): FeishuPostBody {
  const today =
    date ??
    new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Shanghai',
    }).replace(/\//g, '-')

  const paragraphs: FeishuParagraph[] = []

  // ---- 标题行 ----
  paragraphs.push([{ tag: 'text', text: `📌 AI 周报 · ${today}` }])

  // ---- 每日速览 ----
  if (dailySummary) {
    paragraphs.push([{ tag: 'text', text: dailySummary }])
  }

  // ---- 分割线 ----
  paragraphs.push([{ tag: 'text', text: '——————————————' }])

  // 分中英文
  const zhArticles = articles.slice(0, zhCount).slice(0, 5)
  const enArticles = articles.slice(zhCount).slice(0, 3)

  // ---- 中文精选 ----
  if (zhArticles.length > 0) {
    paragraphs.push([{ tag: 'text', text: '🇨🇳 中文精选' }])
    for (let i = 0; i < zhArticles.length; i++) {
      const a = zhArticles[i]
      const label = a.titleCn && a.titleCn !== a.title ? a.titleCn : a.title
      paragraphs.push([
        { tag: 'text', text: `${i + 1}. ${label} [${a.source}]` },
      ])
      paragraphs.push([
        { tag: 'text', text: '  👉 ' },
        { tag: 'a', text: a.link, href: a.link },
      ])
    }
  }

  // ---- 英文精选 ----
  if (enArticles.length > 0) {
    paragraphs.push([{ tag: 'text', text: '🌐 英文精选' }])
    for (let i = 0; i < enArticles.length; i++) {
      const a = enArticles[i]
      const label = a.titleCn
        ? `${a.titleCn}（${a.title}）`
        : a.title
      paragraphs.push([
        { tag: 'text', text: `${i + 1}. ${label} [${a.source}]` },
      ])
      paragraphs.push([
        { tag: 'text', text: '  👉 ' },
        { tag: 'a', text: a.link, href: a.link },
      ])
    }
  }

  // ---- 底部 ----
  paragraphs.push([
    { tag: 'text', text: '——————————————' },
  ])
  paragraphs.push([
    { tag: 'text', text: 'AI News · 每周六早 8:00' },
  ])

  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: `AI 周报 · ${today}`,
          content: paragraphs,
        },
      },
    },
  }
}

// ---- 发送 ----

/**
 * 推送精简日报到飞书群机器人。
 *
 * @param webhookUrl - 飞书 Webhook URL
 * @param articles  - 文章列表（已分组排序）
 * @param zhCount   - 前 N 篇为中文
 * @param dailySummary - 每日总结文字
 * @param date      - 日期字符串（默认当天）
 * @returns 是否发送成功
 */
export async function pushToFeishu(
  webhookUrl: string,
  articles: Article[],
  zhCount: number,
  dailySummary?: string,
  date?: string,
): Promise<boolean> {
  const body = formatFeishuMessage(articles, zhCount, dailySummary, date)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[飞书] 推送失败 (${res.status}): ${text}`)
      return false
    }

    const data = await res.json() as { code?: number; StatusCode?: number }
    if (data.code !== 0 && data.StatusCode !== 0) {
      console.error(`[飞书] API 返回错误: ${JSON.stringify(data)}`)
      return false
    }

    console.log('[飞书] 推送成功')
    return true
  } catch (err) {
    console.error('[飞书] 请求异常:', err)
    return false
  }
}
