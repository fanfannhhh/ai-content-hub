import { BubbleMenu } from '@tiptap/react/menus'

const SIZE_PRESETS = [
  { id: '25%', label: '小', title: '宽度 25%' },
  { id: '50%', label: '中', title: '宽度 50%' },
  { id: '100%', label: '大', title: '宽度 100%' },
]

/**
 * 图片选中：对齐 + 尺寸胶囊 + 删除。
 *
 * @param {{
 *   editor: import('@tiptap/react').Editor | null,
 *   aiStreaming?: boolean,
 * }} props
 */
export default function ImageBubbleMenu({ editor, aiStreaming = false }) {
  if (!editor) {
    return null
  }

  const attrs = editor.getAttributes('image')
  const align = attrs.align || 'center'
  const width = attrs.width || '100%'

  const setAlign = (value) => {
    editor.chain().focus().setImageAlign(value).run()
  }

  const setWidth = (value) => {
    editor.chain().focus().setImageWidth(value).run()
  }

  const handleDelete = () => {
    editor.chain().focus().deleteSelection().run()
  }

  const isWidthActive = (preset) => width === preset

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      appendTo={() => document.body}
      options={{
        placement: 'top',
        offset: 10,
      }}
      shouldShow={({ editor: ed }) => !aiStreaming && ed.isActive('image')}
    >
      <div
        className="image-bubble-toolbar"
        role="toolbar"
        aria-label="图片工具栏"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="image-bubble-row">
          <button
            type="button"
            className={`image-bubble-btn${align === 'left' ? ' is-active' : ''}`}
            title="靠左对齐"
            onClick={() => setAlign('left')}
          >
            靠左
          </button>
          <button
            type="button"
            className={`image-bubble-btn${align === 'center' ? ' is-active' : ''}`}
            title="居中对齐"
            onClick={() => setAlign('center')}
          >
            居中
          </button>
          <button
            type="button"
            className={`image-bubble-btn${align === 'right' ? ' is-active' : ''}`}
            title="靠右对齐"
            onClick={() => setAlign('right')}
          >
            靠右
          </button>
        </div>

        <span className="image-bubble-divider image-bubble-divider--row" aria-hidden="true" />

        <div className="image-bubble-row image-bubble-row--size">
          <span className="image-bubble-label">尺寸</span>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`image-bubble-btn image-bubble-btn--size${isWidthActive(preset.id) ? ' is-active' : ''}`}
              title={preset.title}
              onClick={() => setWidth(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <span className="image-bubble-divider image-bubble-divider--row" aria-hidden="true" />

        <div className="image-bubble-row">
          <button
            type="button"
            className="image-bubble-btn image-bubble-btn--danger"
            title="删除图片"
            onClick={handleDelete}
          >
            🗑️ 删除
          </button>
        </div>
      </div>
    </BubbleMenu>
  )
}
