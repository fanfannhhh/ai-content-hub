import { streamEditorContent } from './api.js'
import { insertPlainText } from './editorText.js'
import { markdownToHtml } from '../utils/markdownToHtml.js'

/**
 * Stream AI text into Tiptap with typewriter effect, then apply Markdown formatting.
 *
 * @param {import('@tiptap/react').Editor} editor
 * @param {string} topic
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<void>}
 */
export async function streamIntoEditor(editor, topic, { signal } = {}) {
  const startPos = editor.state.selection.from
  let accumulated = ''

  window.dispatchEvent(new CustomEvent('ai-stream-start'))

  try {
    await streamEditorContent(topic, {
      signal,
      onChunk(text) {
        if (!text) {
          return
        }
        accumulated += text
        insertPlainText(editor, text)
      },
    })

    const endPos = editor.state.selection.from
    if (accumulated.trim() && endPos > startPos) {
      const html = markdownToHtml(accumulated)
      editor
        .chain()
        .focus()
        .deleteRange({ from: startPos, to: endPos })
        .insertContentAt(startPos, html)
        .run()
    }
  } finally {
    window.dispatchEvent(new CustomEvent('ai-stream-end'))
  }
}
