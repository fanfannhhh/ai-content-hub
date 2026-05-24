import { useCallback, useEffect, useRef, useState } from 'react'

import { streamSlashAiWrite } from '../lib/api.js'
import { insertPlainText } from '../lib/editorText.js'

const CONTEXT_MAX = 1000

const LOG_LINE_RE = /^(\[[^\]]+\])\s*(Agent-\d+):\s*(.*)$/
const LOG_LINE_SYSTEM_RE = /^(\[[^\]]+\])\s*(.+)$/

/**
 * @param {import('@tiptap/react').Editor | null} editor
 * @param {number} [maxLen]
 */
function getContextBeforeCursor(editor, maxLen = CONTEXT_MAX) {
  const { from } = editor.state.selection
  const start = Math.max(0, from - maxLen)
  return editor.state.doc.textBetween(start, from, '\n')
}

/**
 * @param {string} tag
 */
function tagClassName(tag) {
  if (/执行中|初始中|启动中/.test(tag)) {
    return 'ai-terminal-tag is-running'
  }
  if (/完\s*成/.test(tag)) {
    return 'ai-terminal-tag is-done'
  }
  if (/错|ERR/i.test(tag)) {
    return 'ai-terminal-tag is-error'
  }
  return 'ai-terminal-tag'
}

/**
 * @param {string} line
 */
function AgentLogLine({ line }) {
  const agentMatch = line.match(LOG_LINE_RE)
  if (agentMatch) {
    const [, tag, agent, body] = agentMatch
    return (
      <div className="ai-agent-terminal-line">
        <span className={tagClassName(tag)}>{tag}</span>
        <span className="ai-terminal-sep"> </span>
        <span className="ai-terminal-agent">{agent}</span>
        <span className="ai-terminal-colon">: </span>
        <span className="ai-terminal-body">{body}</span>
      </div>
    )
  }

  const systemMatch = line.match(LOG_LINE_SYSTEM_RE)
  if (systemMatch) {
    const [, tag, body] = systemMatch
    return (
      <div className="ai-agent-terminal-line">
        <span className={tagClassName(tag)}>{tag}</span>
        <span className="ai-terminal-sep"> </span>
        <span className="ai-terminal-body">{body}</span>
      </div>
    )
  }

  return <div className="ai-agent-terminal-line">{line}</div>
}

/**
 * AI 帮我写 — 斜杠命令面板，对接多 Agent SSE 与骇客风思考终端。
 *
 * @param {{
 *   open: boolean,
 *   editor: import('@tiptap/react').Editor | null,
 *   onClose: () => void,
 *   onComplete?: () => void,
 * }} props
 */
export default function AiPromptPanel({ open, editor, onClose, onComplete }) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [agentLogs, setAgentLogs] = useState([])
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [terminalFading, setTerminalFading] = useState(false)

  const abortRef = useRef(null)
  const terminalRef = useRef(null)
  const contentStartedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setError('')
      setAgentLogs([])
      setTerminalVisible(false)
      setTerminalFading(false)
      contentStartedRef.current = false
    }
  }, [open])

  useEffect(() => {
    const el = terminalRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [agentLogs, isGenerating, terminalVisible])

  const hideTerminal = useCallback(() => {
    setTerminalFading(true)
    window.setTimeout(() => {
      setTerminalVisible(false)
      setTerminalFading(false)
    }, 320)
  }, [])

  const handleSlashWrite = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('请先输入写作需求')
      return
    }
    if (!editor) {
      setError('编辑器尚未就绪')
      return
    }
    if (isGenerating) {
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError('')
    setIsGenerating(true)
    setAgentLogs([])
    setTerminalVisible(true)
    setTerminalFading(false)
    contentStartedRef.current = false

    const context = getContextBeforeCursor(editor)
    window.dispatchEvent(new CustomEvent('ai-stream-start'))

    try {
      await streamSlashAiWrite(trimmed, context, {
        signal: controller.signal,
        onStatus(payload) {
          const message = String(payload.message || '').trim()
          if (message) {
            setAgentLogs((prev) => [...prev, message])
          }
        },
        onContent(text) {
          if (!contentStartedRef.current) {
            contentStartedRef.current = true
            hideTerminal()
          }
          insertPlainText(editor, text)
        },
        onDone() {
          onComplete?.()
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setAgentLogs((prev) => [...prev, `[ 错  误 ] 系统: ${message}`])
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setIsGenerating(false)
      setTerminalVisible(false)
      setTerminalFading(false)
      window.dispatchEvent(new CustomEvent('ai-stream-end'))
      editor?.commands.focus()
    }
  }, [prompt, editor, isGenerating, hideTerminal, onComplete])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  if (!open) {
    return null
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSlashWrite()
    }
  }

  const handleClose = () => {
    if (isGenerating) {
      abortRef.current?.abort()
      return
    }
    onClose()
  }

  const showTerminal = isGenerating && terminalVisible

  return (
    <div className="ai-prompt-backdrop" onClick={isGenerating ? undefined : handleClose}>
      <div
        className="ai-prompt-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="ai-prompt-title">✨ AI 帮我写</h3>
        <p className="ai-prompt-hint">
          描述续写需求；将结合光标前 {CONTEXT_MAX} 字上下文，由多 Agent 协作生成。（Enter 提交，Shift+Enter 换行）
        </p>
        <textarea
          className="ai-prompt-input"
          placeholder="例如：续写数据分析的下一小节……"
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          autoFocus
        />

        {showTerminal ? (
          <div
            ref={terminalRef}
            className={`ai-agent-terminal${terminalFading ? ' is-fading' : ''}`}
            role="log"
            aria-live="polite"
            aria-label="Agent 思考终端"
          >
            <div className="ai-agent-terminal-header">
              <span className="ai-agent-terminal-dot" />
              <span className="ai-agent-terminal-dot is-amber" />
              <span className="ai-agent-terminal-dot is-green" />
              <span className="ai-agent-terminal-title">MULTI_AGENT_PIPELINE.exe</span>
            </div>
            <div className="ai-agent-terminal-body">
              {agentLogs.length === 0 ? (
                <AgentLogLine line="[ 启动中 ] 系统: 多 Agent 神经链路握手中…" />
              ) : (
                agentLogs.map((line, index) => (
                  <AgentLogLine key={`${index}-${line}`} line={line} />
                ))
              )}
              <span className="ai-terminal-cursor" aria-hidden="true">
                █
              </span>
            </div>
          </div>
        ) : null}

        {error ? <p className="ai-prompt-error">{error}</p> : null}
        <div className="ai-prompt-actions">
          <button
            type="button"
            className="ai-prompt-btn secondary"
            onClick={handleClose}
            disabled={false}
          >
            {isGenerating ? '停止' : '取消'}
          </button>
          <button
            type="button"
            className="ai-prompt-btn primary"
            onClick={() => void handleSlashWrite()}
            disabled={isGenerating}
          >
            {isGenerating ? '生成中…' : '开始生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
