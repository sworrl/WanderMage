import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { metrics, pois, weather } from '../services/api'
import StatesVisitedMap from '../components/StatesVisitedMap'
import MultiCrawlStatusDisplay from '../components/MultiCrawlStatusDisplay'
import POIDataMap from '../components/POIDataMap'
import { US_STATE_PATHS } from '../data/usStatePaths'
import './Dashboard.css'

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

// State viewBox bounds for proper rendering (x, y, width, height)
const STATE_VIEWBOXES: Record<string, string> = {
  'AL': '625 355 65 120', 'AK': '0 460 230 140', 'AZ': '135 295 100 140',
  'AR': '495 340 100 90', 'CA': '0 160 140 230', 'CO': '250 235 135 95',
  'CT': '840 155 50 45', 'DE': '815 215 30 50', 'FL': '675 420 130 170',
  'GA': '665 350 105 130', 'HI': '225 520 130 85', 'ID': '140 60 95 180',
  'IL': '555 200 75 135', 'IN': '615 200 60 115', 'IA': '465 170 110 80',
  'KS': '370 255 135 75', 'KY': '595 285 130 65', 'LA': '515 410 110 95',
  'ME': '855 50 70 115', 'MD': '755 215 95 60', 'MA': '850 140 65 45',
  'MI': '555 80 135 150', 'MN': '460 60 95 145', 'MS': '570 365 65 120',
  'MO': '480 245 120 105', 'MT': '185 45 155 100', 'NE': '345 180 145 75',
  'NV': '95 170 105 165', 'NH': '865 90 35 80', 'NJ': '825 175 35 75',
  'NM': '235 315 120 120', 'NY': '770 100 105 110', 'NC': '685 295 130 65',
  'ND': '380 65 115 75', 'OH': '660 195 70 95', 'OK': '375 320 135 80',
  'OR': '55 85 140 100', 'PA': '745 175 100 65', 'RI': '880 160 25 30',
  'SC': '710 335 75 70', 'SD': '380 125 115 80', 'TN': '580 310 145 55',
  'TX': '300 350 220 195', 'UT': '185 210 90 130', 'VT': '860 95 30 65',
  'VA': '720 235 120 75', 'WA': '80 25 120 85', 'WV': '710 220 65 80',
  'WI': '530 100 85 115', 'WY': '240 140 115 90'
}

// All US states for complete display
const ALL_US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

