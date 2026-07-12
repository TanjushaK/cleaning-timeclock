export type StructuredAddressInput = {
  street: string | null
  house_number: string | null
  house_number_addition: string | null
  postal_code: string | null
  city: string | null
  country_code: string | null
  formatted_address: string | null
  geocode_provider: string | null
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function normalizeCountryCode(value: unknown): string | null {
  const code = textOrNull(value)?.toUpperCase() || null
  return code ? code.slice(0, 2) : null
}

function parseStreetLine(value: string): {
  street: string | null
  house_number: string | null
  house_number_addition: string | null
} {
  const match = /^(.*?)\s+(\d+)\s*([A-Za-z0-9\-\/ ]*)$/.exec(value.trim())
  if (!match) {
    return { street: textOrNull(value), house_number: null, house_number_addition: null }
  }

  return {
    street: textOrNull(match[1]),
    house_number: textOrNull(match[2]),
    house_number_addition: textOrNull(match[3]),
  }
}

function parsePostalCityLine(value: string): { postal_code: string | null; city: string | null } {
  const match = /^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/.exec(value.trim())
  if (!match) return { postal_code: null, city: textOrNull(value) }
  return {
    postal_code: match[1].replace(/\s+/g, ' ').toUpperCase(),
    city: textOrNull(match[2]),
  }
}

export function structuredAddressFromBody(
  body: Record<string, unknown>,
  fallbackAddress: string | null,
): StructuredAddressInput {
  const nested = body.address_selection && typeof body.address_selection === 'object'
    ? (body.address_selection as Record<string, unknown>)
    : body

  const formattedAddress = textOrNull(nested.formatted_address) || textOrNull(fallbackAddress)
  let street = textOrNull(nested.street)
  let houseNumber = textOrNull(nested.house_number)
  let houseNumberAddition = textOrNull(nested.house_number_addition)
  let postalCode = textOrNull(nested.postal_code)
  let city = textOrNull(nested.city)

  if (formattedAddress && (!street || !houseNumber || !postalCode || !city)) {
    const parts = formattedAddress.split(',').map((part) => part.trim()).filter(Boolean)
    const streetParts = parts[0] ? parseStreetLine(parts[0]) : null
    const cityParts = parts[1] ? parsePostalCityLine(parts[1]) : null
    street = street || streetParts?.street || null
    houseNumber = houseNumber || streetParts?.house_number || null
    houseNumberAddition = houseNumberAddition || streetParts?.house_number_addition || null
    postalCode = postalCode || cityParts?.postal_code || null
    city = city || cityParts?.city || null
  }

  return {
    street,
    house_number: houseNumber,
    house_number_addition: houseNumberAddition,
    postal_code: postalCode,
    city,
    country_code: normalizeCountryCode(nested.country_code) || 'NL',
    formatted_address: formattedAddress,
    geocode_provider: textOrNull(nested.geocode_provider) || 'nominatim',
  }
}

export function emptyStructuredAddressPatch() {
  return {
    street: null,
    house_number: null,
    house_number_addition: null,
    postal_code: null,
    city: null,
    country_code: null,
    formatted_address: null,
    geocode_provider: null,
    coordinates_source: 'legacy_unverified',
    coordinates_verified_at: null,
    coordinates_verified_by: null,
  }
}
