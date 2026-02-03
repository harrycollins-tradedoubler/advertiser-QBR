import { useNavigate } from 'react-router-dom'
import { Bot, MessageSquare } from 'lucide-react'
import type { Agent } from '../lib/types'

interface AgentCardProps {
  agent: Agent
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/chat/${agent.id}`)}
      className="group cursor-pointer rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm transition-all hover:shadow-md hover:border-[hsl(var(--primary))]"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          {agent.icon ? (
            <span className="text-2xl">{agent.icon}</span>
          ) : (
            <Bot className="h-6 w-6" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">
            {agent.name}
          </h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] line-clamp-2">
            {agent.description}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <MessageSquare className="h-4 w-4" />
        <span>Start chatting</span>
      </div>
    </div>
  )
}
