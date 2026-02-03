import { useMemo, useState, type FormEvent } from 'react'

type PeriodType = 'quarter' | 'custom'
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export interface QbrRequestPayload {
  type: 'QBR_REQUEST'
  programId: string
  year: string
  periodType: PeriodType
  quarter?: Quarter
  startDate?: string
  endDate?: string
  fromDate: string
  toDate: string
}

interface QbrRequestFormProps {
  onSubmit: (payload: QbrRequestPayload) => void
  disabled?: boolean
}

const quarterRanges: Record<Quarter, { start: string; end: string }> = {
  Q1: { start: '01-01', end: '03-31' },
  Q2: { start: '04-01', end: '06-30' },
  Q3: { start: '07-01', end: '09-30' },
  Q4: { start: '10-01', end: '12-31' },
}

function normalizeDate(date: string) {
  return date.replaceAll('-', '')
}

function buildQuarterDates(year: string, quarter: Quarter) {
  const range = quarterRanges[quarter]
  return {
    start: `${year}-${range.start}`,
    end: `${year}-${range.end}`,
  }
}

function isValidYear(value: string) {
  return /^\d{4}$/.test(value)
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const diff = endDate.getTime() - startDate.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function QbrRequestForm({ onSubmit, disabled }: QbrRequestFormProps) {
  const [programId, setProgramId] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [periodType, setPeriodType] = useState<PeriodType>('quarter')
  const [quarter, setQuarter] = useState<Quarter>('Q1')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const computedRange = useMemo(() => {
    if (!isValidYear(year)) {
      return null
    }
    if (periodType === 'quarter') {
      return buildQuarterDates(year, quarter)
    }
    if (startDate && endDate) {
      return { start: startDate, end: endDate }
    }
    return null
  }, [year, periodType, quarter, startDate, endDate])

  const canSubmit = useMemo(() => {
    if (!programId.trim()) return false
    if (!isValidYear(year)) return false
    if (periodType === 'quarter') return Boolean(quarter)
    return Boolean(startDate && endDate)
  }, [programId, year, periodType, quarter, startDate, endDate])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!programId.trim()) {
      setError('Program ID is required.')
      return
    }
    if (!isValidYear(year)) {
      setError('Year must be four digits.')
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
    if (periodType === 'custom') {
      const daySpan = daysBetween(computedRange.start, computedRange.end)
      if (daySpan > 366) {
        setError('Custom date ranges are limited to 366 days.')
        return
      }
    }

    onSubmit({
      type: 'QBR_REQUEST',
      programId: programId.trim(),
      year,
      periodType,
      quarter: periodType === 'quarter' ? quarter : undefined,
      startDate: periodType === 'custom' ? computedRange.start : undefined,
      endDate: periodType === 'custom' ? computedRange.end : undefined,
      fromDate: normalizeDate(computedRange.start),
      toDate: normalizeDate(computedRange.end),
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
            Select the program and date period to generate a QBR analysis.
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

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="block text-xs text-gray-600">
          Program ID
          <input
            type="text"
            value={programId}
            onChange={(event) => setProgramId(event.target.value)}
            placeholder="e.g., 1001403"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
          />
        </label>

        <label className="block text-xs text-gray-600">
          Year
          <input
            type="text"
            inputMode="numeric"
            value={year}
            onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="2025"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
          />
        </label>

        <div className="text-xs text-gray-600">
          Period Type
          <div className="mt-2 flex gap-2">
            {(['quarter', 'custom'] as PeriodType[]).map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setPeriodType(option)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  periodType === option
                    ? 'border-[#2A73FF] bg-[#F7F9FF] text-[#2A73FF]'
                    : 'border-gray-200 text-gray-500 hover:border-[#2A73FF]/40'
                }`}
              >
                {option === 'quarter' ? 'Quarter' : 'Custom Dates'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {periodType === 'quarter' ? (
          <label className="block text-xs text-gray-600">
            Quarter
            <select
              value={quarter}
              onChange={(event) => setQuarter(event.target.value as Quarter)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2A73FF]"
            >
              <option value="Q1">Q1 (Jan - Mar)</option>
              <option value="Q2">Q2 (Apr - Jun)</option>
              <option value="Q3">Q3 (Jul - Sep)</option>
              <option value="Q4">Q4 (Oct - Dec)</option>
            </select>
          </label>
        ) : (
          <>
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
          </>
        )}

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

      {error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}
    </form>
  )
}
