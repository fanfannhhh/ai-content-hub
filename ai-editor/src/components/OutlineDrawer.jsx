import { useEffect, useRef } from 'react'

import OutlineStreamView from './OutlineStreamView.jsx'

export default function OutlineDrawer({
  open,
  streaming,
  content,
  error,
  title,
  onClose,
  onStop,
  onCopy,
  onDownload,
}) {
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        className={`outline-drawer-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`outline-drawer${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="PPT 与脑图大纲"
        aria-hidden={!open}
      >
        <header className="outline-drawer-header">
          <div className="outline-drawer-header-text">
            <h2 className="outline-drawer-title">PPT / 脑图大纲</h2>
            <p className="outline-drawer-subtitle">{title || '当前文档'}</p>
          </div>
          <div className="outline-drawer-header-actions">
            {streaming ? (
              <button
                type="button"
                className="outline-drawer-stop"
                onClick={onStop}
              >
                ⏹️ 停止生成
              </button>
            ) : null}
            <button
              type="button"
              className="outline-drawer-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="outline-drawer-body" ref={bodyRef}>
          {error ? <p className="outline-drawer-error">{error}</p> : null}
          {!error && !content && streaming ? (
            <p className="outline-drawer-placeholder">AI 正在提炼结构…</p>
          ) : null}
          {!error && !content && !streaming ? (
            <p className="outline-drawer-placeholder">
              点击「生成 PPT/脑图」从当前文档提炼逐页大纲与树状脑图。
            </p>
          ) : null}
          {(content || streaming) && !error ? (
            <OutlineStreamView content={content} streaming={streaming} />
          ) : null}
        </div>

        <footer className="outline-drawer-footer">
          <button
            type="button"
            className="outline-drawer-btn"
            disabled={!content || streaming}
            onClick={onCopy}
          >
            📋 复制大纲
          </button>
          <button
            type="button"
            className="outline-drawer-btn outline-drawer-btn--primary"
            disabled={!content || streaming}
            onClick={onDownload}
          >
            💾 下载为 Markdown
          </button>
        </footer>
      </aside>
    </>
  )
}
