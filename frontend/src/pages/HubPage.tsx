import { useNavigate } from 'react-router-dom'
import { Bot, ArrowRight } from 'lucide-react'
import type { Agent } from '../lib/types'

interface HubPageProps {
  agents: Agent[]
}

export function HubPage({ agents }: HubPageProps) {
  const navigate = useNavigate()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white overflow-y-auto">
      {/* Hero */}
      <div className="text-center max-w-xl mb-10">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[#F7F9FF] mb-5">
          <Bot className="h-7 w-7 text-[#2A73FF]" />
        </div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-3">
          Welcome to Agent Hub
        </h1>
        <p className="text-base text-gray-500 leading-relaxed">
          Select an AI agent to start a conversation. Each agent is specialized
          to help you with different tasks.
        </p>
      </div>

      {/* Agent cards */}
      <div className="w-full max-w-2xl grid gap-3">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => navigate(`/chat/${agent.id}`)}
            className="group flex items-center gap-4 w-full p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-[#2A73FF]/40 hover:bg-[#F7F9FF] transition-all hover:shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F7F9FF] text-[#2A73FF] group-hover:bg-[#2A73FF] group-hover:text-white transition-colors shrink-0">
              {agent.icon ? (
                <span className="text-2xl">{agent.icon}</span>
              ) : (
                <Bot className="h-6 w-6" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-[#2A73FF] transition-colors">
                {agent.name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {agent.description}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#2A73FF] group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        ))}

        {agents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">
              No agents available yet. Check back soon!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
