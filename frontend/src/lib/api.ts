import type { Agent, Message, OnboardingStatus, OnboardingSearchResult } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function fetchAgents(): Promise<Agent[]> {
  const response = await fetch(`${API_URL}/api/agents`)
  if (!response.ok) {
    throw new Error('Failed to fetch agents')
  }
  return response.json()
}

export async function sendMessage(
  agentId: string,
  message: string,
  threadId?: string
): Promise<{ response: string; threadId: string; jobId?: string; jobStatus?: string }> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId,
      message,
      threadId,
    }),
  })
  if (!response.ok) {
    throw new Error('Failed to send message')
  }
  return response.json()
}

export async function fetchQbrStatus(jobId: string): Promise<{ status: string; result?: string; error?: string }> {
  const response = await fetch(`${API_URL}/api/qbr/${encodeURIComponent(jobId)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch QBR status')
  }
  return response.json()
}

export async function fetchThreadMessages(threadId: string): Promise<Message[]> {
  const response = await fetch(`${API_URL}/api/threads/${threadId}/messages`)
  if (!response.ok) {
    throw new Error('Failed to fetch messages')
  }
  return response.json()
}

// Onboarding Dashboard API
export async function fetchOnboardingStatus(programId: string): Promise<OnboardingStatus> {
  const response = await fetch(`${API_URL}/api/onboarding/${encodeURIComponent(programId)}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Program not found. Please check the ID and try again.')
    }
    throw new Error('Failed to fetch onboarding status')
  }
  return response.json()
}

export async function searchOnboardingPrograms(searchTerm: string): Promise<OnboardingSearchResult[]> {
  const response = await fetch(`${API_URL}/api/onboarding/search/${encodeURIComponent(searchTerm)}`)
  if (!response.ok) {
    throw new Error('Failed to search programs')
  }
  const data = await response.json()
  return data.results
}
