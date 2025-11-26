/**
 * Nominatim API utilities with retry logic and error handling
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000 // 2 seconds between retries

export interface NominatimSearchResult {
  display_name: string
  lat: string
  lon: string
  address: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
    country?: string
  }
}

export interface NominatimReverseResult {
  display_name: string
  address: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
    country?: string
  }
}

// Callback for status updates
type StatusCallback = (status: string) => void

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Search for addresses with retry logic
 */
export async function searchAddress(
  query: string,
  onStatus?: StatusCallback
): Promise<NominatimSearchResult[]> {
  if (query.length < 3) return []

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=8&countrycodes=us`,
        {
          headers: { 'User-Agent': 'WanderMage-RV-App' }
        }
      )

      if (response.status === 503) {
        if (attempt < MAX_RETRIES) {
          onStatus?.(`Service busy, retrying (${attempt}/${MAX_RETRIES})...`)
          await sleep(RETRY_DELAY_MS)
          continue
        }
        throw new Error('Geocoding service is temporarily unavailable. Please try again.')
      }

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`)
      }

      const data = await response.json()
      onStatus?.('')
      return data
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('Address search failed after retries:', error)
        throw error
      }
      onStatus?.(`Request failed, retrying (${attempt}/${MAX_RETRIES})...`)
      await sleep(RETRY_DELAY_MS)
    }
  }

  return []
}

/**
 * Reverse geocode coordinates with retry logic
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  onStatus?: StatusCallback
): Promise<NominatimReverseResult | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
        {
          headers: { 'User-Agent': 'WanderMage-RV-App' }
        }
      )

      if (response.status === 503) {
        if (attempt < MAX_RETRIES) {
          onStatus?.(`Service busy, retrying (${attempt}/${MAX_RETRIES})...`)
          await sleep(RETRY_DELAY_MS)
          continue
        }
        throw new Error('Geocoding service is temporarily unavailable. Please try again.')
      }

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed: ${response.statusText}`)
      }

      const data = await response.json()
      onStatus?.('')
      return data
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('Reverse geocode failed after retries:', error)
        throw error
      }
      onStatus?.(`Request failed, retrying (${attempt}/${MAX_RETRIES})...`)
      await sleep(RETRY_DELAY_MS)
    }
  }

  return null
}
