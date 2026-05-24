import { API_BASE } from './apiBase.js'

/**
 * 智能配图：中文 + scope → 后端生图 → 图片 URL。
 *
 * @param {string} text
 * @param {'selection' | 'full_page'} scope
 * @returns {Promise<{ url: string, prompt?: string, scope: string }>}
 */
export async function generateImage(text, scope = 'selection') {
  const response = await fetch(`${API_BASE}/api/doc/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text: text.trim(), scope }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg ?? JSON.stringify(item)).join('; ')
          : data.detail
            ? JSON.stringify(data.detail)
            : `HTTP ${response.status}`
    throw new Error(detail)
  }

  if (!data.url) {
    throw new Error('未返回图片地址')
  }
  return { url: data.url, prompt: data.prompt, scope: data.scope ?? scope }
}
