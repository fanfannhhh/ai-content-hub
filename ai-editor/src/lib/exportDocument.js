import { markdownToHtml } from '../utils/markdownToHtml.js'

/** Backend base URL; empty string uses same-origin or Vite dev proxy. */
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

/**
 * 导出前：若正文仍是「段落里的 Markdown」（# 标题、**粗体**），先转成语义化 HTML。
 * @param {string} html
 * @returns {string}
 */
function prepareHtmlForExport(html) {
  const raw = (html || '').trim()
  if (!raw) return raw
  const hasRealHeading = /<h[1-6][^>]*>/i.test(raw)
  const markdownInParagraph = /<p[^>]*>\s*#{1,6}\s/i.test(raw)
  if (markdownInParagraph || (!hasRealHeading && /#{1,6}\s/.test(raw))) {
    const text = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*/gi, '\n')
      .replace(/<\/h[1-6]>\s*/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    return markdownToHtml(text)
  }
  return raw
}

/**
 * @param {string} html
 * @param {string} fallback
 * @returns {string}
 */
function resolveExportTopic(html, fallback) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (!match?.[1]) {
    return fallback
  }
  const text = match[1].replace(/<[^>]+>/g, '').trim()
  return text || fallback
}

/**
 * @param {Response} response
 * @param {string} defaultFilename
 * @returns {Promise<void>}
 */
async function downloadBlobFromResponse(response, defaultFilename) {
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const asciiMatch = disposition.match(/filename="([^"]+)"/i)
  let filename = defaultFilename
  if (utf8Match?.[1]) {
    filename = decodeURIComponent(utf8Match[1])
  } else if (asciiMatch?.[1]) {
    filename = asciiMatch[1]
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {string} path
 * @param {object} body
 * @param {string} defaultFilename
 * @returns {Promise<void>}
 */
async function postExportAndDownload(path, body, defaultFilename) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : data.detail
          ? JSON.stringify(data.detail)
          : `HTTP ${response.status}`
    throw new Error(detail)
  }

  await downloadBlobFromResponse(response, defaultFilename)
}

/**
 * @param {string} html
 * @param {string} [topic]
 * @returns {Promise<void>}
 */
export async function exportEditorToWord(html, topic = '文档') {
  const prepared = prepareHtmlForExport(html)
  const filenameTopic = resolveExportTopic(prepared, topic)
  await postExportAndDownload(
    '/api/doc/export/editor-word',
    { html: prepared, topic: filenameTopic },
    'document.docx',
  )
}

/**
 * @param {string} html
 * @param {string} [topic]
 * @returns {Promise<void>}
 */
export async function exportEditorToPdf(html, topic = '文档') {
  const payload = prepareHtmlForExport(html).trim()
  if (!payload || payload === '<p></p>' || payload === '<p><br></p>') {
    throw new Error('编辑器内容为空，无法导出 PDF')
  }
  console.log('导出HTML内容:', payload)
  const filenameTopic = resolveExportTopic(payload, topic)
  await postExportAndDownload(
    '/api/doc/export/editor-pdf',
    { html: payload, topic: filenameTopic },
    'document.pdf',
  )
}

/**
 * @param {string[]} docIds
 * @param {'pdf' | 'word'} format
 * @returns {Promise<void>}
 */
export async function exportBulkBook(docIds, format) {
  const ids = (docIds || []).map((id) => String(id).trim()).filter(Boolean)
  if (!ids.length) {
    throw new Error('没有可导出的文档')
  }
  const path = format === 'pdf' ? '/api/export/pdf' : '/api/export/word'
  const defaultName = format === 'pdf' ? '整书导出.pdf' : '整书导出.docx'
  await postExportAndDownload(path, { doc_ids: ids }, defaultName)
}

/**
 * @param {string} [topic]
 * @returns {Promise<void>}
 */
export async function exportAllDocsToWord(topic = '整本导出') {
  await postExportAndDownload(
    '/api/doc/export-all',
    { topic: topic.trim() || '整本导出' },
    '整本导出.docx',
  )
}
