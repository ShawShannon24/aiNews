import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Article } from '../types.js'

// ---- 小红书格式 ----

/** 从文章摘要中提取一句话简介（≈50 字符） */
function extractBlurb(a: Article): string {
  // 优先用中文标题，其次英文标题
  const title = a.titleCn && a.titleCn !== a.title ? a.titleCn : a.title

  // 如果有摘要，取前 50 字符；否则直接用标题说明
  if (a.summary) {
    // 优先用中文摘要
    const summaryText = a.summaryCn ?? a.summary
    // 移除特殊字符和多余空格
    const cleaned = summaryText.replace(/[<>]/g, '').trim()
    if (cleaned.length > 0) {
      return cleaned.length <= 50
        ? cleaned
        : cleaned.slice(0, 47) + '…'
    }
  }

  // 没有摘要时用标题作为介绍
  return title.length <= 50 ? title : title.slice(0, 47) + '…'
}

/** 根据文章内容自动挑选话题标签 */
function pickTags(articles: Article[]): string[] {
  const tags: string[] = ['#人工智能', '#AI']
  const allText = articles
    .map(a => `${a.title} ${a.titleCn ?? ''} ${a.summary} ${a.summaryCn ?? ''}`)
    .join(' ')
    .toLowerCase()

  // 关键词 → 标签映射
  const tagPatterns: [RegExp, string][] = [
    [/大模型|llm|gpt|claude|gemini|语言模型|transformer/i, '#大模型'],
    [/机器人|人形机器人|robotics|humanoid/i, '#机器人'],
    [/自动驾驶|无人驾驶|auto.?driving|self.?driving/i, '#自动驾驶'],
    [/芯片|gpu|nvidia|semiconductor|半导体|soc/i, '#芯片'],
    [/融资|投资|收购|funding|acquisition|invest/i, '#投融资'],
    [/开源|open.?source|release|发布/i, '#开源'],
  ]

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(allText)) {
      tags.push(tag)
    }
  }

  // 去重，最多 5 个标签
  return [...new Set(tags)].slice(0, 5)
}

/**
 * 生成小红书格式的 Markdown 发布内容。
 *
 * 小红书约束：
 * - 标题 ≤ 20 字符
 * - 正文 ≤ 1000 字符
 * - 建议展示 5 篇文章
 * - 中文话题标签
 * - Emoji + 简短介绍排版
 */
export function formatXHSPost(
  articles: Article[],
  zhCount: number,
  dailySummary?: string,
  date?: string,
): string {
  const today =
    date ??
    new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Shanghai',
    }).replace(/\//g, '-')

  // ---- 标题（≤20 字符） ----
  // 优先从 dailySummary 取前 20 字符
  let title = ''
  if (dailySummary) {
    // 去掉开头的 emoji/标记符号
    const clean = dailySummary.replace(/^[📌🔍📢🎯⭐🌟💡🔔]\s*/, '').trim()
    title = clean.length <= 20 ? clean : clean.slice(0, 17) + '…'
  }
  // fallback 标题
  if (!title) {
    title = '今日 AI 资讯速览 🚀'
  }

  const lines: string[] = [title, '']

  // ---- 正文 ----

  // 简介段落（从 dailySummary 取，≈80 字以内）
  if (dailySummary) {
    const intro = dailySummary.slice(0, 80)
    lines.push(intro, '')
  }

  // 今日要点
  lines.push('📰 今日要点', '')

  // 优先选中文文章，最多 5 篇
  const zhArticles = articles.slice(0, zhCount)
  const enArticles = articles.slice(zhCount)

  // 取前 5 篇：优先中文，中文不够用英文补
  const selected: Article[] = [
    ...zhArticles.slice(0, 5),
    ...enArticles.slice(0, Math.max(0, 5 - zhArticles.length)),
  ].slice(0, 5)

  for (let i = 0; i < selected.length; i++) {
    const a = selected[i]
    const displayTitle =
      a.titleCn && a.titleCn !== a.title ? a.titleCn : a.title
    const blurb = extractBlurb(a)

    lines.push(`${i + 1}. **${displayTitle}** [${a.source}]`)
    lines.push(`   ${blurb}`)
    lines.push('')
  }

  // ---- 话题标签 ----
  const tags = pickTags(articles)
  lines.push(tags.join(' '))

  const content = lines.join('\n')

  // 验证约束
  const [titleLine] = content.split('\n')
  const titleLen = [...titleLine].length  // 中文字符数
  const bodyLen = [...content].length

  if (titleLen > 20) {
    console.warn(`[小红书] 警告：标题 ${titleLen} 字符，超过 20 字限制`)
  }
  if (bodyLen > 1000) {
    console.warn(`[小红书] 警告：正文 ${bodyLen} 字符，超过 1000 字限制`)
  }

  return content
}

/**
 * 生成小红书发布内容并写入文件。
 *
 * @param articles  - 文章列表（已分组排序）
 * @param zhCount   - 前 N 篇为中文
 * @param dailySummary - 每日总结
 * @param outDir    - 输出目录（默认 ./output/xiaohongshu）
 * @param date      - 日期字符串（默认当天）
 * @returns 文件路径
 */
export async function generateXHSPost(
  articles: Article[],
  zhCount: number,
  dailySummary?: string,
  outDir?: string,
  date?: string,
): Promise<string> {
  const outputDir = resolve(outDir || './output/xiaohongshu')
  const content = formatXHSPost(articles, zhCount, dailySummary, date)

  const today =
    date ??
    new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Shanghai',
    }).replace(/\//g, '-')

  await mkdir(outputDir, { recursive: true })
  const filename = `xhs-${today}.md`
  const filePath = join(outputDir, filename)
  await writeFile(filePath, content, 'utf-8')

  return filePath
}
