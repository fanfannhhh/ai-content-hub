import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

/**
 * Floating slash command menu rendered by @tiptap/suggestion.
 */
const SlashCommandList = forwardRef(function SlashCommandList(props, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index) => {
    const item = props.items[index]
    if (item) {
      props.command(item)
    }
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((index) =>
          (index + props.items.length - 1) % props.items.length,
        )
        return true
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((index) => (index + 1) % props.items.length)
        return true
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }

      return false
    },
  }))

  if (!props.items.length) {
    return (
      <div className="slash-menu">
        <div className="slash-menu-empty">未找到匹配命令</div>
      </div>
    )
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`slash-menu-item${index === selectedIndex ? ' is-selected' : ''}`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <span className="slash-menu-text">
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

export default SlashCommandList
