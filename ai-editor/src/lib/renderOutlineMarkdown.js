import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * Parse outline Markdown to safe HTML for drawer preview.
 * @param {string} markdown
 * @returns {string}
 */
export function renderOutlineMarkdown(markdown) {
  if (!markdown?.trim()) {
    return ''
  }
  try {
    const html = marked.parse(markdown, { async: false })
    return typeof html === 'string' ? html : ''
  } catch {
    return ''
  }
}
