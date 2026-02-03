import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { Message } from '../lib/types'

interface ChatMessageProps {
  message: Message
  animate?: boolean
}

export function ChatMessage({ message, animate = false }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const safeContent = normalizeContent(message.content)
  const reportText = isUser ? null : extractReport(safeContent)
  const assistantContent = reportText ?? safeContent

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${animate ? 'chat-message-animate' : ''}`}>
      <div className={`max-w-[700px] w-full flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-2.5 rounded-[14px] text-sm shadow-sm ${
            isUser
              ? 'bg-gray-100 text-gray-900'
              : 'bg-[#2A73FF] text-white'
          }`}
        >
          {isUser ? (
            safeContent.split('\n').map((line, i) => {
              if (!line.trim()) return <p key={i} className="mb-1">&nbsp;</p>
              if (line.startsWith('â€¢') || line.startsWith('-')) {
                return <p key={i} className="ml-4">{line}</p>
              }
              return <p key={i} className="mb-1">{line}</p>
            })
          ) : (
            <div className="qbr-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                h1: ({ children }) => <h1 className="text-lg font-semibold mt-2 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-2 leading-6">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-3">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-3">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                table: ({ children }) => <table className="w-full text-xs border-collapse mb-3">{children}</table>,
                thead: ({ children }) => <thead className="bg-white/10">{children}</thead>,
                th: ({ children }) => <th className="border border-white/30 px-2 py-1 text-left font-semibold">{children}</th>,
                td: ({ children }) => <td className="border border-white/20 px-2 py-1 align-top">{children}</td>,
                a: ({ children, href }) => <a className="underline text-white/90" href={href}>{children}</a>,
                code: ({ children }) => <code className="bg-white/10 px-1 py-0.5 rounded">{children}</code>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                hr: () => <hr className="border-white/30 my-4" />,
                }}
              >
                {assistantContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1 px-1">
          {message.createdAt
            ? new Date(message.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </div>
      </div>
    </div>
  )
}

function extractReport(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith("{'") || !trimmed.includes("'report':")) {
    return null
  }

  const reportKey = "'report':"
  const start = trimmed.indexOf(reportKey)
  if (start === -1) return null

  const valueStart = trimmed.indexOf("'", start + reportKey.length)
  if (valueStart === -1) return null

  const endMarkers = [
    "', 'generated_at'",
    "', 'generatedAt'",
    "', 'client'",
    "'}",
  ]

  let end = -1
  for (const marker of endMarkers) {
    const idx = trimmed.indexOf(marker, valueStart + 1)
    if (idx !== -1 && (end === -1 || idx < end)) {
      end = idx
    }
  }

  if (end === -1) return null

  let extracted = trimmed.slice(valueStart + 1, end)
  extracted = extracted
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  return extracted
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content === null || content === undefined) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}
