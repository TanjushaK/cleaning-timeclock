'use client'

import { useCallback, useRef } from 'react'

type Props = {
  label?: string
  type: 'date' | 'time'
  value: string
  onChange: (v: string) => void
  className?: string
  disabled?: boolean
  name?: string
}

export function SmartPickerInput({ label, type, value, onChange, className, disabled, name }: Props) {
  // any here is intentional: it avoids TS "never" issues in projects where refs get inferred as `null`.
  const ref = useRef<any>(null)

  const openPicker = useCallback(() => {
    const el = ref.current
    if (!el) return

    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      // ignore
    }

    try {
      if (typeof el.focus === 'function') el.focus()
    } catch {
      // ignore
    }
  }, [])

  return (
    <label className="grid gap-1">
      {label ? <span className="text-xs opacity-80">{label}</span> : null}
      <div className="relative">
        <input
          ref={ref}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={className}
          onPointerDown={() => {
            openPicker()
          }}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-amber-500/20 bg-black/20 px-2 py-1 text-[10px] text-amber-100/90 hover:bg-amber-500/10 disabled:opacity-50"
          aria-label={type === 'date' ? 'Открыть календарь' : 'Открыть выбор времени'}
        >
          {type === 'date' ? '📅' : '🕒'}
        </button>
      </div>
    </label>
  )
}
