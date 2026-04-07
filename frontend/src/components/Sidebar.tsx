import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, MessageSquare, Bot, ClipboardList } from 'lucide-react'
import type { Agent, QbrLogItem } from '../lib/types'

interface Thread {
  id: string
  agentId: string
  title: string
  updatedAt: string
}

interface SidebarProps {
  agents: Agent[]
  threads: Thread[]
  qbrLogs?: QbrLogItem[]
  onNewChat: (agentId: string) => void
}

export function Sidebar({ agents, threads, qbrLogs = [], onNewChat }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isQbrPage = location.pathname.startsWith('/chat/qbr-agent')

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#2A73FF]">Agent Hub</h1>
            <p className="text-xs text-gray-500 mt-0.5">Your AI assistants</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Back to hub"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Agents section */}
      <div className="px-3 mb-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Agents
        </h2>
        <nav className="space-y-0.5">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onNewChat(agent.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-100 transition-colors group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F7F9FF] text-[#2A73FF] shrink-0">
                {agent.icon ? (
                  <span className="text-base">{agent.icon}</span>
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {agent.name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {agent.description}
                </p>
              </div>
              <Plus className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </nav>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-gray-200 my-2" />

      {/* Tools section */}
      <div className="px-3 mb-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Tools
        </h2>
        <nav className="space-y-0.5">
          <button
            onClick={() => navigate('/onboarding')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              location.pathname === '/onboarding'
                ? 'bg-[#F7F9FF] text-[#2A73FF]'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
              location.pathname === '/onboarding'
                ? 'bg-[#2A73FF] text-white'
                : 'bg-[#F7F9FF] text-[#2A73FF]'
            }`}>
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                Onboarding Tracker
              </p>
              <p className="text-xs text-gray-500 truncate">
                Check program status
              </p>
            </div>
          </button>
        </nav>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-gray-200 my-2" />

      {/* Recent conversations */}
      <div className="px-3 flex-1 overflow-y-auto">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          {isQbrPage ? 'Request Log' : 'Recent Conversations'}
        </h2>
        <nav className="space-y-0.5">
          {isQbrPage ? (
            qbrLogs.length === 0 ? (
              <p className="px-2 text-xs text-gray-400 py-2">No QBR requests yet</p>
            ) : (
              qbrLogs.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-800 truncate">{entry.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        entry.status === 'error'
                          ? 'bg-red-50 text-red-600'
                          : entry.status === 'completed' || entry.status === 'downloaded'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{entry.detail}</p>
                  )}
                  {entry.fileName && (
                    <p className="mt-1 text-[11px] text-gray-500 truncate">{entry.fileName}</p>
                  )}
                </div>
              ))
            )
          ) : (
            threads.length === 0 ? (
              <p className="px-2 text-xs text-gray-400 py-2">
                No conversations yet
              </p>
            ) : (
              threads.map((thread) => {
                const isActive = location.pathname === `/chat/${thread.agentId}` && location.search.includes(thread.id)
                return (
                  <button
                    key={thread.id}
                    onClick={() => navigate(`/chat/${thread.agentId}?thread=${thread.id}`)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-[#F7F9FF] text-[#2A73FF]'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#2A73FF]' : 'text-gray-400'}`} />
                    <span className="text-sm truncate">{thread.title}</span>
                  </button>
                )
              })
            )
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200">
        <button
          onClick={() => {
            if (agents.length > 0) onNewChat(agents[0].id)
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#F7F9FF] border border-[#2A73FF]/20 text-[#2A73FF] rounded-xl text-sm font-medium hover:bg-[#2A73FF]/10 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </button>
      </div>
    </aside>
  )
}
