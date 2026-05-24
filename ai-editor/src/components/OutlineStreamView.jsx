import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { renderOutlineMarkdown } from '../lib/renderOutlineMarkdown.js'

/**
 * Streaming Markdown preview — stable parsed HTML + plain tail while streaming.
 */
export default function OutlineStreamView({ content, streaming }) {
  const wrapRef = useRef(null)
  const articleRef = useRef(null)
  const prevLenRef = useRef(0)
  const [tailText, setTailText] = useState('')

  useEffect(() => {
    const prev = prevLenRef.current
    if (content.length > prev) {
      setTailText(content.slice(prev))
    } else if (!streaming) {
      setTailText('')
    }
    prevLenRef.current = content.length
  }, [content, streaming])

  const stableMarkdown =
    streaming && tailText ? content.slice(0, content.length - tailText.length) : content

  const html = useMemo(() => renderOutlineMarkdown(stableMarkdown), [stableMarkdown])

  useLayoutEffect(() => {
    if (articleRef.current) {
      articleRef.current.innerHTML = html
    }
  }, [html])

  useEffect(() => {
    const body = wrapRef.current?.closest('.outline-drawer-body')
    if (!body || !streaming) return
    body.scrollTop = body.scrollHeight
  }, [content, html, tailText, streaming])

  if (!content && !streaming) {
    return null
  }

  return (
    <div ref={wrapRef} className="outline-stream-wrap">
      <article ref={articleRef} className="outline-md-article" />
      {streaming && tailText ? (
        <pre className="outline-md-tail">{tailText}</pre>
      ) : null}
    </div>
  )
}
