/** Backend base URL; empty string uses same-origin or Vite dev proxy. */
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

/**
 * Parse one SSE event block.
 *
 * @param {string} block
 * @returns {{ event: string, data: string } | null}
 */
function parseSseBlock(block) {
  const trimmed = block.trim()
  if (!trimmed) {
    return null
  }

  let event = 'message'
  const dataLines = []

  for (const line of trimmed.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  return { event, data: dataLines.join('\n') }
}

/**
 * Generic SSE POST consumer.
 *
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {{ onChunk: (text: string) => void, onDone?: () => void, signal?: AbortSignal }} handlers
 */
export async function streamSse(path, body, { onChunk, onDone, signal }) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
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

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('浏览器不支持流式响应')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        break
      }
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseBlock(block)
        if (parsed) {
          if (parsed.event === 'chunk') {
            const payload = JSON.parse(parsed.data || '{}')
            if (payload.text) {
              onChunk(payload.text)
            }
          } else if (parsed.event === 'error') {
            const payload = JSON.parse(parsed.data || '{}')
            throw new Error(payload.detail || '流式请求失败')
          } else if (parsed.event === 'done') {
            finished = true
            onDone?.()
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    if (!finished && !signal?.aborted) {
      onDone?.()
    }
  } catch (err) {
    await reader.cancel().catch(() => {})
    throw err
  }
}

/**
 * Stream full-document AI generation (Markdown).
 *
 * @param {string} topic
 * @param {{ onChunk: (text: string) => void, onDone?: () => void, signal?: AbortSignal }} handlers
 */
export function streamEditorContent(topic, handlers) {
  return streamSse(
    '/api/doc/ai-generate-stream',
    { topic: topic.trim() },
    handlers,
  )
}

/**
 * Stream bubble-menu AI edit (polish / continue / simplify).
 *
 * @param {'polish' | 'continue' | 'simplify'} action
 * @param {string} text
 * @param {{ onChunk: (text: string) => void, onDone?: () => void, signal?: AbortSignal }} handlers
 */
export function streamAiEdit(action, text, handlers) {
  return streamSse(
    '/api/doc/ai-edit-stream',
    { action, text: text.trim() },
    handlers,
  )
}

/**
 * Stream PPT outline + mind-map Markdown from editor HTML.
 *
 * @param {string} html
 * @param {string} [title]
 * @param {{ onChunk: (text: string) => void, onDone?: () => void, signal?: AbortSignal }} handlers
 */
export function streamDocOutline(html, title, handlers) {
  return streamSse(
    '/api/doc/generate-outline',
    { html: html.trim(), title: (title || '').trim() },
    handlers,
  )
}

/**
 * Parse slash-write SSE blocks (`data: {json}` per line, no `event:` field).
 *
 * @param {string} block
 * @returns {Record<string, unknown> | null}
 */
function parseSlashSseDataBlock(block) {
  const trimmed = block.trim()
  if (!trimmed) {
    return null
  }

  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data:')) {
      const raw = line.slice(5).trimStart()
      if (raw) {
        return JSON.parse(raw)
      }
    }
  }
  return null
}

/**
 * Stream slash-command multi-agent write (status + content JSON payloads).
 *
 * @param {string} prompt
 * @param {string} context
 * @param {{
 *   onStatus?: (payload: Record<string, unknown>) => void,
 *   onContent?: (text: string) => void,
 *   onDone?: () => void,
 *   signal?: AbortSignal,
 * }} handlers
 */
export async function streamSlashAiWrite(prompt, context, { onStatus, onContent, onDone, signal }) {
  const response = await fetch(`${API_BASE}/api/ai/slash-write`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ prompt: prompt.trim(), context }),
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
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

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('浏览器不支持流式响应')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        break
      }
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const payload = parseSlashSseDataBlock(block)
        if (payload) {
          if (payload.type === 'status') {
            onStatus?.(payload)
          } else if (payload.type === 'content' && payload.text) {
            onContent?.(String(payload.text))
          } else if (payload.type === 'error') {
            throw new Error(String(payload.message || '流式请求失败'))
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    if (!signal?.aborted) {
      onDone?.()
    }
  } catch (err) {
    await reader.cancel().catch(() => {})
    throw err
  }
}
