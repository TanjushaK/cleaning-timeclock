import fs from 'node:fs'

const path = 'app/admin/page.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`)
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`)
  }
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

replaceOnce(
  "  lat: number\n  lng: number\n}",
  "  lat: number\n  lng: number\n  geocode_provider: 'pdok' | 'nominatim'\n}",
  'address suggestion provider type',
)

replaceOnce(
  "  const [newObjLng, setNewObjLng] = useState<number | null>(null)\n  const [newObjRadius, setNewObjRadius] = useState('150')",
  "  const [newObjLng, setNewObjLng] = useState<number | null>(null)\n  const [newObjAddressSelection, setNewObjAddressSelection] = useState<AddressSuggestion | null>(null)\n  const [newObjRadius, setNewObjRadius] = useState('150')",
  'new site address selection state',
)

replaceOnce(
  "  const [siteCardAddressConfirmed, setSiteCardAddressConfirmed] = useState(false)\n  const [siteCardPhotos, setSiteCardPhotos] = useState<SitePhoto[]>([])",
  "  const [siteCardAddressConfirmed, setSiteCardAddressConfirmed] = useState(false)\n  const [siteCardAddressSelection, setSiteCardAddressSelection] = useState<AddressSuggestion | null>(null)\n  const [siteCardPhotos, setSiteCardPhotos] = useState<SitePhoto[]>([])",
  'site card address selection state',
)

replaceOnce(
  "    setSiteCardAddressConfirmed(Boolean(String(s.address || '').trim() && s.lat != null && s.lng != null))\n    setSiteCardPhotos",
  "    setSiteCardAddressConfirmed(Boolean(String(s.address || '').trim() && s.lat != null && s.lng != null))\n    setSiteCardAddressSelection(null)\n    setSiteCardPhotos",
  'clear site card selection on open',
)

replaceOnce(
  "    setNewObjLng(null)\n    setNewObjRadius('150')",
  "    setNewObjLng(null)\n    setNewObjAddressSelection(null)\n    setNewObjRadius('150')",
  'clear new site selection on open',
)

replaceOnce(
  "          address_confirmed: true,\n          radius,",
  "          address_confirmed: true,\n          address_selection: newObjAddressSelection,\n          radius,",
  'create payload metadata',
)

replaceOnce(
  "      setNewObjLng(null)\n      setNewObjRadius('150')",
  "      setNewObjLng(null)\n      setNewObjAddressSelection(null)\n      setNewObjRadius('150')",
  'clear new site selection after save',
)

replaceOnce(
  "          address_confirmed: true,\n          radius,\n          lat,",
  "          address_confirmed: true,\n          address_selection: siteCardAddressSelection || undefined,\n          radius,\n          lat,",
  'update payload metadata',
)

replaceOnce(
  "                                setNewObjLat(null)\n                                setNewObjLng(null)\n                              }}",
  "                                setNewObjLat(null)\n                                setNewObjLng(null)\n                                setNewObjAddressSelection(null)\n                              }}",
  'clear new site selection on typing',
)

replaceOnce(
  "                                setNewObjLat(suggestion.lat)\n                                setNewObjLng(suggestion.lng)\n                              }}",
  "                                setNewObjLat(suggestion.lat)\n                                setNewObjLng(suggestion.lng)\n                                setNewObjAddressSelection(suggestion)\n                              }}",
  'store new site selection',
)

replaceOnce(
  "                                    setSiteCardLat('')\n                                    setSiteCardLng('')\n                                  }}",
  "                                    setSiteCardLat('')\n                                    setSiteCardLng('')\n                                    setSiteCardAddressSelection(null)\n                                  }}",
  'clear site card selection on typing',
)

replaceOnce(
  "                                    setSiteCardLat(String(suggestion.lat))\n                                    setSiteCardLng(String(suggestion.lng))\n                                  }}",
  "                                    setSiteCardLat(String(suggestion.lat))\n                                    setSiteCardLng(String(suggestion.lng))\n                                    setSiteCardAddressSelection(suggestion)\n                                  }}",
  'store site card selection',
)

fs.writeFileSync(path, source)
console.log('Applied site address selection metadata patch')
