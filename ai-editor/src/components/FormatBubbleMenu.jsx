import { useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'

import { streamReplaceSelection } from '../lib/streamReplaceSelection.js'

const COLOR_PRESETS = [
  { id: 'default', label: '默认', value: null, swatch: '#1a1a1a' },
  { id: 'red', label: '红', value: '#ef4444', swatch: '#ef4444' },
  { id: 'blue', label: '蓝', value: '#3b82f6', swatch: '#3b82f6' },
  { id: 'green', label: '绿', value: '#22c55e', swatch: '#22c55e' },
]

const FONT_SIZE_PRESETS = [
  { id: '14', label: '14', value: '14px', title: '14px 小号' },
  { id: '16', label: '16', value: '16px', title: '16px 正文' },
  { id: '18', label: '18', value: '18px', title: '18px 强调' },
]

const AI_TEXT_ACTIONS = [
  { id: 'polish', label: '✨ 润色' },
  { id: 'simplify', label: '✂️ 精简' },
  { id: 'continue', label: '续写' },
]

async function defaultSelectionImage() {
  throw new Error('未配置划词配图')
}

/**
 * @param {{
 *   editor: import('@tiptap/react').Editor | null,
 *   aiStreaming?: boolean,
 *   imageGenerating?: boolean,
 *   onSelectionImage?: (payload: { from: number, to: number, text: string }) => Promise<void>,
 * }} props
 */
export default function FormatBubbleMenu({
  editor,
  aiStreaming = false,
  imageGenerating = false,
  onSelectionImage = defaultSelectionImage,
}) {
  const [aiLoading, setAiLoading] = useState(null)

  if (!editor) {
    return null
  }

  const attrs = editor.getAttributes('textStyle')
  const currentColor = attrs.color || null
  const currentFontSize = attrs.fontSize || null
  const busy = Boolean(aiLoading) || aiStreaming || imageGenerating

  const restoreFocus = () => {
    editor.commands.focus()
  }

  const applyColor = (preset) => {
    const chain = editor.chain().focus()
    if (!preset.value) {
      chain.unsetColor().run()
    } else {
      chain.setColor(preset.value).run()
    }
    restoreFocus()
  }

  const isColorActive = (preset) => {
    if (!preset.value) {
      return !currentColor
    }
    return currentColor === preset.value
  }

  const applyFontSize = (preset) => {
    const chain = editor.chain().focus()
    if (!preset.value) {
      chain.unsetFontSize().run()
    } else {
      chain.setFontSize(preset.value).run()
    }
    restoreFocus()
  }

  const isFontSizeActive = (preset) => {
    if (!preset.value) {
      return !currentFontSize
    }
    return currentFontSize === preset.value
  }

  const handleAiAction = async (actionId) => {
    if (busy) {
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

    setAiLoading(actionId)
    try {
      await streamReplaceSelection(editor, actionId, {
        from,
        to,
        text: selectedText,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`AI 处理失败：${message}`)
    } finally {
      setAiLoading(null)
      restoreFocus()
    }
  }

  const handleSelectionImage = async () => {
    if (busy) {
      return
    }

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

    setAiLoading('image')
    try {
      await onSelectionImage({ from, to, text: selectedText })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`配图失败：${message}`)
    } finally {
      setAiLoading(null)
      restoreFocus()
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      appendTo={() => document.body}
      options={{
        placement: 'top',
        offset: 10,
      }}
      shouldShow={({ from, to, editor: ed }) => {
        if (ed.isActive('image')) {
          return false
        }
        if (ed.isActive('codeBlock')) {
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
        className="format-bubble-toolbar"
        role="toolbar"
        aria-label="划词格式与 AI"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="format-bubble-section format-bubble-section--format">
          <button
            type="button"
            className={`format-bubble-btn format-bubble-btn--bold${editor.isActive('bold') ? ' is-active' : ''}`}
            title="粗体"
            disabled={busy}
            onClick={() => {
              editor.chain().focus().toggleBold().run()
              restoreFocus()
            }}
          >
            <strong>B</strong>
          </button>

          <span className="format-bubble-divider" aria-hidden="true" />

          <div className="format-bubble-group" role="group" aria-label="行内字号">
            {FONT_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`format-bubble-btn format-bubble-btn--size${isFontSizeActive(preset) ? ' is-active' : ''}`}
                title={preset.title}
                disabled={busy}
                onClick={() => applyFontSize(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <span className="format-bubble-divider" aria-hidden="true" />

          <div className="format-bubble-group format-bubble-colors" role="group" aria-label="文字颜色">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`format-bubble-swatch${isColorActive(preset) ? ' is-active' : ''}`}
                title={preset.label}
                disabled={busy}
                style={{ '--swatch': preset.swatch }}
                onClick={() => applyColor(preset)}
              >
                <span className="format-bubble-swatch-dot" />
              </button>
            ))}
          </div>
        </div>

        <span className="format-bubble-divider format-bubble-divider--section" aria-hidden="true" />

        <div className="format-bubble-section format-bubble-section--ai">
          <div className="format-bubble-group format-bubble-ai" role="group" aria-label="AI 划词">
            {AI_TEXT_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="format-bubble-btn format-bubble-btn--ai"
                disabled={busy}
                onClick={() => void handleAiAction(action.id)}
              >
                {aiLoading === action.id ? '处理中…' : action.label}
              </button>
            ))}
            <button
              type="button"
              className="format-bubble-btn format-bubble-btn--ai format-bubble-btn--image"
              disabled={busy}
              onClick={() => void handleSelectionImage()}
            >
              {aiLoading === 'image' ? '🎨 作画中…' : '🖼️ 根据选中配图'}
            </button>
          </div>
        </div>
      </div>
    </BubbleMenu>
  )
}
