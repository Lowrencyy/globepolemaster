import { useEffect, useMemo, useState } from 'react'

type PsgcItem = {
  code: string
  name: string
  regionCode?: string
  provinceCode?: string
  cityCode?: string
}

type PsgcCascadeProps = {
  region: string
  province: string
  city: string
  barangay: string
  onChange: (updates: {
    region?: string
    province?: string
    city?: string
    barangay?: string
    barangay_code?: string
  }) => void
  inputClass?: string
  labelClass?: string
}

const PSGC_BASE = 'https://psgc.gitlab.io/api'

const defaultInputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-100'

const defaultLabelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`)
  }

  return res.json()
}

export default function PsgcCascade({
  region,
  province,
  city,
  barangay,
  onChange,
  inputClass = defaultInputClass,
  labelClass = defaultLabelClass,
}: PsgcCascadeProps) {
  const [regions, setRegions] = useState<PsgcItem[]>([])
  const [provinces, setProvinces] = useState<PsgcItem[]>([])
  const [cities, setCities] = useState<PsgcItem[]>([])
  const [barangays, setBarangays] = useState<PsgcItem[]>([])

  const [loadingRegions, setLoadingRegions] = useState(false)
  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingBarangays, setLoadingBarangays] = useState(false)

  const selectedRegion = useMemo(
    () => regions.find((item) => item.name === region),
    [regions, region]
  )

  const selectedProvince = useMemo(
    () => provinces.find((item) => item.name === province),
    [provinces, province]
  )

  const selectedCity = useMemo(
    () => cities.find((item) => item.name === city),
    [cities, city]
  )

  useEffect(() => {
    let cancelled = false

    const loadRegions = async () => {
      try {
        setLoadingRegions(true)
        const data = await fetchJson<PsgcItem[]>(`${PSGC_BASE}/regions/`)

        if (!cancelled) {
          setRegions(data)
        }
      } catch {
        if (!cancelled) {
          setRegions([])
        }
      } finally {
        if (!cancelled) {
          setLoadingRegions(false)
        }
      }
    }

    loadRegions()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProvinces = async () => {
      if (!selectedRegion?.code) {
        setProvinces([])
        return
      }

      try {
        setLoadingProvinces(true)
        const data = await fetchJson<PsgcItem[]>(
          `${PSGC_BASE}/regions/${selectedRegion.code}/provinces/`
        )

        if (!cancelled) {
          setProvinces(data)
        }
      } catch {
        if (!cancelled) {
          setProvinces([])
        }
      } finally {
        if (!cancelled) {
          setLoadingProvinces(false)
        }
      }
    }

    loadProvinces()

    return () => {
      cancelled = true
    }
  }, [selectedRegion?.code])

  useEffect(() => {
    let cancelled = false

    const loadCities = async () => {
      if (!selectedProvince?.code) {
        setCities([])
        return
      }

      try {
        setLoadingCities(true)
        const data = await fetchJson<PsgcItem[]>(
          `${PSGC_BASE}/provinces/${selectedProvince.code}/cities-municipalities/`
        )

        if (!cancelled) {
          setCities(data)
        }
      } catch {
        if (!cancelled) {
          setCities([])
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false)
        }
      }
    }

    loadCities()

    return () => {
      cancelled = true
    }
  }, [selectedProvince?.code])

  useEffect(() => {
    let cancelled = false

    const loadBarangays = async () => {
      if (!selectedCity?.code) {
        setBarangays([])
        return
      }

      try {
        setLoadingBarangays(true)
        const data = await fetchJson<PsgcItem[]>(
          `${PSGC_BASE}/cities-municipalities/${selectedCity.code}/barangays/`
        )

        if (!cancelled) {
          setBarangays(data)
        }
      } catch {
        if (!cancelled) {
          setBarangays([])
        }
      } finally {
        if (!cancelled) {
          setLoadingBarangays(false)
        }
      }
    }

    loadBarangays()

    return () => {
      cancelled = true
    }
  }, [selectedCity?.code])

  const handleRegionChange = (value: string) => {
    onChange({
      region: value,
      province: '',
      city: '',
      barangay: '',
    })
  }

  const handleProvinceChange = (value: string) => {
    onChange({
      province: value,
      city: '',
      barangay: '',
    })
  }

  const handleCityChange = (value: string) => {
    onChange({
      city: value,
      barangay: '',
    })
  }

  const handleBarangayChange = (value: string) => {
    const item = barangays.find(b => b.name === value)
    onChange({ barangay: value, barangay_code: item?.code ?? '' })
  }

  return (
    <>
      <div>
        <label className={labelClass}>Region</label>
        <select
          value={region}
          onChange={(e) => handleRegionChange(e.target.value)}
          className={inputClass}
          disabled={loadingRegions}
          required
        >
          <option value="">Select Region</option>
          {regions.map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Province</label>
        <select
          value={province}
          onChange={(e) => handleProvinceChange(e.target.value)}
          className={inputClass}
          disabled={!region || loadingProvinces}
          required
        >
          <option value="">Select Province</option>
          {provinces.map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>City / Municipality</label>
        <select
          value={city}
          onChange={(e) => handleCityChange(e.target.value)}
          className={inputClass}
          disabled={!province || loadingCities}
          required
        >
          <option value="">Select City / Municipality</option>
          {cities.map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Barangay</label>
        <select
          value={barangay}
          onChange={(e) => handleBarangayChange(e.target.value)}
          className={inputClass}
          disabled={!city || loadingBarangays}
          required
        >
          <option value="">Select Barangay</option>
          {barangays.map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}