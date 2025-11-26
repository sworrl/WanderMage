import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { trips as tripsApi, rvProfiles as rvApi } from '../services/api'
import TripCalendar from '../components/TripCalendar'

// State name to abbreviation mapping
const STATE_ABBREV: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI'
}

// Convert state name to abbreviation
const getStateAbbrev = (state: string): string => {
  if (!state) return ''
  if (state.length <= 2) return state.toUpperCase()
  const abbrev = STATE_ABBREV[state.toLowerCase()]
  return abbrev || state.toUpperCase()
}

// Custom marker icon for map selection
const selectMarkerIcon = L.divIcon({
  className: 'select-marker-icon',
  html: '<div style="width: 24px; height: 24px; background: var(--accent-primary); border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
})

interface Stop {
  id?: string // temp ID for frontend
  address: string
  city: string
  state: string
  zip_code: string
  latitude: string
  longitude: string
  stop_order: number
  stop_type: 'origin' | 'waypoint' | 'destination' // Type of stop
  is_overnight: boolean
  arrival_time: string
  departure_time: string
  arrival_tentative: boolean
  departure_tentative: boolean
  notes: string
  is_here_now: boolean // For starting location "Here Now" option
  display_address: string // Full formatted address for display
}

interface SearchResult {
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
  }
}

