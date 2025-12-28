import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { trips as tripsApi } from '../services/api'
import { US_STATE_PATHS } from '../data/usStatePaths'
import { safeStorage } from '../utils/storage'
import RouteMapWithHazards from '../components/RouteMapWithHazards'

// State code to name mapping
const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

// Reverse mapping: state name to abbreviation
const STATE_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
)

// Convert state name to abbreviation
const getStateAbbrev = (state: string): string => {
  if (!state) return ''
  if (state.length <= 2) return state.toUpperCase()
  const abbrev = STATE_ABBREV[state.toLowerCase()]
  return abbrev || state.toUpperCase()
}

// Mini state SVG component
const StateSVG = ({ stateCode, size = 24 }: { stateCode: string; size?: number }) => {
  const path = US_STATE_PATHS[stateCode.toUpperCase()]
  if (!path) return null

  return (
    <svg
      viewBox="0 0 960 600"
      width={size}
      height={size * 0.625}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      title={STATE_NAMES[stateCode.toUpperCase()] || stateCode}
    >
      <path
        d={path}
        fill="var(--accent-primary)"
        stroke="var(--text-muted)"
        strokeWidth="2"
      />
    </svg>
  )
}

interface StopData {
  id?: number
  stop_order: number
  stop_type: string
  name: string
  address?: string
  city?: string
  state?: string
  latitude: number
  longitude: number
  arrival_time?: string
  departure_time?: string
  arrival_tentative?: boolean
  departure_tentative?: boolean
  notes?: string
  is_overnight: boolean
  category?: string
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
  // Auto-generation tracking
  is_auto_generated?: boolean
  needs_user_selection?: boolean
  search_radius_miles?: number
}

// Category icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  'winery': '🍷',
  'brewery': '🍺',
  'distillery': '🥃',
  'cidery': '🍎',
  'restaurant': '🍽️',
  'farm': '🌾',
  'campground': '⛺',
  'rv_park': '🚐',
  'museum': '🏛️',
  'golf': '⛳',
  'marina': '⚓',
  'gas_station': '⛽',
  'hotel': '🏨',
  'attraction': '🎢',
  'store': '🛒',
  'harvest_host': '🌾',
  'boondocking': '🏕️',
  'other': '📍'
}

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  'winery': '#722F37',
  'brewery': '#D4A017',
  'distillery': '#8B4513',
  'cidery': '#8FBC8F',
  'restaurant': '#FF6B6B',
  'farm': '#228B22',
  'campground': '#2E8B57',
  'rv_park': '#4169E1',
  'museum': '#9370DB',
  'golf': '#32CD32',
  'marina': '#1E90FF',
  'gas_station': '#FF8C00',
  'hotel': '#9932CC',
  'attraction': '#FF1493',
  'store': '#20B2AA',
  'harvest_host': '#16a34a',
  'boondocking': '#8B7355',
  'other': '#6366f1'
}

const getCategoryIcon = (category?: string) => CATEGORY_ICONS[category || 'other'] || '📍'
const getCategoryColor = (category?: string) => CATEGORY_COLORS[category || 'other'] || '#6366f1'

// Gap analysis result interface
interface GapAnalysis {
  has_gaps: boolean
  gaps: Array<{
    from_stop: string
    to_stop: string
    segment_distance: number
    max_daily_distance: number
    suggested_area: string
    suggested_latitude: number
    suggested_longitude: number
    city: string
    state: string
    reason: string
    search_radius_miles: number
  }>
  daily_miles_target: number
  max_driving_hours: number
  total_stops: number
  message: string
}

