/**
 * 在选区结束位置下方插入配图（段落分隔 + 居中图片）。
 *
 * @param {import('@tiptap/react').Editor} editor
 * @param {number} insertPos 选区 to（插入点）
 * @param {string} url 图片地址
 */
export function insertImageBelowSelection(editor, insertPos, url) {
  if (!url?.trim()) {
    return
  }

  editor
    .chain()
    .focus()
    .insertContentAt(insertPos, [
      { type: 'paragraph' },
      {
        type: 'image',
        attrs: {
          src: url.trim(),
          align: 'center',
          width: '100%',
        },
      },
    ])
    .run()
}
