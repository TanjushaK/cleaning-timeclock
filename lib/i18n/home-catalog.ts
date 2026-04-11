import type { HomeLocale } from './types'
import en from '@/messages/home/en.json'
import nl from '@/messages/home/nl.json'
import ru from '@/messages/home/ru.json'

export const HOME_CATALOG: Record<HomeLocale, Record<string, string>> = {
  ru: ru as Record<string, string>,
  nl: nl as Record<string, string>,
  en: en as Record<string, string>,
}