export default function TripDetail() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Gap analysis state
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null)
  const [analyzingGaps, setAnalyzingGaps] = useState(false)

  // Recalculate state
  const [recalculating, setRecalculating] = useState(false)

  // Stop editing state
  const [editingStop, setEditingStop] = useState<StopData | null>(null)
  const [showAddStop, setShowAddStop] = useState(false)
  const [showHHImport, setShowHHImport] = useState(false)
  const [hhImportText, setHhImportText] = useState('')
  const [hhImportUrl, setHhImportUrl] = useState('')
  const [hhImportLoading, setHhImportLoading] = useState(false)
  const [hhParsedStop, setHhParsedStop] = useState<any>(null)

  // Search state for adding stops
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (id) {
      loadTrip(parseInt(id))
    }
  }, [id])

  // Analyze gaps when trip loads or stops change
  useEffect(() => {
    if (trip?.id && trip.stops?.length >= 2) {
      analyzeGaps(trip.id)
    }
  }, [trip?.id, trip?.stops?.length])

  const loadTrip = async (tripId: number) => {
    try {
      const response = await tripsApi.getById(tripId)
      setTrip(response.data)
    } catch (error) {
      console.error('Failed to load trip:', error)
    } finally {
      setLoading(false)
    }
  }

  const analyzeGaps = async (tripId: number) => {
    setAnalyzingGaps(true)
    try {
      const response = await tripsApi.analyzeGaps(tripId)
      setGapAnalysis(response.data)
    } catch (error) {
      console.error('Failed to analyze gaps:', error)
    } finally {
      setAnalyzingGaps(false)
    }
  }

  const recalculateTrip = async () => {
    if (!trip || !id) return

    const stops = trip.stops?.sort((a: any, b: any) => a.stop_order - b.stop_order) || []
    if (stops.length < 2) {
      alert('Need at least a start and destination to recalculate')
      return
    }

    const startStop = stops[0]
    const endStop = stops[stops.length - 1]

    if (!confirm(`This will recalculate the route from "${startStop.name}" to "${endStop.name}" and replace intermediate search areas. Continue?`)) {
      return
    }

    setRecalculating(true)
    try {
      // Get user preferences for daily miles
      const userPrefs = JSON.parse(safeStorage.getItem('userPreferences') || '{}')
      const dailyMiles = userPrefs.daily_miles_target || 300

      // Plan the new route FIRST (before deleting anything)
      const planResponse = await fetch('/api/trips/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: trip.name,
          start: {
            name: startStop.name,
            latitude: startStop.latitude,
            longitude: startStop.longitude,
            city: startStop.city,
            state: startStop.state
          },
          destination: {
            name: endStop.name,
            latitude: endStop.latitude,
            longitude: endStop.longitude,
            city: endStop.city,
            state: endStop.state
          },
          departure_datetime: trip.start_date || new Date().toISOString(),
          daily_miles_target: dailyMiles,
          max_driving_hours: userPrefs.max_driving_hours || 8,
          route_preference: 'fastest'
        })
      })

      if (!planResponse.ok) throw new Error('Failed to plan route')
      const planData = await planResponse.json()

      // Only now delete intermediate stops (keep first and last)
      const intermediateStops = stops.slice(1, -1)
      for (const stop of intermediateStops) {
        await fetch(`/api/trips/${id}/stops/${stop.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${safeStorage.getItem('token')}` }
        })
      }

      // Add new suggested stops
      let stopOrder = 2 // Start at 2 (after the starting stop)
      for (const suggestedStop of planData.suggested_stops) {
        const stopData = {
          stop_order: stopOrder,
          name: suggestedStop.name,
          latitude: suggestedStop.latitude,
          longitude: suggestedStop.longitude,
          city: suggestedStop.city,
          state: suggestedStop.state,
          is_overnight: true,
          needs_user_selection: true,
          search_radius_miles: suggestedStop.search_radius_miles || 30
        }

        await fetch(`/api/trips/${id}/stops`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          },
          body: JSON.stringify(stopData)
        })
        stopOrder++
      }

      // Update end stop order
      await fetch(`/api/trips/${id}/stops/${endStop.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        },
        body: JSON.stringify({ ...endStop, stop_order: stopOrder })
      })

      // Update trip distance
      await fetch(`/api/trips/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        },
        body: JSON.stringify({
          total_distance_miles: planData.total_distance_miles,
          estimated_days: planData.estimated_days
        })
      })

      // Reload the trip
      await loadTrip(parseInt(id))
    } catch (error) {
      console.error('Failed to recalculate trip:', error)
      alert('Failed to recalculate trip. Your original stops are preserved.')
    } finally {
      setRecalculating(false)
    }
  }

  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([])
      return
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=8&countrycodes=us`,
        { headers: { 'User-Agent': 'WanderMage-RV-App' } }
      )
      const data = await response.json()
      setSearchResults(data)
      setShowSuggestions(true)
    } catch (error) {
      console.error('Address search failed:', error)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchAddress(value), 300)
  }

  const selectSearchResult = (result: any) => {
    const city = result.address.city || result.address.town || result.address.village || ''
    const state = result.address.state || ''
    const stateAbbrev = getStateAbbrev(state)

    const newStop: StopData = {
      stop_order: trip.stops.length,
      stop_type: 'waypoint',
      name: result.display_name,
      city,
      state: stateAbbrev,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      is_overnight: true
    }

    setEditingStop(newStop)
    setSearchQuery('')
    setShowSuggestions(false)
    setSearchResults([])
    setShowAddStop(false)
  }

  const saveStop = async () => {
    if (!editingStop || !id) return

    try {
      const stopData = {
        ...editingStop,
        stop_order: editingStop.stop_order || trip.stops.length
      }

      if (editingStop.id) {
        // Update existing stop
        await fetch(`/api/trips/${id}/stops/${editingStop.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          },
          body: JSON.stringify(stopData)
        })
      } else {
        // Add new stop
        await fetch(`/api/trips/${id}/stops`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          },
          body: JSON.stringify(stopData)
        })
      }

      // Reload trip to get updated data
      await loadTrip(parseInt(id))
      setEditingStop(null)
    } catch (error) {
      console.error('Failed to save stop:', error)
      alert('Failed to save stop')
    }
  }

  const deleteStop = async (stopId: number) => {
    if (!id || !confirm('Are you sure you want to delete this stop?')) return

    try {
      await fetch(`/api/trips/${id}/stops/${stopId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })
      await loadTrip(parseInt(id))
    } catch (error) {
      console.error('Failed to delete stop:', error)
      alert('Failed to delete stop')
    }
  }

  const parseHarvestHostsText = async () => {
    if (!hhImportText || hhImportText.length < 50) {
      alert('Please paste the full page content from Harvest Hosts')
      return
    }

    setHhImportLoading(true)

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
      if (!response.ok) throw new Error(data.detail || 'Failed to parse')

      const parsed = data.parsed_stop

      // Geocode if no coordinates
      if (!parsed.latitude && parsed.address) {
        const geoResponse = await fetch(`/api/import/geocode-address?address=${encodeURIComponent(parsed.address)}`, {
          headers: { 'Authorization': `Bearer ${safeStorage.getItem('token')}` }
        })
        const geoData = await geoResponse.json()
        if (geoData.success) {
          parsed.latitude = geoData.latitude
          parsed.longitude = geoData.longitude
        }
      }

      setHhParsedStop(parsed)
    } catch (error: any) {
      alert(error.message || 'Failed to parse Harvest Hosts content')
    } finally {
      setHhImportLoading(false)
    }
  }

  const addParsedHHStop = () => {
    if (!hhParsedStop) return

    const newStop: StopData = {
      stop_order: trip.stops.length,
      stop_type: 'waypoint',
      name: hhParsedStop.name,
      address: hhParsedStop.address,
      city: hhParsedStop.city,
      state: hhParsedStop.state,
      latitude: hhParsedStop.latitude || 0,
      longitude: hhParsedStop.longitude || 0,
      is_overnight: true,
      source: 'harvest_hosts',
      source_url: hhParsedStop.source_url,
      max_rig_size: hhParsedStop.max_rig_size,
      parking_spaces: hhParsedStop.parking_spaces,
      parking_surface: hhParsedStop.parking_surface,
      check_in_time: hhParsedStop.check_in_time,
      parking_instructions: hhParsedStop.parking_instructions,
      host_support_info: hhParsedStop.host_support_info
    }

    setEditingStop(newStop)
    setShowHHImport(false)
    setHhImportText('')
    setHhImportUrl('')
    setHhParsedStop(null)
  }

  if (loading) {
    return <div>Loading trip details...</div>
  }

  if (!trip) {
    return <div>Trip not found</div>
  }

  // Get RV height from trip profile if available
  const rvHeight = trip.rv_profile?.height_feet || 13.5

  return (
    <div>
      <h1>{trip.name}</h1>
      <p className="mb-4" style={{ color: 'var(--text-muted)' }}>{trip.description}</p>

      {/* Interactive Trip Route Map with Hazards */}
      {trip.stops && trip.stops.length >= 2 && (
        <div className="card mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0 }}>Route Map with Hazards</h2>
            <button
              onClick={recalculateTrip}
              disabled={recalculating}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: recalculating ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #3B82F6, #6366F1)',
                color: 'white',
                cursor: recalculating ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: recalculating ? 'none' : '0 2px 8px rgba(99, 102, 241, 0.3)'
              }}
            >
              {recalculating ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                  Recalculating...
                </>
              ) : (
                <>
                  🔄 Recalculate Route
                </>
              )}
            </button>
          </div>
          <RouteMapWithHazards
            tripId={parseInt(id!)}
            stops={trip.stops}
            rvHeight={rvHeight}
          />
        </div>
      )}

      {/* Trip Dates */}
      {(trip.start_date || trip.end_date) && (
        <div className="card mb-4" style={{ background: 'var(--bg-tertiary)', borderLeft: '4px solid var(--accent-primary)' }}>
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'center' }}>
            {trip.start_date && (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Departure</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {new Date(trip.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            )}
            {trip.start_date && trip.end_date && (
              <div style={{ fontSize: '24px', color: 'var(--text-muted)' }}>→</div>
            )}
            {trip.end_date && (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Arrival {trip.end_date_tentative && <span style={{ fontSize: '10px' }}>(estimated)</span>}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {new Date(trip.end_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            )}
            {trip.estimated_days > 0 && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Duration</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{trip.estimated_days} {trip.estimated_days === 1 ? 'day' : 'days'}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-3 mb-4">
        <div className="card">
          <h3>Status</h3>
          <p style={{ fontSize: '20px', fontWeight: '600' }}>{trip.status}</p>
        </div>
        <div className="card">
          <h3>Total Distance</h3>
          <p style={{ fontSize: '20px', fontWeight: '600' }}>{trip.total_distance_miles?.toFixed(1) || '0'} miles</p>
        </div>
        <div className="card">
          <h3>Estimated Fuel</h3>
          <p style={{ fontSize: '20px', fontWeight: '600' }}>${trip.total_fuel_cost?.toFixed(2) || '0.00'}</p>
          {trip.total_fuel_gallons > 0 && (
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              ~{trip.total_fuel_gallons?.toFixed(1)} gallons
            </p>
          )}
        </div>
      </div>

      {trip.rv_profile && (
        <div className="card mb-4" style={{ background: 'var(--bg-tertiary)', borderLeft: '4px solid var(--accent-primary)' }}>
          <h3 style={{ marginBottom: '8px' }}>RV Profile: {trip.rv_profile.name}</h3>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '14px', color: 'var(--text-muted)' }}>
            {trip.rv_profile.mpg && <span>MPG: {trip.rv_profile.mpg}</span>}
            {trip.rv_profile.fuel_grade && <span>Fuel: {trip.rv_profile.fuel_grade}</span>}
            {trip.rv_profile.height_feet && <span>Height: {trip.rv_profile.height_feet} ft</span>}
          </div>
        </div>
      )}

      {/* Gap Analysis Warning */}
      {gapAnalysis?.has_gaps && (
        <div className="card mb-4" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          borderLeft: '4px solid #EF4444',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <h3 style={{ margin: 0, color: '#EF4444' }}>Trip Needs More Stops</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                {gapAnalysis.message}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {gapAnalysis.gaps.map((gap, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--card-bg)',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                  {gap.from_stop} → {gap.to_stop}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <span style={{ color: '#EF4444', fontWeight: 600 }}>{gap.segment_distance} miles</span>
                  {' '}exceeds your {gap.max_daily_distance}-mile daily limit
                </div>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  padding: '10px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: 600, color: '#F59E0B', marginBottom: '4px' }}>
                    Suggested Stop Area
                  </div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    📍 {gap.suggested_area}
                  </div>
                  <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    Search within {gap.search_radius_miles} miles for campgrounds, RV parks, or Harvest Hosts
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Based on {gapAnalysis.daily_miles_target} miles/day and {gapAnalysis.max_driving_hours} hours driving
          </div>
        </div>
      )}

      {analyzingGaps && (
        <div className="card mb-4" style={{ textAlign: 'center', padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Analyzing trip segments...</p>
        </div>
      )}

      {/* Stops Section */}
      <div className="card mb-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Stops ({trip.stops?.length || 0})</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowHHImport(true)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '2px solid #16a34a',
                background: 'transparent',
                color: '#16a34a',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              🌾 Import HH
            </button>
            <button
              onClick={() => setShowAddStop(true)}
              className="btn btn-primary"
              style={{ padding: '8px 12px', fontSize: '12px' }}
            >
              + Add Stop
            </button>
          </div>
        </div>

        {/* HH Import Modal */}
        {showHHImport && (
          <div style={{
            background: 'var(--bg-tertiary)',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '15px',
            border: '2px solid #16a34a'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: '#16a34a' }}>🌾 Import from Harvest Hosts</h4>
              <button onClick={() => { setShowHHImport(false); setHhParsedStop(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>

            {!hhParsedStop ? (
              <>
                <input
                  type="text"
                  value={hhImportUrl}
                  onChange={(e) => setHhImportUrl(e.target.value)}
                  className="input"
                  placeholder="Stay URL (optional)"
                  style={{ marginBottom: '10px', fontSize: '12px' }}
                />
                <textarea
                  value={hhImportText}
                  onChange={(e) => setHhImportText(e.target.value)}
                  className="input"
                  placeholder="Paste page content here (Ctrl+A, Ctrl+C from HH page)..."
                  style={{ minHeight: '100px', fontSize: '11px', marginBottom: '10px' }}
                />
                <button
                  onClick={parseHarvestHostsText}
                  disabled={hhImportLoading || !hhImportText}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#16a34a',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {hhImportLoading ? 'Parsing...' : 'Parse Content'}
                </button>
              </>
            ) : (
              <div>
                <div style={{ background: 'var(--card-bg)', padding: '10px', borderRadius: '6px', marginBottom: '10px', fontSize: '12px' }}>
                  <strong>{hhParsedStop.name}</strong>
                  {hhParsedStop.address && <div style={{ color: 'var(--text-muted)' }}>📍 {hhParsedStop.address}</div>}
                  {hhParsedStop.max_rig_size && <div style={{ color: 'var(--text-muted)' }}>🚐 {hhParsedStop.max_rig_size}</div>}
                  {hhParsedStop.check_in_time && <div style={{ color: 'var(--text-muted)' }}>🕐 {hhParsedStop.check_in_time}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setHhParsedStop(null)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>Back</button>
                  <button onClick={addParsedHHStop} style={{ flex: 2, padding: '8px', borderRadius: '6px', border: 'none', background: '#16a34a', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Add Stop</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Stop Search */}
        {showAddStop && (
          <div style={{ marginBottom: '15px', position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSuggestions(true)}
              className="input"
              placeholder="Search for a location..."
              autoFocus
            />
            {showSuggestions && searchResults.length > 0 && (
              <div style={{
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
              }}>
                {searchResults.map((result, i) => (
                  <div
                    key={i}
                    onClick={() => selectSearchResult(result)}
                    style={{ padding: '10px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border-color)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                  >
                    {result.display_name}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setShowAddStop(false); setSearchQuery(''); setSearchResults([]); }}
              style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Stop Edit Modal */}
        {editingStop && (
          <div style={{
            background: 'var(--bg-tertiary)',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '15px',
            border: '2px solid var(--accent-primary)'
          }}>
            <h4 style={{ marginBottom: '15px' }}>{editingStop.id ? 'Edit Stop' : 'New Stop'}</h4>

            <div className="form-group">
              <label className="label" style={{ fontSize: '12px' }}>Name *</label>
              <input
                type="text"
                value={editingStop.name}
                onChange={(e) => setEditingStop({ ...editingStop, name: e.target.value })}
                className="input"
              />
            </div>

            <div className="grid grid-2" style={{ gap: '10px' }}>
              <div className="form-group">
                <label className="label" style={{ fontSize: '12px' }}>City</label>
                <input
                  type="text"
                  value={editingStop.city || ''}
                  onChange={(e) => setEditingStop({ ...editingStop, city: e.target.value })}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontSize: '12px' }}>State</label>
                <input
                  type="text"
                  value={editingStop.state || ''}
                  onChange={(e) => setEditingStop({ ...editingStop, state: e.target.value })}
                  className="input"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="label" style={{ fontSize: '12px' }}>Notes</label>
              <textarea
                value={editingStop.notes || ''}
                onChange={(e) => setEditingStop({ ...editingStop, notes: e.target.value })}
                className="input"
                style={{ minHeight: '60px' }}
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingStop.is_overnight}
                  onChange={(e) => setEditingStop({ ...editingStop, is_overnight: e.target.checked })}
                />
                <span style={{ fontSize: '13px' }}>Overnight Stop</span>
              </label>
            </div>

            {/* HH-specific fields if from Harvest Hosts */}
            {editingStop.source === 'harvest_hosts' && (
              <div style={{ background: 'rgba(22, 163, 74, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '10px', fontSize: '11px' }}>
                <div style={{ fontWeight: 600, marginBottom: '5px', color: '#16a34a' }}>🌾 Harvest Hosts Info</div>
                {editingStop.max_rig_size && <div>Max Rig: {editingStop.max_rig_size}</div>}
                {editingStop.parking_surface && <div>Surface: {editingStop.parking_surface}</div>}
                {editingStop.check_in_time && <div>Check-in: {editingStop.check_in_time}</div>}
                {editingStop.parking_instructions && (
                  <div style={{ marginTop: '5px' }}>
                    <strong>Parking:</strong> {editingStop.parking_instructions.substring(0, 150)}...
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setEditingStop(null)}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveStop}
                className="btn btn-primary"
                style={{ flex: 2 }}
              >
                {editingStop.id ? 'Save Changes' : 'Add Stop'}
              </button>
            </div>
          </div>
        )}

        {/* Stops List */}
        {trip.stops && trip.stops.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trip.stops.map((stop: any, index: number) => (
              <div
                key={stop.id}
                onClick={() => setEditingStop(stop)}
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  borderLeft: `4px solid ${getCategoryColor(stop.category)}`,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '18px' }}>{getCategoryIcon(stop.category)}</span>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>
                        {index + 1}. {stop.name}
                      </h3>
                      {stop.state && <StateSVG stateCode={stop.state} size={28} />}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                      {stop.city}{stop.state && `, ${STATE_NAMES[stop.state.toUpperCase()] || stop.state}`}
                      {stop.category && stop.category !== 'other' && (
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          background: getCategoryColor(stop.category) + '20',
                          color: getCategoryColor(stop.category),
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500
                        }}>
                          {stop.category.replace(/_/g, ' ')}
                        </span>
                      )}
                    </p>
                    {/* Arrival/Departure dates */}
                    {(stop.arrival_time || stop.departure_time) && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {stop.arrival_time && (
                          <span>
                            📅 Arrive: {new Date(stop.arrival_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {stop.arrival_tentative && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> (tentative)</span>}
                          </span>
                        )}
                        {stop.departure_time && (
                          <span>
                            🚗 Depart: {new Date(stop.departure_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {stop.departure_tentative && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> (tentative)</span>}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Auto-generated stop indicator */}
                    {stop.needs_user_selection && (
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        background: 'var(--accent-warning)15',
                        border: '1px solid var(--accent-warning)',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--accent-warning)', marginBottom: '4px' }}>
                          ⚠️ Suggested Stop Area - Action Needed
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          Find a campground, RV park, or Harvest Host within {stop.search_radius_miles || 30} miles of this location.
                        </div>
                      </div>
                    )}
                    {/* Harvest Hosts / Source specific details */}
                    {(stop.max_rig_size || stop.check_in_time || stop.parking_spaces) && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {stop.max_rig_size && <span>🚐 {stop.max_rig_size} </span>}
                        {stop.parking_spaces && <span>🅿️ {stop.parking_spaces} spaces </span>}
                        {stop.check_in_time && <span>🕐 {stop.check_in_time}</span>}
                      </div>
                    )}
                    {stop.parking_instructions && (
                      <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        📋 {stop.parking_instructions}
                      </p>
                    )}
                    {stop.amenities && (
                      <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        ✨ {stop.amenities}
                      </p>
                    )}
                    {stop.source_url && (
                      <a
                        href={stop.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: 'var(--accent-primary)', marginTop: '4px', display: 'inline-block' }}
                      >
                        🔗 View on {stop.source || 'source'}
                      </a>
                    )}
                    {stop.notes && (
                      <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{stop.notes}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {stop.is_overnight && (
                      <span style={{
                        backgroundColor: 'var(--accent-success)',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '10px'
                      }}>
                        Overnight
                      </span>
                    )}
                    <button
                      onClick={() => setEditingStop(stop)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteStop(stop.id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        background: 'var(--accent-error)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No stops added yet. Click "Add Stop" or "Import HH" to get started.</p>
        )}
      </div>

      {trip.route_notes && trip.route_notes.length > 0 && (
        <div className="card">
          <h2>Route Notes ({trip.route_notes.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
            {trip.route_notes.map((note: any) => (
              <div
                key={note.id}
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  borderLeft: '4px solid var(--accent-warning)'
                }}
              >
                <h4 style={{ marginBottom: '5px', color: 'var(--text-primary)' }}>{note.title}</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  Type: {note.note_type}
                </p>
                {note.description && (
                  <p style={{ marginTop: '5px', fontSize: '14px', color: 'var(--text-secondary)' }}>{note.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
