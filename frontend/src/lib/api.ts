import type { Agent, Message, OnboardingStatus, OnboardingSearchResult, ProgramRequestRun } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8008'

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
  } catch {
    // ignore parse failures
  }
  return fallback
}

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

export async function fetchQbrStatus(jobId: string): Promise<{
  status: string
  result?: string
  error?: string
  download_available?: boolean
  file_name?: string
}> {
  const response = await fetch(`${API_URL}/api/qbr/${encodeURIComponent(jobId)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch QBR status')
  }
  return response.json()
}

export async function downloadQbrReport(jobId: string): Promise<{ fileName: string }> {
  const response = await fetch(`${API_URL}/api/qbr/${encodeURIComponent(jobId)}/download`)
  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'Failed to download QBR report'))
  }

  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition') || ''
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  const fileName = filenameMatch?.[1] || `qbr-report-${jobId}.pptx`

  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)

  return { fileName }
}

export async function fetchThreadMessages(threadId: string): Promise<Message[]> {
  const response = await fetch(`${API_URL}/api/threads/${threadId}/messages`)
  if (!response.ok) {
    throw new Error('Failed to fetch messages')
  }
  return response.json()
}

export async function tdFetchUser(accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}/api/td/fetch-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'Failed to fetch user with access token'))
  }
  return response.json()
}

export async function tdGetImpersonateUsername(organizationId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}/api/td/impersonate-username?organizationId=${encodeURIComponent(organizationId)}`)
  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'Failed to fetch impersonate username'))
  }
  return response.json()
}

export async function tdImpersonate(username: string): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/api/td/impersonate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  })
  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'Failed to impersonate user'))
  }
  return response.json()
}

export async function tdFetchImpersonatedUser(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}/api/td/impersonated-user`)
  if (!response.ok) {
    throw new Error('Failed to fetch impersonated user')
  }
  return response.json()
}

export async function tdGetOrganisation(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}/api/td/organisation`)
  if (!response.ok) {
    throw new Error('Failed to fetch organisation')
  }
  return response.json()
}

export async function tdClearTokens(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/api/td/clear-tokens`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to clear tokens')
  }
  return response.json()
}

export async function tdGetPrograms(
  organizationId?: string,
  limit = 100,
  accessToken?: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (organizationId?.trim()) {
    params.set('organizationId', organizationId.trim())
  }
  const response = await fetch(`${API_URL}/api/td/programs?${params.toString()}`, {
    headers: accessToken?.trim()
      ? {
          Authorization: `Bearer ${accessToken.trim()}`,
        }
      : undefined,
  })
  if (!response.ok) {
    let detail = 'Failed to fetch programs'
    try {
      const errorBody = await response.json()
      if (typeof errorBody?.detail === 'string' && errorBody.detail.trim()) {
        detail = errorBody.detail
      }
    } catch {
      // ignore parse failures and keep default message
    }
    throw new Error(detail)
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

export async function fetchProgramRequestRuns(limit = 100): Promise<ProgramRequestRun[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  const response = await fetch(`${API_URL}/api/program-request-runs?${params.toString()}`)
  if (!response.ok) {
    throw new Error(await readErrorDetail(response, 'Failed to fetch run log'))
  }
  const data = await response.json()
  return Array.isArray(data?.runs) ? data.runs : []
}
