/**
 * 飞书身份验证模块
 *
 * 职责：
 * - 获取并缓存 tenant_access_token（有效期 2h，提前 10min 刷新）
 * - 验证事件回调签名
 */
import crypto from 'node:crypto'

// ---- Token 缓存 ----

interface TokenCache {
  token: string
  expiresAt: number // ms timestamp
}

let tokenCache: TokenCache | null = null

/**
 * 获取飞书 tenant_access_token（带缓存）。
 *
 * @param appId    飞书应用 App ID
 * @param appSecret 飞书应用 App Secret
 * @returns tenant_access_token
 * @throws 如果请求失败
 */
export async function getTenantToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  // 缓存有效则直接返回
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })

  if (!res.ok) {
    throw new Error(`获取 tenant_access_token 失败: HTTP ${res.status}`)
  }

  const data = (await res.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number }
  if (data.code !== 0 || !data.tenant_access_token || !data.expire) {
    throw new Error(`获取 tenant_access_token 失败: ${data.msg || JSON.stringify(data)}`)
  }

  // expire 的单位是秒，提前 10 分钟（600 秒）刷新
  const bufferSec = 600
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - bufferSec) * 1000,
  }

  return tokenCache.token
}

// ---- 事件签名验证 ----

/**
 * 验证飞书事件回调签名。
 *
 * 飞书 v2 签名算法：SHA256 摘要验证。
 * 使用 header `X-Lark-Signature` 与 body 比较。
 *
 * @param body         请求体原文（字符串）
 * @param signature    header 中的签名值
 * @param verifyToken  飞书应用的验证令牌
 * @returns 签名是否通过
 */
export function verifySignature(
  body: string,
  signature: string,
  verifyToken: string,
): boolean {
  const expected = crypto
    .createHash('sha256')
    .update(body + verifyToken)
    .digest('hex')
  return expected === signature
}
