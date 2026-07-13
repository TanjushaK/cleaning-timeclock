import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateParticipantLogs,
  amsterdamScheduleDateTime,
  deriveParticipantStatus,
  deriveSummaryStatus,
} from '../lib/workforce-map-status.mjs'

test('converts Amsterdam winter time to UTC', () => {
  assert.equal(amsterdamScheduleDateTime('2026-01-15', '08:00:00')?.toISOString(), '2026-01-15T07:00:00.000Z')
})

test('converts Amsterdam summer time to UTC', () => {
  assert.equal(amsterdamScheduleDateTime('2026-07-15', '08:00:00')?.toISOString(), '2026-07-15T06:00:00.000Z')
})

test('rejects a nonexistent Amsterdam DST wall-clock time', () => {
  assert.equal(amsterdamScheduleDateTime('2026-03-29', '02:30:00'), null)
})

test('aggregates repeated logs per participant without hiding the first start', () => {
  assert.deepEqual(
    aggregateParticipantLogs([
      { started_at: '2026-07-15T08:30:00.000Z', stopped_at: '2026-07-15T09:00:00.000Z' },
      { started_at: '2026-07-15T08:00:00.000Z', stopped_at: '2026-07-15T08:15:00.000Z' },
      { started_at: '2026-07-15T09:15:00.000Z', stopped_at: null },
    ]),
    {
      started_at: '2026-07-15T08:00:00.000Z',
      stopped_at: '2026-07-15T09:00:00.000Z',
      has_open_log: true,
    },
  )
})

test('an open repeated log keeps the participant working', () => {
  const log = aggregateParticipantLogs([
    { started_at: '2026-07-15T08:00:00.000Z', stopped_at: '2026-07-15T09:00:00.000Z' },
    { started_at: '2026-07-15T09:15:00.000Z', stopped_at: null },
  ])

  assert.equal(
    deriveParticipantStatus({
      jobStatus: 'in_progress',
      scheduledAt: new Date('2026-07-15T06:00:00.000Z'),
      log,
      now: new Date('2026-07-15T10:00:00.000Z'),
    }),
    'working',
  )
})

test('cancelled overrides late, missing, and working states', () => {
  const status = deriveParticipantStatus({
    jobStatus: 'cancelled',
    scheduledAt: new Date('2026-07-10T06:00:00.000Z'),
    log: {
      started_at: '2026-07-10T06:00:00.000Z',
      stopped_at: null,
      has_open_log: true,
    },
    now: new Date('2026-07-15T10:00:00.000Z'),
  })

  assert.equal(status, 'cancelled')
  assert.equal(deriveSummaryStatus('cancelled', [status]), 'cancelled')
})
