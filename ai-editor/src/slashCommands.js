/**
 * Slash command definitions — AI-Native 极简：仅保留「AI 帮我写」。
 */

export const slashCommandItems = [
  {
    title: '✨ AI 帮我写',
    description: '多 Agent 协作续写',
    icon: '✨',
    searchTerms: ['ai', '写', 'prompt', '智能', '帮我写'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(new CustomEvent('slash-ai-prompt'))
    },
  },
]

/**
 * @param {{ query: string }} params
 * @returns {typeof slashCommandItems}
 */
export function getSuggestionItems({ query }) {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) {
    return slashCommandItems
  }

  return slashCommandItems.filter((item) => {
    const haystack = [item.title, item.description, ...item.searchTerms]
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}
