import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 应用配置 */
export interface Config {
  feishu: {
    /** 飞书群机器人 Webhook URL */
    webhookUrl: string
  }
  xiaohongshu?: {
    /** 展示文章数（默认 5） */
    maxArticles?: number
  }
}

const CONFIG_PATH = join(homedir(), '.ainews', 'config.json')

/**
 * 加载配置，优先级：环境变量 > ~/.ainews/config.json。
 *
 * 环境变量：
 * - `AINEWS_FEISHU_WEBHOOK_URL` → 飞书 Webhook URL
 * - `AINEWS_XHS_ENABLED`        → 小红书发布开关
 * - `AINEWS_XHS_MAX_ARTICLES`   → 小红书最大文章数
 *
 * 即使 ~/.ainews/config.json 不存在，环境变量也能独立生效。
 * 文件不存在或读取失败时不抛异常，仅依赖环境变量。
 */
export function loadConfig(): Config | null {
  const envWebhook = process.env.AINEWS_FEISHU_WEBHOOK_URL
  const envXhsEnabled = process.env.AINEWS_XHS_ENABLED
  const envXhsMax = process.env.AINEWS_XHS_MAX_ARTICLES

  // 尝试读取文件配置
  let config: Config | null = null
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    config = JSON.parse(raw) as Config
  } catch {
    // 文件不存在时仅依赖环境变量
  }

  // 环境变量覆盖 / 补充（即使文件不存在也能独立生效）
  if (envWebhook) {
    config ??= { feishu: { webhookUrl: '' }, xiaohongshu: undefined }
    config.feishu ??= { webhookUrl: '' }
    config.feishu.webhookUrl = envWebhook
  }

  if (envXhsEnabled === 'true' || envXhsEnabled === '1') {
    config ??= { feishu: { webhookUrl: '' }, xiaohongshu: { maxArticles: 5 } }
    config.xiaohongshu ??= { maxArticles: 5 }
  }

  if (envXhsMax) {
    config ??= { feishu: { webhookUrl: '' }, xiaohongshu: { maxArticles: 5 } }
    config.xiaohongshu ??= {}
    config.xiaohongshu.maxArticles = parseInt(envXhsMax, 10) || 5
  }

  return config
}
