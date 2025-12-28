import React, { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { trips as tripsApi } from '../services/api'
import { safeStorage } from '../utils/storage'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css'
import L from 'leaflet'

// Helper: Calculate distance between two points in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Helper: Find closest point on route to a given point
function findClosestRouteIndex(route: [number, number][], lat: number, lon: number): number {
  let minDist = Infinity
  let closestIdx = 0
  for (let i = 0; i < route.length; i++) {
    const dist = haversineDistance(lat, lon, route[i][0], route[i][1])
    if (dist < minDist) {
      minDist = dist
      closestIdx = i
    }
  }
  return closestIdx
}

// Helper: Extract route segment around a point (by distance in meters)
function extractRouteSegment(
  route: [number, number][],
  centerIdx: number,
  distanceMeters: number
): [number, number][] {
  if (route.length < 2) return route

  // Go backwards from center to find start
  let startIdx = centerIdx
  let backDist = 0
  for (let i = centerIdx; i > 0; i--) {
    backDist += haversineDistance(route[i][0], route[i][1], route[i-1][0], route[i-1][1])
    if (backDist >= distanceMeters) {
      startIdx = i
      break
    }
    startIdx = i - 1
  }

  // Go forwards from center to find end
  let endIdx = centerIdx
  let forwardDist = 0
  for (let i = centerIdx; i < route.length - 1; i++) {
    forwardDist += haversineDistance(route[i][0], route[i][1], route[i+1][0], route[i+1][1])
    if (forwardDist >= distanceMeters) {
      endIdx = i + 1
      break
    }
    endIdx = i + 1
  }

  return route.slice(startIdx, endIdx + 1)
}

// Simplify a route segment by sampling every Nth point
function simplifySegment(segment: [number, number][], maxPoints: number = 50): [number, number][] {
  if (segment.length <= maxPoints) return segment
  const step = Math.ceil(segment.length / maxPoints)
  const simplified: [number, number][] = []
  for (let i = 0; i < segment.length; i += step) {
    simplified.push(segment[i])
  }
  // Always include the last point
  if (simplified[simplified.length - 1] !== segment[segment.length - 1]) {
    simplified.push(segment[segment.length - 1])
  }
  return simplified
}

// Fix for default marker icons in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Stop {
  id: number
  stop_order: number
  name: string
  latitude: number
  longitude: number
  city?: string
  state?: string
  category?: string
  is_overnight?: boolean
}

interface RailroadCrossing {
  id: number
  name: string
  latitude: number
  longitude: number
  safety_level: string
  road_name?: string
  gates?: boolean
  light?: boolean
  bell?: boolean
}

interface HeightRestriction {
  id: number
  name: string
  latitude: number
  longitude: number
  height_feet: number
  road_name?: string
  category?: string
  restriction_type?: 'bridge' | 'tunnel' | 'parking' | null
}

interface WeightRestriction {
  id: number
  name: string
  latitude: number
  longitude: number
  weight_tons: number
  weight_lbs?: number
  weight_display?: string
  road_name?: string
  restriction_type?: string
  applies_to?: string
  is_hazard?: boolean
}

interface RouteMapWithHazardsProps {
  tripId: number
  stops: Stop[]
  rvHeight?: number // RV height in feet for filtering
  rvWeight?: number // RV weight in pounds for filtering
}

