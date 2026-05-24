import { useEffect } from 'react'

/**
 * AI 灵感配图抽屉：预览 → 重新生成 / 插入文档。
 *
 * @param {{
 *   open: boolean,
 *   loading: boolean,
 *   imageUrl: string | null,
 *   error: string | null,
 *   scope: 'selection' | 'full_page',
 *   title: string,
 *   onClose: () => void,
 *   onRegenerate: () => void,
 *   onInsert: () => void,
 * }} props
 */
export default function ImageDrawer({
  open,
  loading,
  imageUrl,
  error,
  scope,
  title,
  onClose,
  onRegenerate,
  onInsert,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const scopeLabel =
    scope === 'full_page' ? '整页封面感' : '划词细节感'

  return (
    <>
      <div
        className={`outline-drawer-backdrop image-drawer-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`outline-drawer image-inspiration-drawer${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI 灵感配图"
        aria-hidden={!open}
      >
        <header className="outline-drawer-header">
          <div className="outline-drawer-header-text">
            <h2 className="outline-drawer-title">AI 灵感配图</h2>
            <p className="outline-drawer-subtitle">
              {title || '当前文档'} · {scopeLabel}
            </p>
          </div>
          <button
            type="button"
            className="outline-drawer-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        <div className="outline-drawer-body image-drawer-body">
          {error ? <p className="outline-drawer-error">{error}</p> : null}

          {loading ? (
            <div className="image-drawer-stage" aria-busy="true" aria-label="正在生成图片">
              <div className="image-drawer-skeleton" />
              <p className="image-drawer-loading-text">🎨 正在构思作画...</p>
              <p className="image-drawer-loading-hint">
                {scope === 'full_page'
                  ? '正在从全文提炼封面级视觉概念'
                  : '正在根据选中片段绘制细节画面'}
              </p>
            </div>
          ) : null}

          {!loading && !error && imageUrl ? (
            <div className="image-drawer-stage">
              <img
                className="image-drawer-preview"
                src={imageUrl}
                alt="AI 生成的配图预览"
              />
              <p className="image-drawer-tip">
                预览满意后点击「插入到当前位置」。图片链接约 1 小时内有效，请及时插入或自行保存。
              </p>
            </div>
          ) : null}

          {!loading && !error && !imageUrl ? (
            <p className="outline-drawer-placeholder">
              使用顶部「AI 配图」生成整页封面感画面，或在正文中划词后使用气泡菜单生成细节配图。
            </p>
          ) : null}
        </div>

        <footer className="outline-drawer-footer">
          <button
            type="button"
            className="outline-drawer-btn"
            disabled={loading}
            onClick={onRegenerate}
          >
            {loading ? '生成中…' : '🎨 重新生成'}
          </button>
          <button
            type="button"
            className="outline-drawer-btn outline-drawer-btn--primary"
            disabled={loading || !imageUrl}
            onClick={onInsert}
          >
            📌 插入到当前位置
          </button>
        </footer>
      </aside>
    </>
  )
}
