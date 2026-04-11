#!/usr/bin/env node
/**
 * Fill or refresh nl.json / en.json from messages/home/ru.json using DeepL API (dev-only helper).
 * Does NOT run in the browser and does NOT touch the live DOM.
 *
 * Env:
 *   DEEPL_AUTH_KEY — DeepL API auth key (https://www.deepl.com/pro-api)
 *   DEEPL_API_URL    — optional, default https://api-free.deepl.com/v2/translate (use api.deepl.com for Pro)
 *
 * Run: node scripts/fill-deepl-home.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const ruPath = join(root, 'messages', 'home', 'ru.json')
const nlPath = join(root, 'messages', 'home', 'nl.json')
const enPath = join(root, 'messages', 'home', 'en.json')

const key = process.env.DEEPL_AUTH_KEY || process.env.DEEPL_API_KEY
if (!key) {
  console.error('Missing DEEPL_AUTH_KEY (or legacy DEEPL_API_KEY)')
  process.exit(1)
}

const apiUrl = (process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate').replace(/\/$/, '')

async function translateBatch(texts, targetLang) {
  const body = new URLSearchParams()
  for (const t of texts) {
    body.append('text', t)
  }
  body.append('target_lang', targetLang)
  body.append('source_lang', 'RU')

  const res = await fetch(`${apiUrl}`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`DeepL ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = await res.json()
  const out = data.translations?.map((x) => x.text) || []
  if (out.length !== texts.length) {
    throw new Error('DeepL: translation count mismatch')
  }
  return out
}

async function main() {
  const ru = JSON.parse(readFileSync(ruPath, 'utf8'))
  const keys = Object.keys(ru).sort()
  const batchSize = 40
  const targets = [
    { lang: 'NL', path: nlPath, code: 'nl' },
    { lang: 'EN', path: enPath, code: 'en' },
  ]

  for (const { lang, path, code } of targets) {
    const existing = JSON.parse(readFileSync(path, 'utf8'))
    const next = { ...existing }

    for (let i = 0; i < keys.length; i += batchSize) {
      const slice = keys.slice(i, i + batchSize)
      const texts = slice.map((k) => ru[k])
      process.stdout.write(`Translating ${code}: ${i + 1}-${Math.min(i + batchSize, keys.length)} / ${keys.length}\n`)
      const translated = await translateBatch(texts, lang)
      slice.forEach((k, j) => {
        next[k] = translated[j]
      })
      await new Promise((r) => setTimeout(r, 200))
    }

    writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8')
    process.stdout.write(`Wrote ${path}\n`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
