'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableSelectItem = {
  id: string
  label: string
}

type Props = {
  label?: string
  value: string
  onChange: (id: string) => void
  items: SearchableSelectItem[]
  placeholder?: string
  disabled?: boolean
  inputClassName?: string
}

export function SearchableSelect({ label, value, onChange, items, placeholder, disabled, inputClassName }: Props) {
  const rootRef = useRef<any>(null)
  const inputRef = useRef<any>(null)
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => items.find((x) => x.id === value) || null, [items, value])
  const [query, setQuery] = useState<string>(selected?.label || '')

  // Sync input text when external value changes
  useEffect(() => {
    setQuery(selected?.label || '')
  }, [selected?.id, selected?.label])

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const a = String(it.label || '').toLowerCase()
      const b = String(it.id || '').toLowerCase()
      return a.includes(q) || b.includes(q)
    })
  }, [items, query])

  useEffect(() => {
    const onDown = (e: any) => {
      const root = rootRef.current
      if (!root) return
      if (root.contains?.(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true } as any)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown as any)
    }
  }, [])

  return (
    <div ref={rootRef} className="relative">
      {label ? <div className="mb-1 text-[11px] text-zinc-300">{label}</div> : null}

      <input
        ref={inputRef}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          if (!disabled) setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!disabled) setOpen(true)

          // If user clears input, clear selection too
          if (!e.target.value) onChange('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            ;(inputRef.current as any)?.blur?.()
          }
        }}
        className={
          inputClassName ||
          'w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60'
        }
      />

      {open ? (
        <div className="absolute left-0 right-0 z-[60] mt-2 max-h-72 overflow-auto rounded-2xl border border-yellow-400/20 bg-black/95 shadow-2xl">
          {filtered.length ? (
            filtered.map((it) => {
              const active = it.id === value
              return (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(it.id)
                    setQuery(it.label)
                    setOpen(false)
                  }}
                  className={
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition ' +
                    (active
                      ? 'bg-yellow-400/15 text-yellow-100'
                      : 'text-zinc-200 hover:bg-yellow-400/10 hover:text-yellow-100')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  <span className="shrink-0 text-[10px] text-zinc-400">{it.id}</span>
                </button>
              )
            })
          ) : (
            <div className="px-3 py-3 text-xs text-zinc-400">Ничего не найдено</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
