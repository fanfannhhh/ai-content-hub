/**
 * Insert plain text at the current cursor (ProseMirror native, no extension needed).
 *
 * @param {import('@tiptap/react').Editor} editor
 * @param {string} text
 */
export function insertPlainText(editor, text) {
  if (!text) {
    return
  }

  const { from } = editor.state.selection
  const transaction = editor.state.tr.insertText(text, from)
  editor.view.dispatch(transaction)
}
