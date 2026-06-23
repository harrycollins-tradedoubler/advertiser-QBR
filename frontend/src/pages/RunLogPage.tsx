import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Database, RefreshCw } from 'lucide-react'

import { fetchProgramRequestRuns } from '../lib/api'
import type { ProgramRequestRun } from '../lib/types'

const DEFAULT_LIMIT = 100

function formatTimestamp(value: string) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function latestTimestamp(runs: ProgramRequestRun[]) {
  if (runs.length === 0) return 'No records'
  return formatTimestamp(runs[0].timestamp)
}

function text(value: string | undefined, fallback = '-') {
  return value?.trim() || fallback
}

function dateRange(run: ProgramRequestRun) {
  return run.startDate && run.endDate ? `${run.startDate} to ${run.endDate}` : '-'
}

export function RunLogPage() {
  const [runs, setRuns] = useState<ProgramRequestRun[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uniqueProgramCount = useMemo(
    () => new Set(runs.map((run) => run.programId).filter(Boolean)).size,
    [runs],
  )

  const loadRuns = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const nextRuns = await fetchProgramRequestRuns(DEFAULT_LIMIT)
      setRuns(nextRuns)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run log')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadRuns()
  }, [])

  return (
    <main className="flex-1 overflow-y-auto bg-[#F8FAFC]">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col px-6 py-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#2A73FF]">
              <Database className="h-4 w-4" />
              Program Requests
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">Run Log</h1>
            <p className="mt-1 text-sm text-slate-500">
              Review recorded QBR program requests from Postgres.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRuns(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2A73FF]/40 hover:text-[#2A73FF] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        <section className="grid gap-3 border-b border-slate-200 py-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Runs</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-950">{runs.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Primary Programs</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-950">{uniqueProgramCount}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Latest Request</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{latestTimestamp(runs)}</p>
          </div>
        </section>

        <section className="flex-1 py-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-11 animate-pulse rounded-md bg-slate-200/70"
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Could not load the run log</p>
                <p className="mt-1 text-red-600">{error}</p>
              </div>
            </div>
          ) : runs.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
              <div className="px-6 text-center">
                <Database className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-800">No runs recorded yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Submit a QBR request and it will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Client</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Program IDs</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Program Names</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Date Range</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Language</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Currency</th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map((run, index) => (
                    <tr key={`${run.programId}-${run.timestamp}-${index}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{text(run.clientUsername)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-950">
                        {text(run.programIds, run.programId || '-')}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-slate-700">{text(run.programNames)}</td>
                      <td className="px-4 py-3 text-slate-600">{dateRange(run)}</td>
                      <td className="px-4 py-3 text-slate-600">{text(run.languageCode)}</td>
                      <td className="px-4 py-3 text-slate-600">{text(run.currencyCode)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTimestamp(run.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
