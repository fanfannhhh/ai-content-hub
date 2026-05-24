import { mergeAttributes } from '@tiptap/core'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

/**
 * 原生水平线作为物理分页符（导入的 hr.page-break 与导出一致）。
 */
export const PageBreakHr = HorizontalRule.extend({
  name: 'horizontalRule',

  parseHTML() {
    return [{ tag: 'hr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'hr',
      mergeAttributes(HTMLAttributes, {
        class: 'page-break',
        style: 'page-break-after: always;',
      }),
    ]
  },
})

export default PageBreakHr
