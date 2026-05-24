import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import ExportBookModal from './components/ExportBookModal.jsx'
import FormatBubbleMenu from './components/FormatBubbleMenu.jsx'
import ImageBubbleMenu from './components/ImageBubbleMenu.jsx'
import AiPromptPanel from './components/AiPromptPanel.jsx'
import ImageDrawer from './components/ImageDrawer.jsx'
import OutlineDrawer from './components/OutlineDrawer.jsx'
import { streamDocOutline } from './lib/api.js'
import { EditorImage } from './extensions/EditorImage.js'
import { PageBreakHr } from './extensions/PageBreakHr.js'
import { SlashCommand } from './extensions/SlashCommand.js'
import {
  exportBulkBook,
  exportEditorToPdf,
  exportEditorToWord,
} from './lib/exportDocument.js'
import {
  createDoc,
  deleteDoc,
  fetchDoc,
  fetchDocList,
  sortDocsByCreatedAt,
  updateDoc,
} from './lib/docsApi.js'
import { generateImage } from './lib/generateImage.js'
import { insertImageBelowSelection } from './lib/insertImageBelowSelection.js'
import { uploadImportDocument } from './lib/importDocument.js'
import { normalizeEditorHtml } from './lib/normalizeEditorHtml.js'

const AUTOSAVE_MS = 1500

function formatDocTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function App() {
  const [aiPromptOpen, setAiPromptOpen] = useState(false)
  const [aiStreaming, setAiStreaming] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingFormat, setExportingFormat] = useState(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportBookOpen, setExportBookOpen] = useState(false)
  const [exportBookLoading, setExportBookLoading] = useState(false)
  const [exportBookFormat, setExportBookFormat] = useState(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outlineContent, setOutlineContent] = useState('')
  const [outlineStreaming, setOutlineStreaming] = useState(false)
  const [outlineError, setOutlineError] = useState(null)
  const [isImageDrawerOpen, setIsImageDrawerOpen] = useState(false)
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null)
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imageError, setImageError] = useState(null)
  const [imageScope, setImageScope] = useState('selection')
  const [docImporting, setDocImporting] = useState(false)

  const [docs, setDocs] = useState([])
  const [activeDocId, setActiveDocId] = useState(null)
  const [docTitle, setDocTitle] = useState('未命名文档')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [booting, setBooting] = useState(true)
  const [loadError, setLoadError] = useState(null)


  const skipSaveRef = useRef(true)
  const saveTimerRef = useRef(null)
  const outlineAbortRef = useRef(null)
  const activeDocIdRef = useRef(null)
  const docTitleRef = useRef('未命名文档')
  const editorRef = useRef(null)
  const imageRequestRef = useRef({ text: '', scope: 'selection' })
  const importFileInputRef = useRef(null)
  const exportMenuRef = useRef(null)

  activeDocIdRef.current = activeDocId
  docTitleRef.current = docTitle

  const refreshDocList = useCallback(async () => {
    const list = sortDocsByCreatedAt(await fetchDocList())
    setDocs(list)
    return list
  }, [])

  const persistDoc = useCallback(async () => {
    const id = activeDocIdRef.current
    const ed = editorRef.current
    if (!id || !ed) return null
    const saved = await updateDoc(id, {
      title: docTitleRef.current.trim() || '未命名文档',
      content: ed.getHTML(),
    })
    setDocs((prev) => {
      const next = prev.map((item) =>
        item.id === saved.id
          ? {
              ...item,
              id: saved.id,
              title: saved.title,
              updated_at: saved.updated_at,
              created_at: saved.created_at ?? item.created_at,
            }
          : item,
      )
      if (!next.some((item) => item.id === saved.id)) {
        next.push({
          id: saved.id,
          title: saved.title,
          created_at: saved.created_at,
          updated_at: saved.updated_at,
        })
      }
      return sortDocsByCreatedAt(next)
    })
    return saved
  }, [])

  const scheduleSave = useCallback(() => {
    if (skipSaveRef.current || !activeDocIdRef.current) return
    setSaveStatus('syncing')
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await persistDoc()
          setSaveStatus('saved')
        } catch (err) {
          console.error(err)
          setSaveStatus('idle')
        }
      })()
    }, AUTOSAVE_MS)
  }, [persistDoc])

  const loadDocument = useCallback(
    async (id) => {
      if (!id) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      skipSaveRef.current = true
      setSaveStatus('idle')
      const doc = await fetchDoc(id)
      setActiveDocId(doc.id)
      setDocTitle(doc.title)
      docTitleRef.current = doc.title
      const ed = editorRef.current
      if (ed) {
        ed.commands.setContent(normalizeEditorHtml(doc.content || '<p></p>'), false)
      }
      skipSaveRef.current = false
    },
    [],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
      }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
      PageBreakHr,
      EditorImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'editor-image-node' },
      }),
      SlashCommand,
    ],
    content: '<p></p>',
    onUpdate: () => scheduleSave(),
    editorProps: {
      attributes: {
        class: 'tiptap',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      },
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    const html = editor.getHTML()
    const normalized = normalizeEditorHtml(html)
    if (normalized !== html) {
      editor.commands.setContent(normalized, false)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return

    let cancelled = false
    setLoadError(null)
    setBooting(true)

    ;(async () => {
      try {
        let list = await fetchDocList()
        if (list.length === 0) {
          const created = await createDoc()
          list = sortDocsByCreatedAt([
            {
              id: created.id,
              title: created.title,
              created_at: created.created_at,
              updated_at: created.updated_at,
            },
          ])
        } else {
          list = sortDocsByCreatedAt(list)
        }
        if (cancelled) return
        setDocs(list)
        await loadDocument(list[0].id)
      } catch (err) {
        if (cancelled) return
        console.error(err)
        const message = err instanceof Error ? err.message : String(err)
        setLoadError(message)
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [editor, loadDocument])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      outlineAbortRef.current?.abort()
    }
  }, [])

  const retryBootstrap = useCallback(() => {
    if (!editor) return
    setLoadError(null)
    setBooting(true)
    void (async () => {
      try {
        let list = sortDocsByCreatedAt(await fetchDocList())
        if (list.length === 0) {
          const created = await createDoc()
          list = sortDocsByCreatedAt([
            {
              id: created.id,
              title: created.title,
              created_at: created.created_at,
              updated_at: created.updated_at,
            },
          ])
        }
        setDocs(list)
        await loadDocument(list[0].id)
        setLoadError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setLoadError(message)
      } finally {
        setBooting(false)
      }
    })()
  }, [editor, loadDocument])

  const applyImportedDoc = useCallback(
    async (doc) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      skipSaveRef.current = true
      setSaveStatus('idle')
      setActiveDocId(doc.id)
      setDocTitle(doc.title)
      docTitleRef.current = doc.title
      setDocs((prev) => {
        const next = [
          {
            id: doc.id,
            title: doc.title,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
          },
          ...prev.filter((item) => item.id !== doc.id),
        ]
        return sortDocsByCreatedAt(next)
      })
      const ed = editorRef.current
      if (ed) {
        ed.commands.setContent(normalizeEditorHtml(doc.content || '<p></p>'), false)
      }
      skipSaveRef.current = false
    },
    [],
  )

  const handleNewDoc = async () => {
    try {
      const doc = await createDoc()
      await refreshDocList()
      await loadDocument(doc.id)
    } catch (err) {
      window.alert(`新建失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleImportDocClick = () => {
    if (docImporting || booting) {
      return
    }
    importFileInputRef.current?.click()
  }

  const handleImportDocFile = async (event) => {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) {
      return
    }
    const name = (file.name || '').toLowerCase()
    if (name.endsWith('.doc')) {
      window.alert('不支持旧版 .doc，请在 Word 中另存为 .docx 后再导入')
      return
    }
    setDocImporting(true)
    try {
      const doc = await uploadImportDocument(file)
      await refreshDocList()
      await applyImportedDoc(doc)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`导入失败：${message}`)
    } finally {
      setDocImporting(false)
    }
  }

  const handleSelectDoc = (id) => {
    if (id === activeDocId) return
    void loadDocument(id)
  }

  const handleDeleteDoc = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('确定删除这篇文档？')) return
    try {
      await deleteDoc(id)
      let list = await refreshDocList()
      if (activeDocId === id) {
        if (list.length === 0) {
          const created = await createDoc()
          list = sortDocsByCreatedAt([
            {
              id: created.id,
              title: created.title,
              created_at: created.created_at,
              updated_at: created.updated_at,
            },
          ])
          setDocs(list)
        }
        await loadDocument(list[0].id)
      }
    } catch (err) {
      window.alert(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleTitleChange = (e) => {
    const value = e.target.value
    setDocTitle(value)
    docTitleRef.current = value
    scheduleSave()
  }

  const handleExport = async (format) => {
    if (!editor) {
      window.alert('编辑器尚未就绪')
      return
    }
    setExportMenuOpen(false)
    setExporting(true)
    setExportingFormat(format)
    try {
      const html = editor.getHTML()
      const topic = docTitle.trim() || 'AI 编辑器导出'
      if (format === 'pdf') {
        if (import.meta.env.DEV) {
          console.log('导出HTML内容(editor.getHTML):', html)
        }
        await exportEditorToPdf(html, topic)
      } else {
        await exportEditorToWord(html, topic)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const label = format === 'pdf' ? 'PDF' : 'Word'
      window.alert(`导出 ${label} 失败：${message}`)
    } finally {
      setExporting(false)
      setExportingFormat(null)
    }
  }

  useEffect(() => {
    if (!exportMenuOpen) return
    const onPointerDown = (e) => {
      if (exportMenuRef.current?.contains(e.target)) return
      setExportMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exportMenuOpen])

  const handleExportBookConfirm = async (format) => {
    const sorted = sortDocsByCreatedAt(docs)
    const docIds = sorted.map((doc) => doc.id)
    if (!docIds.length) {
      window.alert('暂无文档可导出')
      return
    }

    setExportBookLoading(true)
    setExportBookFormat(format)
    try {
      await exportBulkBook(docIds, format)
      setExportBookOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`全书导出失败：${message}`)
    } finally {
      setExportBookLoading(false)
      setExportBookFormat(null)
    }
  }

  const handleStopOutline = useCallback(() => {
    outlineAbortRef.current?.abort()
    outlineAbortRef.current = null
    setOutlineStreaming(false)
  }, [])

  const handleCloseOutline = useCallback(() => {
    outlineAbortRef.current?.abort()
    outlineAbortRef.current = null
    setOutlineOpen(false)
    setOutlineStreaming(false)
  }, [])

  const runImageGeneration = useCallback(async (text, scope) => {
    const trimmed = text.trim()
    if (!trimmed) {
      window.alert(
        scope === 'full_page'
          ? '当前文档为空，请先写入内容再生成配图'
          : '请先选中要配图的文字',
      )
      return
    }

    imageRequestRef.current = { text: trimmed, scope }
    setImageScope(scope)
    setIsImageDrawerOpen(true)
    setGeneratedImageUrl(null)
    setImageError(null)
    setImageGenerating(true)

    try {
      const result = await generateImage(trimmed, scope)
      setGeneratedImageUrl(result.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setImageError(message)
    } finally {
      setImageGenerating(false)
    }
  }, [])

  const handleGenerateImageFullPage = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) {
      window.alert('编辑器尚未就绪')
      return
    }
    const plain = ed.getText().trim()
    await runImageGeneration(plain, 'full_page')
  }, [runImageGeneration])

  /** 划词配图：生图后直接插入选区下方（不打开抽屉）。 */
  const handleSelectionImageInline = useCallback(
    async ({ from, to, text }) => {
      const ed = editorRef.current
      if (!ed) {
        throw new Error('编辑器尚未就绪')
      }

      setImageGenerating(true)
      setImageError(null)
      try {
        const result = await generateImage(text, 'selection')
        insertImageBelowSelection(ed, to, result.url)
        imageRequestRef.current = { text, scope: 'selection' }
        scheduleSave()
      } finally {
        setImageGenerating(false)
        ed.commands.focus()
      }
    },
    [scheduleSave],
  )

  const handleRegenerateImage = useCallback(async () => {
    const { text, scope } = imageRequestRef.current
    if (!text) return
    await runImageGeneration(text, scope)
  }, [runImageGeneration])

  const handleInsertGeneratedImage = useCallback(() => {
    const ed = editorRef.current
    if (!ed || !generatedImageUrl) return
    ed.chain().focus().setImage({ src: generatedImageUrl, align: 'center', width: '100%' }).run()
    scheduleSave()
  }, [generatedImageUrl, scheduleSave])

  const handleCloseImageDrawer = useCallback(() => {
    setIsImageDrawerOpen(false)
    setImageGenerating(false)
  }, [])

  const handleGenerateOutline = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) {
      window.alert('编辑器尚未就绪')
      return
    }
    const html = ed.getHTML()
    const plain = ed.getText().trim()
    if (!plain) {
      window.alert('当前文档为空，请先写入内容再生成大纲')
      return
    }

    outlineAbortRef.current?.abort()
    const controller = new AbortController()
    outlineAbortRef.current = controller

    setOutlineOpen(true)
    setOutlineContent('')
    setOutlineError(null)
    setOutlineStreaming(true)

    try {
      await streamDocOutline(html, docTitleRef.current, {
        signal: controller.signal,
        onChunk: (text) => {
          flushSync(() => {
            setOutlineContent((prev) => prev + text)
          })
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : String(err)
      setOutlineError(message)
    } finally {
      if (outlineAbortRef.current === controller) {
        outlineAbortRef.current = null
      }
      setOutlineStreaming(false)
    }
  }, [])

  const handleCopyOutline = useCallback(async () => {
    if (!outlineContent.trim()) return
    try {
      await navigator.clipboard.writeText(outlineContent)
    } catch {
      window.alert('复制失败，请手动选中复制')
    }
  }, [outlineContent])

  const handleDownloadOutline = useCallback(() => {
    if (!outlineContent.trim()) return
    const stem = (docTitleRef.current || '大纲').trim() || '大纲'
    const blob = new Blob([outlineContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stem}_PPT脑图大纲.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [outlineContent])

  useEffect(() => {
    const openAiPrompt = () => setAiPromptOpen(true)
    const onStreamStart = () => setAiStreaming(true)
    const onStreamEnd = () => setAiStreaming(false)

    window.addEventListener('slash-ai-prompt', openAiPrompt)
    window.addEventListener('ai-stream-start', onStreamStart)
    window.addEventListener('ai-stream-end', onStreamEnd)

    return () => {
      window.removeEventListener('slash-ai-prompt', openAiPrompt)
      window.removeEventListener('ai-stream-start', onStreamStart)
      window.removeEventListener('ai-stream-end', onStreamEnd)
    }
  }, [])

  const isPaperEmpty = Boolean(editor && !editor.getText().trim())

  const saveHint =
    saveStatus === 'syncing'
      ? '同步中…'
      : saveStatus === 'saved'
        ? '已自动保存'
        : ''

  return (
    <>
      <style>{`
        body {
          margin: 0;
          min-height: 100vh;
          background: #0f1419;
          color: #c9d1d9;
        }
        #root {
          min-height: 100vh;
        }
        .app-layout {
          display: flex;
          min-height: 100vh;
          color-scheme: dark;
          color: #c9d1d9;
        }
        .doc-sidebar {
          flex: 0 0 260px;
          width: 260px;
          display: flex;
          flex-direction: column;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 4px 0 32px rgba(0, 0, 0, 0.28);
          z-index: 20;
        }
        .doc-sidebar-header {
          padding: 1rem 0.85rem 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .doc-sidebar-brand {
          margin: 0 0 0.75rem;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #8b949e;
        }
        .new-doc-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          width: 100%;
          padding: 0.55rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          color: #f0f6fc;
          font: inherit;
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .new-doc-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.14);
          transform: scale(1.02);
        }
        .new-doc-btn:active {
          transform: scale(0.98);
        }
        .import-doc-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          width: 100%;
          margin-top: 0.45rem;
          padding: 0.55rem 0.75rem;
          border: 1px dashed rgba(88, 166, 255, 0.45);
          border-radius: 8px;
          background: rgba(88, 166, 255, 0.08);
          color: #79c0ff;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            opacity 0.15s ease;
        }
        .import-doc-btn:hover:not(:disabled) {
          background: rgba(88, 166, 255, 0.16);
          border-color: rgba(125, 211, 252, 0.65);
          color: #a5d6ff;
        }
        .import-doc-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .export-all-sidebar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          width: 100%;
          margin-top: 0.45rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid rgba(163, 113, 247, 0.35);
          border-radius: 8px;
          background: rgba(137, 87, 229, 0.15);
          color: #d2a8ff;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .export-all-sidebar-btn:hover:not(:disabled) {
          background: rgba(137, 87, 229, 0.28);
          border-color: #a371f7;
          transform: scale(1.02);
        }
        .export-all-sidebar-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .doc-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0.45rem 1rem;
        }
        .doc-list-empty {
          padding: 1rem 0.65rem;
          font-size: 0.82rem;
          color: #8b949e;
        }
        .doc-list-item {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          width: 100%;
          margin-bottom: 0.35rem;
          padding: 0.6rem 0.65rem 0.6rem 0.55rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.02);
          color: #c9d1d9;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .doc-list-chapter {
          flex-shrink: 0;
          min-width: 2.1rem;
          margin-top: 0.1rem;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(148, 163, 184, 0.75);
        }
        .doc-list-item.is-active .doc-list-chapter {
          color: #79c0ff;
        }
        .doc-list-item:hover {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.09) 0%,
            rgba(255, 255, 255, 0.03) 100%
          );
          border-color: rgba(255, 255, 255, 0.06);
          transform: translateX(3px);
          padding-left: 0.72rem;
        }
        .doc-list-item.is-active {
          background: linear-gradient(
            90deg,
            rgba(88, 166, 255, 0.18) 0%,
            rgba(88, 166, 255, 0.06) 100%
          );
          border-color: rgba(88, 166, 255, 0.35);
        }
        .doc-list-item-body {
          flex: 1;
          min-width: 0;
        }
        .doc-list-item-title {
          display: block;
          font-size: 0.88rem;
          font-weight: 500;
          color: #f0f6fc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .doc-list-item-time {
          display: block;
          margin-top: 0.15rem;
          font-size: 0.72rem;
          color: #8b949e;
        }
        .doc-delete-btn {
          flex-shrink: 0;
          width: 1.5rem;
          height: 1.5rem;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          font-size: 0.75rem;
          line-height: 1;
          opacity: 0;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .doc-list-item:hover .doc-delete-btn {
          opacity: 0.85;
        }
        .doc-delete-btn:hover {
          background: rgba(248, 81, 73, 0.18);
          transform: scale(1.02);
        }
        .doc-delete-btn:active {
          transform: scale(0.96);
        }
        .editor-main {
          flex: 1;
          min-width: 0;
          position: relative;
          z-index: 1;
          isolation: isolate;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(88, 120, 180, 0.12) 0%, transparent 55%),
            linear-gradient(165deg, #1a2332 0%, #0f1419 48%, #0d1117 100%);
        }
        .editor-shell {
          width: 100%;
          max-width: none;
          margin: 0 auto;
          padding: 2rem 0 4rem;
          text-align: left;
        }
        .paper-stage {
          position: relative;
          width: 100%;
          max-width: 820px;
          margin: 0 auto;
          padding: 0 0.5rem;
        }
        .capsule-toolbar {
          position: sticky;
          top: 1rem;
          z-index: 15;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          margin: 0 auto 1.1rem;
          padding: 0.4rem 0.5rem 0.4rem 0.85rem;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: #23262e;
          box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .capsule-title-input {
          flex: 1;
          min-width: 7rem;
          margin: 0;
          padding: 0.35rem 0.55rem;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #f0f6fc;
          font: inherit;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .capsule-title-input::placeholder {
          color: #6e7681;
        }
        .capsule-title-input:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .capsule-title-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.07);
          box-shadow: inset 0 0 0 1px rgba(88, 166, 255, 0.35);
        }
        .capsule-toolbar-meta {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .capsule-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .ai-streaming-badge {
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #58a6ff;
          background: rgba(88, 166, 255, 0.12);
          border: 1px solid rgba(88, 166, 255, 0.35);
          animation: ai-pulse 1.2s ease-in-out infinite;
        }
        @keyframes ai-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .editor-canvas-wrap {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: center;
          padding: 1.25rem 1.5rem 3rem;
          overflow-x: auto;
          overflow-y: visible;
          color-scheme: only light;
          isolation: isolate;
          filter: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .paper-stack {
          position: relative;
          width: 100%;
          border-radius: 6px;
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.04),
            0 24px 48px rgba(0, 0, 0, 0.28),
            0 48px 96px rgba(0, 0, 0, 0.18);
        }
        .paper-stack::before,
        .paper-stack::after {
          content: '';
          position: absolute;
          left: 6px;
          right: 6px;
          height: calc(100% - 8px);
          top: 6px;
          border-radius: 4px;
          background: #f4f4f5;
          z-index: 0;
          pointer-events: none;
        }
        .editor-paper-surface {
          position: relative;
          z-index: 2;
          width: 100%;
          color-scheme: only light;
          color: #1a1a1a;
          isolation: isolate;
        }
        .editor-paper-surface .ProseMirror,
        .editor-paper-surface .ProseMirror *:not(code):not(pre *):not(span[style*="color"]):not(span[style*="font-size"]) {
          color: #1a1a1a !important;
          -webkit-text-fill-color: currentColor !important;
          opacity: 1 !important;
        }
        .editor-paper-surface .ProseMirror span[style*="color"] {
          -webkit-text-fill-color: currentColor !important;
        }
        .editor-paper-surface .ProseMirror span[style*="font-size"] {
          line-height: 1.45;
        }
        .editor-paper-surface .ProseMirror code {
          color: #c7254e !important;
        }
        .editor-paper-surface .ProseMirror pre,
        .editor-paper-surface .ProseMirror pre * {
          color: #1a1a1a !important;
        }
        .paper-stack::before {
          transform: translateY(5px) rotate(-0.35deg);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          opacity: 1;
        }
        .paper-stack::after {
          transform: translateY(10px) rotate(0.25deg);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
          opacity: 0.92;
        }
        .autosave-badge {
          position: absolute;
          right: 14px;
          bottom: 14px;
          z-index: 2;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.68rem;
          font-weight: 500;
          color: #6e7681;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .autosave-badge.is-syncing {
          color: #0969da;
        }
        .autosave-badge.is-saved {
          color: #1a7f37;
        }
        .editor-canvas-wrap .tiptap,
        .editor-canvas-wrap .ProseMirror {
          position: relative;
          z-index: 3;
          opacity: 1;
          box-sizing: border-box;
          width: 100%;
          min-height: 297mm;
          margin: 0 auto;
          padding: 25mm 20mm;
          text-align: left;
          outline: none;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 4px;
          background: #ffffff;
          color-scheme: light;
          color: #1a1a1a;
          font-family: 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif;
          font-size: 11pt;
          line-height: 1.55;
          box-shadow:
            0 1px 1px rgba(0, 0, 0, 0.1),
            0 2px 2px rgba(0, 0, 0, 0.1),
            0 4px 4px rgba(0, 0, 0, 0.1),
            0 8px 8px rgba(0, 0, 0, 0.1),
            0 16px 32px rgba(0, 0, 0, 0.12);
          transition: box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .editor-canvas-wrap .tiptap:focus,
        .editor-canvas-wrap .ProseMirror:focus {
          border-color: rgba(88, 166, 255, 0.2);
          box-shadow:
            0 1px 1px rgba(0, 0, 0, 0.1),
            0 2px 2px rgba(0, 0, 0, 0.1),
            0 4px 4px rgba(0, 0, 0, 0.1),
            0 8px 8px rgba(0, 0, 0, 0.1),
            0 12px 24px rgba(0, 0, 0, 0.14),
            0 24px 48px rgba(88, 166, 255, 0.08);
        }
        .editor-canvas-wrap .tiptap > * + * {
          margin-top: 0.75em;
        }
        .editor-canvas-wrap .tiptap p,
        .editor-canvas-wrap .tiptap h1,
        .editor-canvas-wrap .tiptap h2,
        .editor-canvas-wrap .tiptap h3,
        .editor-canvas-wrap .tiptap li,
        .editor-canvas-wrap .tiptap blockquote,
        .editor-canvas-wrap .tiptap pre {
          text-align: left;
        }
        .editor-canvas-wrap .tiptap p {
          margin: 0 0 0.5em;
          color: #1a1a1a;
        }
        .editor-canvas-wrap .tiptap :is(div, td, th) {
          color: #1a1a1a;
        }
        .editor-canvas-wrap .tiptap span:not([style*="color"]) {
          color: inherit;
        }
        .editor-canvas-wrap .tiptap h1 {
          margin: 0 0 0.45em;
          font-size: 1.75rem;
          font-weight: 700;
          line-height: 1.25;
          color: #1a1a1a;
        }
        .editor-canvas-wrap .tiptap h2 {
          margin: 0.85em 0 0.4em;
          font-size: 1.35rem;
          font-weight: 600;
          line-height: 1.3;
          color: #262626;
        }
        .editor-canvas-wrap .tiptap h3 {
          margin: 0.75em 0 0.35em;
          font-size: 1.1rem;
          font-weight: 600;
          color: #333333;
        }
        .editor-canvas-wrap .tiptap blockquote {
          margin: 0.85em 0;
          padding: 0.65em 1em;
          border-left: 4px solid #9ca3af;
          background: #f5f5f5;
          color: #555555;
          font-style: italic;
        }
        .editor-canvas-wrap .tiptap blockquote p {
          margin: 0.25em 0;
          color: #555555;
        }
        .editor-canvas-wrap .tiptap ul,
        .editor-canvas-wrap .tiptap ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
          list-style-position: outside;
        }
        .editor-canvas-wrap .tiptap ul {
          list-style-type: disc;
        }
        .editor-canvas-wrap .tiptap ol {
          list-style-type: decimal;
        }
        .editor-canvas-wrap .tiptap li {
          margin: 0.25em 0;
          line-height: 1.55;
          color: #333333;
        }
        .editor-canvas-wrap .tiptap li p {
          margin: 0;
        }
        .editor-canvas-wrap .tiptap hr.page-break,
        .editor-canvas-wrap .tiptap hr[data-page-break] {
          page-break-after: always;
          break-after: page;
          border: none;
          border-top: 2px dashed #cccccc;
          margin: 24px 0;
          height: 0;
          background: transparent;
        }
        .editor-canvas-wrap .tiptap hr.page-break::after {
          content: '— 分页 —';
          display: block;
          font-size: 0.72rem;
          color: #9ca3af;
          text-align: center;
          margin-top: 8px;
          letter-spacing: 0.08em;
        }
        .editor-canvas-wrap .tiptap pre {
          margin: 0.85em 0;
          padding: 0.85em 1em;
          border-radius: 6px;
          background: #f6f8fa;
          border: 1px solid #e1e4e8;
          overflow-x: auto;
          font-family: Consolas, 'Cascadia Code', monospace;
          font-size: 0.9em;
          line-height: 1.5;
          color: #333333;
        }
        .editor-canvas-wrap .tiptap pre code {
          display: block;
          padding: 0;
          background: transparent;
          border: none;
          color: inherit;
        }
        .editor-canvas-wrap .tiptap :not(pre) > code {
          padding: 0.12em 0.35em;
          border-radius: 4px;
          background: #f0f0f0;
          border: 1px solid #e8e8e8;
          font-family: Consolas, monospace;
          font-size: 0.9em;
          color: #c7254e;
        }
        .editor-canvas-wrap .tiptap strong {
          font-weight: 700;
          color: #1a1a1a;
        }
        .editor-canvas-wrap .ProseMirror img.editor-image-node {
          display: block;
          max-width: 100%;
          height: auto !important;
          margin: 1em 0;
          border-radius: 6px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
          opacity: 1 !important;
          filter: none !important;
          transition: width 0.3s ease, margin 0.25s ease, box-shadow 0.2s ease;
        }
        .editor-canvas-wrap .ProseMirror img.editor-image-node[data-align='left'] {
          margin-left: 0;
          margin-right: auto;
        }
        .editor-canvas-wrap .ProseMirror img.editor-image-node[data-align='center'] {
          margin-left: auto;
          margin-right: auto;
        }
        .editor-canvas-wrap .ProseMirror img.editor-image-node[data-align='right'] {
          margin-left: auto;
          margin-right: 0;
        }
        .editor-canvas-wrap .ProseMirror img.editor-image-node.ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
          outline-offset: 3px;
          box-shadow: 0 2px 16px rgba(59, 130, 246, 0.25);
        }
        .image-bubble-toolbar {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0.45rem 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          background: #23262e;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
          z-index: 1250;
        }
        .image-bubble-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .image-bubble-row--size {
          gap: 0.3rem;
        }
        .image-bubble-label {
          font-size: 0.68rem;
          font-weight: 600;
          color: #8b949e;
          margin-right: 0.15rem;
          letter-spacing: 0.04em;
        }
        .image-bubble-divider--row {
          width: 100%;
          height: 1px;
          margin: 0;
        }
        .image-bubble-btn {
          padding: 0.35rem 0.65rem;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #c9d1d9;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .image-bubble-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f0f6fc;
        }
        .image-bubble-btn.is-active {
          background: rgba(59, 130, 246, 0.22);
          color: #93c5fd;
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45);
        }
        .image-bubble-btn--size {
          min-width: 2.1rem;
          padding: 0.35rem 0.55rem;
          font-weight: 600;
        }
        .image-bubble-btn--danger:hover {
          background: rgba(248, 81, 73, 0.2);
          color: #ff7b72;
        }
        .image-bubble-divider {
          width: 1px;
          height: 1.1rem;
          margin: 0 0.15rem;
          background: rgba(255, 255, 255, 0.12);
        }
        .slash-menu-root .slash-menu {
          min-width: 16rem;
          padding: 0.35rem;
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #161b22;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
        }
        .slash-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.55rem 0.65rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #c9d1d9;
          text-align: left;
          cursor: pointer;
        }
        .slash-menu-item.is-selected,
        .slash-menu-item:hover {
          background: #21262d;
        }
        .slash-menu-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border-radius: 6px;
          background: #21262d;
          font-size: 0.85rem;
          font-weight: 700;
          color: #58a6ff;
        }
        .slash-menu-text {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .slash-menu-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: #f0f6fc;
        }
        .slash-menu-desc {
          font-size: 0.75rem;
          color: #8b949e;
        }
        .slash-menu-empty {
          padding: 0.65rem;
          font-size: 0.85rem;
          color: #8b949e;
        }
        .ai-prompt-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(1, 4, 9, 0.72);
        }
        .ai-prompt-panel {
          width: min(28rem, calc(100vw - 2rem));
          padding: 1.25rem;
          border: 1px solid #30363d;
          border-radius: 12px;
          background: #161b22;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
        }
        .ai-prompt-title {
          margin: 0 0 0.35rem;
          font-size: 1.1rem;
          color: #f0f6fc;
        }
        .ai-prompt-hint {
          margin: 0 0 0.85rem;
          font-size: 0.85rem;
          color: #8b949e;
        }
        .ai-prompt-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.75rem;
          border: 1px solid #30363d;
          border-radius: 8px;
          background: #0d1117;
          color: #c9d1d9;
          font: inherit;
          resize: vertical;
        }
        .ai-prompt-input:focus {
          outline: none;
          border-color: #58a6ff;
        }
        .ai-prompt-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.85rem;
        }
        .ai-prompt-btn {
          padding: 0.45rem 0.9rem;
          border-radius: 8px;
          border: 1px solid transparent;
          font: inherit;
          cursor: pointer;
        }
        .ai-prompt-btn.secondary {
          background: transparent;
          border-color: #30363d;
          color: #c9d1d9;
        }
        .ai-prompt-btn.primary {
          background: #238636;
          color: #fff;
        }
        .ai-prompt-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ai-prompt-error {
          margin: 0.5rem 0 0;
          font-size: 0.85rem;
          color: #f85149;
        }
        @keyframes ai-terminal-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.38; }
        }
        @keyframes ai-terminal-glow {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(59, 130, 246, 0.28),
              0 0 18px rgba(59, 130, 246, 0.12),
              inset 0 0 28px rgba(59, 130, 246, 0.04);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(52, 211, 153, 0.35),
              0 0 22px rgba(59, 130, 246, 0.18),
              inset 0 0 32px rgba(52, 211, 153, 0.05);
          }
        }
        .ai-agent-terminal {
          margin-top: 0.75rem;
          max-height: 9.5rem;
          overflow: hidden;
          border-radius: 8px;
          background: #0a0a0a;
          border: 1px solid rgba(59, 130, 246, 0.32);
          font-family: ui-monospace, 'Cascadia Code', 'SF Mono', 'Consolas', monospace;
          font-size: 0.72rem;
          line-height: 1.65;
          color: rgba(203, 213, 225, 0.92);
          animation: ai-terminal-glow 2.8s ease-in-out infinite;
          transition: opacity 0.32s ease;
        }
        .ai-agent-terminal.is-fading {
          opacity: 0;
          pointer-events: none;
          animation: none;
        }
        .ai-agent-terminal-header {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem 0.65rem;
          border-bottom: 1px solid rgba(59, 130, 246, 0.18);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(10, 10, 10, 0.95));
        }
        .ai-agent-terminal-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.55);
        }
        .ai-agent-terminal-dot.is-amber {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
        }
        .ai-agent-terminal-dot.is-green {
          background: #22c55e;
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
        }
        .ai-agent-terminal-title {
          margin-left: 0.35rem;
          font-size: 0.62rem;
          letter-spacing: 0.06em;
          color: rgba(96, 165, 250, 0.85);
          text-transform: uppercase;
        }
        .ai-agent-terminal-body {
          max-height: 7.25rem;
          overflow-y: auto;
          padding: 0.55rem 0.7rem 0.65rem;
        }
        .ai-agent-terminal-line {
          white-space: pre-wrap;
          word-break: break-word;
          margin-bottom: 0.2rem;
        }
        .ai-terminal-tag {
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .ai-terminal-tag.is-running {
          color: #facc15;
          text-shadow: 0 0 10px rgba(250, 204, 21, 0.45);
          animation: ai-terminal-pulse 1.35s ease-in-out infinite;
        }
        .ai-terminal-tag.is-done {
          color: #34d399;
          text-shadow: 0 0 10px rgba(52, 211, 153, 0.4);
        }
        .ai-terminal-tag.is-error {
          color: #f87171;
          text-shadow: 0 0 10px rgba(248, 113, 113, 0.45);
        }
        .ai-terminal-agent {
          color: #60a5fa;
          font-weight: 700;
          text-shadow: 0 0 8px rgba(96, 165, 250, 0.35);
        }
        .ai-terminal-colon,
        .ai-terminal-sep {
          color: rgba(148, 163, 184, 0.7);
        }
        .ai-terminal-body {
          color: rgba(226, 232, 240, 0.88);
        }
        .ai-terminal-cursor {
          display: inline-block;
          margin-top: 0.15rem;
          color: #22d3ee;
          text-shadow: 0 0 12px rgba(34, 211, 238, 0.65);
          animation: ai-terminal-pulse 0.85s step-end infinite;
        }
        .format-bubble-toolbar {
          position: relative;
          z-index: 1200;
          display: flex;
          align-items: stretch;
          gap: 0;
          padding: 0.35rem 0.45rem;
          border: 1px solid rgba(88, 166, 255, 0.22);
          border-radius: 12px;
          background: rgba(13, 17, 23, 0.82);
          backdrop-filter: blur(14px) saturate(1.2);
          -webkit-backdrop-filter: blur(14px) saturate(1.2);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04) inset,
            0 12px 32px rgba(0, 0, 0, 0.55),
            0 0 24px rgba(56, 139, 253, 0.08);
        }
        .format-bubble-section {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.1rem 0.25rem;
        }
        .format-bubble-divider--section {
          width: 1px;
          align-self: stretch;
          margin: 0.15rem 0.35rem;
          background: rgba(88, 166, 255, 0.35);
          flex-shrink: 0;
        }
        .format-bubble-group {
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }
        .format-bubble-divider {
          width: 1px;
          height: 1.25rem;
          background: rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .format-bubble-btn {
          min-width: 1.85rem;
          height: 1.85rem;
          padding: 0 0.45rem;
          border: 1px solid transparent;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: #c9d1d9;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .format-bubble-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.08);
          color: #f0f6fc;
        }
        .format-bubble-btn.is-active {
          background: rgba(56, 139, 253, 0.18);
          border-color: rgba(88, 166, 255, 0.45);
          color: #79c0ff;
        }
        .format-bubble-btn--bold strong {
          font-weight: 800;
        }
        .format-bubble-btn--size {
          min-width: 1.75rem;
          font-size: 0.72rem;
          letter-spacing: 0.02em;
        }
        .format-bubble-divider--ai {
          margin-left: 0.15rem;
          background: rgba(88, 166, 255, 0.25);
        }
        .format-bubble-ai {
          gap: 0.25rem;
        }
        .format-bubble-btn--ai {
          padding: 0 0.55rem;
          min-width: auto;
          height: 1.85rem;
          font-size: 0.74rem;
          font-weight: 500;
          white-space: nowrap;
          border-color: rgba(88, 166, 255, 0.15);
          background: rgba(56, 139, 253, 0.1);
          color: #a5d6ff;
        }
        .format-bubble-btn--ai:hover:not(:disabled) {
          background: rgba(56, 139, 253, 0.22);
          border-color: rgba(88, 166, 255, 0.35);
          color: #e6f4ff;
        }
        .format-bubble-btn--ai:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .format-bubble-btn--image {
          padding: 0 0.5rem;
        }
        .format-bubble-colors {
          gap: 0.35rem;
          padding-left: 0.1rem;
        }
        .format-bubble-swatch {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.35rem;
          height: 1.35rem;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.35);
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .format-bubble-swatch:hover {
          transform: scale(1.08);
          border-color: rgba(255, 255, 255, 0.28);
        }
        .format-bubble-swatch.is-active {
          border-color: rgba(88, 166, 255, 0.75);
          box-shadow: 0 0 0 2px rgba(56, 139, 253, 0.25);
        }
        .format-bubble-swatch-dot {
          width: 0.65rem;
          height: 0.65rem;
          border-radius: 50%;
          background: var(--swatch, #c9d1d9);
          box-shadow: 0 0 6px color-mix(in srgb, var(--swatch, #c9d1d9) 55%, transparent);
        }
        .slash-menu-root {
          z-index: 9999 !important;
        }
        .capsule-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.38rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          color: #e6edf3;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .capsule-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.16);
          transform: scale(1.02);
        }
        .capsule-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .capsule-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .capsule-btn--light {
          background: rgba(255, 255, 255, 0.92);
          border-color: rgba(255, 255, 255, 0.4);
          color: #1f2328;
        }
        .capsule-btn--light:hover:not(:disabled) {
          background: #ffffff;
          box-shadow: 0 2px 12px rgba(255, 255, 255, 0.2);
        }
        .capsule-btn--accent {
          background: rgba(137, 87, 229, 0.22);
          border-color: rgba(163, 113, 247, 0.45);
          color: #e2c9ff;
        }
        .capsule-btn--accent:hover:not(:disabled) {
          background: rgba(137, 87, 229, 0.36);
          border-color: rgba(163, 113, 247, 0.65);
        }
        .capsule-btn--outline {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.4);
          color: #7dd3fc;
        }
        .capsule-btn--outline:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.28);
          border-color: rgba(125, 211, 252, 0.55);
        }
        .capsule-btn--wide {
          padding-left: 0.7rem;
          padding-right: 0.7rem;
          font-size: 0.74rem;
        }
        .export-dropdown-wrap {
          position: relative;
          display: inline-flex;
        }
        .export-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 200;
          min-width: 220px;
          padding: 6px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(22, 27, 34, 0.98);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          animation: export-menu-in 0.18s ease;
        }
        @keyframes export-menu-in {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .export-dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          width: 100%;
          padding: 0.55rem 0.75rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #e6edf3;
          font: inherit;
          font-size: 0.8rem;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .export-dropdown-item:hover:not(:disabled) {
          background: rgba(137, 87, 229, 0.22);
        }
        .export-dropdown-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .export-dropdown-item-sub {
          margin-left: auto;
          font-size: 0.7rem;
          color: #8b949e;
        }
        /* —— 右侧抽屉：遮罩不压暗/不模糊左侧 A4 —— */
        .outline-drawer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 900;
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .outline-drawer-backdrop.is-open {
          opacity: 1;
          pointer-events: auto;
        }
        .outline-drawer-backdrop.is-open::after {
          content: '';
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(420px, 92vw);
          background: rgba(0, 0, 0, 0.28);
          pointer-events: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .outline-drawer {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 910;
          display: flex;
          flex-direction: column;
          width: min(420px, 92vw);
          height: 100vh;
          background: #15171e;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: -16px 0 48px rgba(0, 0, 0, 0.5);
          transform: translateX(100%);
          transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
          color: #f0f6fc;
          opacity: 1;
        }
        .outline-drawer.is-open {
          transform: translateX(0);
          pointer-events: auto;
        }
        .outline-drawer-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .outline-drawer-header-text {
          flex: 1;
          min-width: 0;
        }
        .outline-drawer-header-actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
        }
        .outline-drawer-stop {
          padding: 0.35rem 0.65rem;
          border: 1px solid rgba(248, 81, 73, 0.55);
          border-radius: 999px;
          background: rgba(248, 81, 73, 0.18);
          color: #ff7b72 !important;
          font: inherit;
          font-size: 0.72rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .outline-drawer-stop:hover {
          background: rgba(248, 81, 73, 0.32);
        }
        .outline-drawer-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #f0f6fc !important;
        }
        .outline-drawer-subtitle {
          margin: 0.25rem 0 0;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.55) !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 16rem;
        }
        .outline-drawer-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          color: #f0f6fc !important;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .outline-drawer-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .outline-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          color: rgba(255, 255, 255, 0.95) !important;
        }
        .outline-drawer-placeholder {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.55) !important;
        }
        .outline-drawer-error {
          margin: 0;
          font-size: 0.85rem;
          color: #f85149 !important;
          line-height: 1.5;
        }
        .outline-drawer .outline-stream-wrap,
        .outline-drawer .outline-md-article,
        .outline-drawer .outline-md-article p,
        .outline-drawer .outline-md-article li,
        .outline-drawer .outline-md-article span,
        .outline-drawer .outline-md-article blockquote,
        .outline-drawer .outline-md-article blockquote p,
        .outline-drawer .outline-md-article strong,
        .outline-drawer .outline-md-article em,
        .outline-drawer .outline-md-article a,
        .outline-drawer .outline-md-article code,
        .outline-drawer .outline-md-article pre,
        .outline-drawer .outline-md-article pre code,
        .outline-drawer .outline-md-tail {
          color: rgba(255, 255, 255, 0.95) !important;
          -webkit-text-fill-color: rgba(255, 255, 255, 0.95) !important;
        }
        .outline-drawer .outline-md-article {
          font-size: 0.86rem;
          line-height: 1.65;
          word-break: break-word;
        }
        .outline-drawer .outline-md-article :is(h1, h2, h3, h4) {
          margin: 12px 0 !important;
          padding: 0 !important;
          border: none !important;
          font-weight: 700 !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          line-height: 1.4 !important;
        }
        .outline-drawer .outline-md-article h1 { font-size: 1.05rem !important; }
        .outline-drawer .outline-md-article h2 { font-size: 1rem !important; }
        .outline-drawer .outline-md-article h3 { font-size: 0.95rem !important; }
        .outline-drawer .outline-md-article p {
          margin: 12px 0 !important;
        }
        .outline-drawer .outline-md-article :is(ul, ol) {
          margin: 12px 0 !important;
          padding-left: 1.5em !important;
          list-style-position: outside !important;
        }
        .outline-drawer .outline-md-article ul {
          list-style-type: disc !important;
        }
        .outline-drawer .outline-md-article ol {
          list-style-type: decimal !important;
        }
        .outline-drawer .outline-md-article li {
          margin: 4px 0 !important;
        }
        .outline-drawer .outline-md-article li::marker {
          color: rgba(255, 255, 255, 0.95) !important;
        }
        .outline-drawer .outline-md-article code,
        .outline-drawer .outline-md-article pre {
          background: rgba(255, 255, 255, 0.06) !important;
          border: none !important;
          border-radius: 4px;
        }
        .outline-drawer .outline-md-article pre {
          margin: 12px 0 !important;
          padding: 0.65em 0.75em !important;
          overflow-x: auto;
        }
        .outline-drawer .outline-md-tail {
          margin: 0;
          padding: 0;
          border: none;
          background: transparent !important;
          font-family: inherit;
          font-size: 0.86rem;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .outline-drawer-footer {
          display: flex;
          gap: 0.5rem;
          padding: 0.85rem 1rem 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .outline-drawer-btn {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: #f0f6fc !important;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
        }
        .outline-drawer-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
        .outline-drawer-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .outline-drawer-btn--primary {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
          color: #f0f6fc !important;
        }
        .outline-drawer-btn--primary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
        /* —— AI 灵感配图抽屉 —— */
        .image-inspiration-drawer {
          z-index: 920;
        }
        .image-drawer-backdrop.is-open {
          z-index: 915;
        }
        .image-drawer-backdrop.is-open::after {
          width: min(420px, 92vw);
        }
        .image-drawer-body {
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
        .image-drawer-stage {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.85rem;
        }
        .image-drawer-skeleton {
          width: 100%;
          aspect-ratio: 1;
          max-height: min(72vw, 340px);
          border-radius: 12px;
          background: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0.04) 8%,
            rgba(255, 255, 255, 0.12) 18%,
            rgba(255, 255, 255, 0.04) 33%
          );
          background-size: 200% 100%;
          animation: image-drawer-shimmer 1.4s ease-in-out infinite;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        @keyframes image-drawer-shimmer {
          to {
            background-position: -200% 0;
          }
        }
        .image-drawer-loading-text {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: #f0f6fc !important;
          text-align: center;
        }
        .image-drawer-loading-hint {
          margin: 0;
          font-size: 0.78rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.5) !important;
          text-align: center;
        }
        .image-drawer-preview {
          display: block;
          width: 100%;
          max-height: min(72vh, 420px);
          object-fit: contain;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
          background: #ffffff;
          opacity: 1 !important;
          filter: none !important;
        }
        .image-drawer-tip {
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.5) !important;
          text-align: center;
        }
        .editor-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 50vh;
          color: #8b949e;
          font-size: 0.95rem;
        }
        .load-error-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: 50vh;
          padding: 1.5rem;
          text-align: center;
        }
        .load-error-panel p {
          margin: 0;
          max-width: 22rem;
          color: #f85149;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .load-error-hint {
          color: #8b949e !important;
          font-size: 0.82rem !important;
        }
        .load-error-retry {
          padding: 0.45rem 0.9rem;
          border: 1px solid #30363d;
          border-radius: 8px;
          background: #21262d;
          color: #f0f6fc;
          font: inherit;
          cursor: pointer;
        }
        .load-error-retry:hover {
          background: #30363d;
        }
        .paper-empty-import {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.85rem;
          padding: 2rem;
          text-align: center;
          pointer-events: none;
        }
        .paper-empty-import-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #57606a;
        }
        .paper-empty-import-hint {
          margin: 0;
          max-width: 18rem;
          font-size: 0.82rem;
          line-height: 1.55;
          color: #8b949e;
        }
        .paper-empty-import-btn {
          pointer-events: auto;
          padding: 0.5rem 1.1rem;
          border: 1px dashed rgba(88, 166, 255, 0.5);
          border-radius: 999px;
          background: rgba(88, 166, 255, 0.1);
          color: #0969da;
          font: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .paper-empty-import-btn:hover:not(:disabled) {
          background: rgba(88, 166, 255, 0.18);
          border-color: rgba(9, 105, 218, 0.55);
        }
        .paper-empty-import-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .doc-import-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(13, 17, 23, 0.55);
          pointer-events: auto;
        }
        .export-book-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: rgba(1, 4, 9, 0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .export-book-panel {
          width: min(32rem, calc(100vw - 2rem));
          padding: 1.35rem 1.4rem 1.25rem;
          border: 1px solid rgba(88, 166, 255, 0.22);
          border-radius: 14px;
          background: rgba(13, 17, 23, 0.94);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04) inset,
            0 24px 64px rgba(0, 0, 0, 0.55);
        }
        .export-book-title {
          margin: 0 0 0.5rem;
          font-size: 1.15rem;
          font-weight: 700;
          color: #f0f6fc;
        }
        .export-book-preview {
          margin: 0 0 0.35rem;
          font-size: 0.92rem;
          color: #c9d1d9;
        }
        .export-book-preview strong {
          color: #79c0ff;
          font-weight: 700;
        }
        .export-book-hint {
          margin: 0 0 1rem;
          font-size: 0.78rem;
          color: #8b949e;
        }
        .export-book-format-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem;
          margin-bottom: 1.1rem;
        }
        .export-book-format-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
          padding: 0.85rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.03);
          color: #c9d1d9;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .export-book-format-card:hover:not(:disabled) {
          border-color: rgba(88, 166, 255, 0.35);
          background: rgba(88, 166, 255, 0.08);
        }
        .export-book-format-card.is-selected {
          border-color: rgba(88, 166, 255, 0.55);
          background: rgba(56, 139, 253, 0.14);
          box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.2) inset;
        }
        .export-book-format-card:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .export-book-format-icon {
          font-size: 1.25rem;
        }
        .export-book-format-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #f0f6fc;
        }
        .export-book-format-sub {
          font-size: 0.72rem;
          color: #8b949e;
        }
        .export-book-format-desc {
          margin-top: 0.15rem;
          font-size: 0.72rem;
          line-height: 1.45;
          color: #8b949e;
        }
        .export-book-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .export-book-btn {
          padding: 0.48rem 0.95rem;
          border-radius: 8px;
          border: 1px solid transparent;
          font: inherit;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .export-book-btn.secondary {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.12);
          color: #c9d1d9;
        }
        .export-book-btn.primary {
          background: #238636;
          color: #fff;
        }
        .export-book-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .doc-import-overlay-card {
          padding: 1.25rem 1.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          background: #161b22;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
          color: #f0f6fc;
          font-size: 0.95rem;
          font-weight: 500;
        }
      `}</style>

      <div className="app-layout">
        <aside className="doc-sidebar">
          <div className="doc-sidebar-header">
            <p className="doc-sidebar-brand">我的文档</p>
            <button type="button" className="new-doc-btn" onClick={() => void handleNewDoc()}>
              ➕ 新建文档
            </button>
            <button
              type="button"
              className="import-doc-btn"
              disabled={docImporting || booting}
              onClick={handleImportDocClick}
            >
              {docImporting ? '📝 正在深度解析文档结构...' : '📥 导入文档 (Word/PDF)'}
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
              hidden
              aria-hidden="true"
              onChange={(e) => void handleImportDocFile(e)}
            />
            <button
              type="button"
              className="export-all-sidebar-btn"
              disabled={exportBookLoading || booting || docs.length === 0}
              onClick={() => setExportBookOpen(true)}
            >
              {exportBookLoading ? '导出中…' : '📥 导出全书'}
            </button>
          </div>
          <nav className="doc-list" aria-label="文档列表">
            {booting ? (
              <p className="doc-list-empty">加载中…</p>
            ) : loadError ? (
              <p className="doc-list-empty">连接失败</p>
            ) : docs.length === 0 ? (
              <p className="doc-list-empty">暂无文档</p>
            ) : (
              docs.map((doc, index) => (
                <div
                  key={doc.id}
                  className={`doc-list-item${doc.id === activeDocId ? ' is-active' : ''}`}
                  onClick={() => handleSelectDoc(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectDoc(doc.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="doc-list-chapter">{String(index + 1).padStart(2, '0')}</span>
                  <span className="doc-list-item-body">
                    <span className="doc-list-item-title">{doc.title || '未命名文档'}</span>
                    <span className="doc-list-item-time">{formatDocTime(doc.updated_at)}</span>
                  </span>
                  <button
                    type="button"
                    className="doc-delete-btn"
                    title="删除"
                    aria-label="删除文档"
                    onClick={(e) => void handleDeleteDoc(e, doc.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </nav>
        </aside>

        <main className="editor-main">
          {booting ? (
            <p className="editor-loading">正在打开文档…</p>
          ) : loadError ? (
            <div className="load-error-panel">
              <p>无法连接文档服务：{loadError}</p>
              <p className="load-error-hint">
                请检查网络连接，或稍后重试。本地开发可在 ai-editor/.env 中设置 VITE_API_BASE_URL
              </p>
              <button type="button" className="load-error-retry" onClick={retryBootstrap}>
                重试
              </button>
            </div>
          ) : (
            <div className="editor-shell">
              <div className="editor-canvas-wrap">
                <div className="paper-stage">
                  <div className="capsule-toolbar" role="toolbar" aria-label="文档工具栏">
                    <input
                      type="text"
                      className="capsule-title-input"
                      value={docTitle}
                      onChange={handleTitleChange}
                      placeholder="未命名文档"
                      aria-label="文档标题"
                      spellCheck={false}
                    />
                    <div className="capsule-toolbar-meta">
                      {aiStreaming ? (
                        <span className="ai-streaming-badge">AI 写入中</span>
                      ) : null}
                      <div className="capsule-toolbar-actions">
                        <div className="export-dropdown-wrap" ref={exportMenuRef}>
                          <button
                            type="button"
                            className="capsule-btn capsule-btn--light"
                            disabled={exporting || exportBookLoading || !editor}
                            aria-expanded={exportMenuOpen}
                            aria-haspopup="menu"
                            onClick={() => setExportMenuOpen((open) => !open)}
                          >
                            {exporting
                              ? exportingFormat === 'pdf'
                                ? 'PDF 导出中…'
                                : exportingFormat === 'word'
                                  ? 'Word 导出中…'
                                  : '导出中…'
                              : '📤 导出'}
                          </button>
                          {exportMenuOpen ? (
                            <div
                              className="export-dropdown-menu"
                              role="menu"
                              aria-label="导出格式"
                            >
                              <button
                                type="button"
                                className="export-dropdown-item"
                                role="menuitem"
                                disabled={exporting || !editor}
                                onClick={() => void handleExport('word')}
                              >
                                <span>📄</span>
                                <span>导出为 Word 文档</span>
                                <span className="export-dropdown-item-sub">.docx</span>
                              </button>
                              <button
                                type="button"
                                className="export-dropdown-item"
                                role="menuitem"
                                disabled={exporting || !editor}
                                onClick={() => void handleExport('pdf')}
                              >
                                <span>📕</span>
                                <span>导出为 PDF 电子书</span>
                                <span className="export-dropdown-item-sub">.pdf</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="capsule-btn capsule-btn--outline capsule-btn--wide"
                          disabled={exportBookLoading || !editor || booting}
                          onClick={() => setExportBookOpen(true)}
                        >
                          {exportBookLoading ? '导出中…' : '📥 导出全书'}
                        </button>
                        <button
                          type="button"
                          className="capsule-btn capsule-btn--outline capsule-btn--wide"
                          disabled={imageGenerating || !editor || booting}
                          onClick={() => void handleGenerateImageFullPage()}
                        >
                          {imageGenerating ? '🎨 正在构思作画...' : '🖼️ 根据全文配图'}
                        </button>
                        <button
                          type="button"
                          className="capsule-btn capsule-btn--outline"
                          disabled={outlineStreaming || !editor || booting}
                          onClick={() => void handleGenerateOutline()}
                        >
                          {outlineStreaming ? '提炼中…' : '✨ 生成 PPT/脑图'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="paper-stack editor-paper-surface">
                    {isPaperEmpty && !docImporting ? (
                      <div className="paper-empty-import" aria-hidden="false">
                        <p className="paper-empty-import-title">白纸已就绪</p>
                        <p className="paper-empty-import-hint">
                          开始输入，或导入外部 Word / PDF，将自动解析并填入本页。
                        </p>
                        <button
                          type="button"
                          className="paper-empty-import-btn"
                          disabled={docImporting || booting}
                          onClick={handleImportDocClick}
                        >
                          📥 导入文档 (Word/PDF)
                        </button>
                      </div>
                    ) : null}
                    {saveHint ? (
                      <span
                        className={`autosave-badge${saveStatus === 'syncing' ? ' is-syncing' : ''}${saveStatus === 'saved' ? ' is-saved' : ''}`}
                      >
                        {saveHint}
                      </span>
                    ) : null}
                    <EditorContent editor={editor} spellCheck={false} />
                  </div>
                </div>
              </div>
              <FormatBubbleMenu
                editor={editor}
                aiStreaming={aiStreaming}
                imageGenerating={imageGenerating}
                onSelectionImage={handleSelectionImageInline}
              />
              <ImageBubbleMenu editor={editor} aiStreaming={aiStreaming} />
            </div>
          )}
        </main>
      </div>

      <ExportBookModal
        open={exportBookOpen}
        chapterCount={docs.length}
        loading={exportBookLoading}
        loadingFormat={exportBookFormat}
        onClose={() => setExportBookOpen(false)}
        onConfirm={handleExportBookConfirm}
      />

      <AiPromptPanel
        open={aiPromptOpen}
        editor={editor}
        onClose={() => setAiPromptOpen(false)}
        onComplete={scheduleSave}
      />

      <OutlineDrawer
        open={outlineOpen}
        streaming={outlineStreaming}
        content={outlineContent}
        error={outlineError}
        title={docTitle}
        onClose={handleCloseOutline}
        onStop={handleStopOutline}
        onCopy={() => void handleCopyOutline()}
        onDownload={handleDownloadOutline}
      />

      {docImporting ? (
        <div className="doc-import-overlay" role="status" aria-live="polite">
          <div className="doc-import-overlay-card">📝 正在深度解析文档结构...</div>
        </div>
      ) : null}

      <ImageDrawer
        open={isImageDrawerOpen}
        loading={imageGenerating}
        imageUrl={generatedImageUrl}
        error={imageError}
        scope={imageScope}
        title={docTitle}
        onClose={handleCloseImageDrawer}
        onRegenerate={() => void handleRegenerateImage()}
        onInsert={handleInsertGeneratedImage}
      />
    </>
  )
}
