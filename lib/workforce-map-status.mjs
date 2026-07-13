/**
 * @typedef {'scheduled' | 'working' | 'completed' | 'late' | 'missing' | 'cancelled'} WorkforceParticipantStatus
 * @typedef {WorkforceParticipantStatus | 'unassigned'} WorkforceSummaryStatus
 * @typedef {{ started_at: string | null, stopped_at: string | null }} ParticipantLog
 * @typedef {{ started_at: string | null, stopped_at: string | null, has_open_log: boolean }} AggregatedParticipantLog
 */

const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam'
const GRACE_MS = 15 * 60 * 1000
const MISSING_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * @param {Date} date
 * @param {string} timeZone
 */
function dateTimePartsAt(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  }
}

/**
 * Convert a date and wall-clock time in Europe/Amsterdam to a UTC Date.
 * Returns null for malformed or nonexistent local times, including the DST spring gap.
 *
 * @param {string | null} dateValue
 * @param {string | null} timeValue
 * @returns {Date | null}
 */
export function amsterdamScheduleDateTime(dateValue, timeValue) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || '').slice(0, 10))
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(timeValue || ''))
  if (!dateMatch || !timeMatch) return null

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] || 0),
  }

  const validCalendarDate = new Date(Date.UTC(target.year, target.month - 1, target.day))
  if (
    validCalendarDate.getUTCFullYear() !== target.year ||
    validCalendarDate.getUTCMonth() !== target.month - 1 ||
    validCalendarDate.getUTCDate() !== target.day ||
    target.hour < 0 ||
    target.hour > 23 ||
    target.minute < 0 ||
    target.minute > 59 ||
    target.second < 0 ||
    target.second > 59
  ) {
    return null
  }

  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  )
  let guess = targetAsUtc

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = dateTimePartsAt(new Date(guess), AMSTERDAM_TIME_ZONE)
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    )
    const correction = targetAsUtc - currentAsUtc
    if (correction === 0) break
    guess += correction
  }

  const result = new Date(guess)
  const verified = dateTimePartsAt(result, AMSTERDAM_TIME_ZONE)
  if (
    verified.year !== target.year ||
    verified.month !== target.month ||
    verified.day !== target.day ||
    verified.hour !== target.hour ||
    verified.minute !== target.minute ||
    verified.second !== target.second
  ) {
    return null
  }

  return result
}

/**
 * @param {ParticipantLog[]} logs
 * @returns {AggregatedParticipantLog}
 */
export function aggregateParticipantLogs(logs) {
  let startedAt = null
  let stoppedAt = null
  let hasOpenLog = false

  for (const log of logs) {
    const started = String(log.started_at || '').trim()
    const stopped = String(log.stopped_at || '').trim()
    if (!started) continue

    if (!startedAt || started < startedAt) startedAt = started
    if (!stopped) {
      hasOpenLog = true
    } else if (!stoppedAt || stopped > stoppedAt) {
      stoppedAt = stopped
    }
  }

  return {
    started_at: startedAt,
    stopped_at: stoppedAt,
    has_open_log: hasOpenLog,
  }
}

/**
 * @param {string | null | undefined} status
 */
export function isCancelledJobStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized === 'cancelled' || normalized === 'canceled'
}

/**
 * @param {{
 *   jobStatus: string | null,
 *   scheduledAt: Date | null,
 *   log: AggregatedParticipantLog,
 *   now: Date,
 * }} params
 * @returns {WorkforceParticipantStatus}
 */
export function deriveParticipantStatus(params) {
  const { jobStatus, scheduledAt, log, now } = params

  if (isCancelledJobStatus(jobStatus)) return 'cancelled'
  if (log.has_open_log) return 'working'
  if (log.started_at && log.stopped_at) return 'completed'
  if (!scheduledAt) return 'scheduled'

  const diff = now.getTime() - scheduledAt.getTime()
  if (diff > MISSING_AFTER_MS) return 'missing'
  if (diff > GRACE_MS) return 'late'
  return 'scheduled'
}

/**
 * @param {string | null} jobStatus
 * @param {WorkforceParticipantStatus[]} participantStatuses
 * @returns {WorkforceSummaryStatus}
 */
export function deriveSummaryStatus(jobStatus, participantStatuses) {
  if (isCancelledJobStatus(jobStatus)) return 'cancelled'
  if (participantStatuses.includes('working')) return 'working'
  if (participantStatuses.includes('late')) return 'late'
  if (participantStatuses.includes('missing')) return 'missing'
  if (participantStatuses.length > 0 && participantStatuses.every((status) => status === 'completed')) {
    return 'completed'
  }
  if (participantStatuses.length === 0) return 'unassigned'
  return 'scheduled'
}
