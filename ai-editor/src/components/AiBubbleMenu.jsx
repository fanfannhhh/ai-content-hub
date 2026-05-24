import { useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'

import { streamReplaceSelection } from '../lib/streamReplaceSelection.js'

const ACTIONS = [
  { id: 'polish', label: '✨ AI 润色' },
  { id: 'continue', label: '📝 续写' },
  { id: 'simplify', label: '✂️ 精简字数' },
  { id: 'image', label: '🎨 AI 配图' },
]

/**
 * Floating bubble menu for AI text actions on selection.
 *
 * @param {{
 *   editor: import('@tiptap/react').Editor | null,
 *   imageGenerating?: boolean,
 *   onGenerateImage?: () => void | Promise<void>,
 * }} props
 */
export default function AiBubbleMenu({ editor, imageGenerating = false, onGenerateImage }) {
  const [loading, setLoading] = useState(null)

  if (!editor) {
    return null
  }

  const handleAction = async (actionId) => {
    if (loading || imageGenerating) {
      return
    }

    if (actionId === 'image') {
      const { from, to } = editor.state.selection
      if (from === to) {
        window.alert('请先选中要配图的文字')
        return
      }
      const selectedText = editor.state.doc.textBetween(from, to, '\n\n').trim()
      if (!selectedText) {
        window.alert('选中内容为空，无法配图')
        return
      }
      if (onGenerateImage) {
        await onGenerateImage()
      }
      return
    }

    const { from, to } = editor.state.selection
    if (from === to) {
      return
    }

    const selectedText = editor.state.doc.textBetween(from, to, '\n\n')
    if (!selectedText.trim()) {
      return
    }

    setLoading(actionId)
    try {
      await streamReplaceSelection(editor, actionId, { from, to, text: selectedText })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`AI 处理失败：${message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      appendTo={() => document.body}
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ from, to, editor: ed }) => {
        if (loading || imageGenerating) {
          return false
        }
        if (from === to || ed.state.selection.empty) {
          return false
        }
        const text = ed.state.doc.textBetween(from, to, ' ')
        return text.trim().length > 0
      }}
    >
      <div
        className="ai-bubble-menu"
        role="toolbar"
        aria-label="AI 划词菜单"
        style={{ zIndex: 1200 }}
      >
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="ai-bubble-btn"
            disabled={Boolean(loading) || imageGenerating}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void handleAction(action.id)}
          >
            {action.id === 'image' && imageGenerating
              ? '🎨 正在构思作画...'
              : loading === action.id
                ? '处理中…'
                : action.label}
          </button>
        ))}
      </div>
    </BubbleMenu>
  )
}
