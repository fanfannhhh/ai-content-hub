import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'

import SlashCommandList from '../components/SlashCommandList.jsx'
import { getSuggestionItems } from '../slashCommands.js'

const SLASH_MENU_Z_INDEX = 9999

/**
 * Position the slash menu with flip/shift (bottom-start → top-start near viewport bottom).
 *
 * @param {HTMLElement} element
 * @param {import('@tiptap/suggestion').SuggestionProps} props
 */
async function updateMenuPosition(element, props) {
  const rect = props.clientRect?.()
  if (!rect) {
    return
  }

  const virtualElement = {
    getBoundingClientRect: () => rect,
  }

  const { x, y, strategy } = await computePosition(virtualElement, element, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
      }),
      shift({ padding: 8 }),
    ],
  })

  element.style.position = strategy
  element.style.left = `${x}px`
  element.style.top = `${y}px`
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        allowedPrefixes: null,
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        ...this.options.suggestion,
        items: ({ query }) => getSuggestionItems({ query }),
        render: () => {
          let component
          let element

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              })

              element = component.element
              element.classList.add('slash-menu-root')
              element.style.position = 'fixed'
              element.style.zIndex = String(SLASH_MENU_Z_INDEX)
              // appendTo body: escape editor overflow clipping
              document.body.appendChild(element)
              void updateMenuPosition(element, props)
            },

            onUpdate(props) {
              component.updateProps(props)
              void updateMenuPosition(element, props)
            },

            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                return true
              }

              return component.ref?.onKeyDown?.(props) ?? false
            },

            onExit() {
              component.destroy()
              element?.remove()
            },
          }
        },
      }),
    ]
  },
})
