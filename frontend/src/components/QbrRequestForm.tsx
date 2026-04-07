import { useMemo, useState, type FormEvent } from 'react'

import { tdFetchUser, tdGetImpersonateUsername, tdImpersonate, tdGetPrograms } from '../lib/api'

type AnalysisLevel = 'program' | 'organization'
type PublisherProgramMode = 'selected_program' | 'all_programs_in_organisation'
type LanguageCode = 'EN' | 'FR' | 'NL' | 'DE' | 'IT' | 'NO' | 'SV' | 'DA' | 'FI' | 'ES' | 'PL'
type CurrencyCode = 'GBP' | 'EUR' | 'USD' | 'SEK' | 'NOK' | 'DKK' | 'PLN'
type TdTokens = {
  user_access_token: string
  impersonate_access_token: string
}

export interface QbrRequestPayload {
  type: 'QBR_REQUEST'
  analysisLevel: AnalysisLevel
  organizationId: string
  programId: string
  programName: string
  publisherProgramMode: PublisherProgramMode
  publisherProgramIds: string[]
  languageCode: LanguageCode
  currencyCode: CurrencyCode
  startDate: string
  endDate: string
  fromDate: string
  toDate: string
  td_tokens?: TdTokens
}

interface QbrRequestFormProps {
  onSubmit: (payload: QbrRequestPayload) => void
  disabled?: boolean
}

