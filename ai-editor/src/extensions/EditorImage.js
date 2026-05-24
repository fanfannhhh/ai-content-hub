import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { NodeSelection, Plugin } from '@tiptap/pm/state'

/** @typedef {'25%' | '50%' | '100%' | 'auto'} ImageWidthPreset */

/**
 * 标准 Image 节点 + 对齐 + 百分比宽度（由悬浮工具栏切换，无拖拽缩放）。
 */
export const EditorImage = Image.extend({
  draggable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => {
          const preset = element.getAttribute('data-image-width')
          if (preset === '25%' || preset === '50%' || preset === '100%' || preset === 'auto') {
            return preset
          }
          const styleWidth = element.style?.width
          if (
            styleWidth === '25%' ||
            styleWidth === '50%' ||
            styleWidth === '100%' ||
            styleWidth === 'auto'
          ) {
            return styleWidth
          }
          return '100%'
        },
        renderHTML: (attributes) => {
          const w = attributes.width || '100%'
          return {
            'data-image-width': w,
            style: `width:${w};height:auto;`,
          }
        },
      },
      height: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      align: {
        default: 'center',
        parseHTML: (element) => {
          const host =
            element.closest?.('[data-image-align]') ||
            element.parentElement?.closest?.('[data-image-align]')
          const fromHost = host?.getAttribute('data-image-align')
          if (fromHost === 'left' || fromHost === 'right' || fromHost === 'center') {
            return fromHost
          }
          const fromImg = element.getAttribute?.('data-align')
          if (fromImg === 'left' || fromImg === 'right' || fromImg === 'center') {
            return fromImg
          }
          return 'center'
        },
        renderHTML: (attributes) => {
          if (!attributes.align) {
            return {}
          }
          return { 'data-align': attributes.align }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes['data-align'] || 'center'
    const { 'data-align': _a, ...imgAttrs } = HTMLAttributes
    const textAlign =
      align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'
    return [
      'div',
      {
        class: `editor-image-block editor-image-block--${align}`,
        'data-image-align': align,
        style: `text-align:${textAlign}`,
      },
      ['img', mergeAttributes(this.options.HTMLAttributes, imgAttrs)],
    ]
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-image-align] img[src]',
        getAttrs: (node) => {
          const wrapper = node.closest('[data-image-align]')
          const align = wrapper?.getAttribute('data-image-align')
          const width = node.getAttribute('data-image-width')
          return {
            ...(align ? { align } : {}),
            ...(width ? { width } : {}),
          }
        },
      },
      {
        tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
        getAttrs: (node) => {
          const width = node.getAttribute('data-image-width')
          const align = node.getAttribute('data-align')
          return {
            ...(width ? { width } : {}),
            ...(align ? { align } : {}),
          }
        },
      },
    ]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align }),
      setImageWidth:
        (width) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { width, height: null }),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos) {
            if (node.type.name !== 'image') {
              return false
            }
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
            return true
          },
        },
      }),
    ]
  },
})

export default EditorImage