// Create custom icons
const createStopIcon = (stopNumber: number, isStart: boolean, isEnd: boolean) => {
  let bgColor = '#3b82f6' // Blue for waypoints
  let emoji = `${stopNumber}`

  if (isStart) {
    bgColor = '#22c55e' // Green
    emoji = '1'
  } else if (isEnd) {
    bgColor = '#ef4444' // Red
    emoji = `${stopNumber}`
  }

  return L.divIcon({
    className: 'stop-icon',
    html: `<div style="
      background: ${bgColor};
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      font-size: 12px;
      font-weight: bold;
      color: white;
    ">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// Railroad crossing icon
const createRRIcon = (safetyLevel: string) => {
  const color = safetyLevel === 'protected' ? '#22c55e' :
                safetyLevel === 'warning' ? '#f59e0b' : '#ef4444'

  return L.divIcon({
    className: 'rr-icon',
    html: `<div style="
      background: ${color};
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      font-size: 14px;
    ">🚂</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

// Height restriction icon - distinct shapes for each type
// - bridge: warning triangle
// - tunnel: arch/semicircle shape
// - parking: square with P
// All dynamically colored based on clearance relative to user's RV height
const createHeightIcon = (
  heightFeet: number,
  restrictionType: 'bridge' | 'tunnel' | 'parking' | null = 'bridge',
  userRvHeight: number = 13.5
) => {
  // Calculate clearance
  const clearance = heightFeet - userRvHeight
  const isDangerous = clearance <= 5/12 // Within 5 inches or less
  const isTooLow = heightFeet <= userRvHeight

  // Dynamic coloring based on user's RV height
  let color: string
  if (isTooLow) {
    color = '#DC2626' // Red - impassable
  } else if (isDangerous) {
    color = '#F59E0B' // Yellow - within 5 inches, caution
  } else {
    color = '#10B981' // Green - safe
  }

  // PARKING GARAGE - Square with P prefix
  if (restrictionType === 'parking') {
    return L.divIcon({
      className: 'height-icon parking',
      html: `<div style="
        background-color: ${color};
        width: 28px;
        height: 28px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        font-size: 10px;
        font-weight: bold;
        color: white;
        position: relative;
      "><span style="font-size: 7px; position: absolute; top: 0px; left: 2px;">P</span>${heightFeet.toFixed(0)}'</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    })
  }

  // TUNNEL - Arch/semicircle shape
  if (restrictionType === 'tunnel') {
    return L.divIcon({
      className: 'height-icon tunnel',
      html: `<div style="
        background-color: ${color};
        width: 32px;
        height: 26px;
        border-radius: 16px 16px 4px 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        font-size: 9px;
        font-weight: bold;
        color: white;
        position: relative;
      "><span style="font-size: 6px; position: absolute; top: 1px;">T</span><span style="margin-top: 6px;">${heightFeet.toFixed(0)}'</span></div>`,
      iconSize: [32, 26],
      iconAnchor: [16, 26],
    })
  }

  // BRIDGE (default) - Warning triangle shape
  return L.divIcon({
    className: 'height-icon bridge',
    html: `<div style="
      background-color: ${color};
      width: 32px;
      height: 28px;
      clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      font-size: 9px;
      font-weight: bold;
      color: white;
      padding-top: 8px;
    ">${heightFeet.toFixed(0)}'</div>`,
    iconSize: [32, 28],
    iconAnchor: [16, 28],
  })
}

// Weight restriction icon - hexagon shape with weight display
const createWeightIcon = (
  weightTons: number,
  userRvWeightLbs: number = 20000 // Default 20,000 lbs (10 tons)
) => {
  const userWeightTons = userRvWeightLbs / 2000
  const isHazard = weightTons < userWeightTons
  const isWarning = weightTons < userWeightTons * 1.2 // Within 20% of limit

  let color: string
  if (isHazard) {
    color = '#DC2626' // Red - over limit
  } else if (isWarning) {
    color = '#F59E0B' // Yellow - close to limit
  } else {
    color = '#10B981' // Green - safe
  }

  return L.divIcon({
    className: 'weight-icon',
    html: `<div style="
      background-color: ${color};
      width: 30px;
      height: 28px;
      clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      font-size: 8px;
      font-weight: bold;
      color: white;
    ">${weightTons.toFixed(0)}T</div>`,
    iconSize: [30, 28],
    iconAnchor: [15, 14],
  })
}

// Component to fit map bounds
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [map, bounds])
  return null
}

export default function RouteMapWithHazards({ tripId, stops, rvHeight = 13.5, rvWeight = 20000 }: RouteMapWithHazardsProps) {
  const [route, setRoute] = useState<[number, number][]>([])
  const [railroadCrossings, setRailroadCrossings] = useState<RailroadCrossing[]>([])
  const [heightRestrictions, setHeightRestrictions] = useState<HeightRestriction[]>([])
  const [weightRestrictions, setWeightRestrictions] = useState<WeightRestriction[]>([])
  const [loading, setLoading] = useState(true)
  const [showRailroad, setShowRailroad] = useState(true)
  const [showHeights, setShowHeights] = useState(true)
  const [showWeights, setShowWeights] = useState(true)

  // Resizable map height
  const [mapHeight, setMapHeight] = useState(() => {
    const saved = safeStorage.getItem('tripMapHeight')
    return saved ? parseInt(saved) : 550  // Default to 550px
  })
  const [isResizing, setIsResizing] = useState(false)

  // Save map height to localStorage
  useEffect(() => {
    safeStorage.setItem('tripMapHeight', mapHeight.toString())
  }, [mapHeight])

  // Handle resize drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = mapHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(300, Math.min(900, startHeight + deltaY))
      setMapHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Fetch route geometry
  useEffect(() => {
    const fetchRoute = async () => {
      try {
        const response = await tripsApi.getRoute(tripId)
        if (response.data?.route) {
          setRoute(response.data.route)
        }
      } catch (error) {
        console.error('Failed to fetch route:', error)
      }
    }

    if (tripId) {
      fetchRoute()
    }
  }, [tripId])

  // Fetch hazards when route is loaded
  useEffect(() => {
    const fetchHazards = async () => {
      if (route.length < 2) {
        setLoading(false)
        return
      }

      const token = safeStorage.getItem('token')
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }

      // Simplify route for API call (max 100 points)
      const simplifiedRoute = route.length <= 100
        ? route
        : route.filter((_, i) => i % Math.ceil(route.length / 100) === 0 || i === route.length - 1)

      const routeCoords = JSON.stringify(simplifiedRoute)

      try {
        // Fetch railroad crossings
        const rrResponse = await fetch(
          `/api/railroad-crossings/along-route?route_coords=${encodeURIComponent(routeCoords)}&buffer_miles=3`,
          { headers }
        )
        if (rrResponse.ok) {
          const rrData = await rrResponse.json()
          setRailroadCrossings(rrData.crossings || [])
        }

        // Fetch height restrictions
        const heightResponse = await fetch(
          `/api/overpass-heights/along-route?route_coords=${encodeURIComponent(routeCoords)}&buffer_miles=3`,
          { headers }
        )
        if (heightResponse.ok) {
          const heightData = await heightResponse.json()
          setHeightRestrictions(heightData.overpasses || heightData.heights || [])
        }

        // Fetch weight restrictions
        const weightResponse = await fetch(
          `/api/weight-restrictions/along-route?route_coords=${encodeURIComponent(routeCoords)}&buffer_miles=3&max_weight_tons=${rvWeight / 2000}`,
          { headers }
        )
        if (weightResponse.ok) {
          const weightData = await weightResponse.json()
          setWeightRestrictions(weightData.restrictions || [])
        }
      } catch (error) {
        console.error('Failed to fetch hazards:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchHazards()
  }, [route, rvWeight])

  // Calculate map bounds
  const bounds = useMemo(() => {
    const points = stops.map(s => [s.latitude, s.longitude] as [number, number])
    if (points.length === 0) return undefined
    return L.latLngBounds(points)
  }, [stops])

  // Filter critical heights (below RV height + safety margin)
  const criticalHeights = useMemo(() => {
    return heightRestrictions.filter(h => h.height_feet <= rvHeight + 0.5)
  }, [heightRestrictions, rvHeight])

  // Filter critical weights (below RV weight)
  const criticalWeights = useMemo(() => {
    const rvWeightTons = rvWeight / 2000
    return weightRestrictions.filter(w => w.weight_tons < rvWeightTons)
  }, [weightRestrictions, rvWeight])

  if (stops.length < 2) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Add at least 2 stops to see the route map.
      </div>
    )
  }

  return (
    <div>
      {/* Map Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '10px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showRailroad}
            onChange={(e) => setShowRailroad(e.target.checked)}
          />
          <span>🚂 Railroad Crossings ({railroadCrossings.length})</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showHeights}
            onChange={(e) => setShowHeights(e.target.checked)}
          />
          <span>
            ⚠️ Low Clearances ({heightRestrictions.length})
            {criticalHeights.length > 0 && (
              <span style={{ color: '#ef4444', fontWeight: 600 }}> ({criticalHeights.length} critical)</span>
            )}
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showWeights}
            onChange={(e) => setShowWeights(e.target.checked)}
          />
          <span>
            ⚖️ Weight Limits ({weightRestrictions.length})
            {criticalWeights.length > 0 && (
              <span style={{ color: '#ef4444', fontWeight: 600 }}> ({criticalWeights.length} critical)</span>
            )}
          </span>
        </label>
        {loading && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading hazards...</span>
        )}
      </div>

      {/* Map Container with Resize Handle */}
      <div style={{ position: 'relative' }}>
        <div style={{
          height: `${mapHeight}px`,
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
          transition: isResizing ? 'none' : 'height 0.1s ease'
        }}>
        <MapContainer
          center={[stops[0].latitude, stops[0].longitude]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {bounds && <FitBounds bounds={bounds} />}

          {/* Route Polyline */}
          {route.length > 1 && (
            <Polyline
              positions={route}
              color="#3b82f6"
              weight={4}
              opacity={0.8}
            />
          )}

          {/* Stop Markers - Search Areas show as route corridors */}
          {stops.map((stop, index) => {
            const isSearchArea = stop.name.toLowerCase().includes('search area')
            const isStartOrEnd = index === 0 || index === stops.length - 1

            // For search areas, show a glowing route segment (clean, simple visualization)
            if (isSearchArea && !isStartOrEnd && route.length > 2) {
              // Find where this stop is on the route
              const routeIdx = findClosestRouteIndex(route, stop.latitude, stop.longitude)

              // Extract route segment: ~50 miles each direction from the center (1 hour driving window)
              const corridorDistance = 80467  // ~50 miles in meters
              const segment = simplifySegment(extractRouteSegment(route, routeIdx, corridorDistance), 100)

              return (
                <React.Fragment key={stop.id}>
                  {/* Outer glow - wide, faint */}
                  <Polyline
                    positions={segment}
                    pathOptions={{
                      color: '#F59E0B',
                      weight: 24,
                      opacity: 0.2,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }}
                  />
                  {/* Middle glow */}
                  <Polyline
                    positions={segment}
                    pathOptions={{
                      color: '#F59E0B',
                      weight: 14,
                      opacity: 0.35,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }}
                  />
                  {/* Inner highlight - bright core */}
                  <Polyline
                    positions={segment}
                    pathOptions={{
                      color: '#EF4444',
                      weight: 6,
                      opacity: 0.8,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }}
                  />
                  {/* Center marker for search area */}
                  <Marker
                    position={[stop.latitude, stop.longitude]}
                    icon={L.divIcon({
                      className: 'search-area-icon',
                      html: `<div style="
                        background: linear-gradient(135deg, #F59E0B, #EF4444);
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 12px;
                        border: 2px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                      ">🔍</div>`,
                      iconSize: [32, 32],
                      iconAnchor: [16, 16],
                    })}
                  >
                    <Popup>
                      <div style={{ minWidth: '200px' }}>
                        <strong style={{ color: '#F59E0B', fontSize: '14px' }}>
                          🔍 {stop.name}
                        </strong>
                        <div style={{
                          margin: '10px 0',
                          padding: '8px',
                          background: '#FEF3C7',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#92400E'
                        }}>
                          Find your overnight stop anywhere along the highlighted route
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                          The glowing segment shows your search window - about 1 hour of driving each direction from this point.
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              )
            }

            // Fallback for search areas if route not loaded yet
            if (isSearchArea && !isStartOrEnd) {
              return (
                <Marker
                  key={stop.id}
                  position={[stop.latitude, stop.longitude]}
                  icon={L.divIcon({
                    className: 'search-area-icon',
                    html: `<div style="
                      background: linear-gradient(135deg, #F59E0B, #EF4444);
                      width: 32px;
                      height: 32px;
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: white;
                      font-weight: bold;
                      font-size: 12px;
                      border: 2px solid white;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    ">🔍</div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                  })}
                >
                  <Popup>
                    <div>
                      <strong style={{ color: '#F59E0B' }}>🔍 {stop.name}</strong>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        Loading route...
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            }

            // Regular stop markers (start, end, or named stops)
            return (
              <Marker
                key={stop.id}
                position={[stop.latitude, stop.longitude]}
                icon={createStopIcon(index + 1, index === 0, index === stops.length - 1)}
              >
                <Popup>
                  <div style={{ minWidth: '150px' }}>
                    <strong>{stop.name}</strong>
                    {stop.city && stop.state && (
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {stop.city}, {stop.state}
                      </div>
                    )}
                    {stop.is_overnight && (
                      <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px' }}>
                        Overnight Stop
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Railroad Crossing Markers */}
          {showRailroad && railroadCrossings.length > 0 && (
            <MarkerClusterGroup chunkedLoading>
              {railroadCrossings.map(crossing => (
                <Marker
                  key={`rr-${crossing.id}`}
                  position={[crossing.latitude, crossing.longitude]}
                  icon={createRRIcon(crossing.safety_level)}
                >
                  <Popup>
                    <div style={{ minWidth: '180px' }}>
                      <strong>🚂 {crossing.name}</strong>
                      {crossing.road_name && (
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {crossing.road_name}
                        </div>
                      )}
                      <div style={{
                        fontSize: '11px',
                        marginTop: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: crossing.safety_level === 'protected' ? '#dcfce7' :
                                   crossing.safety_level === 'warning' ? '#fef3c7' : '#fee2e2',
                        color: crossing.safety_level === 'protected' ? '#166534' :
                               crossing.safety_level === 'warning' ? '#92400e' : '#991b1b'
                      }}>
                        {crossing.safety_level === 'protected' && '✓ Protected (Gates)'}
                        {crossing.safety_level === 'warning' && '⚠ Warning (Lights/Bell)'}
                        {crossing.safety_level === 'unprotected' && '⚠ Unprotected'}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}

          {/* Height Restriction Markers */}
          {showHeights && heightRestrictions.length > 0 && (
            <MarkerClusterGroup chunkedLoading>
              {heightRestrictions.map(height => {
                const restrictionType = height.restriction_type || 'bridge'
                const isSafe = height.height_feet > rvHeight
                const isDangerous = height.height_feet - rvHeight <= 5/12
                const typeLabel = restrictionType === 'parking' ? 'Parking Garage' : restrictionType === 'tunnel' ? 'Tunnel' : 'Bridge/Overpass'
                const typeEmoji = restrictionType === 'parking' ? '🅿️' : restrictionType === 'tunnel' ? '🚇' : '🌉'
                const statusColor = !isSafe ? '#ef4444' : isDangerous ? '#f59e0b' : '#10B981'
                return (
                  <Marker
                    key={`height-${height.id}`}
                    position={[height.latitude, height.longitude]}
                    icon={createHeightIcon(height.height_feet, restrictionType, rvHeight)}
                  >
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <strong style={{ color: statusColor }}>
                          {typeEmoji} {height.name || typeLabel}
                        </strong>
                        {height.road_name && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {height.road_name}
                          </div>
                        )}
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          marginTop: '4px',
                          color: statusColor
                        }}>
                          Clearance: {height.height_feet.toFixed(1)} ft
                        </div>
                        {!isSafe && (
                          <div style={{
                            fontSize: '11px',
                            marginTop: '4px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: '#fee2e2',
                            color: '#991b1b'
                          }}>
                            ⚠ Below your RV height ({rvHeight} ft)
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          )}

          {/* Weight Restriction Markers */}
          {showWeights && weightRestrictions.length > 0 && (
            <MarkerClusterGroup chunkedLoading>
              {weightRestrictions.map(weight => {
                const rvWeightTons = rvWeight / 2000
                const isHazard = weight.weight_tons < rvWeightTons
                const isWarning = weight.weight_tons < rvWeightTons * 1.2
                const statusColor = isHazard ? '#ef4444' : isWarning ? '#f59e0b' : '#10B981'
                return (
                  <Marker
                    key={`weight-${weight.id}`}
                    position={[weight.latitude, weight.longitude]}
                    icon={createWeightIcon(weight.weight_tons, rvWeight)}
                  >
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <strong style={{ color: statusColor }}>
                          ⚖️ {weight.name || 'Weight Limit'}
                        </strong>
                        {weight.road_name && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {weight.road_name}
                          </div>
                        )}
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          marginTop: '4px',
                          color: statusColor
                        }}>
                          Limit: {weight.weight_tons.toFixed(1)} tons ({((weight.weight_tons || 0) * 2000).toLocaleString()} lbs)
                        </div>
                        {weight.applies_to && (
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                            Applies to: {weight.applies_to}
                          </div>
                        )}
                        {isHazard && (
                          <div style={{
                            fontSize: '11px',
                            marginTop: '4px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: '#fee2e2',
                            color: '#991b1b'
                          }}>
                            ⚠ Your RV ({(rvWeight / 2000).toFixed(1)} tons) exceeds this limit
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          )}
        </MapContainer>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '12px',
            cursor: 'ns-resize',
            background: 'linear-gradient(to bottom, transparent, var(--bg-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            opacity: 0.8,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
        >
          <div style={{
            width: '40px',
            height: '4px',
            background: 'var(--text-muted)',
            borderRadius: '2px'
          }} />
        </div>
      </div>

      {/* Critical Warnings */}
      {criticalHeights.length > 0 && (
        <div style={{
          marginTop: '10px',
          padding: '10px 12px',
          background: '#fee2e2',
          borderRadius: '6px',
          border: '1px solid #fca5a5'
        }}>
          <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '6px' }}>
            🚫 {criticalHeights.length} Critical Low Clearance{criticalHeights.length > 1 ? 's' : ''} on Route
          </div>
          <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
            These clearances may be too low for your RV ({rvHeight} ft). Consider alternate routes.
          </div>
        </div>
      )}

      {criticalWeights.length > 0 && (
        <div style={{
          marginTop: '10px',
          padding: '10px 12px',
          background: '#fef3c7',
          borderRadius: '6px',
          border: '1px solid #fcd34d'
        }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
            ⚖️ {criticalWeights.length} Weight Restriction{criticalWeights.length > 1 ? 's' : ''} on Route
          </div>
          <div style={{ fontSize: '12px', color: '#78350f' }}>
            Your RV ({(rvWeight / 2000).toFixed(1)} tons) may exceed these weight limits. Check bridge restrictions.
          </div>
        </div>
      )}
    </div>
  )
}
