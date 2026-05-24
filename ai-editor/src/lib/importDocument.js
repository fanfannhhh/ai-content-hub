import { API_BASE, API_CONNECT_ERROR } from './apiBase.js'

const UPLOAD_TIMEOUT_MS = 120_000

/**
 * 上传 Word / PDF，后端解析并创建新文档。
 *
 * @param {File} file
 * @returns {Promise<{ id: string, title: string, content: string, created_at: string, updated_at: string }>}
 */
export async function uploadImportDocument(file) {
  const form = new FormData()
  form.append('file', file, file.name)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE}/api/doc/upload-import`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      // 勿设置 Content-Type，由浏览器为 multipart 自动生成 boundary
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail =
        typeof data.detail === 'string'
          ? data.detail
          : data.detail
            ? JSON.stringify(data.detail)
            : `HTTP ${response.status}`
      throw new Error(detail)
    }
    return data
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('导入超时，文件可能过大，请稍后重试')
    }
    if (err instanceof TypeError && String(err.message).includes('fetch')) {
      throw new Error(API_CONNECT_ERROR)
    }
    if (err instanceof Error) {
      throw err
    }
    throw new Error('导入失败，请稍后重试')
  } finally {
    clearTimeout(timer)
  }
}
