import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { HubPage } from './pages/HubPage'
import { ChatPage } from './pages/ChatPage'
import { OnboardingDashboard } from './pages/OnboardingDashboard'
import { fetchAgents } from './lib/api'
import type { Agent } from './lib/types'

function AppLayout() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [threads] = useState<{ id: string; agentId: string; title: string; updatedAt: string }[]>([])

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((err) => {
        console.error('Failed to fetch agents:', err)
        // Use fallback agents if backend is down
        setAgents([
          {
            id: 'qbr-agent',
            name: 'QBR Agent',
            description: 'Quarterly Business Review assistant that helps analyze performance metrics, identify trends, and prepare executive summaries.',
            icon: '📊',
            webhookUrl: '',
            isActive: true,
          },
        ])
      })
  }, [])

  const handleNewChat = (agentId: string) => {
    navigate(`/chat/${agentId}`)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900">
      <Sidebar
        agents={agents}
        threads={threads}
        onNewChat={handleNewChat}
      />
      <Routes>
        <Route path="/" element={<HubPage agents={agents} />} />
        <Route path="/chat/:agentId" element={<ChatPage agents={agents} />} />
        <Route path="/onboarding" element={<OnboardingDashboard />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App
