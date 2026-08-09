/**
 * 订阅定时调度器（node-cron）
 *
 * 职责：
 * - 启动时遍历活跃订阅，为有 chat_id 的订阅注册 cron 任务
 * - 定时执行 executeSubscription → pushToChat 推回订阅所在会话
 * - 支持运行时同步（新增/取消订阅后调用 syncSubscriptions 保持一致）
 *
 * 默认「AI 新闻」订阅没有 chat_id（由云端 systemd timer 的群机器人推送），
 * 这里不注册，避免与云端日报重复推送。
 */
import { schedule, ScheduledTask } from 'node-cron'
import { listActiveSubscriptions, Subscription } from '../orchestrator/db.js'
import { executeSubscription } from '../orchestrator/engine.js'
import { pushToChat } from './message.js'

interface BotAuth {
  appId: string
  appSecret: string
}

/** 已注册的定时任务（key = 订阅 id） */
const tasks = new Map<string, ScheduledTask>()

/**
 * 同步订阅 → 定时任务映射。
 *
 * - 新增的有 chat_id 订阅 → 注册 cron
 * - 已取消 / 无 chat_id 的订阅 → 停止并移除
 *
 * @param botAuth 飞书 Bot 认证信息
 */
export function syncSubscriptions(botAuth: BotAuth): void {
  const subs = listActiveSubscriptions()
  const schedulable = new Map<string, Subscription>()

  for (const sub of subs) {
    if (sub.chatId) {
      schedulable.set(sub.id, sub)
    }
  }

  // 停止已取消或无 chat_id 的任务
  for (const [id, task] of tasks) {
    if (!schedulable.has(id)) {
      task.stop()
      tasks.delete(id)
      console.log(`[调度] 已停止订阅任务: ${id}`)
    }
  }

  // 注册新订阅
  for (const [id, sub] of schedulable) {
    if (tasks.has(id)) continue
    try {
      const task = schedule(sub.cronSchedule, () => {
        runSubscription(sub, botAuth).catch((err) => {
          console.error('[调度] 订阅执行失败:', err)
        })
      })
      tasks.set(id, task)
      console.log(`[调度] 已注册订阅任务: "${sub.topic}" (${sub.cronSchedule})`)
    } catch (err) {
      console.error(`[调度] 订阅 "${sub.topic}" 的 cron 表达式无效，跳过:`, err)
    }
  }
}

/**
 * 停止所有订阅任务（优雅退出时调用）。
 */
export function stopAllSubscriptions(): void {
  for (const task of tasks.values()) {
    task.stop()
  }
  tasks.clear()
}

/**
 * 执行单个订阅并推送到订阅所在会话。
 */
async function runSubscription(
  sub: Subscription,
  botAuth: BotAuth,
): Promise<void> {
  const result = await executeSubscription(sub.id)
  if (result.success && sub.chatId) {
    await pushToChat(sub.chatId, result.output, botAuth)
  } else {
    console.warn(`[调度] 订阅 "${sub.topic}" 执行无结果，跳过推送 (${result.output})`)
  }
}
