import { useState } from 'react'
import { Search, CheckCircle2, Clock, Circle, Building2, Calendar, MessageSquare, TrendingUp, Loader2, AlertCircle } from 'lucide-react'
import { fetchOnboardingStatus, searchOnboardingPrograms } from '../lib/api'
import type { OnboardingStatus, OnboardingSearchResult } from '../lib/types'

export function OnboardingDashboard() {
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [searchResults, setSearchResults] = useState<OnboardingSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'dashboard' | 'search'>('idle')

  const handleLookup = async () => {
    if (!searchInput.trim()) return

    setLoading(true)
    setError(null)
    setSearchResults(null)
    setStatus(null)

    try {
      // Try direct lookup first
      const result = await fetchOnboardingStatus(searchInput.trim())
      setStatus(result)
      setMode('dashboard')
    } catch {
      // If not found, try search by company name
      try {
        const results = await searchOnboardingPrograms(searchInput.trim())
        if (results.length === 0) {
          setError('No programs found. Try a different program ID or company name.')
          setMode('idle')
        } else if (results.length === 1) {
          // Single result — load directly
          const result = await fetchOnboardingStatus(results[0].programId)
          setStatus(result)
          setMode('dashboard')
        } else {
          setSearchResults(results)
          setMode('search')
        }
      } catch {
        setError('No programs found. Please check the ID and try again.')
        setMode('idle')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProgram = async (programId: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchOnboardingStatus(programId)
      setStatus(result)
      setMode('dashboard')
      setSearchResults(null)
    } catch {
      setError('Failed to load program details.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup()
  }

  const handleBack = () => {
    setMode('idle')
    setStatus(null)
    setSearchResults(null)
    setError(null)
    setSearchInput('')
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      case 'in_progress':
        return <Clock className="h-5 w-5 text-amber-500" />
      default:
        return <Circle className="h-5 w-5 text-gray-300" />
    }
  }

  const getStatusBadge = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed
          </span>
        )
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            In Progress
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
            Not Started
          </span>
        )
    }
  }

  // Progress ring component
  const ProgressRing = ({ progress }: { progress: number }) => {
    const radius = 54
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (progress / 100) * circumference

    return (
      <div className="relative inline-flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 128 128">
          {/* Background ring */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="8"
          />
          {/* Progress ring */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={progress === 100 ? '#10B981' : '#2A73FF'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-bold text-gray-900">{progress}%</span>
          <span className="text-xs text-gray-500">Complete</span>
        </div>
      </div>
    )
  }

  const totalSteps = status?.steps.length ?? 0
  const completedSteps = status?.steps.filter((step) => step.status === 'completed').length ?? 0
  const computedProgress = totalSteps === 0
    ? 0
    : Math.round((completedSteps / totalSteps) * 100)
  const isComplete = totalSteps > 0 && completedSteps === totalSteps

  return (
    <div className="flex-1 flex flex-col bg-gray-50/50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Onboarding Tracker</h1>
              <p className="text-sm text-gray-500 mt-1">
                Check the implementation status of any program
              </p>
            </div>
            {mode !== 'idle' && (
              <button
                onClick={handleBack}
                className="text-sm text-[#2A73FF] hover:text-[#1F5ED8] font-medium transition-colors"
              >
                ← New Search
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="mt-5 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter Program ID or Company Name..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]/20 focus:border-[#2A73FF] transition-all"
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={loading || !searchInput.trim()}
              className="px-6 py-2.5 bg-[#2A73FF] text-white text-sm font-medium rounded-xl hover:bg-[#1F5ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                'Look Up'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 px-8 py-6">
        <div className="max-w-5xl mx-auto">

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {/* Idle state */}
          {mode === 'idle' && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[#F7F9FF] mb-5">
                <Search className="h-7 w-7 text-[#2A73FF]" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Look Up a Program
              </h2>
              <p className="text-sm text-gray-500 max-w-md">
                Enter a Program ID or Company Name to view the onboarding implementation status and progress.
              </p>
            </div>
          )}

          {/* Search results list */}
          {mode === 'search' && searchResults && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                {searchResults.length} program{searchResults.length !== 1 ? 's' : ''} found
              </h2>
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={result.programId}
                    onClick={() => handleSelectProgram(result.programId)}
                    className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-[#2A73FF]/40 hover:bg-[#F7F9FF] transition-all group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F7F9FF] text-[#2A73FF] shrink-0 group-hover:bg-[#2A73FF] group-hover:text-white transition-colors">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{result.companyName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{result.programId}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">{formatDate(result.startedAt)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{result.messageCount} messages</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dashboard view */}
          {mode === 'dashboard' && status && (
            <div className="space-y-6">
              {/* Overview cards row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Progress ring card */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center">
                  <ProgressRing progress={computedProgress} />
                  <p className="text-sm font-medium text-gray-700 mt-3">
                    {completedSteps} of {totalSteps} steps
                  </p>
                  {isComplete && (
                    <span className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Implementation Complete
                    </span>
                  )}
                </div>

                {/* Program info card */}
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Program Details</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F9FF] shrink-0">
                        <Building2 className="h-4 w-4 text-[#2A73FF]" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Company</p>
                        <p className="text-sm font-medium text-gray-900">{status.companyName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F9FF] shrink-0">
                        <TrendingUp className="h-4 w-4 text-[#2A73FF]" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Program ID</p>
                        <p className="text-sm font-medium text-gray-900 font-mono break-all">{status.programId}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F9FF] shrink-0">
                        <Calendar className="h-4 w-4 text-[#2A73FF]" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Started</p>
                        <p className="text-sm font-medium text-gray-900">{formatDateTime(status.startedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F9FF] shrink-0">
                        <MessageSquare className="h-4 w-4 text-[#2A73FF]" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Last Activity</p>
                        <p className="text-sm font-medium text-gray-900">{formatDateTime(status.lastActivity)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Steps breakdown */}
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Implementation Steps
                </h2>
                <div className="space-y-3">
                  {status.steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`bg-white border rounded-xl p-4 transition-all ${
                        step.status === 'completed'
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : step.status === 'in_progress'
                          ? 'border-amber-200 bg-amber-50/30'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Step number + icon */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                            {index + 1}
                          </span>
                          {getStatusIcon(step.status)}
                        </div>

                        {/* Step content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900">
                              <span className="mr-1.5">{step.icon}</span>
                              {step.name}
                            </h3>
                            {getStatusBadge(step.status)}
                          </div>
                          <p className="text-xs text-gray-500 mb-1">{step.description}</p>
                          <p className="text-xs text-gray-600 font-medium">{step.details}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary footer */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Total interactions: <span className="font-medium text-gray-900">{status.totalMessages}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Overall progress: <span className="font-semibold text-[#2A73FF]">{computedProgress}%</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