export default function TripForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditing = !!id
  const [rvProfiles, setRvProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(isEditing)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    start_date_tentative: false,
    end_date_tentative: false,
    status: 'planned',
    rv_profile_id: ''
  })

  const [stops, setStops] = useState<Stop[]>([])
  const [estimatedDistance, setEstimatedDistance] = useState(0)
  const [estimatedCost, setEstimatedCost] = useState({ low: 0, mid: 0, high: 0 })
  const [estimatedTime, setEstimatedTime] = useState(0)
  const [searchResults, setSearchResults] = useState<{[key: string]: SearchResult[]}>({})
  const [showSuggestions, setShowSuggestions] = useState<{[key: string]: boolean}>({})
  const [searchQuery, setSearchQuery] = useState<{[key: string]: string}>({})
  const searchTimeouts = useRef<{[key: string]: NodeJS.Timeout}>({})
  const suggestionRefs = useRef<{[key: string]: HTMLDivElement | null}>({})
  const [geolocating, setGeolocating] = useState<{[key: string]: boolean}>({})
  const [draggedStop, setDraggedStop] = useState<string | null>(null)

  // Map selection modal state
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [mapModalStopId, setMapModalStopId] = useState<string | null>(null)
  const [mapSelectedLocation, setMapSelectedLocation] = useState<{lat: number, lon: number, address?: string} | null>(null)
  const [mapModalLoading, setMapModalLoading] = useState(false)

  // Stop placement modal state
  const [placementModalOpen, setPlacementModalOpen] = useState(false)
  const [placementType, setPlacementType] = useState<'origin' | 'waypoint' | 'destination'>('waypoint')
  const [placementAfterStopId, setPlacementAfterStopId] = useState<string>('')

  useEffect(() => {
    loadRVProfiles()
    if (isEditing && id) {
      loadTrip(parseInt(id))
    }
  }, [id, isEditing])

  const loadTrip = async (tripId: number) => {
    try {
      const response = await tripsApi.getById(tripId)
      const trip = response.data

      // Format dates for input fields
      const formatDate = (dateStr: string | null) => {
        if (!dateStr) return ''
        return new Date(dateStr).toISOString().split('T')[0]
      }

      setFormData({
        name: trip.name || '',
        description: trip.description || '',
        start_date: formatDate(trip.start_date),
        end_date: formatDate(trip.end_date),
        start_date_tentative: trip.start_date_tentative || false,
        end_date_tentative: trip.end_date_tentative || false,
        status: trip.status || 'planned',
        rv_profile_id: trip.rv_profile_id?.toString() || ''
      })

      // Load stops
      if (trip.stops && trip.stops.length > 0) {
        const loadedStops = trip.stops.map((stop: any) => {
          // Build display address from components
          const displayParts = []
          if (stop.address) displayParts.push(stop.address)
          if (stop.city) displayParts.push(stop.city)
          if (stop.state) displayParts.push(stop.state)
          if (stop.zip_code) displayParts.push(stop.zip_code)
          const displayAddress = displayParts.join(', ')

          return {
            id: stop.id?.toString() || `temp-${Date.now()}-${Math.random()}`,
            address: stop.address || '',
            city: stop.city || '',
            state: stop.state || '',
            zip_code: stop.zip_code || '',
            latitude: stop.latitude?.toString() || '',
            longitude: stop.longitude?.toString() || '',
            stop_order: stop.stop_order || 1,
            stop_type: stop.stop_type || 'waypoint',
            is_overnight: stop.is_overnight || false,
            arrival_time: stop.arrival_time ? new Date(stop.arrival_time).toISOString().slice(0, 16) : '',
            departure_time: stop.departure_time ? new Date(stop.departure_time).toISOString().slice(0, 16) : '',
            arrival_tentative: stop.arrival_tentative || false,
            departure_tentative: stop.departure_tentative || false,
            notes: stop.notes || '',
            is_here_now: false,
            display_address: displayAddress
          }
        })
        setStops(loadedStops)
      }
    } catch (error) {
      console.error('Failed to load trip:', error)
      alert('Failed to load trip')
      navigate('/trips')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    calculateEstimates()
  }, [stops, formData.rv_profile_id])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedOutside = Object.keys(suggestionRefs.current).every(key => {
        const ref = suggestionRefs.current[key]
        return !ref || !ref.contains(event.target as Node)
      })

      if (clickedOutside) {
        setShowSuggestions({})
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadRVProfiles = async () => {
    try {
      const response = await rvApi.getAll()
      setRvProfiles(response.data)
      // Only set default RV profile when creating a new trip
      if (response.data.length > 0 && !isEditing) {
        setFormData(prev => ({ ...prev, rv_profile_id: response.data[0].id.toString() }))
      }
    } catch (error) {
      console.error('Failed to load RV profiles:', error)
    }
  }

  // Check if input looks like coordinates
  const parseCoordinates = (input: string): { lat: number, lon: number } | null => {
    // Match patterns like "38.054491, -91.5861774" or "38.054491 -91.5861774"
    const coordRegex = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/
    const match = input.trim().match(coordRegex)
    if (match) {
      const lat = parseFloat(match[1])
      const lon = parseFloat(match[2])
      // Validate reasonable lat/lon ranges
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon }
      }
    }
    return null
  }

  const searchAddress = async (query: string, stopId: string) => {
    if (query.length < 3) {
      setSearchResults(prev => ({ ...prev, [stopId]: [] }))
      return
    }

    // Check if user entered coordinates directly
    const coords = parseCoordinates(query)
    if (coords) {
      // Use reverse geocoding to get address info, but preserve exact coordinates
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'WanderMage-RV-App'
            }
          }
        )
        const data = await response.json()

        // Create a search result that preserves exact coordinates
        const result: SearchResult = {
          display_name: data.display_name || `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
          lat: coords.lat.toString(), // Use exact entered coordinates
          lon: coords.lon.toString(), // Use exact entered coordinates
          address: data.address || {}
        }

        setSearchResults(prev => ({ ...prev, [stopId]: [result] }))
        setShowSuggestions(prev => ({ ...prev, [stopId]: true }))
      } catch (error) {
        console.error('Reverse geocoding failed:', error)
        // Still create a result with just the coordinates
        const result: SearchResult = {
          display_name: `📍 ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
          lat: coords.lat.toString(),
          lon: coords.lon.toString(),
          address: {}
        }
        setSearchResults(prev => ({ ...prev, [stopId]: [result] }))
        setShowSuggestions(prev => ({ ...prev, [stopId]: true }))
      }
      return
    }

    try {
      // Parse and normalize the query for smarter searching
      const normalized = query.trim()

      // Common street type abbreviations to expand
      const streetTypes: { [key: string]: string } = {
        'ave': 'avenue',
        'dr': 'drive',
        'st': 'street',
        'rd': 'road',
        'blvd': 'boulevard',
        'ln': 'lane',
        'ct': 'court',
        'cir': 'circle',
        'way': 'way',
        'pl': 'place',
        'pkwy': 'parkway',
        'hwy': 'highway'
      }

      // Parse address components - handle flexible formatting
      // Supports: "105 339th Ave, Tonopah AZ" or "105 339th Ave Tonopah, AZ" or "105 339th Ave, Tonopah, AZ 85354"
      const addressPattern = /^(\d+\s+)?([^,\d]+?)[\s,]+([A-Za-z\s]+?)[\s,]+([A-Z]{2})[\s,]*(\d{5})?/
      const match = normalized.match(addressPattern)

      let streetNumber = ''
      let streetName = ''
      let city = ''
      let state = ''
      let zip = ''

      if (match) {
        streetNumber = (match[1] || '').trim()
        streetName = (match[2] || '').trim()
        city = (match[3] || '').trim()
        state = (match[4] || '').trim()
        zip = (match[5] || '').trim()
      } else {
        // Fallback: split by commas and try to parse
        const parts = normalized.split(/[,\s]+/).map(p => p.trim()).filter(p => p)
        if (parts.length >= 2) {
          // Try to identify state (2 letter caps)
          const stateIndex = parts.findIndex(p => /^[A-Z]{2}$/.test(p))
          if (stateIndex > 0) {
            state = parts[stateIndex]
            city = parts[stateIndex - 1]
            if (stateIndex > 1) {
              streetName = parts.slice(0, stateIndex - 1).join(' ')
              // Check if first part is a number
              if (/^\d+$/.test(parts[0])) {
                streetNumber = parts[0]
                streetName = parts.slice(1, stateIndex - 1).join(' ')
              }
            }
          } else {
            // Assume last part is state/city combo, rest is street
            city = parts[parts.length - 1]
            streetName = parts.slice(0, -1).join(' ')
          }
        }
      }

      // Generate query variations
      const searches = []
      const queryVariations = new Set<string>()

      // Add original query
      queryVariations.add(normalized)

      if (streetName && city && state) {
        // Try with expanded street type
        let expandedStreet = streetName
        Object.entries(streetTypes).forEach(([abbrev, full]) => {
          const regex = new RegExp(`\\b${abbrev}\\b`, 'gi')
          if (regex.test(streetName)) {
            expandedStreet = streetName.replace(regex, full)
          }
        })

        // Variation 1: Full address with expanded street type
        if (streetNumber) {
          queryVariations.add(`${streetNumber} ${expandedStreet}, ${city}, ${state}`)
          queryVariations.add(`${streetNumber} ${streetName}, ${city}, ${state}`)
        }

        // Variation 2: Street + city + state (no number)
        queryVariations.add(`${expandedStreet}, ${city}, ${state}`)
        queryVariations.add(`${streetName}, ${city}, ${state}`)

        // Variation 3: Just city and state (broader search)
        queryVariations.add(`${city}, ${state}`)

        // Variation 4: With ZIP if available
        if (zip) {
          if (streetNumber) {
            queryVariations.add(`${streetNumber} ${expandedStreet}, ${city}, ${state} ${zip}`)
          }
          queryVariations.add(`${city}, ${state} ${zip}`)
        }

        // Variation 5: Structured queries
        if (streetNumber && expandedStreet !== streetName) {
          searches.push(
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(streetNumber + ' ' + expandedStreet)}&city=${encodeURIComponent(city)}&state=${state}&addressdetails=1&limit=3&countrycodes=us`,
              { headers: { 'User-Agent': 'WanderMage-RV-App' } }
            )
          )
        }
      }

      // Create search requests for each variation
      queryVariations.forEach(q => {
        searches.push(
          fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=3&countrycodes=us`,
            { headers: { 'User-Agent': 'WanderMage-RV-App' } }
          )
        )
      })

      // Execute all searches in parallel
      const responses = await Promise.all(searches)
      const results = await Promise.all(responses.map(r => r.json()))

      // Combine and deduplicate results
      const allResults: SearchResult[] = []
      const seen = new Set<string>()

      for (const resultSet of results) {
        for (const result of resultSet) {
          const key = `${result.lat},${result.lon}`
          if (!seen.has(key)) {
            seen.add(key)
            allResults.push(result)
          }
        }
      }

      // Sort results - prefer more specific matches (with street address) over just city
      allResults.sort((a, b) => {
        const aHasStreet = a.address?.road ? 1 : 0
        const bHasStreet = b.address?.road ? 1 : 0
        return bHasStreet - aHasStreet
      })

      // If no results found, add a helper message
      if (allResults.length === 0) {
        allResults.push({
          display_name: `⚠️ No results found for "${query}". Try using the "🗺️ Select on Map" button instead.`,
          lat: '',
          lon: '',
          address: {}
        })
      }

      setSearchResults(prev => ({ ...prev, [stopId]: allResults.slice(0, 10) }))
      setShowSuggestions(prev => ({ ...prev, [stopId]: true }))
    } catch (error) {
      console.error('Address search failed:', error)
      setSearchResults(prev => ({ ...prev, [stopId]: [] }))
    }
  }

  const handleAddressSearch = (stopId: string, value: string) => {
    setSearchQuery(prev => ({ ...prev, [stopId]: value }))
    handleStopChange(stopId, 'address', value)

    if (searchTimeouts.current[stopId]) {
      clearTimeout(searchTimeouts.current[stopId])
    }

    searchTimeouts.current[stopId] = setTimeout(() => {
      searchAddress(value, stopId)
    }, 300)
  }

  const selectAddress = (stopId: string, result: SearchResult) => {
    // Don't allow selecting the "no results" helper message
    if (!result.lat || !result.lon) {
      return
    }

    const addressParts = []
    if (result.address.house_number) addressParts.push(result.address.house_number)
    if (result.address.road) addressParts.push(result.address.road)

    const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : result.display_name.split(',')[0]
    const city = result.address.city || result.address.town || result.address.village || ''
    const state = result.address.state || ''
    const zipCode = result.address.postcode || ''
    const stateAbbrev = getStateAbbrev(state)

    // Build display address
    const displayParts = []
    if (fullAddress) displayParts.push(fullAddress)
    if (city) displayParts.push(city)
    if (stateAbbrev) displayParts.push(stateAbbrev)
    if (zipCode) displayParts.push(zipCode)
    const displayAddress = displayParts.join(', ')

    const stop = stops.find(s => s.id === stopId)
    if (!stop) return

    const newStops = stops.map(s => s.id === stopId ? {
      ...s,
      address: fullAddress,
      city: city,
      state: stateAbbrev,
      zip_code: zipCode,
      latitude: result.lat,
      longitude: result.lon,
      display_address: displayAddress,
      is_here_now: false
    } : s)

    setStops(newStops)
    setShowSuggestions(prev => ({ ...prev, [stopId]: false }))
    setSearchQuery(prev => ({ ...prev, [stopId]: displayAddress }))
  }

  const useCurrentLocation = (stopId: string, isHereNow: boolean = false) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setGeolocating(prev => ({ ...prev, [stopId]: true }))

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'WanderMage-RV-App'
              }
            }
          )
          const data = await response.json()

          const addressParts = []
          if (data.address.house_number) addressParts.push(data.address.house_number)
          if (data.address.road) addressParts.push(data.address.road)

          const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : data.display_name.split(',')[0]
          const city = data.address.city || data.address.town || data.address.village || ''
          const state = data.address.state || ''
          const zipCode = data.address.postcode || ''
          const stateAbbrev = getStateAbbrev(state)

          // Build display address
          const displayParts = []
          if (fullAddress) displayParts.push(fullAddress)
          if (city) displayParts.push(city)
          if (stateAbbrev) displayParts.push(stateAbbrev)
          if (zipCode) displayParts.push(zipCode)
          const displayAddress = isHereNow ? `📍 Here Now - ${displayParts.join(', ')}` : displayParts.join(', ')

          const newStops = stops.map(s => s.id === stopId ? {
            ...s,
            address: fullAddress,
            city: city,
            state: stateAbbrev,
            zip_code: zipCode,
            latitude: lat.toString(),
            longitude: lon.toString(),
            display_address: displayAddress,
            is_here_now: isHereNow
          } : s)

          setStops(newStops)
          setSearchQuery(prev => ({ ...prev, [stopId]: displayAddress }))
        } catch (error) {
          console.error('Reverse geocoding failed:', error)
          const displayAddress = isHereNow ? '📍 Here Now (Location detected)' : 'Location detected'
          const newStops = stops.map(s => s.id === stopId ? {
            ...s,
            latitude: lat.toString(),
            longitude: lon.toString(),
            display_address: displayAddress,
            is_here_now: isHereNow
          } : s)
          setStops(newStops)
          setSearchQuery(prev => ({ ...prev, [stopId]: displayAddress }))
        }

        setGeolocating(prev => ({ ...prev, [stopId]: false }))
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Unable to get your location. Please check your browser permissions.')
        setGeolocating(prev => ({ ...prev, [stopId]: false }))
      }
    )
  }

  // Map modal functions
  const openMapModal = (stopId: string) => {
    setMapModalStopId(stopId)
    setMapSelectedLocation(null)
    setMapModalOpen(true)
  }

  const handleMapClick = async (lat: number, lon: number) => {
    setMapModalLoading(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'WanderMage-RV-App'
          }
        }
      )
      const data = await response.json()
      setMapSelectedLocation({
        lat,
        lon,
        address: data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`
      })
    } catch (error) {
      setMapSelectedLocation({
        lat,
        lon,
        address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`
      })
    }
    setMapModalLoading(false)
  }

  const confirmMapSelection = () => {
    if (!mapSelectedLocation || !mapModalStopId) return

    const lat = mapSelectedLocation.lat
    const lon = mapSelectedLocation.lon

    // Reverse geocode to get address details
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'WanderMage-RV-App'
        }
      }
    )
      .then(res => res.json())
      .then(data => {
        const addressParts = []
        if (data.address?.house_number) addressParts.push(data.address.house_number)
        if (data.address?.road) addressParts.push(data.address.road)

        const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : data.display_name?.split(',')[0] || ''
        const city = data.address?.city || data.address?.town || data.address?.village || ''
        const state = data.address?.state || ''
        const zipCode = data.address?.postcode || ''
        const stateAbbrev = getStateAbbrev(state)

        const displayParts = []
        if (fullAddress) displayParts.push(fullAddress)
        if (city) displayParts.push(city)
        if (stateAbbrev) displayParts.push(stateAbbrev)
        if (zipCode) displayParts.push(zipCode)
        const displayAddress = displayParts.join(', ')

        const newStops = stops.map(s => s.id === mapModalStopId ? {
          ...s,
          address: fullAddress,
          city: city,
          state: stateAbbrev,
          zip_code: zipCode,
          latitude: lat.toString(),
          longitude: lon.toString(),
          display_address: displayAddress,
          is_here_now: false
        } : s)

        setStops(newStops)
        setSearchQuery(prev => ({ ...prev, [mapModalStopId]: displayAddress }))
      })
      .catch(() => {
        // Even if reverse geocoding fails, save the coordinates
        const displayAddress = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
        const newStops = stops.map(s => s.id === mapModalStopId ? {
          ...s,
          latitude: lat.toString(),
          longitude: lon.toString(),
          display_address: displayAddress,
          is_here_now: false
        } : s)

        setStops(newStops)
        setSearchQuery(prev => ({ ...prev, [mapModalStopId]: displayAddress }))
      })

    setMapModalOpen(false)
    setMapSelectedLocation(null)
    setMapModalStopId(null)
  }

  // Map click handler component
  const MapClickHandler = ({ onClick }: { onClick: (lat: number, lon: number) => void }) => {
    useMapEvents({
      click: (e) => {
        onClick(e.latlng.lat, e.latlng.lng)
      }
    })
    return null
  }

  const calculateEstimates = () => {
    let totalDistance = 0
    const orderedStops = stops.filter(s => s.latitude && s.longitude).sort((a, b) => a.stop_order - b.stop_order)

    for (let i = 0; i < orderedStops.length - 1; i++) {
      const lat1 = parseFloat(orderedStops[i].latitude)
      const lon1 = parseFloat(orderedStops[i].longitude)
      const lat2 = parseFloat(orderedStops[i + 1].latitude)
      const lon2 = parseFloat(orderedStops[i + 1].longitude)

      if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
        const R = 3959
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLon = (lon2 - lon1) * Math.PI / 180
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        totalDistance += R * c
      }
    }

    setEstimatedDistance(totalDistance)

    if (formData.rv_profile_id) {
      const rv = rvProfiles.find(p => p.id.toString() === formData.rv_profile_id)
      if (rv && rv.avg_mpg && totalDistance > 0) {
        // Calculate fuel cost range based on MPG uncertainty and fuel price variance
        // MPG can vary ±15% based on driving conditions, terrain, weather, load
        const mpgLow = rv.avg_mpg * 0.85  // Worst case (heavy traffic, mountains, headwinds)
        const mpgHigh = rv.avg_mpg * 1.15 // Best case (highway, flat, tailwinds)

        // Fuel prices typically range $3.00 - $4.00/gallon
        const fuelPriceLow = 3.00
        const fuelPriceMid = 3.50
        const fuelPriceHigh = 4.00

        // Low estimate: best MPG, lowest fuel price
        const gallonsLow = totalDistance / mpgHigh
        const costLow = gallonsLow * fuelPriceLow

        // Mid estimate: average MPG, average fuel price
        const gallonsMid = totalDistance / rv.avg_mpg
        const costMid = gallonsMid * fuelPriceMid

        // High estimate: worst MPG, highest fuel price
        const gallonsHigh = totalDistance / mpgLow
        const costHigh = gallonsHigh * fuelPriceHigh

        setEstimatedCost({ low: costLow, mid: costMid, high: costHigh })
      } else {
        setEstimatedCost({ low: 0, mid: 0, high: 0 })
      }
    } else {
      setEstimatedCost({ low: 0, mid: 0, high: 0 })
    }

    if (totalDistance > 0) {
      const hours = totalDistance / 55
      setEstimatedTime(hours)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, type } = e.target
    const value = type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setFormData({
      ...formData,
      [name]: value
    })
  }

  const handleStopChange = (stopId: string, field: string, value: any) => {
    const newStops = stops.map(stop =>
      stop.id === stopId ? { ...stop, [field]: value } : stop
    )
    setStops(newStops)
  }

  const addStop = () => {
    // If no stops yet, add directly as origin
    if (stops.length === 0) {
      const newStop: Stop = {
        id: `temp-${Date.now()}-${Math.random()}`,
        address: '',
        city: '',
        state: '',
        zip_code: '',
        latitude: '',
        longitude: '',
        stop_order: 1,
        stop_type: 'origin',
        is_overnight: false,
        arrival_time: '',
        departure_time: '',
        arrival_tentative: false,
        departure_tentative: false,
        notes: '',
        is_here_now: false,
        display_address: ''
      }
      setStops([newStop])
      return
    }

    // Show placement modal
    setPlacementType('waypoint')
    setPlacementAfterStopId(stops[stops.length - 1]?.id || '')
    setPlacementModalOpen(true)
  }

  const confirmAddStop = () => {
    const newStop: Stop = {
      id: `temp-${Date.now()}-${Math.random()}`,
      address: '',
      city: '',
      state: '',
      zip_code: '',
      latitude: '',
      longitude: '',
      stop_order: 0, // Will be set below
      stop_type: placementType,
      is_overnight: false,
      arrival_time: '',
      departure_time: '',
      arrival_tentative: false,
      departure_tentative: false,
      notes: '',
      is_here_now: false,
      display_address: ''
    }

    let newStops = [...stops]

    if (placementType === 'origin') {
      // Insert at beginning, update all other stops
      newStop.stop_order = 1
      // Change existing origin to waypoint if there is one
      newStops = newStops.map(s => s.stop_type === 'origin' ? { ...s, stop_type: 'waypoint' as const } : s)
      newStops.unshift(newStop)
    } else if (placementType === 'destination') {
      // Insert at end, update any existing destination to waypoint
      newStops = newStops.map(s => s.stop_type === 'destination' ? { ...s, stop_type: 'waypoint' as const } : s)
      newStop.stop_order = newStops.length + 1
      newStops.push(newStop)
    } else {
      // Waypoint - insert after selected stop
      if (placementAfterStopId) {
        const afterIndex = newStops.findIndex(s => s.id === placementAfterStopId)
        if (afterIndex !== -1) {
          newStop.stop_order = afterIndex + 2
          newStops.splice(afterIndex + 1, 0, newStop)
        } else {
          newStop.stop_order = newStops.length + 1
          newStops.push(newStop)
        }
      } else {
        // No stop selected, add at end
        newStop.stop_order = newStops.length + 1
        newStops.push(newStop)
      }
    }

    // Renumber all stops
    newStops.forEach((stop, i) => {
      stop.stop_order = i + 1
    })

    setStops(newStops)
    setPlacementModalOpen(false)
  }

  const removeStop = (stopId: string) => {
    const newStops = stops.filter(s => s.id !== stopId)
    newStops.forEach((stop, i) => {
      stop.stop_order = i + 1
    })
    setStops(newStops)
  }

  const handleDragStart = (e: React.DragEvent, stopId: string) => {
    setDraggedStop(stopId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetStopId: string) => {
    e.preventDefault()
    if (!draggedStop || draggedStop === targetStopId) return

    const draggedIndex = stops.findIndex(s => s.id === draggedStop)
    const targetIndex = stops.findIndex(s => s.id === targetStopId)

    const newStops = [...stops]
    const [removed] = newStops.splice(draggedIndex, 1)
    newStops.splice(targetIndex, 0, removed)

    newStops.forEach((stop, i) => {
      stop.stop_order = i + 1
    })

    setStops(newStops)
    setDraggedStop(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (stops.length === 0) {
      alert('Please add at least one stop to your trip.')
      return
    }

    // Validate all stops have coordinates
    const invalidStops = stops.filter(stop => {
      const lat = parseFloat(stop.latitude)
      const lon = parseFloat(stop.longitude)
      return isNaN(lat) || isNaN(lon)
    })

    if (invalidStops.length > 0) {
      const stopNumbers = invalidStops.map((_, i) =>
        stops.indexOf(invalidStops[i]) + 1
      ).join(', ')
      alert(`Please select a valid address for stop(s): ${stopNumbers}. Use the search dropdown or location button.`)
      return
    }

    try {
      let tripId: number

      if (isEditing && id) {
        // Update existing trip
        await tripsApi.update(parseInt(id), {
          ...formData,
          rv_profile_id: parseInt(formData.rv_profile_id) || null
        })
        tripId = parseInt(id)

        // Delete existing stops and recreate them
        // (simpler than tracking individual stop updates)
        const existingTrip = await tripsApi.getById(tripId)
        for (const existingStop of existingTrip.data.stops || []) {
          try {
            await tripsApi.deleteStop(tripId, existingStop.id)
          } catch (e) {
            // Ignore deletion errors
          }
        }
      } else {
        // Create new trip
        const tripResponse = await tripsApi.create({
          ...formData,
          rv_profile_id: parseInt(formData.rv_profile_id) || null
        })
        tripId = tripResponse.data.id
      }

      // Add all stops
      for (const stop of stops) {
        // Build a meaningful name for the stop
        let stopName = stop.address
        if (!stopName && stop.city) {
          stopName = stop.state ? `${stop.city}, ${stop.state}` : stop.city
        }
        if (!stopName) {
          stopName = `Stop ${stop.stop_order}`
        }

        await tripsApi.addStop(tripId, {
          name: stopName,
          address: stop.address || undefined,
          city: stop.city || undefined,
          state: stop.state || undefined,
          zip_code: stop.zip_code || undefined,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude),
          stop_order: stop.stop_order,
          stop_type: stop.stop_type || 'waypoint',
          is_overnight: stop.is_overnight,
          arrival_time: stop.arrival_time || null,
          departure_time: stop.departure_time || null,
          arrival_tentative: stop.arrival_tentative,
          departure_tentative: stop.departure_tentative,
          notes: stop.notes || undefined
        })
      }

      navigate(`/trips/${tripId}`)
    } catch (error) {
      console.error('Failed to save trip:', error)
      alert(`Failed to ${isEditing ? 'update' : 'create'} trip. Please check all fields.`)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ padding: '40px' }}>
        <div>Loading trip data...</div>
      </div>
    )
  }

  return (
    <div>
      <h1>{isEditing ? 'Edit Trip' : 'Plan New Trip'}</h1>

      <div className="card mb-4" style={{ background: 'var(--card-bg)', borderLeft: '4px solid var(--accent-primary)' }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontSize: '14px' }}>
          <strong>💡 Flexible Planning:</strong> Add stops in any order! You can:
          <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
            <li>Start with just a departure date (mark it tentative if unsure)</li>
            <li>Add stops you've already booked with specific dates</li>
            <li>Fill in details as you plan</li>
            <li>Drag and drop stops to reorder them</li>
          </ul>
        </div>
      </div>

      <div className="card mb-4" style={{ background: 'var(--accent-primary)', opacity: 0.1 }}>
        <h3>Trip Estimates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '15px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Estimated Distance</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {estimatedDistance.toFixed(0)} mi
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Estimated Fuel Cost</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {estimatedCost.mid > 0 ? (
                <>
                  ${estimatedCost.low.toFixed(0)} - ${estimatedCost.high.toFixed(0)}
                  <div style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)', marginTop: '2px' }}>
                    ~${estimatedCost.mid.toFixed(0)} avg
                  </div>
                </>
              ) : (
                '$0'
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Estimated Time</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {estimatedTime.toFixed(1)} hrs
            </div>
          </div>
        </div>
        <p style={{ marginTop: '15px', fontSize: '13px', color: 'var(--text-muted)' }}>
          * Estimates based on straight-line distances. Drag stops to reorder your route.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <h2>Trip Details</h2>

          <div className="grid grid-2" style={{ marginTop: '20px' }}>
            <div className="form-group">
              <label className="label">Trip Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="input"
                placeholder="e.g., Missouri to Arizona Adventure"
              />
            </div>

            <div className="form-group">
              <label className="label">RV Profile</label>
              <select
                name="rv_profile_id"
                value={formData.rv_profile_id}
                onChange={handleChange}
                className="input"
              >
                <option value="">Select RV</option>
                {rvProfiles.map(rv => (
                  <option key={rv.id} value={rv.id}>{rv.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="label">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className="input"
              />
              <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  name="start_date_tentative"
                  checked={formData.start_date_tentative}
                  onChange={handleChange}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>📅 Tentative (not confirmed yet)</span>
              </label>
            </div>

            <div className="form-group">
              <label className="label">End Date (Optional)</label>
              <input
                type="date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                className="input"
              />
              <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  name="end_date_tentative"
                  checked={formData.end_date_tentative}
                  onChange={handleChange}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>📅 Tentative</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input"
              rows={3}
              placeholder="Describe your trip..."
            />
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2>Trip Stops ({stops.length})</h2>
            <button type="button" onClick={addStop} className="btn btn-primary">
              ➕ Add Stop
            </button>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            ↕️ Drag stops to reorder them. Add dates to stops you've already booked.
          </p>

          {stops.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-tertiary)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
                No stops yet. Click "Add Stop" to start planning your route!
              </p>
            </div>
          )}

          {stops.map((stop, index) => (
            <div
              key={stop.id}
              draggable
              onDragStart={(e) => handleDragStart(e, stop.id!)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stop.id!)}
              className="card"
              style={{
                marginBottom: '15px',
                background: 'var(--card-bg)',
                border: '2px solid var(--border-color)',
                position: 'relative',
                cursor: 'move',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              <div className="flex justify-between items-center mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px', cursor: 'move' }}>☰</span>
                  <h3>{index === 0 ? '🚀 Starting Location' : `📍 Stop ${index + 1}`}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => removeStop(stop.id!)}
                  className="btn btn-danger"
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  ✕ Remove
                </button>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <div className="flex justify-between items-center mb-2">
                  <label className="label">Location</label>
                  <div className="flex gap-2">
                    {index === 0 && (
                      <button
                        type="button"
                        onClick={() => useCurrentLocation(stop.id!, true)}
                        className="btn btn-primary"
                        disabled={geolocating[stop.id!]}
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        {geolocating[stop.id!] ? 'Detecting...' : '📍 Here Now'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => useCurrentLocation(stop.id!, false)}
                      className="btn btn-secondary"
                      disabled={geolocating[stop.id!]}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      {geolocating[stop.id!] ? 'Detecting...' : '📍 Use Location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMapModal(stop.id!)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      🗺️ Select on Map
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={searchQuery[stop.id!] || stop.display_address || stop.address}
                  onChange={(e) => handleAddressSearch(stop.id!, e.target.value)}
                  onFocus={() => {
                    if (searchResults[stop.id!]?.length > 0) {
                      setShowSuggestions(prev => ({ ...prev, [stop.id!]: true }))
                    }
                  }}
                  className="input"
                  placeholder="Search address or use map/location buttons above..."
                />
                {showSuggestions[stop.id!] && searchResults[stop.id!]?.length > 0 && (
                  <div
                    ref={(el) => suggestionRefs.current[stop.id!] = el}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 2px 8px var(--shadow)'
                    }}
                  >
                    {searchResults[stop.id!].map((result, i) => {
                      const isHelperMessage = !result.lat || !result.lon
                      return (
                        <div
                          key={i}
                          onClick={() => selectAddress(stop.id!, result)}
                          style={{
                            padding: '10px',
                            cursor: isHelperMessage ? 'default' : 'pointer',
                            borderBottom: i < searchResults[stop.id!].length - 1 ? '1px solid var(--border-color)' : 'none',
                            fontSize: '14px',
                            color: isHelperMessage ? 'var(--text-muted)' : 'var(--text-primary)',
                            background: isHelperMessage ? 'var(--bg-tertiary)' : 'var(--card-bg)',
                            fontStyle: isHelperMessage ? 'italic' : 'normal'
                          }}
                          onMouseEnter={(e) => {
                            if (!isHelperMessage) {
                              e.currentTarget.style.background = 'var(--bg-secondary)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isHelperMessage) {
                              e.currentTarget.style.background = 'var(--card-bg)'
                            }
                          }}
                        >
                          {result.display_name}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-2">
                <div className="form-group">
                  <label className="label">Arrival Date/Time</label>
                  <input
                    type="datetime-local"
                    value={stop.arrival_time}
                    onChange={(e) => handleStopChange(stop.id!, 'arrival_time', e.target.value)}
                    className="input"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={stop.arrival_tentative}
                      onChange={(e) => handleStopChange(stop.id!, 'arrival_tentative', e.target.checked)}
                      style={{ marginRight: '6px' }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>Tentative</span>
                  </label>
                </div>
                <div className="form-group">
                  <label className="label">Departure Date/Time</label>
                  <input
                    type="datetime-local"
                    value={stop.departure_time}
                    onChange={(e) => handleStopChange(stop.id!, 'departure_time', e.target.value)}
                    className="input"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={stop.departure_tentative}
                      onChange={(e) => handleStopChange(stop.id!, 'departure_tentative', e.target.checked)}
                      style={{ marginRight: '6px' }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>Tentative</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="label">
                  <input
                    type="checkbox"
                    checked={stop.is_overnight}
                    onChange={(e) => handleStopChange(stop.id!, 'is_overnight', e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  🌙 Overnight Stop
                </label>
              </div>

              {stop.latitude && stop.longitude && (
                <div style={{
                  background: 'var(--accent-primary)',
                  opacity: 0.15,
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginTop: '10px',
                  color: 'var(--text-primary)'
                }}>
                  <strong>📍 Coordinates:</strong> {parseFloat(stop.latitude).toFixed(6)}, {parseFloat(stop.longitude).toFixed(6)}
                </div>
              )}

              <div className="form-group">
                <label className="label">Notes</label>
                <textarea
                  value={stop.notes}
                  onChange={(e) => handleStopChange(stop.id!, 'notes', e.target.value)}
                  className="input"
                  rows={2}
                  placeholder="Reservation details, confirmation numbers, special notes..."
                />
              </div>
            </div>
          ))}
        </div>

        {/* Calendar View */}
        {formData.start_date && (
          <TripCalendar
            startDate={formData.start_date}
            endDate={formData.end_date || formData.start_date}
            startDateTentative={formData.start_date_tentative}
            endDateTentative={formData.end_date_tentative}
            stops={stops.map(stop => ({
              ...stop,
              name: `${stop.city}, ${stop.state}`
            }))}
          />
        )}

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            {isEditing ? '💾 Save Changes' : '🚀 Create Trip'}
          </button>
          <button type="button" onClick={() => navigate('/trips')} className="btn btn-secondary">
            Cancel
          </button>
        </div>
      </form>

      {/* Stop Placement Modal */}
      {placementModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPlacementModalOpen(false)
            }
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '450px',
              border: '1px solid var(--border-color)'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Add Stop</h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Stop Type
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPlacementType('origin')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: `2px solid ${placementType === 'origin' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: placementType === 'origin' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: placementType === 'origin' ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Origin
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementType('waypoint')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: `2px solid ${placementType === 'waypoint' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: placementType === 'waypoint' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: placementType === 'waypoint' ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Waypoint
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementType('destination')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: `2px solid ${placementType === 'destination' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: placementType === 'destination' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: placementType === 'destination' ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Destination
                </button>
              </div>
            </div>

            {placementType === 'waypoint' && stops.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Insert After
                </label>
                <select
                  value={placementAfterStopId}
                  onChange={(e) => setPlacementAfterStopId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  {stops.map((stop, idx) => (
                    <option key={stop.id} value={stop.id}>
                      Stop {idx + 1}: {stop.display_address || stop.city || stop.address || `Unnamed`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
              {placementType === 'origin' && 'This will be the starting point of your trip. Any existing origin will become a waypoint.'}
              {placementType === 'waypoint' && 'A waypoint is an intermediate stop along your route.'}
              {placementType === 'destination' && 'This will be the final destination of your trip. Any existing destination will become a waypoint.'}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPlacementModalOpen(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddStop}
                className="btn btn-primary"
              >
                Add Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Selection Modal */}
      {mapModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMapModalOpen(false)
              setMapSelectedLocation(null)
            }
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '90vh',
              overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Select Location on Map</h3>
              <button
                onClick={() => {
                  setMapModalOpen(false)
                  setMapSelectedLocation(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '15px' }}>
              Click anywhere on the map to select a location
            </p>

            <div style={{ height: '400px', borderRadius: '8px', overflow: 'hidden', marginBottom: '15px' }}>
              <MapContainer
                center={[39.8283, -98.5795]}
                zoom={4}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapClickHandler onClick={handleMapClick} />
                {mapSelectedLocation && (
                  <Marker
                    position={[mapSelectedLocation.lat, mapSelectedLocation.lon]}
                    icon={selectMarkerIcon}
                  />
                )}
              </MapContainer>
            </div>

            {mapSelectedLocation && (
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '15px'
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Selected Location:
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                  {mapModalLoading ? 'Loading address...' : mapSelectedLocation.address}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {mapSelectedLocation.lat.toFixed(6)}, {mapSelectedLocation.lon.toFixed(6)}
                </div>
              </div>
            )}

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setMapModalOpen(false)
                  setMapSelectedLocation(null)
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmMapSelection}
                className="btn btn-primary"
                disabled={!mapSelectedLocation || mapModalLoading}
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
