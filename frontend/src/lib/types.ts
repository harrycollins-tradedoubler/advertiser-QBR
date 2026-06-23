export interface Agent {
  id: string
  name: string
  description: string
  icon: string
  webhookUrl: string
  isActive: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Thread {
  id: string
  agentId: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

// Onboarding Dashboard types
export interface OnboardingStep {
  id: string
  name: string
  description: string
  icon: string
  order: number
  status: 'completed' | 'in_progress' | 'not_started'
  details: string
}

export interface OnboardingStatus {
  programId: string
  companyName: string
  startedAt: string | null
  lastActivity: string | null
  totalMessages: number
  isComplete: boolean
  overallProgress: number
  completedSteps: number
  totalSteps: number
  steps: OnboardingStep[]
}

export interface OnboardingSearchResult {
  programId: string
  companyName: string
  startedAt: string | null
  lastActivity: string | null
  messageCount: number
}

export interface QbrLogItem {
  id: string
  title: string
  status: 'queued' | 'running' | 'completed' | 'error' | 'downloading' | 'downloaded'
  detail?: string
  fileName?: string
  updatedAt: string
}

export interface ProgramRequestRun {
  programId: string
  timestamp: string
  clientUsername: string
  programIds: string
  programNames: string
  startDate: string
  endDate: string
  languageCode: string
  currencyCode: string
  analysisLevel: string
}