// Get color for POI count using gold/amber gradient
const getPOIStateColor = (count: number, maxCount: number): string => {
  if (count === 0) return '#2a2a2a'; // Dark gray for no data

  // Normalize count (cap at reasonable max for color scaling)
  const normalizedCount = Math.min(count / Math.max(maxCount, 1000), 1);

  // Gold/Amber gradient: Dark amber (30°) → Gold (45°) → Bright Gold (50°)
  const hue = 30 + (normalizedCount * 20); // 30 to 50 degrees (amber to gold)
  const saturation = 60 + (normalizedCount * 30); // 60% to 90%
  const lightness = 35 + (normalizedCount * 20); // 35% to 55%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Generate speckle pattern for POI count
const generatePOISpeckles = (stateCode: string, count: number): JSX.Element[] => {
  if (count === 0) return [];

  // More speckles for higher POI counts (scaled logarithmically)
  const speckleCount = Math.min(Math.floor(Math.log10(count + 1) * 8), 25);
  const speckles: JSX.Element[] = [];

  for (let i = 0; i < speckleCount; i++) {
    // Deterministic positioning based on state code
    const x = ((i * 7 + stateCode.charCodeAt(0)) % 20);
    const y = ((i * 11 + stateCode.charCodeAt(1)) % 20);
    speckles.push(
      <circle
        key={i}
        cx={x}
        cy={y}
        r={1}
        fill="rgba(255, 255, 255, 0.6)"
      />
    );
  }

  return speckles;
}

// Category icons mapping - comprehensive list matching database categories
const CATEGORY_ICONS: Record<string, string> = {
  // Core RV/Camping
  'rest_areas': '🛣️',
  'rest_area': '🛣️',
  'parking_lots': '🅿️',
  'parking_lot': '🅿️',
  'rv_parks': '🚐',
  'rv_park': '🚐',
  'campgrounds': '⛺',
  'campground': '⛺',
  'tent_camping': '🏕️',
  'dump_stations': '🚰',
  'dump_station': '🚰',

  // Fuel & Travel
  'fuel_stations': '⛽',
  'fuel_station': '⛽',
  'gas_stations': '⛽',
  'gas_station': '⛽',
  'truck_stops': '🚛',
  'truck_stop': '🚛',
  'ev_charging': '🔌',

  // Recreation
  'parks': '🌲',
  'park': '🌲',
  'state_parks': '🏞️',
  'state_park': '🏞️',
  'scenic_viewpoint': '🏔️',

  // Food & Shopping
  'dining': '🍽️',
  'restaurant': '🍽️',
  'shopping': '🛍️',
  'grocery': '🛒',
  'convenience_stores': '🏪',
  'convenience_store': '🏪',

  // Lodging
  'lodging': '🏨',
  'hotel': '🏨',

  // Services
  'visitor_centers': '🏛️',
  'visitor_center': '🏛️',
  'welcome_center': '🏛️',
  'restrooms': '🚻',
  'restroom': '🚻',

  // Government & Public
  'government': '🏢',
  'post_offices': '📮',
  'post_office': '📮',

  // Medical
  'hospitals': '🏥',
  'hospital': '🏥',
  'pharmacy': '💊',
  'vet': '🐾',

  // Utilities
  'water': '💧',
  'propane': '🔥',
  'repair': '🔧',
  'laundry': '🧺',
  'wifi': '📶',
  'electric': '⚡',

  // Infrastructure
  'overpass_heights': '🚧',
  'parking': '🅿️'
}

// Mini state SVG component
const StateMiniSVG = ({ stateCode, size = 28 }: { stateCode: string; size?: number }) => {
  const path = US_STATE_PATHS[stateCode.toUpperCase()]
  if (!path) return null

  return (
    <svg
      viewBox="0 0 960 600"
      width={size}
      height={size * 0.625}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
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

// Skeleton loader components
const SkeletonBox = ({ width = '100%', height = '20px', style = {} }: { width?: string; height?: string; style?: React.CSSProperties }) => (
  <div className="skeleton-loader" style={{ width, height, borderRadius: '4px', ...style }} />
)

const SkeletonStatCard = () => (
  <div className="stat-card">
    <SkeletonBox width="60%" height="14px" style={{ marginBottom: '8px' }} />
    <SkeletonBox width="80%" height="28px" />
  </div>
)

const SkeletonCategoryCard = () => (
  <div style={{
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '90px',
    justifyContent: 'center'
  }}>
    <SkeletonBox width="32px" height="32px" style={{ borderRadius: '50%', marginBottom: '6px' }} />
    <SkeletonBox width="70%" height="12px" style={{ marginBottom: '4px' }} />
    <SkeletonBox width="50%" height="16px" />
  </div>
)

const SkeletonStateCard = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 4px',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    minHeight: '85px'
  }}>
    <SkeletonBox width="50px" height="40px" style={{ marginBottom: '4px' }} />
    <SkeletonBox width="20px" height="8px" style={{ marginBottom: '2px' }} />
    <SkeletonBox width="30px" height="10px" />
  </div>
)

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [poiStats, setPoiStats] = useState<any>(null)
  const [subcategoryStats, setSubcategoryStats] = useState<any>(null)
  const [heightsStats, setHeightsStats] = useState<any>(null)
  const [railroadStats, setRailroadStats] = useState<any>(null)
  const [fuelPrices, setFuelPrices] = useState<any>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [currentWeather, setCurrentWeather] = useState<any>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)  // Start true to show loading
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [selectedWeatherAlert, setSelectedWeatherAlert] = useState<any>(null)
  const [hhStays, setHhStays] = useState<any>(null)
  const [selectedHHStay, setSelectedHHStay] = useState<any>(null)

  // Navigate to map centered on a specific location with height data
  const showOnMap = (item: any) => {
    // Store the target location and height data in sessionStorage so MapView can read it
    sessionStorage.setItem('mapTarget', JSON.stringify({
      lat: item.latitude,
      lon: item.longitude,
      zoom: 17,
      heightData: {
        name: item.name,
        road_name: item.road_name,
        height_feet: item.height_feet
      }
    }))
    navigate('/map')
  }

  // Open Google Street View in a new tab
  const openStreetView = (lat: number, lon: number) => {
    window.open(
      `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  useEffect(() => {
    // Load all data in parallel - each section shows skeleton then content when ready
    loadStats()
    loadPoiStats()
    loadSubcategoryStats()
    loadHeightsStats()
    loadRailroadStats()
    loadFuelPrices()
    loadCurrentWeather()
    loadHHStays()
  }, [])

  // Fallback to IP-based geolocation (via backend to avoid mixed-content issues)
  const getLocationByIP = async (): Promise<{ latitude: number; longitude: number; city?: string } | null> => {
    try {
      const response = await weather.getIpLocation()
      if (response.data.success) {
        return {
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          city: response.data.city
        }
      }
    } catch (e) {
      console.error('IP geolocation failed:', e)
    }
    return null
  }

  const fetchWeatherForLocation = async (latitude: number, longitude: number) => {
    try {
      const response = await weather.updateUserLocation(latitude, longitude)
      setCurrentWeather(response.data)
      setWeatherError(null)
    } catch (error) {
      console.error('Failed to fetch weather:', error)
      setWeatherError('Failed to fetch weather data')
    } finally {
      setWeatherLoading(false)
    }
  }

  const loadCurrentWeather = async () => {
    setWeatherLoading(true)
    setWeatherError(null)

    // Try IP-based location first (fast, always works)
    try {
      const ipLocation = await getLocationByIP()
      if (ipLocation) {
        console.log('Using IP-based location:', ipLocation.city)
        await fetchWeatherForLocation(ipLocation.latitude, ipLocation.longitude)
        return
      }
    } catch (e) {
      console.warn('IP geolocation failed:', e)
    }

    // Fallback to browser geolocation (may prompt for permission)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          await fetchWeatherForLocation(latitude, longitude)
        },
        async (error) => {
          console.warn('Browser geolocation also failed:', error.message)
          setWeatherError('Could not determine location. Click to try again.')
          setWeatherLoading(false)
        },
        { timeout: 5000, enableHighAccuracy: false }
      )
    } else {
      setWeatherError('Could not determine location')
      setWeatherLoading(false)
    }
  }

  const requestLocationPermission = () => {
    setWeatherError(null)
    loadCurrentWeather()
  }

  const loadSubcategoryStats = async () => {
    try {
      const response = await pois.getSubcategoryStats()
      setSubcategoryStats(response.data)
    } catch (error) {
      console.error('Failed to load subcategory stats:', error)
    }
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const loadFuelPrices = async () => {
    try {
      const response = await metrics.getFuelPrices()
      setFuelPrices(response.data)
    } catch (error) {
      console.error('Failed to load fuel prices:', error)
    }
  }

  const loadStats = async () => {
    try {
      const response = await metrics.getStatistics()
      setStats(response.data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadPoiStats = async () => {
    try {
      const response = await pois.getDatabaseStats()
      setPoiStats(response.data)
    } catch (error) {
      console.error('Failed to load POI stats:', error)
    }
  }

  const loadHeightsStats = async () => {
    try {
      const response = await pois.getOverpassHeightsStats()
      setHeightsStats(response.data)
    } catch (error) {
      console.error('Failed to load heights stats:', error)
    }
  }

  const loadRailroadStats = async () => {
    try {
      const response = await pois.getRailroadCrossingsStats()
      setRailroadStats(response.data)
    } catch (error) {
      console.error('Failed to load railroad stats:', error)
    }
  }

  const loadHHStays = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/harvest-hosts/stays?upcoming_only=true', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      setHhStays(data)
    } catch (error) {
      console.error('Failed to load HH stays:', error)
    }
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      {/* Harvest Hosts Upcoming Stays */}
      {hhStays && hhStays.stays && hhStays.stays.length > 0 && (
        <div className="card mb-4">
          <h2>🌾 Upcoming Harvest Hosts Stays ({hhStays.stays.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
            {hhStays.stays.map((stay: any) => (
              <div
                key={stay.id}
                onClick={() => setSelectedHHStay(stay)}
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>
                      {stay.host_name}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      📅 {stay.check_in_date ? new Date(stay.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                      {stay.nights && ` • ${stay.nights} night${stay.nights > 1 ? 's' : ''}`}
                    </div>
                    {stay.status && (
                      <div style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: stay.is_confirmed ? 'rgba(22, 163, 74, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: stay.is_confirmed ? '#16a34a' : '#f59e0b',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {stay.status}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {stay.trip_id ? (
                      <div style={{ fontSize: '11px', color: '#10b981', fontStyle: 'italic' }}>
                        ✓ Added to trip
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Ready to add to trip
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--accent-primary)' }}>
                      Click for details →
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HH Stay Detail Modal */}
      {selectedHHStay && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setSelectedHHStay(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', color: 'var(--text-primary)' }}>
                  {selectedHHStay.host_name}
                </h2>
                {selectedHHStay.host_type && (
                  <div style={{ fontSize: '14px', color: 'var(--accent-primary)', marginTop: '4px' }}>
                    {selectedHHStay.host_type}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedHHStay(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* Stay Dates */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Check-in</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedHHStay.check_in_date ? new Date(selectedHHStay.check_in_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                  </div>
                  {selectedHHStay.check_in_time && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedHHStay.check_in_time}</div>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px' }}>→</div>
                  {selectedHHStay.nights && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {selectedHHStay.nights} night{selectedHHStay.nights > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Check-out</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedHHStay.check_out_date ? new Date(selectedHHStay.check_out_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                  </div>
                  {selectedHHStay.check_out_time && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedHHStay.check_out_time}</div>
                  )}
                </div>
              </div>
              {selectedHHStay.status && (
                <div style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: selectedHHStay.is_confirmed ? 'rgba(22, 163, 74, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: selectedHHStay.is_confirmed ? '#16a34a' : '#f59e0b',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  marginTop: '10px'
                }}>
                  {selectedHHStay.status}
                </div>
              )}
            </div>

            {/* Location */}
            {(selectedHHStay.address || selectedHHStay.city || selectedHHStay.latitude) && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>📍 Location</h3>
                {selectedHHStay.address && (
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {selectedHHStay.address}
                  </div>
                )}
                {(selectedHHStay.city || selectedHHStay.state || selectedHHStay.zip_code) && (
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {[selectedHHStay.city, selectedHHStay.state, selectedHHStay.zip_code].filter(Boolean).join(', ')}
                  </div>
                )}
                {selectedHHStay.latitude && selectedHHStay.longitude && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Coordinates: {selectedHHStay.latitude}, {selectedHHStay.longitude}
                  </div>
                )}
                {selectedHHStay.location_directions && (
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    padding: '10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '6px',
                    fontStyle: 'italic'
                  }}>
                    {selectedHHStay.location_directions}
                  </div>
                )}
              </div>
            )}

            {/* Parking Info */}
            {(selectedHHStay.max_rig_size || selectedHHStay.parking_spaces || selectedHHStay.parking_surface || selectedHHStay.check_in_method) && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>🚐 Parking Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {selectedHHStay.max_rig_size && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max Rig Size</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedHHStay.max_rig_size}</div>
                    </div>
                  )}
                  {selectedHHStay.parking_spaces && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Parking Spaces</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedHHStay.parking_spaces}</div>
                    </div>
                  )}
                  {selectedHHStay.parking_surface && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Surface</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedHHStay.parking_surface}</div>
                    </div>
                  )}
                  {selectedHHStay.check_in_method && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Check-in Method</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedHHStay.check_in_method}</div>
                    </div>
                  )}
                </div>
                {selectedHHStay.parking_instructions && (
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    padding: '10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '6px'
                  }}>
                    {selectedHHStay.parking_instructions}
                  </div>
                )}
              </div>
            )}

            {/* Host Rules - Always show this section */}
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>📋 House Rules</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {/* Pets - explicit true/false from page, no mention = not allowed */}
                <div style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: selectedHHStay.pets_allowed === true ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: selectedHHStay.pets_allowed === true ? '#16a34a' : '#ef4444'
                }}>
                  {selectedHHStay.pets_allowed === true ? '✓ Pets Allowed' : '✗ No Pets'}
                </div>
                {/* Generators - true/false if mentioned, null = not listed (presumed OK) */}
                <div style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: selectedHHStay.generators_allowed === true
                    ? 'rgba(22, 163, 74, 0.15)'
                    : selectedHHStay.generators_allowed === false
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(200, 180, 100, 0.15)',
                  color: selectedHHStay.generators_allowed === true
                    ? '#16a34a'
                    : selectedHHStay.generators_allowed === false
                      ? '#ef4444'
                      : '#b8860b'
                }}>
                  {selectedHHStay.generators_allowed === true
                    ? '✓ Generators OK'
                    : selectedHHStay.generators_allowed === false
                      ? '✗ No Generators'
                      : '~ Generators Not Listed'}
                </div>
                {/* Slideouts - true/false if mentioned, null = not listed (presumed OK) */}
                <div style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: selectedHHStay.slideouts_allowed === true
                    ? 'rgba(22, 163, 74, 0.15)'
                    : selectedHHStay.slideouts_allowed === false
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(200, 180, 100, 0.15)',
                  color: selectedHHStay.slideouts_allowed === true
                    ? '#16a34a'
                    : selectedHHStay.slideouts_allowed === false
                      ? '#ef4444'
                      : '#b8860b'
                }}>
                  {selectedHHStay.slideouts_allowed === true
                    ? '✓ Slideouts OK'
                    : selectedHHStay.slideouts_allowed === false
                      ? '✗ No Slideouts'
                      : '~ Slideouts Not Listed'}
                </div>
              </div>
            </div>

            {/* Contact & Links */}
            {(selectedHHStay.phone || selectedHHStay.website) && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>📞 Contact</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {selectedHHStay.phone && (
                    <a
                      href={`tel:${selectedHHStay.phone}`}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        textDecoration: 'none',
                        fontSize: '14px'
                      }}
                    >
                      📞 {selectedHHStay.phone}
                    </a>
                  )}
                  {selectedHHStay.website && (
                    <a
                      href={selectedHHStay.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                        fontSize: '14px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      🌐 Website
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Amenities */}
            {selectedHHStay.amenities && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>✨ Amenities</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {selectedHHStay.amenities}
                </div>
              </div>
            )}

            {/* How to Support */}
            {selectedHHStay.how_to_support && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>💝 How to Support the Host</h3>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px'
                }}>
                  {selectedHHStay.how_to_support}
                </div>
              </div>
            )}

            {/* Special Instructions / Host Message */}
            {(selectedHHStay.special_instructions || selectedHHStay.host_message) && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>💬 Host Message</h3>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px'
                }}>
                  {selectedHHStay.special_instructions || selectedHHStay.host_message}
                </div>
              </div>
            )}

            {/* Business Hours */}
            {selectedHHStay.business_hours && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>🕐 Business Hours</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {selectedHHStay.business_hours}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              {selectedHHStay.latitude && selectedHHStay.longitude && (
                <button
                  onClick={() => {
                    sessionStorage.setItem('mapTarget', JSON.stringify({
                      lat: selectedHHStay.latitude,
                      lon: selectedHHStay.longitude,
                      zoom: 15,
                      name: selectedHHStay.host_name
                    }))
                    navigate('/map')
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  📍 Show on Map
                </button>
              )}
              {selectedHHStay.latitude && selectedHHStay.longitude && (
                <button
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${selectedHHStay.latitude},${selectedHHStay.longitude}`,
                      '_blank'
                    )
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  🗺️ Google Maps
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Current Location Weather */}
      <div className="card mb-4">
        <h2>Current Weather</h2>
        {weatherLoading ? (
          <div className="stats-grid">
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </div>
        ) : weatherError ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🌤️</div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {weatherError}
            </div>
            <button
              onClick={requestLocationPermission}
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Request Location Access
            </button>
          </div>
        ) : currentWeather?.forecast?.forecast?.[0] ? (
            <>
              {/* Active Alerts - Clickable */}
              {currentWeather.forecast.alerts && currentWeather.forecast.alerts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {currentWeather.forecast.alerts.map((alert: any, index: number) => {
                    const severityColors: Record<string, { bg: string; border: string; text: string }> = {
                      'Extreme': { bg: 'rgba(127, 29, 29, 0.3)', border: '#dc2626', text: '#fca5a5' },
                      'Severe': { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444' },
                      'Moderate': { bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b', text: '#f59e0b' },
                      'Minor': { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#3b82f6' }
                    };
                    const colors = severityColors[alert.severity] || severityColors['Minor'];

                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedWeatherAlert(alert)}
                        style={{
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px',
                          padding: '12px 16px',
                          marginBottom: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = `0 4px 12px ${colors.border}40`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '16px' }}>
                                {alert.severity === 'Extreme' ? '🚨' : alert.severity === 'Severe' ? '⚠️' : alert.severity === 'Moderate' ? '⚡' : 'ℹ️'}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '14px', color: colors.text }}>
                                {alert.event}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: colors.border,
                                color: 'white',
                                fontWeight: 600,
                                textTransform: 'uppercase'
                              }}>
                                {alert.severity}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              {alert.headline?.length > 120 ? alert.headline.substring(0, 120) + '...' : alert.headline}
                            </div>
                            {alert.onset && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {new Date(alert.onset).toLocaleString()} — {alert.expires ? new Date(alert.expires).toLocaleString() : 'Until further notice'}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: colors.text, marginLeft: '12px', whiteSpace: 'nowrap' }}>
                            Click for details →
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Main Current Conditions */}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {/* Temperature & Icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {currentWeather.forecast.forecast[0].icon && (
                    <img
                      src={currentWeather.forecast.forecast[0].icon}
                      alt={currentWeather.forecast.forecast[0].shortForecast}
                      style={{ width: '72px', height: '72px' }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1 }}>
                      {currentWeather.forecast.forecast[0].temperature}°{currentWeather.forecast.forecast[0].temperatureUnit}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {currentWeather.forecast.location?.city}, {currentWeather.forecast.location?.state}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {currentWeather.forecast.forecast[0].name}
                    </div>
                  </div>
                </div>

                {/* Conditions Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  flex: 1,
                  minWidth: '280px'
                }}>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Wind</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentWeather.forecast.forecast[0].windSpeed} {currentWeather.forecast.forecast[0].windDirection}
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Humidity</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentWeather.forecast.forecast[0].relativeHumidity?.value ?? 'N/A'}%
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Precip Chance</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentWeather.forecast.forecast[0].probabilityOfPrecipitation?.value ?? 0}%
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Conditions</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentWeather.forecast.forecast[0].shortForecast}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Forecast Text */}
              {currentWeather.forecast.forecast[0].detailedForecast && (
                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    Detailed Forecast
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {currentWeather.forecast.forecast[0].detailedForecast}
                  </div>
                </div>
              )}

              {/* Extended Forecast (Next 5 periods) */}
              {currentWeather.forecast.forecast.length > 1 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Extended Forecast
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '10px'
                  }}>
                    {currentWeather.forecast.forecast.slice(1, 6).map((period: any, index: number) => (
                      <div
                        key={index}
                        style={{
                          background: 'var(--bg-secondary)',
                          borderRadius: '8px',
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          textAlign: 'center'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                          {period.name}
                        </div>
                        {period.icon && (
                          <img
                            src={period.icon}
                            alt={period.shortForecast}
                            style={{ width: '40px', height: '40px', marginBottom: '6px' }}
                          />
                        )}
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          {period.temperature}°
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
                          {period.shortForecast}
                        </div>
                        {(period.probabilityOfPrecipitation?.value ?? 0) > 0 && (
                          <div style={{
                            fontSize: '10px',
                            color: '#3b82f6',
                            marginTop: '4px',
                            fontWeight: 600
                          }}>
                            💧 {period.probabilityOfPrecipitation.value}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              No weather data available.
            </div>
          )}
      </div>

      {/* Weather Alert Detail Modal */}
      {selectedWeatherAlert && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setSelectedWeatherAlert(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: `2px solid ${
                selectedWeatherAlert.severity === 'Extreme' ? '#dc2626' :
                selectedWeatherAlert.severity === 'Severe' ? '#ef4444' :
                selectedWeatherAlert.severity === 'Moderate' ? '#f59e0b' : '#3b82f6'
              }`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alert Header */}
            <div style={{
              background: selectedWeatherAlert.severity === 'Extreme' ? 'rgba(127, 29, 29, 0.4)' :
                         selectedWeatherAlert.severity === 'Severe' ? 'rgba(239, 68, 68, 0.3)' :
                         selectedWeatherAlert.severity === 'Moderate' ? 'rgba(245, 158, 11, 0.3)' :
                         'rgba(59, 130, 246, 0.3)',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px' }}>
                      {selectedWeatherAlert.severity === 'Extreme' ? '🚨' :
                       selectedWeatherAlert.severity === 'Severe' ? '⚠️' :
                       selectedWeatherAlert.severity === 'Moderate' ? '⚡' : 'ℹ️'}
                    </span>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}>
                      {selectedWeatherAlert.event}
                    </h2>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: selectedWeatherAlert.severity === 'Extreme' ? '#dc2626' :
                                      selectedWeatherAlert.severity === 'Severe' ? '#ef4444' :
                                      selectedWeatherAlert.severity === 'Moderate' ? '#f59e0b' : '#3b82f6',
                      color: 'white',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      {selectedWeatherAlert.severity}
                    </span>
                    {selectedWeatherAlert.urgency && (
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600
                      }}>
                        Urgency: {selectedWeatherAlert.urgency}
                      </span>
                    )}
                    {selectedWeatherAlert.certainty && (
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600
                      }}>
                        Certainty: {selectedWeatherAlert.certainty}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWeatherAlert(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '28px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '0 8px',
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Alert Content */}
            <div style={{ padding: '24px' }}>
              {/* Timing */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '20px'
              }}>
                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Effective
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedWeatherAlert.onset ? new Date(selectedWeatherAlert.onset).toLocaleString() : 'Now'}
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Expires
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedWeatherAlert.expires ? new Date(selectedWeatherAlert.expires).toLocaleString() :
                     selectedWeatherAlert.ends ? new Date(selectedWeatherAlert.ends).toLocaleString() : 'Until Further Notice'}
                  </div>
                </div>
              </div>

              {/* Area Description */}
              {selectedWeatherAlert.area_desc && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Affected Area
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)'
                  }}>
                    {selectedWeatherAlert.area_desc}
                  </div>
                </div>
              )}

              {/* Headline */}
              {selectedWeatherAlert.headline && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Summary
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    lineHeight: 1.5
                  }}>
                    {selectedWeatherAlert.headline}
                  </div>
                </div>
              )}

              {/* Full Description */}
              {selectedWeatherAlert.description && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Details
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    background: 'var(--bg-secondary)',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {selectedWeatherAlert.description}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {selectedWeatherAlert.instruction && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Safety Instructions
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}>
                    {selectedWeatherAlert.instruction}
                  </div>
                </div>
              )}

              {/* Source */}
              {selectedWeatherAlert.sender && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textAlign: 'right',
                  fontStyle: 'italic'
                }}>
                  Source: {selectedWeatherAlert.sender}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POI Database Statistics */}
      <div className="card mb-4">
        <h2>POI Database Overview</h2>
        <div className="stats-grid">
          {poiStats ? (
            <>
              <div className="stat-card">
                <h3>Total POIs</h3>
                <div className="stat-value">{(poiStats.total_pois ?? 0).toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <h3>States with Data</h3>
                <div className="stat-value">{poiStats.states_with_data} / 50</div>
              </div>
              <div className="stat-card">
                <h3>Last Updated</h3>
                <div className="stat-value">
                  {poiStats.last_updated
                    ? new Date(poiStats.last_updated).toLocaleString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      })
                    : 'Never'}
                </div>
              </div>
            </>
          ) : (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          )}
        </div>

          <div className="grid grid-2 mt-4">
            <div>
              <h3>POIs by Category</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '10px'
              }}>
                {subcategoryStats && subcategoryStats.categories && subcategoryStats.categories.length > 0 ? (
                  subcategoryStats.categories.map((cat: any) => (
                    <div
                      key={cat.category}
                      onClick={() => cat.subcategories && cat.subcategories.length > 1 && toggleCategory(cat.category)}
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        padding: '12px',
                        cursor: cat.subcategories && cat.subcategories.length > 1 ? 'pointer' : 'default',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        minHeight: '90px',
                        justifyContent: 'center'
                      }}
                    >
                      <span style={{ fontSize: '24px', marginBottom: '6px' }}>
                        {CATEGORY_ICONS[cat.category] || '📍'}
                      </span>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '4px',
                        lineHeight: '1.2'
                      }}>
                        {cat.display_name}
                      </div>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-primary)' }}>
                        {(cat.total ?? 0).toLocaleString()}
                      </strong>
                      {cat.subcategories && cat.subcategories.length > 1 && (
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {cat.subcategories.length} types
                        </div>
                      )}
                    </div>
                  ))
                ) : poiStats && poiStats.by_category && poiStats.by_category.length > 0 ? (
                  poiStats.by_category.map((cat: any) => (
                    <div
                      key={cat.category}
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        minHeight: '90px',
                        justifyContent: 'center'
                      }}
                    >
                      <span style={{ fontSize: '24px', marginBottom: '6px' }}>
                        {CATEGORY_ICONS[cat.category] || '📍'}
                      </span>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '4px'
                      }}>
                        {(cat.category ?? '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </div>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-primary)' }}>
                        {(cat.count ?? 0).toLocaleString()}
                      </strong>
                    </div>
                  ))
                ) : (
                  // Skeleton loaders for categories
                  <>
                    <SkeletonCategoryCard />
                    <SkeletonCategoryCard />
                    <SkeletonCategoryCard />
                    <SkeletonCategoryCard />
                    <SkeletonCategoryCard />
                    <SkeletonCategoryCard />
                  </>
                )}
              </div>
            </div>

            <div>
              <h3>POI Coverage by State</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(10, 1fr)',
                gap: '8px',
                marginTop: '10px'
              }}>
                {poiStats && poiStats.by_state ? (() => {
                  // Create a map of state counts
                  const stateCountMap = new Map<string, number>();
                  poiStats.by_state.forEach((s: any) => {
                    stateCountMap.set(s.state.toUpperCase(), s.count);
                  });
                  const maxCount = Math.max(...Array.from(stateCountMap.values()), 1);

                  return ALL_US_STATES.map((stateCode) => {
                    const count = stateCountMap.get(stateCode) || 0;
                    const viewBox = STATE_VIEWBOXES[stateCode] || '0 0 960 600';
                    const baseColor = getPOIStateColor(count, maxCount);
                    const hasSpeckles = count > 0;
                    const patternId = `poi-speckle-${stateCode}`;

                    return (
                      <div
                        key={stateCode}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px 4px',
                          backgroundColor: 'var(--bg-tertiary)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          minHeight: '85px'
                        }}
                        title={`${STATE_NAMES[stateCode]}: ${count.toLocaleString()} POIs`}
                      >
                        {/* State SVG with speckle pattern */}
                        <div style={{ position: 'relative', width: '50px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <svg
                            viewBox={viewBox}
                            style={{
                              width: '100%',
                              height: '100%',
                              filter: count > 0 ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' : 'none'
                            }}
                            preserveAspectRatio="xMidYMid meet"
                          >
                            {/* Define speckle pattern for this state */}
                            {hasSpeckles && (
                              <defs>
                                <pattern
                                  id={patternId}
                                  patternUnits="userSpaceOnUse"
                                  width="20"
                                  height="20"
                                >
                                  <rect width="20" height="20" fill={baseColor} />
                                  {generatePOISpeckles(stateCode, count)}
                                </pattern>
                              </defs>
                            )}
                            <path
                              d={US_STATE_PATHS[stateCode] || ''}
                              fill={hasSpeckles ? `url(#${patternId})` : baseColor}
                              stroke={count > 0 ? 'var(--accent-primary)' : 'var(--border-color)'}
                              strokeWidth="2"
                            />
                          </svg>
                        </div>
                        {/* State code and count */}
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                          textAlign: 'center',
                          marginTop: '4px'
                        }}>
                          {stateCode}
                        </span>
                        <strong style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: count > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
                          marginTop: '2px'
                        }}>
                          {count > 0 ? count.toLocaleString() : '-'}
                        </strong>
                      </div>
                    );
                  });
                })() : (
                  // Skeleton loaders for states (50 states in 10 columns = 5 rows)
                  <>
                    {Array.from({ length: 50 }).map((_, i) => (
                      <SkeletonStateCard key={i} />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Overpass Heights Statistics */}
      <div className="card mb-4">
        <h2>Low Clearance Database (RV Safety)</h2>
        <div className="stats-grid">
          {heightsStats ? (
            <>
              <div className="stat-card">
                <h3>Total Heights</h3>
                <div className="stat-value">{(heightsStats.total_heights ?? 0).toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <h3>Average Height</h3>
                <div className="stat-value">{(heightsStats.average_height ?? 0).toFixed(1)} ft</div>
              </div>
              <div className="stat-card">
                <h3>Min / Max</h3>
                <div className="stat-value">
                  {(heightsStats.min_height ?? 0).toFixed(1)} / {(heightsStats.max_height ?? 0).toFixed(1)} ft
                </div>
              </div>
            </>
          ) : (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          )}
        </div>

        {heightsStats && (
          <div className="grid grid-2 mt-4">
            <div>
              <h3>Heights by Range</h3>
              <div className="metric-list">
                {heightsStats.by_height_range && heightsStats.by_height_range.length > 0 ? (
                  heightsStats.by_height_range.map((range: any) => (
                    <div key={range.range} className="metric-item">
                      <span>{range.range}:</span>
                      <strong>{(range.count ?? 0).toLocaleString()}</strong>
                    </div>
                  ))
                ) : (
                  <p>No height data</p>
                )}
              </div>
            </div>

            <div>
              <h3>Lowest Clearances ({heightsStats.lowest_clearances?.length || 0})</h3>
              <div className="metric-list" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
                {heightsStats.lowest_clearances && heightsStats.lowest_clearances.length > 0 ? (
                  heightsStats.lowest_clearances.map((item: any, index: number) => (
                    <div key={index} className="metric-item" style={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '10px',
                      background: item.height_feet < 11 ? 'rgba(239, 68, 68, 0.15)' : item.height_feet < 13 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-tertiary)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      border: item.height_feet < 11 ? '1px solid rgba(239, 68, 68, 0.3)' : item.height_feet < 13 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{item.road_name || item.name || 'Unknown'}</span>
                        <strong style={{
                          color: item.height_feet < 11 ? '#ef4444' : item.height_feet < 13 ? '#f59e0b' : '#10b981',
                          fontSize: '14px'
                        }}>
                          {(item.height_feet ?? 0).toFixed(1)} ft
                        </strong>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {item.restriction_type && <span style={{ textTransform: 'capitalize' }}>{item.restriction_type}</span>}
                        {item.direction && <span> • {item.direction}</span>}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontStyle: 'italic' }}>
                          {item.description}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'monospace' }}>
                        {item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}
                        {item.source && <span style={{ marginLeft: '8px', opacity: 0.7 }}>({item.source})</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          onClick={() => showOnMap(item)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            background: '#3B82F6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          Show on Map
                        </button>
                        <button
                          onClick={() => openStreetView(item.latitude, item.longitude)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            background: '#10B981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          Street View
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No clearance data</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Railroad Crossings Statistics */}
      <div className="card mb-4">
        <h2>Railroad Crossings Database (RV Safety)</h2>
        <div className="stats-grid">
          {railroadStats ? (
            <>
              <div className="stat-card">
                <h3>Total Crossings</h3>
                <div className="stat-value">{railroadStats.total?.toLocaleString() || 0}</div>
              </div>
              <div className="stat-card">
                <h3>With Gates</h3>
                <div className="stat-value" style={{ color: '#10b981' }}>
                  {railroadStats.with_gates?.toLocaleString() || 0}
                </div>
              </div>
              <div className="stat-card">
                <h3>With Lights/Bells</h3>
                <div className="stat-value" style={{ color: '#f59e0b' }}>
                  {railroadStats.with_lights?.toLocaleString() || 0}
                </div>
              </div>
            </>
          ) : (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          )}
        </div>

        {railroadStats && railroadStats.by_state && Object.keys(railroadStats.by_state).length > 0 && (
          <div className="mt-4">
            <h3>Top States by Railroad Crossings</h3>
            <div className="metric-list">
              {Object.entries(railroadStats.by_state)
                .sort((a: any, b: any) => b[1] - a[1])
                .slice(0, 10)
                .map(([state, count]: [string, any]) => (
                  <div key={state} className="metric-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StateMiniSVG stateCode={state} size={24} />
                      {STATE_NAMES[state] || state}:
                    </span>
                    <strong>{count.toLocaleString()}</strong>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Current Fuel Prices */}
      {fuelPrices && fuelPrices.has_data && (
        <div className="card mb-4">
          <h2>Current Fuel Prices (EIA Data)</h2>

          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <h3>US Regular</h3>
              <div className="stat-value" style={{ color: '#ffffff', textShadow: '0 0 10px rgba(16, 185, 129, 0.5)' }}>
                ${fuelPrices.us_average_regular?.toFixed(3) || 'N/A'}
              </div>
              {fuelPrices.us_regular_change !== null && fuelPrices.us_regular_change !== undefined && (
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: fuelPrices.us_regular_change > 0 ? '#ef4444' : fuelPrices.us_regular_change < 0 ? '#10b981' : 'var(--text-muted)',
                  marginTop: '4px'
                }}>
                  {fuelPrices.us_regular_change > 0 ? '▲' : fuelPrices.us_regular_change < 0 ? '▼' : '—'}
                  {' '}${Math.abs(fuelPrices.us_regular_change ?? 0).toFixed(3)}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>per gallon</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {fuelPrices.last_updated ? new Date(fuelPrices.last_updated).toLocaleDateString() : ''}
              </div>
            </div>
            <div className="stat-card">
              <h3>US Diesel</h3>
              {fuelPrices.us_average_diesel ? (
                <>
                  <div className="stat-value" style={{ color: '#ffffff', textShadow: '0 0 10px rgba(245, 158, 11, 0.5)' }}>
                    ${(fuelPrices.us_average_diesel ?? 0).toFixed(3)}
                  </div>
                  {fuelPrices.us_diesel_change !== null && fuelPrices.us_diesel_change !== undefined && (
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: fuelPrices.us_diesel_change > 0 ? '#ef4444' : fuelPrices.us_diesel_change < 0 ? '#10b981' : 'var(--text-muted)',
                      marginTop: '4px'
                    }}>
                      {fuelPrices.us_diesel_change > 0 ? '▲' : fuelPrices.us_diesel_change < 0 ? '▼' : '—'}
                      {' '}${Math.abs(fuelPrices.us_diesel_change ?? 0).toFixed(3)}
                    </div>
                  )}
                </>
              ) : (
                <div className="stat-value" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
                  Not Available
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>per gallon</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {fuelPrices.last_updated ? new Date(fuelPrices.last_updated).toLocaleDateString() : ''}
              </div>
            </div>
            <div className="stat-card">
              <h3>US Propane</h3>
              {fuelPrices.us_average_propane ? (
                <>
                  <div className="stat-value" style={{ color: '#ffffff', textShadow: '0 0 10px rgba(139, 92, 246, 0.5)' }}>
                    ${(fuelPrices.us_average_propane ?? 0).toFixed(3)}
                  </div>
                  {fuelPrices.us_propane_change !== null && fuelPrices.us_propane_change !== undefined && (
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: fuelPrices.us_propane_change > 0 ? '#ef4444' : fuelPrices.us_propane_change < 0 ? '#10b981' : 'var(--text-muted)',
                      marginTop: '4px'
                    }}>
                      {fuelPrices.us_propane_change > 0 ? '▲' : fuelPrices.us_propane_change < 0 ? '▼' : '—'}
                      {' '}${Math.abs(fuelPrices.us_propane_change ?? 0).toFixed(3)}
                    </div>
                  )}
                </>
              ) : (
                <div className="stat-value" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
                  Not Available
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>per gallon</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {fuelPrices.propane_date ? new Date(fuelPrices.propane_date).toLocaleDateString() : (fuelPrices.last_updated ? new Date(fuelPrices.last_updated).toLocaleDateString() : '')}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div>
              <h3>Regular Gas by Region</h3>
              <div className="metric-list">
                {fuelPrices.regions?.filter((r: string) => r !== 'US').map((region: string) => {
                  const priceData = fuelPrices.prices[region]?.regular;
                  const change = priceData?.change;
                  return (
                    <div key={region} className="metric-item">
                      <span>{fuelPrices.region_names[region]}:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ color: '#ffffff' }}>${priceData?.price?.toFixed(3) || 'N/A'}</strong>
                        {change !== null && change !== undefined && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: change > 0 ? '#ef4444' : change < 0 ? '#10b981' : 'var(--text-muted)'
                          }}>
                            {change > 0 ? '▲' : change < 0 ? '▼' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3>Diesel by Region</h3>
              {fuelPrices.us_average_diesel ? (
                <div className="metric-list">
                  {fuelPrices.regions?.filter((r: string) => r !== 'US').map((region: string) => {
                    const priceData = fuelPrices.prices[region]?.diesel;
                    const change = priceData?.change;
                    return (
                      <div key={region} className="metric-item">
                        <span>{fuelPrices.region_names[region]}:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: '#ffffff' }}>${priceData?.price?.toFixed(3) || 'N/A'}</strong>
                          {change !== null && change !== undefined && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: change > 0 ? '#ef4444' : change < 0 ? '#10b981' : 'var(--text-muted)'
                            }}>
                              {change > 0 ? '▲' : change < 0 ? '▼' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  textAlign: 'center'
                }}>
                  <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>
                    Diesel prices not available.
                  </p>
                </div>
              )}
            </div>
            <div>
              <h3>Propane by Region</h3>
              {fuelPrices.us_average_propane ? (
                <div className="metric-list">
                  {fuelPrices.regions?.filter((r: string) => r !== 'US' && r !== 'PADD4' && r !== 'PADD5').map((region: string) => {
                    const priceData = fuelPrices.prices[region]?.propane;
                    const change = priceData?.change;
                    return (
                      <div key={region} className="metric-item">
                        <span>{fuelPrices.region_names[region]}:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: '#ffffff' }}>${priceData?.price?.toFixed(3) || 'N/A'}</strong>
                          {change !== null && change !== undefined && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: change > 0 ? '#ef4444' : change < 0 ? '#10b981' : 'var(--text-muted)'
                            }}>
                              {change > 0 ? '▲' : change < 0 ? '▼' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  textAlign: 'center'
                }}>
                  <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>
                    Propane prices not available.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fuelPrices && !fuelPrices.has_data && (
        <div className="card mb-4" style={{ background: 'var(--bg-secondary)', borderLeft: '4px solid #f59e0b' }}>
          <h2>Fuel Prices</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {fuelPrices.message || 'No fuel price data available. Configure EIA API key in Settings to fetch prices.'}
          </p>
        </div>
      )}

      {/* POI Distribution Map */}
      {poiStats && poiStats.by_state && (
        <div className="card mb-4">
          <POIDataMap stateData={poiStats.by_state} />
        </div>
      )}

      {/* POI Crawl Status */}
      <div className="mb-4">
        <MultiCrawlStatusDisplay />
      </div>

      <div className="stats-grid">
        {stats ? (
          <>
            <div className="stat-card">
              <h3>Total Trips</h3>
              <div className="stat-value">{stats.overall.total_trips}</div>
            </div>

            <div className="stat-card">
              <h3>Total Miles</h3>
              <div className="stat-value">{(stats.overall?.total_miles ?? 0).toLocaleString()}</div>
            </div>

            <div className="stat-card">
              <h3>Average MPG</h3>
              <div className="stat-value">{stats.overall.avg_mpg || 'N/A'}</div>
            </div>

            <div className="stat-card">
              <h3>Total Fuel Cost</h3>
              <div className="stat-value">${(stats.overall?.total_fuel_cost ?? 0).toFixed(2)}</div>
            </div>

            <div className="stat-card">
              <h3>States Visited</h3>
              <div className="stat-value">{stats.overall.states_count}</div>
            </div>

            <div className="stat-card">
              <h3>Total Stops</h3>
              <div className="stat-value">{stats.overall.total_stops}</div>
            </div>
          </>
        ) : (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        )}
      </div>

      {stats && (
        <>
          <div className="grid grid-2 mt-4">
            <div className="card">
              <h2>Fuel Metrics</h2>
              <div className="metric-list">
                <div className="metric-item">
                  <span>Total Fill-ups:</span>
                  <strong>{stats.fuel.total_fillups}</strong>
                </div>
                <div className="metric-item">
                  <span>Total Gallons:</span>
                  <strong>{(stats.fuel?.total_gallons ?? 0).toFixed(2)}</strong>
                </div>
                <div className="metric-item">
                  <span>Avg Price/Gallon:</span>
                  <strong>${(stats.fuel?.avg_price_per_gallon ?? 0).toFixed(2)}</strong>
                </div>
                <div className="metric-item">
                  <span>Best MPG:</span>
                  <strong>{stats.fuel.best_mpg || 'N/A'}</strong>
                </div>
                <div className="metric-item">
                  <span>Worst MPG:</span>
                  <strong>{stats.fuel.worst_mpg || 'N/A'}</strong>
                </div>
                {stats.fuel.cost_per_mile && (
                  <div className="metric-item">
                    <span>Cost per Mile:</span>
                    <strong>${(stats.fuel?.cost_per_mile ?? 0).toFixed(2)}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h2>Recent States from Trips</h2>
              <div className="states-list">
                {stats.overall.states_visited.length > 0 ? (
                  stats.overall.states_visited.map((state: string) => (
                    <span key={state} className="state-badge">
                      {state}
                    </span>
                  ))
                ) : (
                  <p>No states visited yet</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <StatesVisitedMap onUpdate={loadStats} />
          </div>

          {stats.by_month.length > 0 && (
            <div className="card mt-4">
              <h2>Monthly Overview</h2>
              <div className="monthly-grid">
                {stats.by_month.map((month: any) => (
                  <div key={month.month} className="month-card">
                    <h4>{month.month}</h4>
                    <div className="month-stats">
                      <div>Miles: {(month.miles ?? 0).toFixed(0)}</div>
                      <div>Cost: ${(month.fuel_cost ?? 0).toFixed(2)}</div>
                      {month.avg_mpg && <div>MPG: {month.avg_mpg}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