function normalizeDate(date: string) {
  return date.replaceAll('-', '')
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const diff = endDate.getTime() - startDate.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function QbrRequestForm({ onSubmit, disabled }: QbrRequestFormProps) {
  const [accessToken, setAccessToken] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>('program')
  const [programId, setProgramId] = useState('')
  const [programName, setProgramName] = useState('')
  const [publisherProgramMode, setPublisherProgramMode] = useState<PublisherProgramMode>('selected_program')
  const [languageCode, setLanguageCode] = useState<LanguageCode>('EN')
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('EUR')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([])
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tdTokens, setTdTokens] = useState<TdTokens | null>(null)

  const computedRange = useMemo(() => {
    if (!startDate || !endDate) return null
    return { start: startDate, end: endDate }
  }, [startDate, endDate])

  const publisherProgramIds = useMemo(() => {
    if (publisherProgramMode === 'all_programs_in_organisation') {
      return programs.map((program) => program.id)
    }
    return programId ? [programId] : []
  }, [programId, programs, publisherProgramMode])

  const canSubmit = useMemo(() => {
    if (!accessToken.trim()) return false
    if (!organizationId.trim()) return false
    if (!programId.trim()) return false
    if (!programName.trim()) return false
    return Boolean(startDate && endDate)
  }, [accessToken, organizationId, programId, programName, startDate, endDate])

  const resetPrograms = () => {
    setPrograms([])
    setProgramId('')
    setProgramName('')
    setTdTokens(null)
  }

  const handleLoadPrograms = async (silent = false) => {
    if (!accessToken.trim() || !organizationId.trim()) {
      if (!silent) setError('Access token and Organisation ID are required.')
      return
    }

    setError(null)
    setStatus(null)
    resetPrograms()

    try {
      setLoadingPrograms(true)
      await tdFetchUser(accessToken.trim())
      const owner = await tdGetImpersonateUsername(organizationId.trim())
      const ownerUsername = String(owner?.username || '')
      if (!ownerUsername) {
        throw new Error('Could not resolve owner username')
      }
      await tdImpersonate(ownerUsername)
      const data = await tdGetPrograms(organizationId.trim(), 100, accessToken.trim())
      const items = (data as { items?: Array<{ id: string | number; name?: string }> }).items || []
      const tokenData = (data as { td_tokens?: Partial<TdTokens> }).td_tokens
      const normalized = items
        .map((item) => ({
          id: String(item.id),
          name: item.name ? String(item.name) : `Program ${item.id}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      const userToken = String(tokenData?.user_access_token || '').trim()
      const impersonateToken = String(tokenData?.impersonate_access_token || '').trim()
      if (userToken && impersonateToken) {
        setTdTokens({
          user_access_token: userToken,
          impersonate_access_token: impersonateToken,
        })
      } else {
        setTdTokens(null)
      }

      setPrograms(normalized)
      if (normalized.length === 0) {
        setError('No programs found for this organisation.')
      } else {
        setStatus(`Programs loaded (${normalized.length})`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load programs'
      setError(message)
      setStatus(null)
    } finally {
      setLoadingPrograms(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!accessToken.trim()) {
      setError('TD access token is required.')
      return
    }
    if (!organizationId.trim()) {
      setError('Organisation ID is required.')
      return
    }
    if (!programId.trim()) {
      setError('Program is required.')
      return
    }
    if (!programName.trim()) {
      setError('Program name is required.')
      return
    }
    if (!tdTokens?.impersonate_access_token) {
      setError('TD session token missing. Click Load Programs again before submitting.')
      return
    }
    if (!computedRange) {
      setError('Please select a valid date range.')
      return
    }
    if (computedRange.start > computedRange.end) {
      setError('Start date must be before end date.')
      return
    }

    const daySpan = daysBetween(computedRange.start, computedRange.end)
    if (daySpan > 366) {
      setError('Date ranges are limited to 366 days.')
      return
    }

    onSubmit({
      type: 'QBR_REQUEST',
      analysisLevel,
      organizationId: organizationId.trim(),
      programId: programId.trim(),
      programName: programName.trim(),
      publisherProgramMode,
      publisherProgramIds,
      languageCode,
      currencyCode,
      startDate: computedRange.start,
      endDate: computedRange.end,
      fromDate: normalizeDate(computedRange.start),
      toDate: normalizeDate(computedRange.end),
      td_tokens: tdTokens,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">QBR Request</h2>
          <p className="text-xs text-gray-500">
            Connect TD auth, load the organisation&apos;s programs, then submit the QBR request.
          </p>
        </div>
        <button
          type="submit"
          disabled={disabled || !canSubmit}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#2A73FF] text-white hover:bg-[#1F5ED8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send QBR Request
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-[#2A73FF]">1. Authenticate</div>
          <div className="mt-2 grid gap-4 lg:grid-cols-3">
            <label className="block text-xs text-gray-600 lg:col-span-2">
              TD Access Token
              <div className="mt-2 text-xs text-gray-500">
                Generate a token here:{' '}
                <a
                  href="https://solutions.tradedoubler.com/tools/api-client-authToken/index.php"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#2A73FF] hover:underline"
                >
                  https://solutions.tradedoubler.com/tools/api-client-authToken/index.php
                </a>
              </div>
              <input
                type="password"
                value={accessToken}
                onChange={(event) => {
                  setAccessToken(event.target.value)
                  setStatus(null)
                  setError(null)
                }}
                placeholder="Paste your TD user access token"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              />
            </label>

            <label className="block text-xs text-gray-600">
              Organisation ID
              <input
                type="text"
                value={organizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value)
                  setStatus(null)
                  setError(null)
                }}
                placeholder="e.g., 971448"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              />
            </label>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-[#2A73FF]">2. Load Program</div>
          <div className="mt-2 grid gap-4 lg:grid-cols-3">
            <div className="text-xs text-gray-600">
              <span className="block">Load Programs</span>
              <button
                type="button"
                onClick={() => void handleLoadPrograms(false)}
                disabled={disabled || loadingPrograms || !accessToken.trim() || !organizationId.trim()}
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {loadingPrograms ? 'Loading programs...' : 'Load Programs'}
              </button>
            </div>

            <label className="block text-xs text-gray-600 lg:col-span-2">
              Program
              <select
                value={programId}
                onChange={(event) => {
                  const selectedId = event.target.value
                  setProgramId(selectedId)
                  const selected = programs.find((program) => program.id === selectedId)
                  setProgramName(selected?.name || '')
                }}
                disabled={loadingPrograms || programs.length === 0}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF] disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{loadingPrograms ? 'Loading programs...' : 'Select a program'}</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name} ({program.id})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-[#2A73FF]">3. Request Scope</div>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            <div className="text-xs text-gray-600">
              Analysis Level
              <div className="mt-2 flex gap-2">
                {(['program', 'organization'] as AnalysisLevel[]).map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setAnalysisLevel(option)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      analysisLevel === option
                        ? 'border-[#2A73FF] bg-[#F7F9FF] text-[#2A73FF]'
                        : 'border-gray-200 text-gray-500 hover:border-[#2A73FF]/40'
                    }`}
                  >
                    {option === 'program' ? 'Program' : 'Organisation'}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs text-gray-600">
              Publisher Coverage
              <select
                value={publisherProgramMode}
                onChange={(event) => setPublisherProgramMode(event.target.value as PublisherProgramMode)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              >
                <option value="selected_program">Selected program only</option>
                <option value="all_programs_in_organisation">All programs in organisation</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-[#2A73FF]">4. Output</div>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Language
              <select
                value={languageCode}
                onChange={(event) => setLanguageCode(event.target.value as LanguageCode)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              >
                <option value="EN">English</option>
                <option value="FR">French</option>
                <option value="NL">Dutch</option>
                <option value="DE">German</option>
                <option value="IT">Italian</option>
                <option value="NO">Norwegian</option>
                <option value="SV">Swedish</option>
                <option value="DA">Danish</option>
                <option value="FI">Finnish</option>
                <option value="ES">Spanish</option>
                <option value="PL">Polish</option>
              </select>
            </label>

            <label className="block text-xs text-gray-600">
              Currency
              <select
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value as CurrencyCode)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              >
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="SEK">SEK</option>
                <option value="NOK">NOK</option>
                <option value="DKK">DKK</option>
                <option value="PLN">PLN</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-[#2A73FF]">5. Reporting Period</div>
          <div className="mt-2 grid gap-4 lg:grid-cols-3">
            <label className="block text-xs text-gray-600">
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              />
            </label>

            <label className="block text-xs text-gray-600">
              End Date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
              />
            </label>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
              <div className="font-semibold text-gray-700">Preview</div>
              {computedRange ? (
                <div className="mt-1">
                  <div>
                    From: <span className="font-medium">{computedRange.start}</span>
                  </div>
                  <div>
                    To: <span className="font-medium">{computedRange.end}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-gray-400">Select a period to preview.</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
          <div className="font-semibold text-gray-700">Summary</div>
          <div className="mt-2 grid gap-1 lg:grid-cols-2">
            <div>
              Program: <span className="font-medium">{programName || 'None selected'}</span>
            </div>
            <div>
              KPI scope: <span className="font-medium">{analysisLevel === 'organization' ? 'Organisation-level' : 'Program-level'}</span>
            </div>
            <div>
              Publisher scope: <span className="font-medium">{publisherProgramMode === 'all_programs_in_organisation' ? 'All organisation programs' : 'Selected program only'}</span>
            </div>
            <div>
              Language / Currency: <span className="font-medium">{languageCode} / {currencyCode}</span>
            </div>
          </div>
        </div>
      </div>

      {status && (
        <p className="mt-3 text-xs text-gray-500">{status}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </form>
  )
}
