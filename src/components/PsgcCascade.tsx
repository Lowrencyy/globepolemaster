import { useState, useEffect } from 'react'

const BASE = 'https://psgc.gitlab.io/api'

interface PsgcItem { code: string; name: string }

interface Props {
  region: string
  province: string
  city: string
  barangay: string
  onChange: (updates: Partial<{ region: string; province: string; city: string; barangay: string }>) => void
  inputClass: string
  labelClass?: string
}

function useFetch(url: string | null) {
  const [items, setItems] = useState<PsgcItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!url) { setItems([]); return }
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then((data: PsgcItem[]) => {
        if (!cancelled) setItems(data.sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  return { items, loading }
}

export default function PsgcCascade({ region, province, city, barangay, onChange, inputClass, labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-zinc-200' }: Props) {
  const [regionCode, setRegionCode]     = useState('')
  const [provinceCode, setProvinceCode] = useState('')
  const [cityCode, setCityCode]         = useState('')
  const [noProvinces, setNoProvinces]   = useState(false)

  const regions   = useFetch(`${BASE}/regions/`)
  const provinces = useFetch(regionCode ? `${BASE}/regions/${regionCode}/provinces/` : null)

  const citiesUrl = regionCode
    ? (noProvinces
        ? `${BASE}/regions/${regionCode}/cities-municipalities/`
        : provinceCode
          ? `${BASE}/provinces/${provinceCode}/cities-municipalities/`
          : null)
    : null

  const cities    = useFetch(citiesUrl)
  const barangays = useFetch(cityCode ? `${BASE}/cities-municipalities/${cityCode}/barangays/` : null)

  // Auto-resolve regionCode from name on initial load or when regions list arrives
  useEffect(() => {
    if (!regions.items.length || !region) return
    if (regionCode) return // already resolved
    const match = regions.items.find(r => r.name === region)
    if (match) setRegionCode(match.code)
  }, [regions.items, region, regionCode])

  // Detect NCR-like regions (no provinces)
  useEffect(() => {
    if (!regionCode || provinces.loading) return
    setNoProvinces(provinces.items.length === 0)
  }, [regionCode, provinces.items, provinces.loading])

  // Auto-resolve provinceCode from name
  useEffect(() => {
    if (!provinces.items.length || !province) return
    if (provinceCode) return
    const match = provinces.items.find(p => p.name === province)
    if (match) setProvinceCode(match.code)
  }, [provinces.items, province, provinceCode])

  // Auto-resolve cityCode from name
  useEffect(() => {
    if (!cities.items.length || !city) return
    if (cityCode) return
    const match = cities.items.find(c => c.name === city)
    if (match) setCityCode(match.code)
  }, [cities.items, city, cityCode])

  const handleRegion = (code: string, name: string) => {
    setRegionCode(code)
    setProvinceCode('')
    setCityCode('')
    setNoProvinces(false)
    onChange({ region: name, province: '', city: '', barangay: '' })
  }

  const handleProvince = (code: string, name: string) => {
    setProvinceCode(code)
    setCityCode('')
    onChange({ province: name, city: '', barangay: '' })
  }

  const handleCity = (code: string, name: string) => {
    setCityCode(code)
    onChange({ city: name, barangay: '' })
  }

  const sel = `${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`

  return (
    <>
      {/* Region */}
      <div>
        <label className={labelClass}>Region</label>
        <select
          value={regionCode}
          onChange={e => {
            const opt = regions.items.find(r => r.code === e.target.value)
            if (opt) handleRegion(opt.code, opt.name)
          }}
          className={sel}
          required
        >
          <option value="">{regions.loading ? 'Loading regions…' : 'Select Region'}</option>
          {regions.items.map(r => (
            <option key={r.code} value={r.code}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Province */}
      <div>
        <label className={labelClass}>Province</label>
        <select
          value={provinceCode}
          onChange={e => {
            const opt = provinces.items.find(p => p.code === e.target.value)
            if (opt) handleProvince(opt.code, opt.name)
          }}
          disabled={!regionCode || noProvinces}
          className={sel}
          required={!noProvinces}
        >
          <option value="">
            {!regionCode
              ? 'Select Region first'
              : noProvinces
                ? 'No provinces (NCR)'
                : provinces.loading
                  ? 'Loading provinces…'
                  : 'Select Province'}
          </option>
          {provinces.items.map(p => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* City / Municipality */}
      <div>
        <label className={labelClass}>City / Municipality</label>
        <select
          value={cityCode}
          onChange={e => {
            const opt = cities.items.find(c => c.code === e.target.value)
            if (opt) handleCity(opt.code, opt.name)
          }}
          disabled={!regionCode || (!noProvinces && !provinceCode)}
          className={sel}
          required
        >
          <option value="">
            {!regionCode
              ? 'Select Region first'
              : (!noProvinces && !provinceCode)
                ? 'Select Province first'
                : cities.loading
                  ? 'Loading cities…'
                  : 'Select City / Municipality'}
          </option>
          {cities.items.map(c => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Barangay */}
      <div>
        <label className={labelClass}>Barangay</label>
        <select
          value={barangay}
          onChange={e => onChange({ barangay: e.target.value })}
          disabled={!cityCode}
          className={sel}
          required
        >
          <option value="">
            {!cityCode ? 'Select City first' : barangays.loading ? 'Loading barangays…' : 'Select Barangay'}
          </option>
          {barangays.items.map(b => (
            <option key={b.code} value={b.name}>{b.name}</option>
          ))}
        </select>
      </div>
    </>
  )
}
