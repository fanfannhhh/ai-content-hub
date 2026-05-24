import { streamAiEdit } from './api.js'
import { insertPlainText } from './editorText.js'

/**
 * Stream AI edit into selection: replace (polish/simplify) or append (continue).
 *
 * @param {import('@tiptap/react').Editor} editor
 * @param {'polish' | 'continue' | 'simplify'} action
 * @param {{ signal?: AbortSignal, from?: number, to?: number, text?: string }} [options]
 */
export async function streamReplaceSelection(
  editor,
  action,
  { signal, from: rangeFrom, to: rangeTo, text } = {},
) {
  const from = rangeFrom ?? editor.state.selection.from
  const to = rangeTo ?? editor.state.selection.to
  if (from === to) {
    throw new Error('请先选中要处理的文本')
  }

  const selectedText = text ?? editor.state.doc.textBetween(from, to, '\n\n')
  if (!selectedText.trim()) {
    throw new Error('选中内容为空')
  }

  window.dispatchEvent(new CustomEvent('ai-stream-start'))

  try {
    if (action === 'continue') {
      editor.chain().focus().setTextSelection(to).run()
    } else {
      editor.chain().focus().deleteRange({ from, to }).run()
    }

    await streamAiEdit(action, selectedText, {
      signal,
      onChunk(text) {
        insertPlainText(editor, text)
      },
    })
  } finally {
    window.dispatchEvent(new CustomEvent('ai-stream-end'))
    editor.commands.focus()
  }
}
