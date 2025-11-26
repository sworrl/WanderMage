import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { trips as tripsApi } from '../services/api'
import { safeStorage } from '../utils/storage'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css'
import L from 'leaflet'

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
}

interface RouteMapWithHazardsProps {
  tripId: number
  stops: Stop[]
  rvHeight?: number // RV height in feet for filtering
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

// Height restriction icon
const createHeightIcon = (heightFeet: number, isCritical: boolean) => {
  const color = isCritical ? '#ef4444' : '#f59e0b'

  return L.divIcon({
    className: 'height-icon',
    html: `<div style="
      background: ${color};
      width: 32px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      font-size: 10px;
      font-weight: bold;
      color: white;
    ">${heightFeet.toFixed(0)}'</div>`,
    iconSize: [32, 24],
    iconAnchor: [16, 12],
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

export default function RouteMapWithHazards({ tripId, stops, rvHeight = 13.5 }: RouteMapWithHazardsProps) {
  const [route, setRoute] = useState<[number, number][]>([])
  const [railroadCrossings, setRailroadCrossings] = useState<RailroadCrossing[]>([])
  const [heightRestrictions, setHeightRestrictions] = useState<HeightRestriction[]>([])
  const [loading, setLoading] = useState(true)
  const [showRailroad, setShowRailroad] = useState(true)
  const [showHeights, setShowHeights] = useState(true)

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
          setHeightRestrictions(heightData.heights || [])
        }
      } catch (error) {
        console.error('Failed to fetch hazards:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchHazards()
  }, [route])

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
        {loading && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading hazards...</span>
        )}
      </div>

      {/* Map Container */}
      <div style={{ height: '400px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
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

          {/* Stop Markers */}
          {stops.map((stop, index) => (
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
          ))}

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
                const isCritical = height.height_feet <= rvHeight + 0.5
                return (
                  <Marker
                    key={`height-${height.id}`}
                    position={[height.latitude, height.longitude]}
                    icon={createHeightIcon(height.height_feet, isCritical)}
                  >
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <strong>
                          {isCritical ? '🚫' : '⚠️'} {height.name || 'Low Clearance'}
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
                          color: isCritical ? '#ef4444' : '#f59e0b'
                        }}>
                          Clearance: {height.height_feet.toFixed(1)} ft
                        </div>
                        {isCritical && (
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
        </MapContainer>
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
    </div>
  )
}
