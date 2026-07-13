'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useI18n } from '@/components/I18nProvider'
import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

type ParticipantStatus = 'scheduled' | 'working' | 'completed' | 'late' | 'missing'
type SummaryStatus = ParticipantStatus | 'unassigned'

type Participant = {
  worker_id: string
  worker_name: string
  active: boolean | null
  status: ParticipantStatus
  started_at: string | null
  stopped_at: string | null
}

type WorkforceItem = {
  job_id: string
  job_status: string | null
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
  summary_status: SummaryStatus
  site: {
    id: string
    name: string | null
    address: string | null
    lat: number | null
    lng: number | null
    radius: number | null
  } | null
  participants: Participant[]
  participant_count: number
}

type WorkforceResponse = {
  date_from: string
  date_to: string
  generated_at: string
  items: WorkforceItem[]
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toISODate(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return `${pad2(parsed.getDate())}-${pad2(parsed.getMonth() + 1)}-${parsed.getFullYear()} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return String(value).slice(0, 5)
}

function buildMapUrl(item: WorkforceItem | null) {
  const lat = item?.site?.lat
  const lng = item?.site?.lng
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const radius = item?.site?.radius && item.site.radius > 0 ? Math.min(Math.max(item.site.radius, 50), 5000) : 150
  const latDelta = Math.max(radius / 111320, 0.003)
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2)
  const lngDelta = Math.max(radius / (111320 * cosLat), 0.003)
  const bbox = [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta]
    .map((value) => value.toFixed(6))
    .join(',')
  const params = new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat.toFixed(7)},${lng.toFixed(7)}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function statusClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
  if (status === 'completed') return 'border-sky-400/40 bg-sky-500/20 text-sky-100'
  if (status === 'late') return 'border-amber-400/50 bg-amber-500/20 text-amber-100'
  if (status === 'missing') return 'border-rose