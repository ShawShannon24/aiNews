import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Article } from './types.js'

/** 格式化日期为本地可读字符串 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  })
}

/** 生成 Markdown 日报并写入指定目录 */
export async function generateReport(
  articles: Article[],
  outDir?: string,
  /** 前 N 篇为中文，后续为外文（用于插入语言分隔标题） */
  zhCount?: number,
  /** 可选的每日总结文字 */
  dailySummary?: string,
): Promise<string> {
  const outputDir = resolve(outDir || './output')

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).replace(/\//g, '-')

  // 统计信息
  const sourceNames = [...new Set(articles.map((a) => a.source))]
  const zhCount_ = zhCount ?? articles.length
  const enCount = articles.length - zhCount_
  const statsLine = `共收录 **${articles.length}** 篇` +
    (zhCount_ > 0 ? `（中文 **${zhCount_}** 篇 + 外文 **${enCount}** 篇）` : '') +
    `，来自 ${sourceNames.length} 个源：${sourceNames.join('、')}`

  // 构建 markdown
  const lines: string[] = [
    `# AI 新闻日报 — ${today}`,
    '',
    statsLine,
    '',
  ]

  // 插入每日总结
  if (dailySummary) {
    lines.push('📌 **AI 资讯速览**', '', `> ${dailySummary}`, '', '---', '')
  } else {
    lines.push('---', '')
  }

  articles.forEach((a, i) => {
    // 插入语言分段标题
    if (zhCount !== undefined && i === 0 && zhCount > 0) {
      lines.push('## 🇨🇳 中文资讯', '')
    }
    if (zhCount !== undefined && i === zhCount) {
      lines.push('', '---', '', '## 🌐 外文资讯', '')
    }

    // 标题（中英对照）
    const titleLine = a.titleCn
      ? `### ${i + 1}. [${a.title}](${a.link})\n   中文：${a.titleCn}`
      : `### ${i + 1}. [${a.title}](${a.link})`
    lines.push(titleLine)
    lines.push(`- **来源：** ${a.source} · **时间：** ${formatDate(a.pubDate)}`)
    if (a.summary) {
      const summaryLine = a.summaryCn
        ? `- ${a.summary}\n   中文：${a.summaryCn}`
        : `- ${a.summary}`
      lines.push(summaryLine)
    }
    lines.push('')
  })

  const markdown = lines.join('\n')

  // 写入文件
  await mkdir(outputDir, { recursive: true })
  const filename = `ai-daily-${today}.md`
  const filePath = join(outputDir, filename)
  await writeFile(filePath, markdown, 'utf-8')

  return filePath
}
