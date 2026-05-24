/** @typedef {{ id: string, title: string, created_at: string, updated_at: string }} DocSummary */
/** @typedef {DocSummary & { content: string }} DocFull */

/** @param {DocSummary[]} list */
export function sortDocsByCreatedAt(list) {
  return [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const FETCH_TIMEOUT_MS = 15000

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function apiFetch(path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
    })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时，请确认后端已启动（uvicorn main:app --port 8000）')
    }
    throw new Error('无法连接后端，请确认 uvicorn 已在 8000 端口运行')
  } finally {
    clearTimeout(timer)
  }
}

async function parseJson(response) {
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
}

/** @returns {Promise<DocSummary[]>} */
export async function fetchDocList() {
  const response = await apiFetch('/api/docs')
  return parseJson(response)
}

/** @returns {Promise<DocFull>} */
export async function fetchDoc(id) {
  const response = await apiFetch(`/api/docs/${encodeURIComponent(id)}`)
  return parseJson(response)
}

/** @returns {Promise<DocFull>} */
export async function createDoc() {
  const response = await apiFetch('/api/docs', { method: 'POST' })
  return parseJson(response)
}

/**
 * @param {string} id
 * @param {{ title: string, content: string }} payload
 * @returns {Promise<DocFull>}
 */
export async function updateDoc(id, payload) {
  const response = await apiFetch(`/api/docs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(response)
}

/** @param {string} id */
export async function deleteDoc(id) {
  const response = await apiFetch(`/api/docs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 204) {
    await parseJson(response)
  }
}
