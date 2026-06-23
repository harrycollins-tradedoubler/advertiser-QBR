import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bot } from 'lucide-react'

import { ChatInput } from '../components/ChatInput'
import { ChatMessage } from '../components/ChatMessage'
import { QbrRequestForm, type QbrRequestPayload } from '../components/QbrRequestForm'
import { TypingIndicator } from '../components/TypingIndicator'
import { downloadQbrReport, fetchQbrStatus, sendMessage } from '../lib/api'
import type { Agent, Message, QbrLogItem } from '../lib/types'

interface ChatPageProps {
  agents: Agent[]
  onQbrLog?: (entry: QbrLogItem) => void
}

export function ChatPage({ agents, onQbrLog }: ChatPageProps) {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const agent = agents.find((a) => a.id === agentId) || null
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isQbrAgent = agent?.id === 'qbr-agent'
  const pollingTimers = useRef<Record<string, number>>({})

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setMessages([])
    setThreadId(null)
  }, [agentId])

  useEffect(() => {
    return () => {
      Object.values(pollingTimers.current).forEach((timer) => window.clearTimeout(timer))
      pollingTimers.current = {}
    }
  }, [])

  const normalizeContent = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value === null || value === undefined) return ''
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  const updateMessageContent = (id: string, content: string) => {
    setMessages((prev) => prev.map((message) => (
      message.id === id ? { ...message, content } : message
    )))
  }

  const emitQbrLog = (
    id: string,
    title: string,
    status: QbrLogItem['status'],
    detail?: string,
    fileName?: string
  ) => {
    onQbrLog?.({
      id,
      title,
      status,
      detail,
      fileName,
      updatedAt: new Date().toISOString(),
    })
  }

  const handleSendMessage = async (content: string) => {
    if (!agentId) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      const result = await sendMessage(agentId, content, threadId || undefined)

      if (result.threadId && !threadId) {
        setThreadId(result.threadId)
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: normalizeContent(result.response),
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I ran into an issue responding just now. Please try again in a moment.',
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const startQbrPolling = (jobId: string, title: string) => {
    const poll = async () => {
      try {
        const status = await fetchQbrStatus(jobId)
        if (status.status === 'completed') {
          updateMessageContent(jobId, status.result || 'QBR report completed.')
          emitQbrLog(jobId, title, 'completed', status.result, status.file_name)
          if (status.download_available) {
            emitQbrLog(jobId, title, 'downloading', 'Downloading report...', status.file_name)
            try {
              const downloaded = await downloadQbrReport(jobId)
              emitQbrLog(jobId, title, 'downloaded', 'Download complete.', downloaded.fileName)
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to download report'
              emitQbrLog(jobId, title, 'error', message, status.file_name)
            }
          }
          return
        }
        if (status.status === 'error') {
          updateMessageContent(jobId, `QBR generation failed: ${status.error || 'Unknown error'}`)
          emitQbrLog(jobId, title, 'error', status.error || 'QBR generation failed')
          return
        }
        emitQbrLog(jobId, title, 'running', 'Generating report...')
      } catch {
        updateMessageContent(jobId, 'Still working on the QBR report. Checking again shortly...')
        emitQbrLog(jobId, title, 'running', 'Still processing...')
      }
      pollingTimers.current[jobId] = window.setTimeout(poll, 5000)
    }
    poll()
  }

  const handleQbrRequest = (payload: QbrRequestPayload) => {
    if (!agentId) return

    const scopeLabel = payload.analysisLevel === 'organization'
      ? 'organisation-level KPI analysis'
      : 'program-level KPI analysis'
    const publisherLabel = payload.publisherProgramMode === 'all_programs_in_organisation'
      ? 'all organisation programs for publisher coverage'
      : `${payload.publisherProgramIds.length} selected program${payload.publisherProgramIds.length === 1 ? '' : 's'} for publisher coverage`
    const displayMessage = `QBR request submitted for ${payload.programName} (${payload.programId}) using ${scopeLabel}; ${publisherLabel}; ${payload.languageCode}; ${payload.currencyCode}; ${payload.startDate} to ${payload.endDate}.`

    const requestTitle = `${payload.programName} (${payload.startDate} to ${payload.endDate})`
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayMessage,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    const message = `QBR_REQUEST ${JSON.stringify(payload)}`
    sendMessage(agentId, message, threadId || undefined)
      .then((result) => {
        if (result.threadId && !threadId) {
          setThreadId(result.threadId)
        }

        if (result.jobId) {
          const assistantMessage: Message = {
            id: result.jobId,
            role: 'assistant',
            content: normalizeContent(result.response || 'Generating QBR report...'),
            createdAt: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMessage])
          emitQbrLog(result.jobId, requestTitle, 'queued', 'Request queued')
          startQbrPolling(result.jobId, requestTitle)
        } else {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: normalizeContent(result.response),
            createdAt: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMessage])
          emitQbrLog(assistantMessage.id, requestTitle, 'completed', normalizeContent(result.response))
        }
      })
      .catch((error) => {
        console.error('Failed to send QBR request:', error)
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'I ran into an issue generating the QBR report. Please try again in a moment.',
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMessage])
        emitQbrLog(errorMessage.id, requestTitle, 'error', 'Failed to submit QBR request')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 text-sm">Agent not found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm text-[#2A73FF] hover:underline"
          >
            Back to Hub
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F9FF] text-[#2A73FF]">
            {agent.icon ? (
              <span className="text-lg">{agent.icon}</span>
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {agent.name}
            </h1>
            <p className="text-xs text-gray-500">
              {agent.description}
            </p>
          </div>
        </div>
      </header>

      {isQbrAgent ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1200px]">
            <QbrRequestForm onSubmit={handleQbrRequest} disabled={loading} />
            <div className="mt-4 rounded-xl border border-gray-200 bg-[#F7F9FF] p-3 text-xs text-gray-600">
              Request progress appears in the left sidebar under <span className="font-semibold text-gray-800">Request Log</span>.
              The PowerPoint downloads automatically once generation completes.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F7F9FF] mb-5">
                  {agent.icon ? (
                    <span className="text-3xl">{agent.icon}</span>
                  ) : (
                    <Bot className="h-8 w-8 text-[#2A73FF]" />
                  )}
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Chat with {agent.name}
                </h2>
                <p className="text-sm text-gray-500 max-w-sm">
                  Type a message below to get started.
                </p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} animate />
                ))}
                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="shrink-0 bg-white border-t border-gray-200 p-3">
            <div className="max-w-[1100px] mx-auto">
              <ChatInput
                onSend={handleSendMessage}
                disabled={loading}
                placeholder="Type your message..."
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
