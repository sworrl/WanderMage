import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { trips as tripsApi, rvProfiles as rvApi } from '../services/api'
import { searchAddress as nominatimSearch, reverseGeocode } from '../utils/nominatim'
import { safeStorage } from '../utils/storage'

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
  // If already an abbreviation (2 chars), return uppercase
  if (state.length <= 2) return state.toUpperCase()
  // Look up in mapping
  const abbrev = STATE_ABBREV[state.toLowerCase()]
  return abbrev || state.toUpperCase()
}

interface LocationData {
  name: string
  address?: string
  city?: string
  state?: string
  latitude: number
  longitude: number
  // Harvest Hosts specific fields
  source?: string
  source_url?: string
  source_id?: string
  max_rig_size?: string
  parking_spaces?: number
  parking_surface?: string
  check_in_time?: string
  check_out_time?: string
  parking_instructions?: string
  host_support_info?: string
  amenities?: string
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

interface DistanceBubble {
  radius_miles: number
  label: string
}

interface SuggestedStop {
  day: number
  name: string
  latitude: number
  longitude: number
  miles_from_start: number
  miles_this_segment: number
  city?: string
  state?: string
  is_overnight: boolean
  needs_user_selection?: boolean
  search_radius_miles?: number
  distance_bubbles?: {
    '15_min': DistanceBubble
    '30_min': DistanceBubble
    '60_min': DistanceBubble
  }
  suggested_sources?: string[]
}

interface GapSuggestion {
  from_stop: string
  to_stop: string
  segment_distance: number
  max_daily_distance: number
  suggested_area: string
  suggested_latitude: number
  suggested_longitude: number
  city?: string
  state?: string
  reason: string
  search_radius_miles: number
}

interface FuelEstimate {
  total_gallons: number
  avg_price_per_gallon: number
  estimated_cost: number
  avg_mpg: number
  fuel_type: string
  num_fill_ups: number
}

interface TripPlan {
  total_distance_miles: number
  total_duration_hours?: number
  estimated_days: number
  estimated_arrival: string
  suggested_stops: SuggestedStop[]
  gap_suggestions?: GapSuggestion[]
  fuel_estimate?: FuelEstimate
}

export default function TripPlanWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rvProfiles, setRvProfiles] = useState<any[]>([])

  // Form data
  const [tripName, setTripName] = useState('')
  const [tripDescription, setTripDescription] = useState('')
  const [startLocation, setStartLocation] = useState<LocationData | null>(null)
  const [destLocation, setDestLocation] = useState<LocationData | null>(null)
  const [tripType, setTripType] = useState<'one_way' | 'round_trip'>('one_way')
  const [departureDate, setDepartureDate] = useState('')
  const [departureTime, setDepartureTime] = useState('09:00')
  const [arrivalType, setArrivalType] = useState<'flexible' | 'specific'>('flexible')
  const [arrivalDate, setArrivalDate] = useState('')
  const [dailyMilesTarget, setDailyMilesTarget] = useState(300)
  const [maxDrivingHours, setMaxDrivingHours] = useState(8)
  const [rvProfileId, setRvProfileId] = useState<number | null>(null)

  // Route preference state
  const [routePreference, setRoutePreference] = useState('fastest')
  const [availableRoutePreferences, setAvailableRoutePreferences] = useState<Record<string, string>>({})

  // Waypoints/stops state
  const [hasPlannedStops, setHasPlannedStops] = useState<'yes' | 'no' | 'later' | null>(null)
  const [plannedWaypoints, setPlannedWaypoints] = useState<LocationData[]>([])
  const [waypointSearchQuery, setWaypointSearchQuery] = useState('')
  const [waypointSearchResults, setWaypointSearchResults] = useState<SearchResult[]>([])
  const [showWaypointSuggestions, setShowWaypointSuggestions] = useState(false)
  const waypointTimeoutRef = useRef<NodeJS.Timeout>()
  const [includeHarvestHosts, setIncludeHarvestHosts] = useState(false)

  // Harvest Hosts import state
  const [showHHImportDialog, setShowHHImportDialog] = useState(false)
  const [showHHStaysList, setShowHHStaysList] = useState(false)
  const [showHHManualImport, setShowHHManualImport] = useState(false)
  const [hhUpcomingStays, setHhUpcomingStays] = useState<any[]>([])
  const [selectedStayIds, setSelectedStayIds] = useState<Set<number>>(new Set())
  const [hhImportText, setHhImportText] = useState('')
  const [hhImportUrl, setHhImportUrl] = useState('')
  const [hhImportLoading, setHhImportLoading] = useState(false)
  const [hhImportError, setHhImportError] = useState('')
  const [hhParsedStop, setHhParsedStop] = useState<LocationData | null>(null)

  // Search state
  const [startSearchQuery, setStartSearchQuery] = useState('')
  const [destSearchQuery, setDestSearchQuery] = useState('')
  const [startSearchResults, setStartSearchResults] = useState<SearchResult[]>([])
  const [destSearchResults, setDestSearchResults] = useState<SearchResult[]>([])
  const [showStartSuggestions, setShowStartSuggestions] = useState(false)
  const [showDestSuggestions, setShowDestSuggestions] = useState(false)
  const startTimeoutRef = useRef<NodeJS.Timeout>()
  const destTimeoutRef = useRef<NodeJS.Timeout>()

  // Trip plan preview
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null)
  const [planError, setPlanError] = useState('')

  // Route safety check
  interface SafetyHazard {
    type: string
    severity: string
    name: string
    latitude: number
    longitude: number
    message: string
    value?: number
    limit?: number
  }
  interface SafetyCheck {
    safe: boolean
    hazard_count: number
    critical_count: number
    warning_count: number
    hazards: SafetyHazard[]
  }
  const [safetyCheck, setSafetyCheck] = useState<SafetyCheck | null>(null)
  const [safetyLoading, setSafetyLoading] = useState(false)

  // Search status for retry feedback
  const [searchStatus, setSearchStatus] = useState('')

  useEffect(() => {
    loadRVProfiles()
    loadRoutePreferences()
  }, [])

  const loadRoutePreferences = async () => {
    try {
      const response = await fetch('/api/trips/route-preferences')
      const data = await response.json()
      if (data.preferences) {
        setAvailableRoutePreferences(data.preferences)
        if (data.default) {
          setRoutePreference(data.default)
        }
      }
    } catch (error) {
      console.error('Failed to load route preferences:', error)
      // Fallback defaults
      setAvailableRoutePreferences({
        fastest: 'Fastest route by time',
        shortest: 'Shortest route by distance',
        scenic: 'Scenic route avoiding highways'
      })
    }
  }

  const loadRVProfiles = async () => {
    try {
      const response = await rvApi.getAll()
      setRvProfiles(response.data)
      if (response.data.length > 0) {
        setRvProfileId(response.data[0].id)
      }
    } catch (error) {
      console.error('Failed to load RV profiles:', error)
    }
  }

  const searchAddressWithRetry = async (query: string, isStart: boolean) => {
    if (query.length < 3) {
      if (isStart) setStartSearchResults([])
      else setDestSearchResults([])
      return
    }

    try {
      const data = await nominatimSearch(query, setSearchStatus)

      if (isStart) {
        setStartSearchResults(data)
        setShowStartSuggestions(true)
      } else {
        setDestSearchResults(data)
        setShowDestSuggestions(true)
      }
    } catch (error) {
      console.error('Address search failed:', error)
      setSearchStatus('')
    }
  }

  const handleStartSearchChange = (value: string) => {
    setStartSearchQuery(value)
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current)
    startTimeoutRef.current = setTimeout(() => searchAddressWithRetry(value, true), 300)
  }

  const handleDestSearchChange = (value: string) => {
    setDestSearchQuery(value)
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current)
    destTimeoutRef.current = setTimeout(() => searchAddressWithRetry(value, false), 300)
  }

  const handleWaypointSearchChange = (value: string) => {
    setWaypointSearchQuery(value)
    if (waypointTimeoutRef.current) clearTimeout(waypointTimeoutRef.current)
    waypointTimeoutRef.current = setTimeout(() => searchWaypoint(value), 300)
  }

  const searchWaypoint = async (query: string) => {
    if (query.length < 3) {
      setWaypointSearchResults([])
      return
    }

    try {
      const data = await nominatimSearch(query, setSearchStatus)
      setWaypointSearchResults(data)
      setShowWaypointSuggestions(true)
    } catch (error) {
      console.error('Waypoint search failed:', error)
      setSearchStatus('')
    }
  }

  const selectWaypoint = (result: SearchResult) => {
    const addressParts = []
    if (result.address.house_number) addressParts.push(result.address.house_number)
    if (result.address.road) addressParts.push(result.address.road)

    const address = addressParts.length > 0 ? addressParts.join(' ') : result.display_name.split(',')[0]
    const city = result.address.city || result.address.town || result.address.village || ''
    const state = result.address.state || ''
    const stateAbbrev = getStateAbbrev(state)

    const waypoint: LocationData = {
      name: result.display_name,
      address,
      city,
      state: stateAbbrev,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon)
    }

    setPlannedWaypoints([...plannedWaypoints, waypoint])
    setWaypointSearchQuery('')
    setShowWaypointSuggestions(false)
    setWaypointSearchResults([])
  }

  const removeWaypoint = (index: number) => {
    setPlannedWaypoints(plannedWaypoints.filter((_, i) => i !== index))
  }

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
    const newWaypoints = [...plannedWaypoints]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newWaypoints.length) return
    [newWaypoints[index], newWaypoints[newIndex]] = [newWaypoints[newIndex], newWaypoints[index]]
    setPlannedWaypoints(newWaypoints)
  }

  const parseHarvestHostsText = async () => {
    if (!hhImportText || hhImportText.length < 50) {
      setHhImportError('Please paste the full page content from Harvest Hosts')
      return
    }

    setHhImportLoading(true)
    setHhImportError('')
    setHhParsedStop(null)

    try {
      const response = await fetch('/api/import/parse-harvest-hosts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        },
        body: JSON.stringify({
          page_text: hhImportText,
          url: hhImportUrl || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to parse')
      }

      const parsed = data.parsed_stop

      // If no coordinates, try to geocode the address
      if (!parsed.latitude && parsed.address) {
        try {
          const geoResponse = await fetch(`/api/import/geocode-address?address=${encodeURIComponent(parsed.address)}`, {
            headers: {
              'Authorization': `Bearer ${safeStorage.getItem('token')}`
            }
          })
          const geoData = await geoResponse.json()
          if (geoData.success) {
            parsed.latitude = geoData.latitude
            parsed.longitude = geoData.longitude
          }
        } catch (e) {
          console.error('Geocoding failed:', e)
        }
      }

      // Create the stop object
      const stop: LocationData = {
        name: parsed.name,
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        latitude: parsed.latitude || 0,
        longitude: parsed.longitude || 0,
        source: 'harvest_hosts',
        source_url: parsed.source_url,
        source_id: parsed.source_id,
        max_rig_size: parsed.max_rig_size,
        parking_spaces: parsed.parking_spaces,
        parking_surface: parsed.parking_surface,
        check_in_time: parsed.check_in_time,
        check_out_time: parsed.check_out_time,
        parking_instructions: parsed.parking_instructions,
        host_support_info: parsed.host_support_info
      }

      setHhParsedStop(stop)
    } catch (error: any) {
      setHhImportError(error.message || 'Failed to parse Harvest Hosts content')
    } finally {
      setHhImportLoading(false)
    }
  }

  const addParsedHHStop = () => {
    if (hhParsedStop) {
      if (!hhParsedStop.latitude || !hhParsedStop.longitude) {
        setHhImportError('Could not determine coordinates. Please enter them manually or search for the location.')
        return
      }
      setPlannedWaypoints([...plannedWaypoints, hhParsedStop])
      // Reset import state
      setShowHHManualImport(false)
      setHhImportText('')
      setHhImportUrl('')
      setHhParsedStop(null)
      setHhImportError('')
    }
  }

  const fetchUpcomingHHStays = async () => {
    setHhImportLoading(true)
    setHhImportError('')

    try {
      const response = await fetch('/api/harvest-hosts/stays?upcoming_only=true', {
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to fetch stays')
      }

      setHhUpcomingStays(data.stays || [])

      if (data.stays && data.stays.length > 0) {
        setShowHHStaysList(true)
        setShowHHImportDialog(false)
      } else {
        setHhImportError('No upcoming stays found. You can import manually instead.')
      }
    } catch (error: any) {
      setHhImportError(error.message || 'Failed to fetch upcoming stays')
    } finally {
      setHhImportLoading(false)
    }
  }

  const toggleStaySelection = (stayId: number) => {
    const newSelected = new Set(selectedStayIds)
    if (newSelected.has(stayId)) {
      newSelected.delete(stayId)
    } else {
      newSelected.add(stayId)
    }
    setSelectedStayIds(newSelected)
  }

  const importSelectedStays = async () => {
    if (selectedStayIds.size === 0) {
      setHhImportError('Please select at least one stay to import')
      return
    }

    setHhImportLoading(true)
    setHhImportError('')

    try {
      // Fetch host details for each selected stay
      const staysToImport = hhUpcomingStays.filter(stay => selectedStayIds.has(stay.id))
      const importedWaypoints: LocationData[] = []

      for (const stay of staysToImport) {
        try {
          // Get host details from the API
          const hostResponse = await fetch(`/api/harvest-hosts/stays/${stay.id}`, {
            headers: {
              'Authorization': `Bearer ${safeStorage.getItem('token')}`
            }
          })

          const hostData = await hostResponse.json()

          if (hostData.host) {
            const host = hostData.host
            const waypoint: LocationData = {
              name: host.name || stay.host_name,
              address: host.address || '',
              city: host.city || '',
              state: host.state || '',
              latitude: host.latitude || 0,
              longitude: host.longitude || 0,
              source: 'harvest_hosts',
              source_id: host.hh_id,
              check_in_time: host.check_in_time,
              check_out_time: host.check_out_time,
              parking_instructions: host.check_in_method,
              host_support_info: `${stay.nights || 1} night(s) - Status: ${stay.status}`,
              amenities: host.amenities
            }

            if (waypoint.latitude && waypoint.longitude) {
              importedWaypoints.push(waypoint)
            }
          }
        } catch (error) {
          console.error(`Failed to import stay ${stay.id}:`, error)
        }
      }

      if (importedWaypoints.length > 0) {
        setPlannedWaypoints([...plannedWaypoints, ...importedWaypoints])
        // Reset state
        setShowHHStaysList(false)
        setShowHHImportDialog(false)
        setSelectedStayIds(new Set())
        setHhUpcomingStays([])
      } else {
        setHhImportError('Could not import any stays. Host details may not be available.')
      }
    } catch (error: any) {
      setHhImportError(error.message || 'Failed to import stays')
    } finally {
      setHhImportLoading(false)
    }
  }

  const checkForMatchingHHStays = async () => {
    if (!departureDate) return

    try {
      const token = safeStorage.getItem('token')
      const response = await fetch('/api/harvest-hosts/stays?upcoming_only=true', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok || !data.stays || data.stays.length === 0) {
        return
      }

      // Calculate trip date range
      const tripStart = new Date(departureDate)
      let tripEnd = arrivalDate ? new Date(arrivalDate) : null

      // If no arrival date, estimate 30 days from departure
      if (!tripEnd) {
        tripEnd = new Date(tripStart)
        tripEnd.setDate(tripEnd.getDate() + 30)
      }

      // Find stays that fall within trip dates (with 1-day buffer)
      // Only include approved stays - exclude cancelled/declined
      const matchingStays = data.stays.filter((stay: any) => {
        if (!stay.check_in_date) return false
        // Filter out cancelled and declined stays
        if (stay.status === 'cancelled' || stay.status === 'declined') return false
        const stayDate = new Date(stay.check_in_date)
        const bufferStart = new Date(tripStart)
        bufferStart.setDate(bufferStart.getDate() - 1)
        const bufferEnd = new Date(tripEnd)
        bufferEnd.setDate(bufferEnd.getDate() + 1)
        return stayDate >= bufferStart && stayDate <= bufferEnd
      })

      if (matchingStays.length > 0) {
        setHhUpcomingStays(matchingStays)
        setShowHHStaysList(true)
      }
    } catch (error) {
      console.error('Failed to check for matching HH stays:', error)
    }
  }

  const selectLocation = (result: SearchResult, isStart: boolean) => {
    const addressParts = []
    if (result.address.house_number) addressParts.push(result.address.house_number)
    if (result.address.road) addressParts.push(result.address.road)

    const address = addressParts.length > 0 ? addressParts.join(' ') : result.display_name.split(',')[0]
    const city = result.address.city || result.address.town || result.address.village || ''
    const state = result.address.state || ''
    const stateAbbrev = getStateAbbrev(state)

    const location: LocationData = {
      name: result.display_name, // Show full address details
      address,
      city,
      state: stateAbbrev,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon)
    }

    if (isStart) {
      setStartLocation(location)
      setStartSearchQuery(result.display_name)
      setShowStartSuggestions(false)
    } else {
      setDestLocation(location)
      setDestSearchQuery(result.display_name)
      setShowDestSuggestions(false)
    }
  }

  const useCurrentLocation = (isStart: boolean) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude

        try {
          const data = await reverseGeocode(lat, lon, setSearchStatus)

          const city = data?.address?.city || data?.address?.town || data?.address?.village || ''
          const state = data?.address?.state || ''
          const stateAbbrev = getStateAbbrev(state)
          const fullAddress = data?.display_name || (city ? `${city}, ${stateAbbrev}` : 'Current Location')

          const location: LocationData = {
            name: fullAddress,
            city,
            state: stateAbbrev,
            latitude: lat,
            longitude: lon
          }

          if (isStart) {
            setStartLocation(location)
            setStartSearchQuery(fullAddress)
          } else {
            setDestLocation(location)
            setDestSearchQuery(fullAddress)
          }
        } catch (error) {
          console.error('Reverse geocoding failed:', error)
          setSearchStatus('')
        }
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Unable to get your location')
      }
    )
  }

  const calculatePlan = async () => {
    if (!startLocation || !destLocation) return

    setLoading(true)
    setPlanError('')

    try {
      const departureDatetime = new Date(`${departureDate}T${departureTime}:00`)

      const planData: any = {
        name: tripName,
        description: tripDescription,
        start: {
          name: startLocation.name,
          address: startLocation.address,
          city: startLocation.city,
          state: startLocation.state,
          latitude: startLocation.latitude,
          longitude: startLocation.longitude
        },
        destination: {
          name: destLocation.name,
          address: destLocation.address,
          city: destLocation.city,
          state: destLocation.state,
          latitude: destLocation.latitude,
          longitude: destLocation.longitude
        },
        waypoints: plannedWaypoints.map(wp => ({
          name: wp.name,
          address: wp.address,
          city: wp.city,
          state: wp.state,
          latitude: wp.latitude,
          longitude: wp.longitude,
          source: wp.source,
          source_url: wp.source_url,
          source_id: wp.source_id,
          max_rig_size: wp.max_rig_size,
          parking_spaces: wp.parking_spaces,
          parking_surface: wp.parking_surface,
          check_in_time: wp.check_in_time,
          check_out_time: wp.check_out_time,
          parking_instructions: wp.parking_instructions,
          host_support_info: wp.host_support_info,
          amenities: wp.amenities
        })),
        departure_datetime: departureDatetime.toISOString(),
        trip_type: tripType,
        daily_miles_target: dailyMilesTarget,
        max_driving_hours: maxDrivingHours,
        rv_profile_id: rvProfileId,
        route_preference: routePreference,
        include_harvest_hosts: includeHarvestHosts
      }

      if (arrivalType === 'specific' && arrivalDate) {
        planData.arrival_datetime = new Date(`${arrivalDate}T18:00:00`).toISOString()
      }

      const response = await tripsApi.plan(planData)
      setTripPlan(response.data)

      // Perform route safety check if RV profile selected
      if (rvProfileId) {
        setSafetyLoading(true)
        try {
          const selectedRv = rvProfiles.find(rv => rv.id === rvProfileId)
          if (selectedRv) {
            // Build route coordinates from start, waypoints, and destination
            const routeCoords: number[][] = [
              [startLocation.latitude, startLocation.longitude]
            ]
            plannedWaypoints.forEach(wp => {
              routeCoords.push([wp.latitude, wp.longitude])
            })
            // Add suggested stops
            response.data.suggested_stops?.forEach((stop: any) => {
              routeCoords.push([stop.latitude, stop.longitude])
            })
            routeCoords.push([destLocation.latitude, destLocation.longitude])

            const safetyResponse = await fetch('/api/trips/route-safety-check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                route_coords: routeCoords,
                rv_height_ft: selectedRv.height_ft || selectedRv.height,
                rv_weight_lbs: selectedRv.weight_lbs || selectedRv.gvwr,
                buffer_miles: 0.5
              })
            })
            const safetyData = await safetyResponse.json()
            setSafetyCheck(safetyData)
          }
        } catch (safetyError) {
          console.error('Safety check failed:', safetyError)
          // Non-critical, don't block the plan
        } finally {
          setSafetyLoading(false)
        }
      }

      setStep(6)
    } catch (error: any) {
      console.error('Failed to calculate plan:', error)
      setPlanError(error.response?.data?.detail || 'Failed to calculate trip plan')
    } finally {
      setLoading(false)
    }
  }

  const createTrip = async () => {
    if (!startLocation || !destLocation) return

    setLoading(true)

    try {
      const departureDatetime = new Date(`${departureDate}T${departureTime}:00`)

      const planData: any = {
        name: tripName,
        description: tripDescription,
        start: {
          name: startLocation.name,
          address: startLocation.address,
          city: startLocation.city,
          state: startLocation.state,
          latitude: startLocation.latitude,
          longitude: startLocation.longitude
        },
        destination: {
          name: destLocation.name,
          address: destLocation.address,
          city: destLocation.city,
          state: destLocation.state,
          latitude: destLocation.latitude,
          longitude: destLocation.longitude
        },
        waypoints: plannedWaypoints.map(wp => ({
          name: wp.name,
          address: wp.address,
          city: wp.city,
          state: wp.state,
          latitude: wp.latitude,
          longitude: wp.longitude,
          source: wp.source,
          source_url: wp.source_url,
          source_id: wp.source_id,
          max_rig_size: wp.max_rig_size,
          parking_spaces: wp.parking_spaces,
          parking_surface: wp.parking_surface,
          check_in_time: wp.check_in_time,
          check_out_time: wp.check_out_time,
          parking_instructions: wp.parking_instructions,
          host_support_info: wp.host_support_info,
          amenities: wp.amenities
        })),
        departure_datetime: departureDatetime.toISOString(),
        trip_type: tripType,
        daily_miles_target: dailyMilesTarget,
        max_driving_hours: maxDrivingHours,
        rv_profile_id: rvProfileId,
        route_preference: routePreference,
        include_harvest_hosts: includeHarvestHosts
      }

      if (arrivalType === 'specific' && arrivalDate) {
        planData.arrival_datetime = new Date(`${arrivalDate}T18:00:00`).toISOString()
      }

      const response = await tripsApi.planAndCreate(planData)
      navigate(`/trips/${response.data.id}`)
    } catch (error: any) {
      console.error('Failed to create trip:', error)
      alert(error.response?.data?.detail || 'Failed to create trip')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1: return tripName.trim().length > 0
      case 2: return startLocation !== null
      case 3: return destLocation !== null
      case 4: return departureDate.length > 0 // Dates step
      case 5: return hasPlannedStops !== null // Waypoints question
      case 6: return true // Trip preferences (optional, has defaults)
      default: return true
    }
  }

  const nextStep = async () => {
    // If moving from dates step, check for matching HH stays
    if (step === 4 && departureDate) {
      await checkForMatchingHHStays()
    }

    if (step === 6) {
      calculatePlan()
    } else if (step === 5 && hasPlannedStops === 'no') {
      setStep(6) // Skip waypoint entry
    } else {
      setStep(step + 1)
    }
  }

  const renderStepIndicator = () => (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}>
      {[1, 2, 3, 4, 5, 6, 7].map((s) => (
        <div
          key={s}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 5px',
            background: s === step ? 'var(--accent-primary)' : s < step ? 'var(--accent-success)' : 'var(--bg-tertiary)',
            color: s <= step ? 'white' : 'var(--text-muted)',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          {s < step ? '✓' : s}
        </div>
      ))}
    </div>
  )

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Trip Details</h2>
            <div className="form-group">
              <label className="label">Trip Name *</label>
              <input
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                className="input"
                placeholder="e.g., Cross Country Adventure"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label">Description (optional)</label>
              <textarea
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                className="input"
                rows={3}
                placeholder="Notes about your trip..."
              />
            </div>
            <div className="form-group">
              <label className="label">RV Profile</label>
              <select
                value={rvProfileId || ''}
                onChange={(e) => setRvProfileId(e.target.value ? parseInt(e.target.value) : null)}
                className="input"
              >
                <option value="">No RV Selected</option>
                {rvProfiles.map(rv => (
                  <option key={rv.id} value={rv.id}>{rv.name}</option>
                ))}
              </select>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Starting Location</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Where will you begin your trip?
            </p>

            <div className="form-group" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => useCurrentLocation(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '14px' }}
                >
                  Use Current Location
                </button>
              </div>

              <input
                type="text"
                value={startSearchQuery}
                onChange={(e) => handleStartSearchChange(e.target.value)}
                onFocus={() => startSearchResults.length > 0 && setShowStartSuggestions(true)}
                className="input"
                placeholder="Search for a city, address, or place..."
                autoFocus
              />

              {searchStatus && (
                <div style={{
                  padding: '8px 12px',
                  marginTop: '8px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    border: '2px solid var(--primary-color)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  {searchStatus}
                </div>
              )}

              {showStartSuggestions && startSearchResults.length > 0 && (
                <div
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
                    zIndex: 1000
                  }}
                >
                  {startSearchResults.map((result, i) => (
                    <div
                      key={i}
                      onClick={() => selectLocation(result, true)}
                      style={{
                        padding: '10px',
                        cursor: 'pointer',
                        borderBottom: i < startSearchResults.length - 1 ? '1px solid var(--border-color)' : 'none',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                    >
                      {result.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {startLocation && (
              <div style={{
                background: 'var(--bg-tertiary)',
                padding: '15px',
                borderRadius: '8px',
                marginTop: '15px'
              }}>
                <strong>Selected:</strong> {startLocation.name}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  {startLocation.latitude.toFixed(4)}, {startLocation.longitude.toFixed(4)}
                </div>
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Destination</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Where are you heading?
            </p>

            <div className="form-group" style={{ position: 'relative' }}>
              <input
                type="text"
                value={destSearchQuery}
                onChange={(e) => handleDestSearchChange(e.target.value)}
                onFocus={() => destSearchResults.length > 0 && setShowDestSuggestions(true)}
                className="input"
                placeholder="Search for destination..."
                autoFocus
              />

              {showDestSuggestions && destSearchResults.length > 0 && (
                <div
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
                    zIndex: 1000
                  }}
                >
                  {destSearchResults.map((result, i) => (
                    <div
                      key={i}
                      onClick={() => selectLocation(result, false)}
                      style={{
                        padding: '10px',
                        cursor: 'pointer',
                        borderBottom: i < destSearchResults.length - 1 ? '1px solid var(--border-color)' : 'none',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                    >
                      {result.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {destLocation && (
              <div style={{
                background: 'var(--bg-tertiary)',
                padding: '15px',
                borderRadius: '8px',
                marginTop: '15px',
                borderLeft: '4px solid var(--accent-primary)'
              }}>
                <strong>Destination:</strong> {destLocation.name}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  {destLocation.latitude.toFixed(4)}, {destLocation.longitude.toFixed(4)}
                </div>
              </div>
            )}
          </div>
        )

      case 4:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Trip Dates</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              When does your trip start?
            </p>

            <div className="form-group">
              <label className="label">Departure Date *</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="input"
                min={new Date().toISOString().split('T')[0]}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="label">Departure Time</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="input"
              />
            </div>

            <div className="form-group">
              <label className="label">Arrival Type</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button
                  type="button"
                  onClick={() => setArrivalType('flexible')}
                  className={arrivalType === 'flexible' ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ flex: 1 }}
                >
                  Flexible
                </button>
                <button
                  type="button"
                  onClick={() => setArrivalType('specific')}
                  className={arrivalType === 'specific' ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ flex: 1 }}
                >
                  Specific Date
                </button>
              </div>
            </div>

            {arrivalType === 'specific' && (
              <div className="form-group">
                <label className="label">Target Arrival Date</label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="input"
                  min={departureDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
          </div>
        )

      case 5:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Planned Stops</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Do you have any specific stops planned along the way?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div
                onClick={() => setHasPlannedStops('yes')}
                style={{
                  padding: '20px',
                  borderRadius: '8px',
                  border: `2px solid ${hasPlannedStops === 'yes' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  background: hasPlannedStops === 'yes' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>Yes, add stops now</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  Enter specific locations you want to visit along the route
                </div>
              </div>

              <div
                onClick={() => setHasPlannedStops('later')}
                style={{
                  padding: '20px',
                  borderRadius: '8px',
                  border: `2px solid ${hasPlannedStops === 'later' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  background: hasPlannedStops === 'later' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>I'll add stops later</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  Continue planning, you can add stops after the trip is created
                </div>
              </div>

              <div
                onClick={() => setHasPlannedStops('no')}
                style={{
                  padding: '20px',
                  borderRadius: '8px',
                  border: `2px solid ${hasPlannedStops === 'no' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  background: hasPlannedStops === 'no' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>No specific stops</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  Show search areas along the route where you should look for accommodations
                </div>
              </div>
            </div>

            {/* Harvest Hosts option when "No specific stops" is selected */}
            {hasPlannedStops === 'no' && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={includeHarvestHosts}
                    onChange={(e) => setIncludeHarvestHosts(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#16a34a' }}>🌾</span>
                      Include Harvest Hosts suggestions
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Show Harvest Hosts locations in search areas (requires subscription)
                    </div>
                  </div>
                </label>
              </div>
            )}

            {hasPlannedStops === 'yes' && (
              <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0 }}>Add Waypoints</h3>
                  <button
                    type="button"
                    onClick={() => setShowHHImportDialog(true)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '2px solid #16a34a',
                      background: 'transparent',
                      color: '#16a34a',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>🌾</span>
                    Import from Harvest Hosts
                  </button>
                </div>

                {/* Harvest Hosts Import - Initial Dialog */}
                {showHHImportDialog && (
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '2px solid #16a34a'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h4 style={{ margin: 0, color: '#16a34a' }}>
                        🌾 Import from Harvest Hosts
                      </h4>
                      <button
                        onClick={() => {
                          setShowHHImportDialog(false)
                          setHhImportError('')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '20px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)'
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <p style={{ fontSize: '14px', marginBottom: '20px' }}>
                      Do you have any Harvest Hosts stays booked or requested for this trip?
                    </p>

                    {hhImportError && (
                      <div style={{
                        padding: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        fontSize: '13px',
                        marginBottom: '15px'
                      }}>
                        {hhImportError}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={fetchUpcomingHHStays}
                        disabled={hhImportLoading}
                        style={{
                          padding: '12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#16a34a',
                          color: 'white',
                          cursor: hhImportLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: hhImportLoading ? 0.6 : 1
                        }}
                      >
                        {hhImportLoading ? 'Loading stays...' : 'Yes, import my upcoming stays'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowHHImportDialog(false)
                          setShowHHManualImport(true)
                        }}
                        style={{
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        No, import manually from page content
                      </button>
                    </div>
                  </div>
                )}

                {/* Harvest Hosts Import - Stays Selection */}
                {showHHStaysList && (
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '2px solid #16a34a'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h4 style={{ margin: 0, color: '#16a34a' }}>
                        🌾 Select Stays to Import
                      </h4>
                      <button
                        onClick={() => {
                          setShowHHStaysList(false)
                          setSelectedStayIds(new Set())
                          setHhUpcomingStays([])
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '20px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)'
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                      Found {hhUpcomingStays.length} upcoming stay{hhUpcomingStays.length !== 1 ? 's' : ''}. Select which ones to add:
                    </p>

                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                      {hhUpcomingStays.map(stay => (
                        <div
                          key={stay.id}
                          onClick={() => toggleStaySelection(stay.id)}
                          style={{
                            padding: '12px',
                            background: selectedStayIds.has(stay.id) ? 'rgba(22, 163, 74, 0.1)' : 'var(--card-bg)',
                            border: selectedStayIds.has(stay.id) ? '2px solid #16a34a' : '1px solid var(--border-color)',
                            borderRadius: '6px',
                            marginBottom: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={selectedStayIds.has(stay.id)}
                              onChange={() => {}}
                              style={{ marginTop: '2px', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                                {stay.host_name}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                📅 Check-in: {stay.check_in_date ? new Date(stay.check_in_date).toLocaleDateString() : 'TBD'}
                                {stay.nights && ` • ${stay.nights} night${stay.nights > 1 ? 's' : ''}`}
                              </div>
                              {stay.status && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  Status: {stay.status}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {hhImportError && (
                      <div style={{
                        padding: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        fontSize: '13px',
                        marginBottom: '15px'
                      }}>
                        {hhImportError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowHHStaysList(false)
                          setSelectedStayIds(new Set())
                          setShowHHImportDialog(true)
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={importSelectedStays}
                        disabled={hhImportLoading || selectedStayIds.size === 0}
                        style={{
                          flex: 2,
                          padding: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#16a34a',
                          color: 'white',
                          cursor: hhImportLoading || selectedStayIds.size === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: hhImportLoading || selectedStayIds.size === 0 ? 0.6 : 1
                        }}
                      >
                        {hhImportLoading ? 'Importing...' : `Import ${selectedStayIds.size} stay${selectedStayIds.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Harvest Hosts Import - Manual Import */}
                {showHHManualImport && (
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '2px solid #16a34a'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h4 style={{ margin: 0, color: '#16a34a' }}>
                        🌾 Import Harvest Hosts Stop
                      </h4>
                      <button
                        onClick={() => {
                          setShowHHManualImport(false)
                          setHhImportText('')
                          setHhImportUrl('')
                          setHhParsedStop(null)
                          setHhImportError('')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '20px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)'
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                      1. Open your booked stay on harvesthosts.com<br/>
                      2. Select all text on the page (Ctrl+A / Cmd+A)<br/>
                      3. Copy (Ctrl+C / Cmd+C) and paste below
                    </p>

                    <div className="form-group">
                      <label className="label" style={{ fontSize: '12px' }}>Stay URL (optional)</label>
                      <input
                        type="text"
                        value={hhImportUrl}
                        onChange={(e) => setHhImportUrl(e.target.value)}
                        className="input"
                        placeholder="https://www.harvesthosts.com/member/stays/..."
                        style={{ fontSize: '13px' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="label" style={{ fontSize: '12px' }}>Page Content *</label>
                      <textarea
                        value={hhImportText}
                        onChange={(e) => setHhImportText(e.target.value)}
                        className="input"
                        placeholder="Paste the full page content here..."
                        style={{
                          minHeight: '120px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    {hhImportError && (
                      <div style={{
                        padding: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        fontSize: '13px',
                        marginBottom: '15px'
                      }}>
                        {hhImportError}
                      </div>
                    )}

                    {!hhParsedStop ? (
                      <button
                        type="button"
                        onClick={parseHarvestHostsText}
                        disabled={hhImportLoading || !hhImportText}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#16a34a',
                          color: 'white',
                          cursor: hhImportLoading || !hhImportText ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          opacity: hhImportLoading || !hhImportText ? 0.6 : 1
                        }}
                      >
                        {hhImportLoading ? 'Parsing...' : 'Parse Content'}
                      </button>
                    ) : (
                      <div>
                        <div style={{
                          background: 'var(--card-bg)',
                          padding: '15px',
                          borderRadius: '8px',
                          marginBottom: '15px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '10px' }}>
                            {hhParsedStop.name}
                          </div>
                          {hhParsedStop.address && (
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                              📍 {hhParsedStop.address}
                            </div>
                          )}
                          {hhParsedStop.max_rig_size && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              🚐 Max Rig: {hhParsedStop.max_rig_size}
                            </div>
                          )}
                          {hhParsedStop.parking_spaces && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              🅿️ Spaces: {hhParsedStop.parking_spaces}
                            </div>
                          )}
                          {hhParsedStop.parking_surface && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              Surface: {hhParsedStop.parking_surface}
                            </div>
                          )}
                          {hhParsedStop.check_in_time && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              🕐 Check-in: {hhParsedStop.check_in_time}
                            </div>
                          )}
                          {hhParsedStop.parking_instructions && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', padding: '8px', background: 'rgba(22, 163, 74, 0.1)', borderRadius: '4px' }}>
                              <strong>Parking:</strong> {hhParsedStop.parking_instructions.substring(0, 200)}
                              {hhParsedStop.parking_instructions.length > 200 && '...'}
                            </div>
                          )}
                          {(!hhParsedStop.latitude || !hhParsedStop.longitude) && (
                            <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '8px' }}>
                              ⚠️ Could not determine coordinates - will try to geocode from address
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setHhParsedStop(null)}
                            style={{
                              flex: 1,
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'transparent',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={addParsedHHStop}
                            style={{
                              flex: 2,
                              padding: '10px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#16a34a',
                              color: 'white',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            Add to Waypoints
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={waypointSearchQuery}
                    onChange={(e) => handleWaypointSearchChange(e.target.value)}
                    onFocus={() => waypointSearchResults.length > 0 && setShowWaypointSuggestions(true)}
                    className="input"
                    placeholder="Or search for a stop location..."
                  />

                  {showWaypointSuggestions && waypointSearchResults.length > 0 && (
                    <div
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
                        zIndex: 1000
                      }}
                    >
                      {waypointSearchResults.map((result, i) => (
                        <div
                          key={i}
                          onClick={() => selectWaypoint(result)}
                          style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: i < waypointSearchResults.length - 1 ? '1px solid var(--border-color)' : 'none',
                            fontSize: '14px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                        >
                          {result.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {plannedWaypoints.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '10px' }}>
                      Waypoints ({plannedWaypoints.length}):
                    </div>
                    {plannedWaypoints.map((wp, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '12px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '6px',
                          marginBottom: '8px',
                          borderLeft: '3px solid var(--accent-primary)'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px' }}>
                            {index + 1}. {wp.source === 'harvest_hosts' && <span style={{ color: '#16a34a' }}>🌾 </span>}
                            {wp.name}
                          </div>
                          {wp.source === 'harvest_hosts' && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {wp.max_rig_size && <span>🚐 {wp.max_rig_size}</span>}
                              {wp.check_in_time && <span style={{ marginLeft: '8px' }}>🕐 {wp.check_in_time}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={() => moveWaypoint(index, 'up')}
                            disabled={index === 0}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: index === 0 ? 'not-allowed' : 'pointer',
                              opacity: index === 0 ? 0.5 : 1
                            }}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveWaypoint(index, 'down')}
                            disabled={index === plannedWaypoints.length - 1}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: index === plannedWaypoints.length - 1 ? 'not-allowed' : 'pointer',
                              opacity: index === plannedWaypoints.length - 1 ? 0.5 : 1
                            }}
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeWaypoint(index)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              background: 'var(--accent-error)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 6:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Trip Preferences</h2>

            <div className="form-group">
              <label className="label">Route Preference</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
                marginBottom: '20px'
              }}>
                {Object.entries(availableRoutePreferences).map(([key, desc]) => (
                  <div
                    key={key}
                    onClick={() => setRoutePreference(key)}
                    style={{
                      padding: '15px',
                      borderRadius: '8px',
                      border: `2px solid ${routePreference === key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: routePreference === key ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-tertiary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      marginBottom: '4px',
                      textTransform: 'capitalize'
                    }}>
                      {key === 'fastest' && '🚀 '}
                      {key === 'shortest' && '📍 '}
                      {key === 'recommended' && '⭐ '}
                      {key === 'scenic' && '🏞️ '}
                      {key === 'fuel_efficient' && '⛽ '}
                      {key === 'no_tolls' && '🆓 '}
                      {key === 'no_highways' && '🛤️ '}
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Trip Type</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setTripType('one_way')}
                  style={{
                    flex: 1,
                    padding: '15px',
                    borderRadius: '8px',
                    border: `2px solid ${tripType === 'one_way' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: tripType === 'one_way' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: tripType === 'one_way' ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  One Way
                </button>
                <button
                  type="button"
                  onClick={() => setTripType('round_trip')}
                  style={{
                    flex: 1,
                    padding: '15px',
                    borderRadius: '8px',
                    border: `2px solid ${tripType === 'round_trip' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: tripType === 'round_trip' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: tripType === 'round_trip' ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Round Trip
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label className="label">Daily Miles Target</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <input
                  type="range"
                  min="100"
                  max="600"
                  step="50"
                  value={dailyMilesTarget}
                  onChange={(e) => setDailyMilesTarget(parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 600, minWidth: '80px' }}>{dailyMilesTarget} miles</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>
                Recommended: 250-350 miles for comfortable RV travel
              </div>
            </div>

            <div className="form-group">
              <label className="label">Max Driving Hours</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <input
                  type="range"
                  min="4"
                  max="12"
                  step="1"
                  value={maxDrivingHours}
                  onChange={(e) => setMaxDrivingHours(parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 600, minWidth: '60px' }}>{maxDrivingHours} hrs</span>
              </div>
            </div>
          </div>
        )

      case 7:
        return (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Trip Preview</h2>

            {tripPlan && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: tripPlan.fuel_estimate ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                  gap: '15px',
                  marginBottom: '20px'
                }}>
                  <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Distance</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                      {tripPlan.total_distance_miles.toFixed(0)} mi
                    </div>
                  </div>
                  <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Duration</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                      {tripPlan.estimated_days} days
                    </div>
                    {tripPlan.total_duration_hours && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        ~{tripPlan.total_duration_hours.toFixed(1)} hrs driving
                      </div>
                    )}
                  </div>
                  <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Est. Arrival</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {new Date(tripPlan.estimated_arrival).toLocaleDateString()}
                    </div>
                  </div>
                  {tripPlan.fuel_estimate && (
                    <div className="card" style={{ textAlign: 'center', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Est. Fuel Cost</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                        ${tripPlan.fuel_estimate.estimated_cost.toFixed(0)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {tripPlan.fuel_estimate.total_gallons.toFixed(0)} gal @ ${tripPlan.fuel_estimate.avg_price_per_gallon.toFixed(2)}/gal
                      </div>
                    </div>
                  )}
                </div>

                {/* Fuel Details */}
                {tripPlan.fuel_estimate && (
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>&#x26FD;</span>
                      Fuel Estimate Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Fuel Type:</span>{' '}
                        <strong style={{ textTransform: 'capitalize' }}>{tripPlan.fuel_estimate.fuel_type}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Your MPG:</span>{' '}
                        <strong>{tripPlan.fuel_estimate.avg_mpg.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Est. Fill-ups:</span>{' '}
                        <strong>{tripPlan.fuel_estimate.num_fill_ups}</strong>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                      * Estimate based on regional fuel prices and your RV&apos;s average MPG
                    </div>
                  </div>
                )}

                {/* Safety Check Results */}
                {safetyLoading && (
                  <div style={{
                    padding: '15px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: '16px',
                      height: '16px',
                      border: '2px solid var(--accent-primary)',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Checking route for hazards...
                  </div>
                )}

                {safetyCheck && !safetyLoading && (
                  <div style={{
                    padding: '15px',
                    background: safetyCheck.critical_count > 0
                      ? 'rgba(239, 68, 68, 0.1)'
                      : safetyCheck.warning_count > 0
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'rgba(34, 197, 94, 0.1)',
                    border: `2px solid ${safetyCheck.critical_count > 0
                      ? '#ef4444'
                      : safetyCheck.warning_count > 0
                        ? '#f59e0b'
                        : '#22c55e'}`,
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      fontWeight: 600,
                      color: safetyCheck.critical_count > 0
                        ? '#ef4444'
                        : safetyCheck.warning_count > 0
                          ? '#f59e0b'
                          : '#22c55e',
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {safetyCheck.critical_count > 0 ? (
                        <><span style={{ fontSize: '18px' }}>&#9888;</span> {safetyCheck.critical_count} Critical Hazard{safetyCheck.critical_count !== 1 ? 's' : ''} Detected</>
                      ) : safetyCheck.warning_count > 0 ? (
                        <><span style={{ fontSize: '18px' }}>&#9888;</span> {safetyCheck.warning_count} Warning{safetyCheck.warning_count !== 1 ? 's' : ''} on Route</>
                      ) : (
                        <><span style={{ fontSize: '18px' }}>&#10003;</span> Route Safety Check Passed</>
                      )}
                    </div>

                    {safetyCheck.hazards.length > 0 && (
                      <div style={{ fontSize: '13px', marginBottom: '10px' }}>
                        {safetyCheck.critical_count > 0 && (
                          <p style={{ color: '#ef4444', margin: '0 0 8px 0' }}>
                            There are {safetyCheck.critical_count} location(s) on this route that may not be passable with your RV.
                          </p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                          {safetyCheck.hazards.slice(0, 10).map((hazard, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '10px',
                                background: 'var(--card-bg)',
                                borderRadius: '6px',
                                borderLeft: `4px solid ${hazard.severity === 'critical' ? '#ef4444' : '#f59e0b'}`
                              }}
                            >
                              <div style={{ fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {hazard.type === 'height' && <span>&#x2195;</span>}
                                {hazard.type === 'weight' && <span>&#x2696;</span>}
                                {hazard.type === 'railroad' && <span>&#x1F6A7;</span>}
                                {hazard.name}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {hazard.message}
                              </div>
                            </div>
                          ))}
                          {safetyCheck.hazards.length > 10 && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                              ...and {safetyCheck.hazards.length - 10} more hazards
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {safetyCheck.safe && safetyCheck.hazard_count === 0 && (
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        No height or weight restrictions found that would affect your RV along this route.
                      </p>
                    )}
                  </div>
                )}

                <h3 style={{ marginBottom: '15px' }}>Route Stops</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Origin */}
                  <div style={{
                    padding: '15px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    borderLeft: '4px solid var(--accent-success)'
                  }}>
                    <div style={{ fontWeight: 600 }}>Origin: {startLocation?.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Depart: {new Date(`${departureDate}T${departureTime}`).toLocaleString()}
                    </div>
                  </div>

                  {/* Suggested search areas */}
                  {tripPlan.suggested_stops.map((stop, index) => (
                    <div key={index} style={{
                      padding: '15px',
                      background: stop.needs_user_selection ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      border: stop.needs_user_selection ? '2px solid #f59e0b' : 'none',
                      borderLeft: stop.needs_user_selection ? '4px solid #f59e0b' : '4px solid var(--accent-warning)',
                      animation: stop.needs_user_selection ? 'stopAreaPulse 3s ease-in-out infinite' : 'none'
                    }}>
                      <style>{`
                        @keyframes stopAreaPulse {
                          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
                          50% { box-shadow: 0 0 12px 4px rgba(245, 158, 11, 0.3); }
                        }
                      `}</style>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {stop.needs_user_selection && (
                          <span style={{ fontSize: '18px' }}>🏕️</span>
                        )}
                        <div style={{ fontWeight: 600, color: stop.needs_user_selection ? '#f59e0b' : 'inherit' }}>
                          {stop.needs_user_selection ? `Day ${stop.day} - Search Area` : stop.name}
                        </div>
                      </div>
                      {stop.needs_user_selection ? (
                        <>
                          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                            {stop.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            {stop.miles_this_segment.toFixed(0)} miles from previous stop • Find overnight accommodation here
                          </div>
                          {/* Distance bubbles */}
                          {stop.distance_bubbles && (
                            <div style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap',
                              marginBottom: '10px'
                            }}>
                              {Object.entries(stop.distance_bubbles).map(([key, bubble]) => (
                                <div key={key} style={{
                                  padding: '4px 10px',
                                  background: key === '15_min' ? 'rgba(34, 197, 94, 0.2)' :
                                             key === '30_min' ? 'rgba(59, 130, 246, 0.2)' :
                                             'rgba(168, 85, 247, 0.2)',
                                  border: `1px solid ${key === '15_min' ? '#22c55e' :
                                                       key === '30_min' ? '#3b82f6' : '#a855f7'}`,
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 500
                                }}>
                                  {bubble.label} ({bubble.radius_miles.toFixed(0)} mi)
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Suggested sources */}
                          {stop.suggested_sources && stop.suggested_sources.length > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Look for: {stop.suggested_sources.map(s =>
                                s === 'harvest_hosts' ? '🌾 Harvest Hosts' :
                                s === 'campground' ? '⛺ Campgrounds' :
                                s === 'rv_park' ? '🚐 RV Parks' :
                                s === 'walmart' ? '🏪 Walmart' :
                                s === 'cracker_barrel' ? '🥘 Cracker Barrel' : s
                              ).join(' • ')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {stop.miles_this_segment.toFixed(0)} miles from previous stop
                          {stop.is_overnight && ' | Overnight'}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Destination */}
                  <div style={{
                    padding: '15px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    borderLeft: '4px solid var(--accent-primary)'
                  }}>
                    <div style={{ fontWeight: 600 }}>Destination: {destLocation?.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Est. Arrival: {new Date(tripPlan.estimated_arrival).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Gap Suggestions Warning */}
                {tripPlan.gap_suggestions && tripPlan.gap_suggestions.length > 0 && (
                  <div style={{
                    marginTop: '20px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '15px'
                  }}>
                    <div style={{
                      fontWeight: 600,
                      color: '#f59e0b',
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '18px' }}>&#9888;</span>
                      Route Gaps Detected
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                      Some segments of your trip exceed your daily driving limits. Consider adding stops in these areas:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {tripPlan.gap_suggestions.map((gap, index) => (
                        <div
                          key={index}
                          style={{
                            background: 'var(--card-bg)',
                            padding: '12px',
                            borderRadius: '6px',
                            borderLeft: '4px solid #f59e0b'
                          }}
                        >
                          <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '6px' }}>
                            {gap.suggested_area}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {gap.from_stop} &#8594; {gap.to_stop}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {gap.reason}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginTop: '8px',
                            fontStyle: 'italic'
                          }}>
                            Search within {gap.search_radius_miles} miles for RV parks or campgrounds
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{
                  marginTop: '20px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-tertiary)',
                  padding: '10px',
                  borderRadius: '6px'
                }}>
                  After creating the trip, you can edit stops, add notes, and search for nearby POIs like RV parks and campgrounds.
                </p>
              </>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div>
      <h1>Plan Your Trip</h1>

      {renderStepIndicator()}

      {planError && (
        <div className="card mb-4" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          borderLeft: '4px solid var(--accent-danger)'
        }}>
          <p style={{ color: 'var(--accent-danger)', margin: 0 }}>{planError}</p>
        </div>
      )}

      {renderStep()}

      <div className="flex gap-2" style={{ marginTop: '20px', justifyContent: 'space-between' }}>
        <div>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="btn btn-secondary"
            >
              Back
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/trips')}
            className="btn btn-secondary"
          >
            Cancel
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={nextStep}
              className="btn btn-primary"
              disabled={!canProceed() || loading}
            >
              {loading ? 'Calculating...' : step === 5 ? 'Calculate Route' : 'Next'}
            </button>
          ) : (
            <button
              type="button"
              onClick={createTrip}
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
