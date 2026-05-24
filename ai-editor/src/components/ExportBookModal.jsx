import { useEffect, useState } from 'react'

const FORMAT_OPTIONS = [
  {
    id: 'pdf',
    icon: '📄',
    title: '高质量 PDF',
    subtitle: '出版印刷',
    description: 'A4 版式、篇间分页，适合阅读与打印',
  },
  {
    id: 'word',
    icon: '📝',
    title: 'Microsoft Word',
    subtitle: '二次编辑',
    description: '保留章节结构，便于继续修改与协作',
  },
]

/**
 * 全书导出中心弹窗。
 *
 * @param {{
 *   open: boolean,
 *   chapterCount: number,
 *   loading?: boolean,
 *   loadingFormat?: 'pdf' | 'word' | null,
 *   onClose: () => void,
 *   onConfirm: (format: 'pdf' | 'word') => void | Promise<void>,
 * }} props
 */
export default function ExportBookModal({
  open,
  chapterCount,
  loading = false,
  loadingFormat = null,
  onClose,
  onConfirm,
}) {
  const [selected, setSelected] = useState('pdf')

  useEffect(() => {
    if (open) {
      setSelected('pdf')
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleBackdrop = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <div className="export-book-backdrop" onClick={handleBackdrop}>
      <div
        className="export-book-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-book-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="export-book-title" className="export-book-title">
          📥 导出全书
        </h3>
        <p className="export-book-preview">
          即将合并导出当前全部 <strong>{chapterCount}</strong> 章节文档
        </p>
        <p className="export-book-hint">按创建顺序合并，每篇之间自动分页。</p>

        <div className="export-book-format-grid" role="radiogroup" aria-label="导出格式">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              className={`export-book-format-card${selected === option.id ? ' is-selected' : ''}`}
              disabled={loading}
              onClick={() => setSelected(option.id)}
            >
              <span className="export-book-format-icon">{option.icon}</span>
              <span className="export-book-format-title">{option.title}</span>
              <span className="export-book-format-sub">({option.subtitle})</span>
              <span className="export-book-format-desc">{option.description}</span>
            </button>
          ))}
        </div>

        <div className="export-book-actions">
          <button
            type="button"
            className="export-book-btn secondary"
            disabled={loading}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="export-book-btn primary"
            disabled={loading || chapterCount === 0}
            onClick={() => void onConfirm(selected)}
          >
            {loading
              ? loadingFormat === 'pdf'
                ? 'PDF 生成中…'
                : loadingFormat === 'word'
                  ? 'Word 生成中…'
                  : '导出中…'
              : '开始导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
