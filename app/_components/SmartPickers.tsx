'use client'

import { useI18n } from '@/components/I18nProvider'

/** Localized aria-labels for date/time picker triggers. */
export function useSmartPickerAriaLabels() {
  const { t } = useI18n()
  return {
    openCalendar: t('picker.openCalendar'),
    openTime: t('picker.openTime'),
  }
}
