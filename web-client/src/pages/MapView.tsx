import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { trips as tripsApi, preferences as preferencesApi, rvProfiles as rvProfilesApi, weather as weatherApi } from '../services/api'
import { safeStorage } from '../utils/storage'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css'
import L from 'leaflet'

// Helper function to calculate distance between two points in miles (Haversine formula)
function getDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Normalize longitude to -180 to 180 range (handles map wraparound)
function normalizeLongitude(lon: number): number {
  while (lon > 180) lon -= 360
  while (lon < -180) lon += 360
  return lon
}

// Calculate minimum distance from a point to a polyline (route)
function getMinDistanceToRoute(lat: number, lon: number, route: [number, number][]): number {
  if (route.length === 0) return Infinity
  let minDist = Infinity
  for (let i = 0; i < route.length; i++) {
    const dist = getDistanceMiles(lat, lon, route[i][0], route[i][1])
    if (dist < minDist) minDist = dist
  }
  return minDist
}

// Fix for default marker icons in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom POI icons
const createIcon = (color: string, symbol: string) => {
  return L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-size: 16px;">${symbol}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

// Start icon - green flag
const createStartIcon = (arrivalDate?: string, weatherIcon?: string) => {
  // Format date if provided (show as MM/DD)
  let dateStr = ''
  if (arrivalDate) {
    try {
      const date = new Date(arrivalDate)
      dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      dateStr = ''
    }
  }

  const hasExtras = !!dateStr || !!weatherIcon

  return L.divIcon({
    className: 'start-icon',
    html: `
      <div style="
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        min-width: 40px;
        height: ${hasExtras ? '52px' : '40px'};
        padding: 4px 8px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 3px 10px rgba(16, 185, 129, 0.5);
        color: white;
      ">
        <div style="display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 16px;">🚩</span>
          ${weatherIcon ? `<img src="${weatherIcon}" alt="" style="width: 16px; height: 16px;" />` : ''}
        </div>
        ${dateStr ? `<span style="font-size: 9px; line-height: 1; margin-top: 2px; opacity: 0.95;">${dateStr}</span>` : ''}
      </div>
    `,
    iconSize: [hasExtras ? 52 : 40, hasExtras ? 52 : 40],
    iconAnchor: [hasExtras ? 26 : 20, hasExtras ? 26 : 20],
  })
}

// Finish icon - checkered flag with date and weather
const createFinishIcon = (arrivalDate?: string, weatherIcon?: string) => {
  // Format date if provided (show as MM/DD)
  let dateStr = ''
  if (arrivalDate) {
    try {
      const date = new Date(arrivalDate)
      dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      dateStr = ''
    }
  }

  const hasExtras = !!dateStr || !!weatherIcon

  return L.divIcon({
    className: 'finish-icon',
    html: `
      <div style="
        background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
        min-width: 40px;
        height: ${hasExtras ? '52px' : '40px'};
        padding: 4px 8px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 3px 10px rgba(239, 68, 68, 0.5);
        color: white;
      ">
        <div style="display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 16px;">🏁</span>
          ${weatherIcon ? `<img src="${weatherIcon}" alt="" style="width: 16px; height: 16px;" />` : ''}
        </div>
        ${dateStr ? `<span style="font-size: 9px; line-height: 1; margin-top: 2px; opacity: 0.95;">${dateStr}</span>` : ''}
      </div>
    `,
    iconSize: [hasExtras ? 52 : 40, hasExtras ? 52 : 40],
    iconAnchor: [hasExtras ? 26 : 20, hasExtras ? 26 : 20],
  })
}

// Custom stop icon with number and date - rounded square showing stop order and arrival date
const createStopIcon = (stopNumber: number, arrivalDate: string | null, isNeedsSelection: boolean = false, isOvernight: boolean = false, weatherIcon?: string) => {
  const color = isNeedsSelection ? '#F59E0B' : '#3B82F6' // Orange for suggested, Blue for confirmed
  const pulseAnimation = isNeedsSelection ? 'animation: stopPulse 2s ease-in-out infinite;' : ''

  // Format date if provided (show as MM/DD)
  let dateStr = ''
  if (arrivalDate) {
    try {
      const date = new Date(arrivalDate)
      dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      dateStr = ''
    }
  }

  // Show moon icon for overnight stays
  const overnightBadge = isOvernight ? `
    <div style="
      position: absolute;
      top: -6px;
      right: -6px;
      background: #7C3AED;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    ">🌙</div>
  ` : ''

  const hasExtras = !!dateStr || !!weatherIcon

  return L.divIcon({
    className: 'stop-icon',
    html: `
      <style>
        @keyframes stopPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(245, 158, 11, 0.5); }
          50% { transform: scale(1.15); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.8); }
        }
      </style>
      <div style="
        position: relative;
        background-color: ${color};
        min-width: 36px;
        height: ${hasExtras ? '52px' : '36px'};
        padding: 4px 8px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        color: white;
        ${pulseAnimation}
      ">
        <div style="display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 14px; font-weight: bold; line-height: 1;">${stopNumber}</span>
          ${weatherIcon ? `<img src="${weatherIcon}" alt="" style="width: 14px; height: 14px;" />` : ''}
        </div>
        ${dateStr ? `<span style="font-size: 9px; line-height: 1; margin-top: 2px; opacity: 0.9;">${dateStr}</span>` : ''}
        ${overnightBadge}
      </div>
    `,
    iconSize: [hasExtras ? 52 : 36, hasExtras ? 52 : 36],
    iconAnchor: [hasExtras ? 26 : 18, hasExtras ? 26 : 18],
  })
}

// Gap suggestion icon - diamond-shaped overnight stop needed indicator with date
const createGapSuggestionIcon = (arrivalDate?: string, weatherIcon?: string) => {
  // Format date if provided (show as MM/DD)
  let dateStr = ''
  if (arrivalDate) {
    try {
      const date = new Date(arrivalDate)
      dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      dateStr = ''
    }
  }

  const hasDate = !!dateStr
  const hasWeather = !!weatherIcon

  return L.divIcon({
    className: 'gap-suggestion-icon',
    html: `
      <style>
        @keyframes gapPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.9; }
        }
      </style>
      <div style="
        position: relative;
        background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
        min-width: 40px;
        height: ${hasDate || hasWeather ? '52px' : '40px'};
        padding: 4px 8px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
        animation: gapPulse 2s ease-in-out infinite;
        color: white;
      ">
        <div style="display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 14px;">🏕️</span>
          ${hasWeather ? `<img src="${weatherIcon}" alt="" style="width: 16px; height: 16px;" />` : ''}
        </div>
        ${hasDate ? `<span style="font-size: 9px; line-height: 1; margin-top: 2px; opacity: 0.95;">${dateStr}</span>` : ''}
      </div>
    `,
    iconSize: [hasDate || hasWeather ? 52 : 40, hasDate || hasWeather ? 52 : 40],
    iconAnchor: [hasDate || hasWeather ? 26 : 20, hasDate || hasWeather ? 26 : 20],
  })
}

// Height restriction icon - warning triangle with height display (or P square for parking)
// Now accepts userRvHeight to dynamically color based on clearance safety
// onRoute: true adds a prominent border to indicate heights you'll actually pass under
const createHeightIcon = (heightFeet: number, isParking: boolean = false, userRvHeight: number = 12.5, onRoute: boolean = false) => {
  // Calculate clearance - 5 inches = 5/12 = 0.417 feet
  const clearance = heightFeet - userRvHeight
  const isDangerous = clearance <= 5/12 // Within 5 inches or less
  const isTooLow = heightFeet <= userRvHeight

  // On-route heights get a cyan glow/border to stand out
  const routeStyle = onRoute ? 'box-shadow: 0 0 0 3px #06B6D4, 0 2px 8px rgba(6, 182, 212, 0.6);' : 'box-shadow: 0 2px 5px rgba(0,0,0,0.4);'
  const routeSize = onRoute ? 1.2 : 1 // 20% larger when on route

  if (isParking) {
    // Parking garage icon - blue square with P (also shows danger for vans)
    const parkingClass = isDangerous ? 'height-icon parking pulse-danger' : 'height-icon parking'
    const size = Math.round(28 * routeSize)
    return L.divIcon({
      className: parkingClass,
      html: `<div style="
        background-color: ${isDangerous ? '#DC2626' : '#6366F1'};
        width: ${size}px;
        height: ${size}px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        ${routeStyle}
        font-size: ${Math.round(10 * routeSize)}px;
        font-weight: bold;
        color: white;
      "><span style="font-size: ${Math.round(8 * routeSize)}px; position: absolute; top: 1px;">P</span>${heightFeet.toFixed(0)}'</div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size],
    })
  }

  // Regular overpass icon - warning triangle
  // Dynamic coloring based on user's RV height
  let color: string
  let iconClass = 'height-icon'

  if (isTooLow) {
    color = '#DC2626' // Red - impassable
    iconClass = 'height-icon pulse-danger'
  } else if (isDangerous) {
    color = '#F59E0B' // Yellow - within 5 inches, caution
    iconClass = 'height-icon pulse-warning'
  } else {
    color = '#10B981' // Green - safe
  }

  const width = Math.round(32 * routeSize)
  const height = Math.round(28 * routeSize)

  return L.divIcon({
    className: iconClass,
    html: `<div style="
      background-color: ${color};
      width: ${width}px;
      height: ${height}px;
      clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      ${routeStyle}
      font-size: ${Math.round(9 * routeSize)}px;
      font-weight: bold;
      color: white;
      padding-top: ${Math.round(8 * routeSize)}px;
    ">${heightFeet.toFixed(0)}'</div>`,
    iconSize: [width, height],
    iconAnchor: [width/2, height],
  })
}

// Railroad crossing icon - X shape with safety level coloring
// onRoute: true adds a bright cyan ring to indicate crossings you'll actually cross
const createRailroadCrossingIcon = (safetyLevel: 'protected' | 'warning' | 'unprotected', onRoute: boolean = false) => {
  // Color based on safety level
  let color: string
  let iconClass = 'railroad-icon'

  if (safetyLevel === 'protected') {
    color = '#10B981' // Green - has gates
  } else if (safetyLevel === 'warning') {
    color = '#F59E0B' // Yellow - has lights/bell
  } else {
    color = '#DC2626' // Red - unprotected
    iconClass = 'railroad-icon pulse-warning'
  }

  // On-route crossings get a crossbuck (X-shaped) icon like a railroad crossing sign
  if (onRoute) {
    return L.divIcon({
      className: iconClass,
      html: `<div style="
        position: relative;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- Crossbuck X shape -->
        <div style="
          position: absolute;
          width: 40px;
          height: 10px;
          background: ${color};
          border: 2px solid white;
          border-radius: 2px;
          transform: rotate(45deg);
          box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        "></div>
        <div style="
          position: absolute;
          width: 40px;
          height: 10px;
          background: ${color};
          border: 2px solid white;
          border-radius: 2px;
          transform: rotate(-45deg);
          box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        "></div>
        <!-- Center circle with RR -->
        <div style="
          position: relative;
          background: ${color};
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          font-weight: bold;
          color: white;
          z-index: 1;
        ">RR</div>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })
  }

  return L.divIcon({
    className: iconClass,
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      font-size: 14px;
    ">🚂</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

// Reticle/crosshair icon for targeting a specific location
const createReticleIcon = () => {
  return L.divIcon({
    className: 'reticle-icon',
    html: `
      <div style="
        width: 60px;
        height: 60px;
        position: relative;
        animation: reticlePulse 1.5s ease-in-out infinite;
      ">
        <style>
          @keyframes reticlePulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
        </style>
        <div style="
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 3px;
          background: #DC2626;
          transform: translateY(-50%);
        "></div>
        <div style="
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #DC2626;
          transform: translateX(-50%);
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          border: 3px solid #DC2626;
          border-radius: 50%;
          background: transparent;
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          border: 2px solid #DC2626;
          border-radius: 50%;
          background: transparent;
          opacity: 0.5;
        "></div>
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  })
}

const POI_CATEGORIES = {
  fuel_stations: {
    name: 'Fuel Stations',
    icon: createIcon('#F59E0B', '⛽'),
    color: '#F59E0B',
    query: 'node["amenity"="fuel"]({{bbox}});'
  },
  ev_charging: {
    name: 'EV Charging',
    icon: createIcon('#10B981', '🔌'),
    color: '#10B981',
    query: 'node["amenity"="charging_station"]({{bbox}});'
  },
  rest_areas: {
    name: 'Rest Areas',
    icon: createIcon('#3B82F6', '🅿️'),
    color: '#3B82F6',
    query: 'node["highway"="rest_area"]({{bbox}});way["highway"="rest_area"]({{bbox}});'
  },
  rv_parks: {
    name: 'RV Parks & Resorts',
    icon: createIcon('#059669', '🚐'),
    color: '#059669',
    query: 'node["tourism"="caravan_site"]({{bbox}});'
  },
  tent_camping: {
    name: 'Tent & Wilderness Camping',
    icon: createIcon('#10B981', '⛺'),
    color: '#10B981',
    query: 'node["tourism"="camp_site"]({{bbox}});'
  },
  lodging: {
    name: 'Hotels & Motels',
    icon: createIcon('#8B5CF6', '🏨'),
    color: '#8B5CF6',
    query: 'node["tourism"="hotel"]({{bbox}});node["tourism"="motel"]({{bbox}});'
  },
  parks: {
    name: 'Parks',
    icon: createIcon('#14B8A6', '🌳'),
    color: '#14B8A6',
    query: 'node["leisure"="park"]({{bbox}});node["leisure"="dog_park"]({{bbox}});node["leisure"="playground"]({{bbox}});'
  },
  national_parks: {
    name: 'National Parks',
    icon: createIcon('#047857', '🏞️'),
    color: '#047857',
    query: 'node["boundary"="national_park"]({{bbox}});way["boundary"="national_park"]({{bbox}});'
  },
  shopping: {
    name: 'Grocery & Shopping',
    icon: createIcon('#EC4899', '🛒'),
    color: '#EC4899',
    query: 'node["shop"="supermarket"]({{bbox}});node["shop"="department_store"]({{bbox}});'
  },
  convenience_stores: {
    name: 'Convenience Stores',
    icon: createIcon('#F97316', '🏪'),
    color: '#F97316',
    query: 'node["shop"="convenience"]({{bbox}});'
  },
  dining: {
    name: 'Restaurants',
    icon: createIcon('#EF4444', '🍽️'),
    color: '#EF4444',
    query: 'node["amenity"="restaurant"]({{bbox}});node["amenity"="fast_food"]({{bbox}});'
  },
  dump_stations: {
    name: 'RV Dump Stations',
    icon: createIcon('#6366F1', '💩'),
    color: '#6366F1',
    query: 'node["amenity"="sanitary_dump_station"]({{bbox}});'
  },
  restrooms: {
    name: 'Public Restrooms',
    icon: createIcon('#A855F7', '🚽'),
    color: '#A855F7',
    query: 'node["amenity"="toilets"]({{bbox}});'
  },
  hospitals: {
    name: 'Hospitals & Medical',
    icon: createIcon('#DC2626', '🏥'),
    color: '#DC2626',
    query: 'node["amenity"="hospital"]({{bbox}});node["amenity"="clinic"]({{bbox}});'
  },
  post_offices: {
    name: 'Post Offices',
    icon: createIcon('#2563EB', '📮'),
    color: '#2563EB',
    query: 'node["amenity"="post_office"]({{bbox}});'
  },
  government: {
    name: 'Government Buildings',
    icon: createIcon('#1E40AF', '🏛️'),
    color: '#1E40AF',
    query: 'node["amenity"="townhall"]({{bbox}});node["amenity"="courthouse"]({{bbox}});node["office"="government"]({{bbox}});'
  },
  visitor_centers: {
    name: 'Visitor Centers',
    icon: createIcon('#06B6D4', 'ℹ️'),
    color: '#06B6D4',
    query: 'node["tourism"="information"]({{bbox}});'
  },
  laundromat: {
    name: 'Laundromats',
    icon: createIcon('#60A5FA', '🧺'),
    color: '#60A5FA',
    query: 'node["shop"="laundry"]({{bbox}});way["shop"="laundry"]({{bbox}});'
  },
  vet: {
    name: 'Veterinarians',
    icon: createIcon('#F472B6', '🐕'),
    color: '#F472B6',
    query: 'node["amenity"="veterinary"]({{bbox}});way["amenity"="veterinary"]({{bbox}});'
  },
  pharmacy: {
    name: 'Pharmacies',
    icon: createIcon('#34D399', '💊'),
    color: '#34D399',
    query: 'node["amenity"="pharmacy"]({{bbox}});way["amenity"="pharmacy"]({{bbox}});'
  },
  tire_shop: {
    name: 'Tire Shops',
    icon: createIcon('#6B7280', '🔧'),
    color: '#6B7280',
    query: 'node["shop"="tyres"]({{bbox}});way["shop"="tyres"]({{bbox}});'
  },
  auto_repair: {
    name: 'Auto Repair',
    icon: createIcon('#9CA3AF', '🔩'),
    color: '#9CA3AF',
    query: 'node["shop"="car_repair"]({{bbox}});way["shop"="car_repair"]({{bbox}});'
  },
  hardware_store: {
    name: 'Hardware Stores',
    icon: createIcon('#F59E0B', '🛠️'),
    color: '#F59E0B',
    query: 'node["shop"="hardware"]({{bbox}});node["shop"="doityourself"]({{bbox}});'
  },
  rv_wash: {
    name: 'Car/RV Wash',
    icon: createIcon('#38BDF8', '🚿'),
    color: '#38BDF8',
    query: 'node["amenity"="car_wash"]({{bbox}});way["amenity"="car_wash"]({{bbox}});'
  },
  rv_service: {
    name: 'RV Service & Dealers',
    icon: createIcon('#A78BFA', '🛞'),
    color: '#A78BFA',
    query: 'node["shop"="caravan"]({{bbox}});way["shop"="caravan"]({{bbox}});'
  },
}

// Tile layer configurations - MANY free map styles
const TILE_LAYERS: { [key: string]: { name: string; url: string; attribution: string; maxNativeZoom: number } } = {
  // Dark themes
  dark: {
    name: '🌙 Dark Mode',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  dark_nolabels: {
    name: '🌑 Dark (No Labels)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  alidade_smooth_dark: {
    name: '🌌 Alidade Smooth Dark',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },

  // Standard/Street maps
  osm: {
    name: '🗺️ OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19
  },
  voyager: {
    name: '🏙️ Street (Voyager)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  voyager_nolabels: {
    name: '🏙️ Voyager (No Labels)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  positron: {
    name: '⬜ Positron (Light)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  positron_nolabels: {
    name: '⬜ Positron (No Labels)',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 20
  },
  alidade_smooth: {
    name: '🌸 Alidade Smooth',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  osm_bright: {
    name: '☀️ OSM Bright',
    url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },

  // Satellite/Aerial
  satellite: {
    name: '🛰️ Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxNativeZoom: 19
  },

  // Topographic/Terrain
  topo: {
    name: '🗻 Topographic (OpenTopo)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxNativeZoom: 17
  },
  terrain: {
    name: '🏔️ Terrain (Stamen)',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 18
  },
  terrain_background: {
    name: '🏔️ Terrain Background',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 18
  },
  terrain_lines: {
    name: '📈 Terrain Lines Only',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain_lines/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 18
  },
  usgs: {
    name: '🗺️ USGS Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16
  },
  usgs_imagery: {
    name: '🛰️ USGS Imagery',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16
  },
  usgs_imagery_topo: {
    name: '🗻 USGS Imagery+Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
    maxNativeZoom: 16
  },

  // Artistic/Stylized
  watercolor: {
    name: '🎨 Watercolor',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 16
  },
  toner: {
    name: '🖼️ Toner',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  toner_lite: {
    name: '🖼️ Toner Lite',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  toner_background: {
    name: '⬛ Toner Background',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  toner_lines: {
    name: '➖ Toner Lines Only',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}{r}.png',
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },

  // Special purpose
  humanitarian: {
    name: '🏥 Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a>',
    maxNativeZoom: 20
  },
  cycle: {
    name: '🚴 OpenCycleMap',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - Open Bicycle Render">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  transport: {
    name: '🚌 Transport',
    url: 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
    attribution: 'Map <a href="https://memomaps.de/">memomaps.de</a> <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 18
  },

  // Esri specialty maps
  esri_natgeo: {
    name: '🌍 National Geographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
    maxNativeZoom: 16
  },
  esri_ocean: {
    name: '🌊 Ocean Basemap',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
    maxNativeZoom: 13
  },
  esri_physical: {
    name: '🏜️ Physical',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: US National Park Service',
    maxNativeZoom: 8
  },
  esri_shaded: {
    name: '⛰️ Shaded Relief',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
    maxNativeZoom: 13
  },
  esri_gray: {
    name: '⬜ Canvas Light Gray',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxNativeZoom: 16
  },
  esri_gray_dark: {
    name: '⬛ Canvas Dark Gray',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxNativeZoom: 16
  },
  esri_street: {
    name: '🛣️ Esri Street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
    maxNativeZoom: 19
  },
  esri_topo: {
    name: '🗻 Esri Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxNativeZoom: 19
  },

  // International/Regional
  mtb: {
    name: '🚵 MTB Map',
    url: 'http://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &amp; USGS',
    maxNativeZoom: 18
  },
  opnv: {
    name: '🚇 Public Transit (OPNV)',
    url: 'https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png',
    attribution: 'Map <a href="https://memomaps.de/">memomaps.de</a> <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 18
  },
  hikebike: {
    name: '🥾 Hike & Bike',
    url: 'https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 17
  },

  // Outdoors/Adventure
  outdoors: {
    name: '🏕️ Stadia Outdoors',
    url: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  },
  alidade_satellite: {
    name: '🛰️ Alidade Satellite',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg',
    attribution: '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 20
  }
}

// Create user location icon with customizable colors and icons
const createUserLocationIcon = (config: {
  color?: string
  icon?: string
  size?: number
}) => {
  const color = config.color || '#3B82F6'
  const icon = config.icon || '📍'
  const size = config.size || 32

  return L.divIcon({
    className: 'user-location-icon',
    html: `
      <style>
        .location-pulse-ring {
          animation: locationPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
        }
        @keyframes locationPulse {
          0% {
            transform: scale(0.8);
            box-shadow: 0 0 0 0 ${color}FF, 0 0 20px ${color}AA, 0 0 40px ${color}80;
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            box-shadow: 0 0 0 40px ${color}00, 0 0 60px ${color}30, 0 0 80px ${color}20;
            opacity: 0.8;
          }
          100% {
            transform: scale(0.8);
            box-shadow: 0 0 0 0 ${color}FF, 0 0 20px ${color}AA, 0 0 40px ${color}80;
            opacity: 1;
          }
        }
        @keyframes locationGlow {
          0%, 100% {
            filter: drop-shadow(0 0 8px ${color}) drop-shadow(0 0 16px ${color});
          }
          50% {
            filter: drop-shadow(0 0 20px ${color}) drop-shadow(0 0 40px ${color});
          }
        }
      </style>
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999 !important;
        pointer-events: auto;
      ">
        <div class="location-pulse-ring" style="
          position: absolute;
          background: ${color};
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          border: 5px solid white;
          box-shadow: 0 0 0 0 ${color}FF, 0 0 20px ${color}AA, 0 4px 16px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${size * 0.5}px;
          z-index: 999999 !important;
          animation: locationGlow 1.5s ease-in-out infinite;
        ">${icon}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  })
}

interface POI {
  id: number
  lat: number
  lon: number
  name: string
  type: string
  tags: any
}

interface HeightRestriction {
  id: number
  name: string
  latitude: number
  longitude: number
  height_feet: number
  height_display: string
  road_name: string
  description: string
  is_parking_garage?: boolean
  category?: string
  onRoute?: boolean
}

interface RailroadCrossing {
  id: number
  name: string
  latitude: number
  longitude: number
  road_name: string
  railway_name: string
  crossing_type: string
  barrier: string
  gates: boolean
  light: boolean
  bell: boolean
  supervised: boolean
  tracks: number
  safety_level: 'protected' | 'warning' | 'unprotected'
}

// MapUpdater only fires when explicitly requested via a flag, not on every center change
function MapUpdater({ center, shouldUpdate, onUpdated }: { center: [number, number], shouldUpdate: boolean, onUpdated?: () => void }) {
  const map = useMap()

  useEffect(() => {
    // Only update map view when shouldUpdate flag is set
    if (shouldUpdate) {
      map.setView(center, map.getZoom())
      // Reset the flag after updating
      if (onUpdated) {
        onUpdated()
      }
    }
  }, [center, shouldUpdate, map, onUpdated])

  return null
}

function MapEventHandler({
  onBoundsChange,
  onCenterChange
}: {
  onBoundsChange: (bounds: any) => void
  onCenterChange?: (center: [number, number]) => void
}) {
  const map = useMap()

  useEffect(() => {
    // Trigger initial bounds
    const bounds = map.getBounds()
    onBoundsChange(bounds)

    // Listen for map move events
    const handleMoveEnd = () => {
      const newBounds = map.getBounds()
      onBoundsChange(newBounds)

      // Also update center for persistence
      if (onCenterChange) {
        const newCenter = map.getCenter()
        onCenterChange([newCenter.lat, newCenter.lng])
      }
    }

    map.on('moveend', handleMoveEnd)
    map.on('zoomend', handleMoveEnd)

    return () => {
      map.off('moveend', handleMoveEnd)
      map.off('zoomend', handleMoveEnd)
    }
  }, [map, onBoundsChange, onCenterChange])

  return null
}

// User Location Marker Component
function UserLocationMarker() {
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [altitude, setAltitude] = useState<number | null>(null)
  const [altitudeAccuracy, setAltitudeAccuracy] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timestamp, setTimestamp] = useState<number | null>(null)
  const [zoom, setZoom] = useState(10)
  const [showModal, setShowModal] = useState(false)
  const [locationConfig, setLocationConfig] = useState({ color: '#3B82F6', icon: '📍' })
  const [configLoaded, setConfigLoaded] = useState(false)
  const map = useMap()

  // Load location config from database on mount
  useEffect(() => {
    preferencesApi.get()
      .then(response => {
        const prefs = response.data.preferences || {}
        if (prefs.location_marker_config) {
          setLocationConfig(prefs.location_marker_config)
        }
        setConfigLoaded(true)
      })
      .catch(err => {
        console.error('Failed to load location config:', err)
        setConfigLoaded(true)
      })
  }, [])

  useEffect(() => {
    const handleZoomEnd = () => {
      setZoom(map.getZoom())
    }
    setZoom(map.getZoom())
    map.on('zoomend', handleZoomEnd)
    return () => {
      map.off('zoomend', handleZoomEnd)
    }
  }, [map])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported')
      return
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords
        setPosition([latitude, longitude])
        setAccuracy(accuracy)
        setAltitude(altitude)
        setAltitudeAccuracy(altitudeAccuracy)
        setHeading(heading)
        setSpeed(speed)
        setTimestamp(pos.timestamp)
        setError(null)
      },
      (err) => {
        console.error('Geolocation error:', err)
        setError(err.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )

    // Watch position for updates
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords
        setPosition([latitude, longitude])
        setAccuracy(accuracy)
        setAltitude(altitude)
        setAltitudeAccuracy(altitudeAccuracy)
        setHeading(heading)
        setSpeed(speed)
        setTimestamp(pos.timestamp)
        setError(null)
      },
      (err) => {
        console.error('Geolocation watch error:', err)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [map])

  const handleConfigChange = (key: string, value: string) => {
    const newConfig = { ...locationConfig, [key]: value }
    setLocationConfig(newConfig)
    // Save to database
    if (configLoaded) {
      preferencesApi.save('location_marker_config', newConfig).catch(err =>
        console.error('Failed to save location config:', err)
      )
    }
  }

  if (error) {
    console.warn('Geolocation error:', error)
    return null
  }

  if (!position) {
    return null
  }

  // Scale icon based on zoom level for better visibility
  const iconSize = Math.max(24, Math.min(48, zoom * 3))
  const locationIcon = createUserLocationIcon({
    color: locationConfig.color,
    icon: locationConfig.icon,
    size: iconSize
  })

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const formatDate = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <>
      <Marker
        position={position}
        icon={locationIcon}
        zIndexOffset={9999}
        eventHandlers={{
          click: () => setShowModal(true)
        }}
      >
        <Popup>
          <div style={{ minWidth: '200px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: locationConfig.color }}>📍 Your Location</h3>
            <button
              onClick={() => setShowModal(true)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: locationConfig.color,
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              View Detailed Info
            </button>
          </div>
        </Popup>
      </Marker>

      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>📍 Detailed Location Information</h2>
              <button onClick={() => setShowModal(false)} style={{
                background: 'var(--accent-danger)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '18px'
              }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>LATITUDE</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{position[0].toFixed(8)}°</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {position[0] > 0 ? 'North' : 'South'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>LONGITUDE</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{position[1].toFixed(8)}°</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {position[1] > 0 ? 'East' : 'West'}
                </div>
              </div>
              {accuracy && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>ACCURACY</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>±{Math.round(accuracy)}m</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    ±{(accuracy * 3.28084).toFixed(0)}ft
                  </div>
                </div>
              )}
              {altitude !== null && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>ALTITUDE</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{Math.round(altitude)}m</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {(altitude * 3.28084).toFixed(0)}ft {altitudeAccuracy && `±${Math.round(altitudeAccuracy)}m`}
                  </div>
                </div>
              )}
              {heading !== null && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>HEADING</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{Math.round(heading)}°</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {heading >= 337.5 || heading < 22.5 ? 'N' : heading >= 22.5 && heading < 67.5 ? 'NE' : heading >= 67.5 && heading < 112.5 ? 'E' : heading >= 112.5 && heading < 157.5 ? 'SE' : heading >= 157.5 && heading < 202.5 ? 'S' : heading >= 202.5 && heading < 247.5 ? 'SW' : heading >= 247.5 && heading < 292.5 ? 'W' : 'NW'}
                  </div>
                </div>
              )}
              {speed !== null && speed > 0 && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>SPEED</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{(speed * 2.23694).toFixed(1)} mph</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {speed.toFixed(1)} m/s • {(speed * 3.6).toFixed(1)} km/h
                  </div>
                </div>
              )}
            </div>

            {timestamp && (
              <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '8px', marginBottom: '25px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>LAST UPDATE</div>
                <div style={{ fontSize: '16px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {formatDate(timestamp)} at {formatTime(timestamp)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  Unix timestamp: {timestamp}
                </div>
              </div>
            )}

            <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '25px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>COORDINATE FORMATS</h3>
              <div style={{ display: 'grid', gap: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '3px' }}>Decimal Degrees (DD)</div>
                  <div style={{ color: 'var(--text-primary)' }}>{position[0].toFixed(8)}, {position[1].toFixed(8)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '3px' }}>Degrees Decimal Minutes (DDM)</div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {Math.floor(Math.abs(position[0]))}° {((Math.abs(position[0]) - Math.floor(Math.abs(position[0]))) * 60).toFixed(4)}' {position[0] >= 0 ? 'N' : 'S'},{' '}
                    {Math.floor(Math.abs(position[1]))}° {((Math.abs(position[1]) - Math.floor(Math.abs(position[1]))) * 60).toFixed(4)}' {position[1] >= 0 ? 'E' : 'W'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '3px' }}>Degrees Minutes Seconds (DMS)</div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {Math.floor(Math.abs(position[0]))}° {Math.floor((Math.abs(position[0]) - Math.floor(Math.abs(position[0]))) * 60)}' {(((Math.abs(position[0]) - Math.floor(Math.abs(position[0]))) * 60 - Math.floor((Math.abs(position[0]) - Math.floor(Math.abs(position[0]))) * 60)) * 60).toFixed(2)}" {position[0] >= 0 ? 'N' : 'S'},{' '}
                    {Math.floor(Math.abs(position[1]))}° {Math.floor((Math.abs(position[1]) - Math.floor(Math.abs(position[1]))) * 60)}' {(((Math.abs(position[1]) - Math.floor(Math.abs(position[1]))) * 60 - Math.floor((Math.abs(position[1]) - Math.floor(Math.abs(position[1]))) * 60)) * 60).toFixed(2)}" {position[1] >= 0 ? 'E' : 'W'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>CUSTOMIZE LOCATION MARKER</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>MARKER COLOR</label>
                  <input
                    type="color"
                    value={locationConfig.color}
                    onChange={(e) => handleConfigChange('color', e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>MARKER ICON</label>
                  <select
                    value={locationConfig.icon}
                    onChange={(e) => handleConfigChange('icon', e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '18px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', maxHeight: '200px' }}
                  >
                    <optgroup label="📍 Pins & Markers">
                      <option value="📍">📍 Classic Pin</option>
                      <option value="📌">📌 Pushpin</option>
                      <option value="📎">📎 Paperclip</option>
                      <option value="🔖">🔖 Bookmark</option>
                    </optgroup>

                    <optgroup label="🎯 Targets & Crosshairs">
                      <option value="🎯">🎯 Bullseye</option>
                      <option value="⊕">⊕ Crosshair</option>
                      <option value="⊗">⊗ Circle-X</option>
                      <option value="⊙">⊙ Dot-Circle</option>
                      <option value="◎">◎ Double Circle</option>
                    </optgroup>

                    <optgroup label="⭐ Stars & Shapes">
                      <option value="⭐">⭐ Star</option>
                      <option value="✨">✨ Sparkles</option>
                      <option value="💫">💫 Dizzy</option>
                      <option value="🌟">🌟 Glowing Star</option>
                      <option value="⛤">⛤ Pentagram</option>
                      <option value="✴️">✴️ Eight Point</option>
                      <option value="❇️">❇️ Sparkle</option>
                    </optgroup>

                    <optgroup label="🔵 Dots & Circles">
                      <option value="🔵">🔵 Blue Dot</option>
                      <option value="🟢">🟢 Green Dot</option>
                      <option value="🔴">🔴 Red Dot</option>
                      <option value="🟡">🟡 Yellow Dot</option>
                      <option value="🟠">🟠 Orange Dot</option>
                      <option value="🟣">🟣 Purple Dot</option>
                      <option value="⚫">⚫ Black Dot</option>
                      <option value="⚪">⚪ White Dot</option>
                      <option value="🟤">🟤 Brown Dot</option>
                    </optgroup>

                    <optgroup label="🚩 Flags & Markers">
                      <option value="🚩">🚩 Red Flag</option>
                      <option value="🏁">🏁 Checkered Flag</option>
                      <option value="🏴">🏴 Black Flag</option>
                      <option value="🏳️">🏳️ White Flag</option>
                      <option value="🎌">🎌 Crossed Flags</option>
                      <option value="🏴‍☠️">🏴‍☠️ Pirate Flag</option>
                      <option value="🚧">🚧 Construction</option>
                    </optgroup>

                    <optgroup label="🧭 Navigation">
                      <option value="🧭">🧭 Compass</option>
                      <option value="⬆️">⬆️ Up Arrow</option>
                      <option value="➡️">➡️ Right Arrow</option>
                      <option value="⬇️">⬇️ Down Arrow</option>
                      <option value="⬅️">⬅️ Left Arrow</option>
                      <option value="↗️">↗️ NE Arrow</option>
                      <option value="↘️">↘️ SE Arrow</option>
                      <option value="↙️">↙️ SW Arrow</option>
                      <option value="↖️">↖️ NW Arrow</option>
                      <option value="🔄">🔄 Refresh</option>
                    </optgroup>

                    <optgroup label="🗺️ Maps & Location">
                      <option value="🗺️">🗺️ World Map</option>
                      <option value="🌐">🌐 Globe</option>
                      <option value="🌍">🌍 Earth Africa</option>
                      <option value="🌎">🌎 Earth Americas</option>
                      <option value="🌏">🌏 Earth Asia</option>
                      <option value="🗾">🗾 Japan Map</option>
                    </optgroup>

                    <optgroup label="📡 Satellites & Signals">
                      <option value="📡">📡 Satellite Dish</option>
                      <option value="🛰️">🛰️ GPS Satellite</option>
                      <option value="📶">📶 Signal Bars</option>
                      <option value="📳">📳 Vibrate</option>
                      <option value="📴">📴 Phone Off</option>
                      <option value="🔆">🔆 Bright</option>
                    </optgroup>

                    <optgroup label="🚗 Vehicles">
                      <option value="🚗">🚗 Car</option>
                      <option value="🚙">🚙 SUV</option>
                      <option value="🚐">🚐 Van</option>
                      <option value="🚚">🚚 Truck</option>
                      <option value="🏎️">🏎️ Race Car</option>
                      <option value="🚓">🚓 Police Car</option>
                      <option value="🚑">🚑 Ambulance</option>
                      <option value="🚒">🚒 Fire Truck</option>
                      <option value="🚜">🚜 Tractor</option>
                      <option value="🛻">🛻 Pickup</option>
                    </optgroup>

                    <optgroup label="✈️ Aircraft & Travel">
                      <option value="✈️">✈️ Airplane</option>
                      <option value="🛩️">🛩️ Small Plane</option>
                      <option value="🚁">🚁 Helicopter</option>
                      <option value="🛸">🛸 UFO</option>
                      <option value="🚀">🚀 Rocket</option>
                      <option value="🎈">🎈 Balloon</option>
                    </optgroup>

                    <optgroup label="⚓ Maritime">
                      <option value="⚓">⚓ Anchor</option>
                      <option value="⛵">⛵ Sailboat</option>
                      <option value="🚤">🚤 Speedboat</option>
                      <option value="🛥️">🛥️ Motor Boat</option>
                      <option value="⛴️">⛴️ Ferry</option>
                      <option value="🚢">🚢 Ship</option>
                    </optgroup>

                    <optgroup label="🏠 Places">
                      <option value="🏠">🏠 House</option>
                      <option value="🏡">🏡 House Garden</option>
                      <option value="🏢">🏢 Office</option>
                      <option value="🏨">🏨 Hotel</option>
                      <option value="🏪">🏪 Store</option>
                      <option value="🏫">🏫 School</option>
                      <option value="🏥">🏥 Hospital</option>
                      <option value="🏦">🏦 Bank</option>
                      <option value="🏭">🏭 Factory</option>
                      <option value="⛪">⛪ Church</option>
                      <option value="🕌">🕌 Mosque</option>
                      <option value="🏛️">🏛️ Classical</option>
                      <option value="🏰">🏰 Castle</option>
                      <option value="🗼">🗼 Tower</option>
                    </optgroup>

                    <optgroup label="⛺ Camping & Outdoors">
                      <option value="⛺">⛺ Tent</option>
                      <option value="🏕️">🏕️ Camping</option>
                      <option value="🎪">🎪 Circus</option>
                      <option value="🌲">🌲 Tree</option>
                      <option value="🌳">🌳 Deciduous</option>
                      <option value="🌴">🌴 Palm</option>
                      <option value="🏔️">🏔️ Mountain</option>
                      <option value="⛰️">⛰️ Peak</option>
                      <option value="🗻">🗻 Fuji</option>
                    </optgroup>

                    <optgroup label="💎 Gems & Special">
                      <option value="💎">💎 Diamond</option>
                      <option value="💠">💠 Gem</option>
                      <option value="🔷">🔷 Blue Diamond</option>
                      <option value="🔶">🔶 Orange Diamond</option>
                      <option value="🔸">🔸 Small Orange</option>
                      <option value="🔹">🔹 Small Blue</option>
                      <option value="❤️">❤️ Heart</option>
                      <option value="💚">💚 Green Heart</option>
                      <option value="💙">💙 Blue Heart</option>
                      <option value="💛">💛 Yellow Heart</option>
                      <option value="🧡">🧡 Orange Heart</option>
                      <option value="💜">💜 Purple Heart</option>
                    </optgroup>

                    <optgroup label="⚡ Energy & Warning">
                      <option value="⚡">⚡ Lightning</option>
                      <option value="🔥">🔥 Fire</option>
                      <option value="💥">💥 Boom</option>
                      <option value="⚠️">⚠️ Warning</option>
                      <option value="☢️">☢️ Radioactive</option>
                      <option value="☣️">☣️ Biohazard</option>
                      <option value="🚫">🚫 Prohibited</option>
                      <option value="❌">❌ Cross Mark</option>
                      <option value="✅">✅ Check</option>
                      <option value="✔️">✔️ Heavy Check</option>
                    </optgroup>

                    <optgroup label="🎮 Gaming & Fun">
                      <option value="🎮">🎮 Controller</option>
                      <option value="🎯">🎯 Target</option>
                      <option value="🎲">🎲 Dice</option>
                      <option value="🎰">🎰 Slot</option>
                      <option value="🃏">🃏 Joker</option>
                      <option value="♠️">♠️ Spade</option>
                      <option value="♥️">♥️ Heart Card</option>
                      <option value="♦️">♦️ Diamond Card</option>
                      <option value="♣️">♣️ Club</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Context Menu Component
function MapContextMenu() {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const map = useMap()

  useMapEvents({
    contextmenu: (e) => {
      e.originalEvent.preventDefault()
      const { lat, lng } = e.latlng
      const { x, y } = e.containerPoint

      setMenuPosition({ x, y, lat, lng })
    },
    click: () => {
      setMenuPosition(null)
    }
  })

  // Disable click propagation to Leaflet map when menu is shown
  useEffect(() => {
    if (menuRef.current && menuPosition) {
      L.DomEvent.disableClickPropagation(menuRef.current)
    }
  }, [menuPosition])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking inside the menu
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return
      setMenuPosition(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  if (!menuPosition) return null

  const menuItems = [
    {
      icon: '📍',
      label: 'Open in Google Maps',
      action: () => {
        window.open(`https://www.google.com/maps?q=${menuPosition.lat},${menuPosition.lng}`, '_blank', 'noopener,noreferrer')
      }
    },
    {
      icon: '🗺️',
      label: 'Open Google Street View',
      action: () => {
        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${menuPosition.lat},${menuPosition.lng}`, '_blank', 'noopener,noreferrer')
      }
    },
    {
      icon: '🌍',
      label: 'Open in Google Earth',
      action: () => {
        window.open(`https://earth.google.com/web/@${menuPosition.lat},${menuPosition.lng},0a,1000d,35y,0h,0t,0r`, '_blank', 'noopener,noreferrer')
      }
    },
    {
      icon: '🧭',
      label: 'Directions to Here',
      action: () => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${menuPosition.lat},${menuPosition.lng}`, '_blank', 'noopener,noreferrer')
      }
    },
    {
      icon: '📏',
      label: 'Copy Coordinates',
      action: () => {
        const coords = `${menuPosition.lat.toFixed(6)}, ${menuPosition.lng.toFixed(6)}`
        navigator.clipboard.writeText(coords)
        alert(`Coordinates copied: ${coords}`)
      }
    },
    {
      icon: '📋',
      label: 'Copy Google Maps Link',
      action: () => {
        const link = `https://www.google.com/maps?q=${menuPosition.lat},${menuPosition.lng}`
        navigator.clipboard.writeText(link)
        alert('Google Maps link copied!')
      }
    },
    {
      icon: '🎯',
      label: 'Center Map Here',
      action: () => {
        map.setView([menuPosition.lat, menuPosition.lng], map.getZoom())
      }
    },
    {
      icon: '🔍',
      label: 'Zoom In Here',
      action: () => {
        map.setView([menuPosition.lat, menuPosition.lng], Math.min(map.getZoom() + 2, 18))
      }
    }
  ]

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: menuPosition.x,
        top: menuPosition.y,
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px var(--shadow-lg)',
        zIndex: 10000,
        minWidth: '220px',
        overflow: 'hidden'
      }}
    >
      {menuItems.map((item, index) => (
        <div
          key={index}
          style={{
            padding: '10px 15px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            color: 'var(--text-primary)',
            transition: 'background-color 0.2s',
            borderBottom: index < menuItems.length - 1 ? '1px solid var(--border-color)' : 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          onClick={() => {
            item.action()
            setMenuPosition(null)
          }}
        >
          <span style={{ fontSize: '18px' }}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
      <div
        style={{
          padding: '8px 15px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-color)'
        }}
      >
        {menuPosition.lat.toFixed(6)}, {menuPosition.lng.toFixed(6)}
      </div>
    </div>
  )
}

// Gap analysis interface
interface GapSuggestion {
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
  estimated_date?: string  // ISO date string for estimated arrival
  day_number?: number      // Day number of the trip
  isochrone?: [number, number][] // Drive-time polygon points (backwards compat)
  isochrone_layers?: {
    '15min': [number, number][]
    '30min': [number, number][]
    '45min': [number, number][]
  }
}

interface StopRangeLayers {
  inner: { minutes: number; percentage: number; isochrone: [number, number][] }
  middle: { minutes: number; percentage: number; isochrone: [number, number][] }
  outer: { minutes: number; percentage: number; isochrone: [number, number][] }
}

export default function MapView() {
  const [trips, setTrips] = useState<any[]>([])
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [gapSuggestions, setGapSuggestions] = useState<GapSuggestion[]>([])
  const [stopRangeLayers, setStopRangeLayers] = useState<StopRangeLayers | null>(null)
  const [stopRangeLoading, setStopRangeLoading] = useState(false)
  const [stopRangeCenter, setStopRangeCenter] = useState<{lat: number, lon: number, name: string} | null>(null)

  // Map settings - will be loaded from database
  const [center, setCenter] = useState<[number, number] | null>(null) // Will be set by preferences or geolocation
  const [centerInitialized, setCenterInitialized] = useState(false) // Track if center has been properly initialized
  const [shouldUpdateMap, setShouldUpdateMap] = useState(false) // Flag to trigger programmatic map centering
  const [selectedTileLayer, setSelectedTileLayer] = useState<string>('dark') // Default tile layer
  const [routeDistanceFilter, setRouteDistanceFilter] = useState<number>(40) // Filter POIs within X miles of route
  const [pois, setPois] = useState<POI[]>([])
  const [heights, setHeights] = useState<HeightRestriction[]>([])
  const [showHeights, setShowHeights] = useState<boolean>(true) // Heights always on by default for safety
  const [railroadCrossings, setRailroadCrossings] = useState<RailroadCrossing[]>([])
  const [showRailroadCrossings, setShowRailroadCrossings] = useState<boolean>(true) // Show railroad crossings
  const [railroadFilterMode, setRailroadFilterMode] = useState<'onRoute' | 'nearby' | 'viewport' | 'all'>('onRoute') // Default to only crossings we drive over
  const [railroadRadiusMiles, setRailroadRadiusMiles] = useState<number>(2) // Radius for nearby mode
  const [showIsochrones, setShowIsochrones] = useState<boolean>(false) // Show drive-time isochrones around stops
  const [isochroneLayer15, setIsochroneLayer15] = useState<boolean>(true) // Show 15min layer
  const [isochroneLayer30, setIsochroneLayer30] = useState<boolean>(true) // Show 30min layer
  const [isochroneLayer45, setIsochroneLayer45] = useState<boolean>(true) // Show 45min layer
  const [stopIsochrones, setStopIsochrones] = useState<Record<number, any>>({}) // Store isochrones for each stop
  const [isochronesLoading, setIsochronesLoading] = useState<boolean>(false)
  const [showMapSettings, setShowMapSettings] = useState<boolean>(false) // Gear menu for map/height settings

  // Weather overlay settings
  const [showWeatherRadar, setShowWeatherRadar] = useState<boolean>(true) // Show NEXRAD radar overlay by default
  const [weatherOverlayOpacity, setWeatherOverlayOpacity] = useState<number>(0.5) // Radar overlay opacity
  const [showWeatherControls, setShowWeatherControls] = useState<boolean>(false) // Show weather radar controls popup
  const [showWeatherPanel, setShowWeatherPanel] = useState<boolean>(false) // Show weather forecast panel
  const [tripForecasts, setTripForecasts] = useState<any[]>([]) // Weather forecasts for trip stops
  const [forecastLoading, setForecastLoading] = useState<boolean>(false)
  const [userRvHeight, setUserRvHeight] = useState<number>(12.5) // Default RV height in feet
  const [showRvHeightInput, setShowRvHeightInput] = useState<boolean>(false)
  const [radarProduct, setRadarProduct] = useState<string>('n0q') // Radar product type (n0q = base reflectivity)
  const [showRadarLegend, setShowRadarLegend] = useState<boolean>(false) // Show radar color legend


  // Weather radar animation
  const [isRadarAnimating, setIsRadarAnimating] = useState<boolean>(false)
  const [radarAnimationSpeed, setRadarAnimationSpeed] = useState<number>(500) // ms per frame

  // NEXRAD radar uses live data - no timestamp needed in URL
  // The Iowa Mesonet tile server automatically serves current radar data
  const generateRadarFrames = useCallback(() => {
    // Return single "current" frame since NEXRAD doesn't support historical timestamps
    return ['current']
  }, [])

  const [radarFrames, setRadarFrames] = useState<string[]>(generateRadarFrames())
  const [radarFrameIndex, setRadarFrameIndex] = useState<number>(radarFrames.length - 1) // Start at latest frame

  // Manual refresh function for on-demand updates
  const refreshRadarFrames = useCallback(() => {
    const newFrames = generateRadarFrames()
    setRadarFrames(newFrames)
    setRadarFrameIndex(newFrames.length - 1) // Reset to latest frame
  }, [generateRadarFrames])

  // Regenerate radar frames every 5 minutes to keep timestamps current
  useEffect(() => {
    const interval = setInterval(() => {
      refreshRadarFrames()
    }, 5 * 60 * 1000) // Every 5 minutes

    return () => clearInterval(interval)
  }, [refreshRadarFrames])

  // Refresh radar when user toggles it on (on-demand)
  useEffect(() => {
    if (showWeatherRadar) {
      refreshRadarFrames()
    }
  }, [showWeatherRadar, refreshRadarFrames])

  // Radar animation loop
  useEffect(() => {
    if (!isRadarAnimating) return

    const interval = setInterval(() => {
      setRadarFrameIndex(prev => (prev + 1) % radarFrames.length)
    }, radarAnimationSpeed)

    return () => clearInterval(interval)
  }, [isRadarAnimating, radarAnimationSpeed, radarFrames.length])

  // Height filter settings
  const [heightFilterMode, setHeightFilterMode] = useState<'all' | 'route' | 'radius' | 'viewport'>('route') // Default to on route only (no buffer)
  const [heightRadiusMiles, setHeightRadiusMiles] = useState<number>(0.1) // Radius for route mode (default 0.1mi = ~500ft for exact route)
  const [heightMinFilter, setHeightMinFilter] = useState<number | null>(null) // Show only heights below this (null = no filter)
  const [heightMaxFilter, setHeightMaxFilter] = useState<number | null>(null) // Show only heights above this (null = no filter)
  const [heightMaxResults, setHeightMaxResults] = useState<number | null>(null) // Limit number of results (null = no limit)
  const [heightShowDangerous, setHeightShowDangerous] = useState<boolean>(true) // Show heights below RV height
  const [heightShowSafe, setHeightShowSafe] = useState<boolean>(true) // Show heights above RV height
  const [showDistanceCircles, setShowDistanceCircles] = useState<boolean>(false) // Show distance circles around stops
  const [selectedRvProfile, setSelectedRvProfile] = useState<any>(null)
  const navigate = useNavigate()
  const [targetMarker, setTargetMarker] = useState<{ lat: number; lon: number } | null>(null)
  const [targetHeightModal, setTargetHeightModal] = useState<{
    name: string;
    road_name: string;
    height_feet: number;
    lat: number;
    lon: number;
  } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set()) // Default to empty - all filters off
  const [loading, setLoading] = useState(false)
  const [showLegend, setShowLegend] = useState<boolean>(true)
  const [cacheStats, setCacheStats] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [mapBounds, setMapBounds] = useState<any>(null)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [initialPreferences, setInitialPreferences] = useState<any>(null) // Track initial values to avoid re-saving on load

  // Compute a signature of stops to detect changes (id, coordinates, order)
  const stopsSignature = useMemo(() => {
    if (!selectedTrip?.stops?.length) return ''
    return JSON.stringify(
      selectedTrip.stops
        .sort((a: any, b: any) => a.stop_order - b.stop_order)
        .map((s: any) => ({
          id: s.id,
          lat: s.latitude,
          lon: s.longitude,
          order: s.stop_order
        }))
    )
  }, [selectedTrip])

  // Filter heights based on user settings
  // Mark which ones are directly on the route (will pass under them)
  const filteredHeights = useMemo(() => {
    const ON_ROUTE_THRESHOLD = 0.002 // miles (~10 feet) - must be actually on the route

    // Calculate distance from point to line segment in miles
    const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
      const dx = x2 - x1
      const dy = y2 - y1
      if (dx === 0 && dy === 0) {
        // Segment is a point
        return getDistanceMiles(px, py, x1, y1)
      }

      // Calculate projection parameter t
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
      const projX = x1 + t * dx
      const projY = y1 + t * dy

      return getDistanceMiles(px, py, projX, projY)
    }

    // Helper to check if a height restriction is on the route
    const isOnRoute = (height: HeightRestriction): boolean => {
      if (routeCoords.length < 2) return false

      // Check distance to each route segment (not just points)
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const dist = pointToSegmentDistance(
          height.latitude, height.longitude,
          routeCoords[i][0], routeCoords[i][1],
          routeCoords[i + 1][0], routeCoords[i + 1][1]
        )
        if (dist <= ON_ROUTE_THRESHOLD) {
          return true
        }
      }
      return false
    }

    let result = [...heights]

    // Apply height thresholds
    if (heightMinFilter !== null) {
      result = result.filter(h => h.height_feet >= heightMinFilter)
    }
    if (heightMaxFilter !== null) {
      result = result.filter(h => h.height_feet <= heightMaxFilter)
    }

    // Apply dangerous/safe filters based on RV height
    if (!heightShowDangerous) {
      result = result.filter(h => h.height_feet > userRvHeight)
    }
    if (!heightShowSafe) {
      result = result.filter(h => h.height_feet <= userRvHeight)
    }

    // Apply route filter - only show heights on the route
    if (heightFilterMode === 'route') {
      if (routeCoords.length > 0) {
        // When we have a route, show only heights directly on it
        result = result.filter(h => {
          // Check if height is within radius of any route point
          for (const coord of routeCoords) {
            const dist = getDistanceMiles(h.latitude, h.longitude, coord[0], coord[1])
            if (dist <= heightRadiusMiles) {
              return true
            }
          }
          return false
        })
      } else {
        // No route - show only heights below RV height (dangerous ones)
        result = result.filter(h => h.height_feet <= userRvHeight)
      }
    }

    // Mark which heights are directly on route (will pass under them)
    result = result.map(h => ({
      ...h,
      onRoute: isOnRoute(h)
    }))

    // Apply max results limit
    if (heightMaxResults !== null && result.length > heightMaxResults) {
      // Sort by danger level (lowest heights first) then limit
      result = result
        .sort((a, b) => a.height_feet - b.height_feet)
        .slice(0, heightMaxResults)
    }

    return result
  }, [heights, heightMinFilter, heightMaxFilter, heightShowDangerous, heightShowSafe,
      heightFilterMode, routeCoords, heightRadiusMiles, heightMaxResults, userRvHeight])

  // Filter railroad crossings based on user settings
  // Mark which ones are directly on the route
  const filteredRailroadCrossings = useMemo(() => {
    const ON_ROUTE_THRESHOLD = 0.002 // miles (~10 feet) - must be actually on the route

    // Calculate distance from point to line segment in miles
    const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
      const dx = x2 - x1
      const dy = y2 - y1
      if (dx === 0 && dy === 0) {
        return getDistanceMiles(px, py, x1, y1)
      }
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
      const projX = x1 + t * dx
      const projY = y1 + t * dy
      return getDistanceMiles(px, py, projX, projY)
    }

    // Helper to check if a crossing is on the route
    const isOnRoute = (crossing: RailroadCrossing): boolean => {
      if (routeCoords.length < 2) return false

      // Check distance to each route segment (not just points)
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const dist = pointToSegmentDistance(
          crossing.latitude, crossing.longitude,
          routeCoords[i][0], routeCoords[i][1],
          routeCoords[i + 1][0], routeCoords[i + 1][1]
        )
        if (dist <= ON_ROUTE_THRESHOLD) {
          return true
        }
      }
      return false
    }

    let result = railroadCrossings

    if (railroadFilterMode === 'onRoute' && routeCoords.length > 0) {
      // Only show crossings we actually drive over
      result = railroadCrossings.filter(crossing => {
        for (const coord of routeCoords) {
          const dist = getDistanceMiles(crossing.latitude, crossing.longitude, coord[0], coord[1])
          if (dist <= ON_ROUTE_THRESHOLD) {
            return true
          }
        }
        return false
      })
    } else if (railroadFilterMode === 'nearby' && routeCoords.length > 0) {
      // Show crossings within radius of route
      result = railroadCrossings.filter(crossing => {
        for (const coord of routeCoords) {
          const dist = getDistanceMiles(crossing.latitude, crossing.longitude, coord[0], coord[1])
          if (dist <= railroadRadiusMiles) {
            return true
          }
        }
        return false
      })
    } else if (railroadFilterMode === 'all') {
      result = railroadCrossings
    }
    // viewport mode - return all (API already filtered by bounds)

    // Add onRoute property to each crossing
    return result.map(crossing => ({
      ...crossing,
      onRoute: isOnRoute(crossing)
    }))
  }, [railroadCrossings, railroadFilterMode, routeCoords, railroadRadiusMiles])

  // Regenerate route when stops change (including add/remove/reorder)
  useEffect(() => {
    if (!selectedTrip?.id || !stopsSignature) return

    const fetchRoute = async () => {
      if (!selectedTrip.stops || selectedTrip.stops.length < 2) {
        setRouteCoords([])
        return
      }

      setRouteLoading(true)
      try {
        const response = await fetch(`/api/trips/${selectedTrip.id}/route`, {
          headers: {
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.route && data.route.length > 0) {
            setRouteCoords(data.route)
            console.log(`Route regenerated: ${data.route.length} points`)
          }
        }
      } catch (error) {
        console.error('Failed to regenerate route:', error)
        // Fallback to straight lines
        setRouteCoords(selectedTrip.stops.map((s: any) => [s.latitude, s.longitude]))
      } finally {
        setRouteLoading(false)
      }
    }

    fetchRoute()
  }, [stopsSignature, selectedTrip?.id])

  // Fetch isochrones for all trip stops
  const fetchStopIsochrones = async () => {
    if (!selectedTrip?.stops || selectedTrip.stops.length === 0) return

    setIsochronesLoading(true)
    const newIsochrones: Record<number, any> = {}

    try {
      // Fetch isochrones for each stop in parallel
      const promises = selectedTrip.stops.map(async (stop: any) => {
        try {
          const response = await tripsApi.getIsochrones(stop.latitude, stop.longitude, '15,30,45')
          return { stopId: stop.id, data: response.data }
        } catch (error) {
          console.error(`Failed to fetch isochrones for stop ${stop.id}:`, error)
          return { stopId: stop.id, data: null }
        }
      })

      const results = await Promise.all(promises)

      results.forEach(result => {
        if (result.data) {
          newIsochrones[result.stopId] = result.data.isochrones
        }
      })

      setStopIsochrones(newIsochrones)
    } catch (error) {
      console.error('Failed to fetch isochrones:', error)
    } finally {
      setIsochronesLoading(false)
    }
  }

  // Fetch isochrones when enabled
  useEffect(() => {
    if (showIsochrones && selectedTrip?.id) {
      fetchStopIsochrones()
    }
  }, [showIsochrones, selectedTrip?.id])

  // Fetch comprehensive weather data

  // Load preferences from database on mount
  useEffect(() => {
    loadPreferences()
  }, [])

  // Check for map target from Dashboard navigation
  useEffect(() => {
    const targetStr = sessionStorage.getItem('mapTarget')
    if (targetStr) {
      try {
        const target = JSON.parse(targetStr)
        setCenter([target.lat, target.lon])
        setShouldUpdateMap(true)

        // Show reticle marker
        setTargetMarker({ lat: target.lat, lon: target.lon })

        // Show height modal if height data is included
        if (target.heightData) {
          setTargetHeightModal({
            ...target.heightData,
            lat: target.lat,
            lon: target.lon
          })
        }

        // Clear the target so it doesn't persist
        sessionStorage.removeItem('mapTarget')
      } catch (e) {
        console.error('Failed to parse map target:', e)
      }
    }
  }, [])

  const loadPreferences = async () => {
    try {
      const response = await preferencesApi.get()
      const prefs = response.data.preferences || {}

      // Track initial values to prevent re-saving on load
      setInitialPreferences({
        map_center: prefs.map_center,
        selected_poi_categories: prefs.selected_poi_categories,
        show_legend: prefs.show_legend,
        selected_tile_layer: prefs.selected_tile_layer,
        route_distance_filter: prefs.route_distance_filter,
        height_filter_mode: prefs.height_filter_mode,
        height_radius_miles: prefs.height_radius_miles,
        height_min_filter: prefs.height_min_filter,
        height_max_filter: prefs.height_max_filter,
        height_max_results: prefs.height_max_results,
        height_show_dangerous: prefs.height_show_dangerous,
        height_show_safe: prefs.height_show_safe
      })

      // Load map center - use saved center, or get user location, or fall back to USA center
      if (prefs.map_center) {
        setCenter(prefs.map_center)
        setCenterInitialized(true)
      } else {
        // No saved center - try to get user's location
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCenter([pos.coords.latitude, pos.coords.longitude])
              setCenterInitialized(true)
            },
            () => {
              // Geolocation failed - fall back to USA center
              setCenter([39.8283, -98.5795])
              setCenterInitialized(true)
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          )
        } else {
          // No geolocation support - fall back to USA center
          setCenter([39.8283, -98.5795])
          setCenterInitialized(true)
        }
      }

      // Load selected categories
      if (prefs.selected_poi_categories) {
        setSelectedCategories(new Set(prefs.selected_poi_categories))
      }

      // Load legend visibility
      if (prefs.show_legend !== undefined) {
        setShowLegend(prefs.show_legend)
      }

      // Load selected tile layer
      if (prefs.selected_tile_layer) {
        setSelectedTileLayer(prefs.selected_tile_layer)
      }

      // Load route distance filter
      if (prefs.route_distance_filter !== undefined) {
        setRouteDistanceFilter(prefs.route_distance_filter)
      }

      // Load user RV height
      if (prefs.user_rv_height !== undefined) {
        setUserRvHeight(prefs.user_rv_height)
      }

      // Load height filter settings
      if (prefs.height_filter_mode) {
        setHeightFilterMode(prefs.height_filter_mode)
      }
      if (prefs.height_radius_miles !== undefined) {
        setHeightRadiusMiles(prefs.height_radius_miles)
      }
      if (prefs.height_min_filter !== undefined) {
        setHeightMinFilter(prefs.height_min_filter)
      }
      if (prefs.height_max_filter !== undefined) {
        setHeightMaxFilter(prefs.height_max_filter)
      }
      if (prefs.height_max_results !== undefined) {
        setHeightMaxResults(prefs.height_max_results)
      }
      if (prefs.height_show_dangerous !== undefined) {
        setHeightShowDangerous(prefs.height_show_dangerous)
      }
      if (prefs.height_show_safe !== undefined) {
        setHeightShowSafe(prefs.height_show_safe)
      }

      // Load RV profile to get vehicle name and height
      try {
        const rvResponse = await rvProfilesApi.getAll()
        if (rvResponse.data && rvResponse.data.length > 0) {
          // Use first profile (or selected profile if we have that preference)
          const selectedProfileId = prefs.selected_rv_profile_id
          const profile = selectedProfileId
            ? rvResponse.data.find((p: any) => p.id === selectedProfileId) || rvResponse.data[0]
            : rvResponse.data[0]
          setSelectedRvProfile(profile)
          // Also set the height from profile if available
          if (profile.height_feet) {
            setUserRvHeight(profile.height_feet)
          }
        }
      } catch (err) {
        console.error('Failed to load RV profiles:', err)
      }

      setPreferencesLoaded(true)
    } catch (error) {
      console.error('Failed to load preferences:', error)
      setSelectedCategories(new Set()) // Default to all filters off on error
      setInitialPreferences({}) // Empty object so we can still save
      setPreferencesLoaded(true) // Still mark as loaded so app doesn't hang

      // Try to get user location even on error
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCenter([pos.coords.latitude, pos.coords.longitude])
            setCenterInitialized(true)
          },
          () => {
            setCenter([39.8283, -98.5795])
            setCenterInitialized(true)
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        )
      } else {
        setCenter([39.8283, -98.5795])
        setCenterInitialized(true)
      }
    }
  }

  // Save map center when it changes (but not on initial load)
  useEffect(() => {
    if (preferencesLoaded && initialPreferences && centerInitialized && center) {
      // Check if this is a real change, not initial load
      const initialCenter = initialPreferences.map_center
      const centerChanged = !initialCenter ||
        center[0] !== initialCenter[0] ||
        center[1] !== initialCenter[1]

      if (centerChanged) {
        preferencesApi.save('map_center', center).catch(err =>
          console.error('Failed to save map center:', err)
        )
      }
    }
  }, [center, preferencesLoaded, initialPreferences, centerInitialized])

  // Save selected categories when they change (but not on initial load)
  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      const initialCategories = initialPreferences.selected_poi_categories
      const categoriesArray = Array.from(selectedCategories)
      const categoriesChanged = !initialCategories ||
        categoriesArray.length !== initialCategories.length ||
        !categoriesArray.every(cat => initialCategories.includes(cat))

      if (categoriesChanged) {
        preferencesApi.save('selected_poi_categories', categoriesArray).catch(err =>
          console.error('Failed to save categories:', err)
        )
      }
    }
  }, [selectedCategories, preferencesLoaded, initialPreferences])

  // Save legend visibility when it changes (but not on initial load)
  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      const initialShowLegend = initialPreferences.show_legend
      if (initialShowLegend === undefined || showLegend !== initialShowLegend) {
        preferencesApi.save('show_legend', showLegend).catch(err =>
          console.error('Failed to save legend preference:', err)
        )
      }
    }
  }, [showLegend, preferencesLoaded, initialPreferences])

  // Track if initial load is complete to avoid saving during load
  const initialLoadComplete = useRef(false)

  // Save tile layer when it changes (but not on initial load)
  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      // Skip the first render after preferences are loaded
      if (!initialLoadComplete.current) {
        initialLoadComplete.current = true
        return
      }
      // Save any subsequent changes
      console.log('Saving tile layer preference:', selectedTileLayer)
      preferencesApi.save('selected_tile_layer', selectedTileLayer).catch(err =>
        console.error('Failed to save tile layer preference:', err)
      )
    }
  }, [selectedTileLayer, preferencesLoaded, initialPreferences])

  // Save route distance filter when it changes (but not on initial load)
  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      const initialRouteFilter = initialPreferences.route_distance_filter
      if (initialRouteFilter === undefined || routeDistanceFilter !== initialRouteFilter) {
        preferencesApi.save('route_distance_filter', routeDistanceFilter).catch(err =>
          console.error('Failed to save route distance filter:', err)
        )
      }
    }
  }, [routeDistanceFilter, preferencesLoaded, initialPreferences])

  // Save height filter settings when they change
  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_filter_mode !== heightFilterMode) {
        preferencesApi.save('height_filter_mode', heightFilterMode).catch(err =>
          console.error('Failed to save height filter mode:', err)
        )
      }
    }
  }, [heightFilterMode, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_radius_miles !== heightRadiusMiles) {
        preferencesApi.save('height_radius_miles', heightRadiusMiles).catch(err =>
          console.error('Failed to save height radius:', err)
        )
      }
    }
  }, [heightRadiusMiles, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_min_filter !== heightMinFilter) {
        preferencesApi.save('height_min_filter', heightMinFilter).catch(err =>
          console.error('Failed to save height min filter:', err)
        )
      }
    }
  }, [heightMinFilter, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_max_filter !== heightMaxFilter) {
        preferencesApi.save('height_max_filter', heightMaxFilter).catch(err =>
          console.error('Failed to save height max filter:', err)
        )
      }
    }
  }, [heightMaxFilter, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_max_results !== heightMaxResults) {
        preferencesApi.save('height_max_results', heightMaxResults).catch(err =>
          console.error('Failed to save height max results:', err)
        )
      }
    }
  }, [heightMaxResults, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_show_dangerous !== heightShowDangerous) {
        preferencesApi.save('height_show_dangerous', heightShowDangerous).catch(err =>
          console.error('Failed to save height show dangerous:', err)
        )
      }
    }
  }, [heightShowDangerous, preferencesLoaded, initialPreferences])

  useEffect(() => {
    if (preferencesLoaded && initialPreferences) {
      if (initialPreferences.height_show_safe !== heightShowSafe) {
        preferencesApi.save('height_show_safe', heightShowSafe).catch(err =>
          console.error('Failed to save height show safe:', err)
        )
      }
    }
  }, [heightShowSafe, preferencesLoaded, initialPreferences])

  useEffect(() => {
    loadTrips()
    loadCacheStats()
  }, [])

  useEffect(() => {
    if (selectedCategories.size > 0 && mapBounds) {
      searchPOIs()
    } else {
      setPois([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories, mapBounds])

  // Fetch heights when map bounds change or filter settings change
  useEffect(() => {
    if (mapBounds && showHeights) {
      searchHeights()
    } else if (!showHeights) {
      setHeights([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBounds, showHeights, heightFilterMode, heightRadiusMiles, routeCoords])

  // Fetch railroad crossings when map bounds change or filter mode changes
  // Only fetch from viewport when in viewport/all mode, otherwise fetch along route
  useEffect(() => {
    if (!showRailroadCrossings) {
      setRailroadCrossings([])
      return
    }

    // For onRoute mode, we need route coords - skip viewport fetch
    if (railroadFilterMode === 'onRoute' && routeCoords.length > 0) {
      searchRailroadCrossingsAlongRoute()
    } else if (railroadFilterMode === 'nearby' && routeCoords.length > 0) {
      searchRailroadCrossingsAlongRoute()
    } else if (mapBounds && (railroadFilterMode === 'viewport' || railroadFilterMode === 'all')) {
      searchRailroadCrossings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBounds, showRailroadCrossings, railroadFilterMode, routeCoords.length])

  const loadTrips = async () => {
    try {
      const response = await tripsApi.getAll()
      setTrips(response.data)
      if (response.data.length > 0 && response.data[0].stops?.length > 0) {
        const firstTrip = response.data[0]
        setSelectedTrip(firstTrip)
        // Only set center from trip if we don't have a saved center preference
        // The saved center takes priority
        if (!initialPreferences?.map_center) {
          const firstStop = firstTrip.stops[0]
          setCenter([firstStop.latitude, firstStop.longitude])
        }

        // Load the route for the initial trip
        if (firstTrip.stops.length >= 2) {
          try {
            const routeResponse = await fetch(`/api/trips/${firstTrip.id}/route`, {
              headers: {
                'Authorization': `Bearer ${safeStorage.getItem('token')}`
              }
            })
            if (routeResponse.ok) {
              const data = await routeResponse.json()
              if (data.route && data.route.length > 0) {
                setRouteCoords(data.route)
              }
            }
          } catch (error) {
            console.error('Failed to load initial route:', error)
          }

          // Load gap suggestions for the initial trip (try saved first, then analyze)
          try {
            // First try to load saved gap suggestions (instant)
            const savedGapResponse = await fetch(`/api/trips/${firstTrip.id}/gap-suggestions`, {
              headers: {
                'Authorization': `Bearer ${safeStorage.getItem('token')}`
              }
            })
            if (savedGapResponse.ok) {
              const savedGapData = await savedGapResponse.json()
              if (savedGapData.gaps && savedGapData.gaps.length > 0) {
                setGapSuggestions(savedGapData.gaps)
                console.log(`Loaded ${savedGapData.gaps.length} saved gap suggestions for initial trip`)
              } else {
                // No saved gaps, analyze and save
                const gapResponse = await fetch(`/api/trips/${firstTrip.id}/analyze-gaps`, {
                  headers: {
                    'Authorization': `Bearer ${safeStorage.getItem('token')}`
                  }
                })
                if (gapResponse.ok) {
                  const gapData = await gapResponse.json()
                  setGapSuggestions(gapData.gaps || [])
                  console.log(`Analyzed and saved ${gapData.gaps?.length || 0} gap suggestions for initial trip`)
                }
              }
            }
          } catch (error) {
            console.error('Failed to load gap suggestions for initial trip:', error)
            setGapSuggestions([])
          }
        }
      }
    } catch (error) {
      console.error('Failed to load trips:', error)
    }
  }

  const searchPOIs = async () => {
    if (!mapBounds) {
      console.log('Map bounds not available yet')
      return
    }

    setLoading(true)
    try {
      const categories = Array.from(selectedCategories).join(',')

      console.log('Searching POIs via bounding box search...')
      console.log('Selected categories:', Array.from(selectedCategories))

      const south = mapBounds.getSouth()
      const west = normalizeLongitude(mapBounds.getWest())
      const north = mapBounds.getNorth()
      const east = normalizeLongitude(mapBounds.getEast())

      console.log('Map bounds (normalized):', { south, west, north, east })

      // Use bounding box search - returns ALL POIs in visible area
      const params = new URLSearchParams({
        south: south.toString(),
        west: west.toString(),
        north: north.toString(),
        east: east.toString(),
        categories: categories,
        limit: '5000' // Max POIs to prevent browser overload
      })

      const response = await fetch(`/api/pois/bbox-search?${params}`, {
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error(`Backend POI API error: ${response.status} ${response.statusText}`)
      }

      const poisData: any[] = await response.json()
      console.log('Backend POI response:', poisData.length, 'POIs')

      // Convert backend format to frontend format
      const convertedPois: POI[] = poisData.map((poi: any) => ({
        id: poi.id,
        lat: poi.latitude,
        lon: poi.longitude,
        name: poi.name || 'Unnamed',
        type: poi.category,
        tags: {
          phone: poi.phone,
          website: poi.website,
          name: poi.name
        },
      }))

      console.log('Processed POIs:', convertedPois.length)
      setPois(convertedPois)
    } catch (error) {
      console.error('Failed to search POIs:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchHeights = async () => {
    if (!mapBounds) return

    try {
      let response

      // Use route-based API when in route mode and we have route coordinates
      if (heightFilterMode === 'route' && routeCoords.length > 0) {
        // Sample route coordinates to avoid URL length issues (max ~50 points)
        const maxPoints = 50
        const sampledCoords = routeCoords.length <= maxPoints
          ? routeCoords
          : routeCoords.filter((_: any, i: number) =>
              i === 0 || i === routeCoords.length - 1 || i % Math.ceil(routeCoords.length / maxPoints) === 0
            )

        const params = new URLSearchParams({
          route_coords: JSON.stringify(sampledCoords),
          buffer_miles: heightRadiusMiles.toString(),
          limit: '5000'
        })

        response = await fetch(`/api/overpass-heights/along-route?${params}`, {
          headers: {
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setHeights(data.overpasses || [])
          console.log(`Loaded ${data.count} height restrictions along route (sampled ${data.route_points_sampled} points)`)
        }
      } else {
        // Use bbox search for viewport or all modes
        const south = mapBounds.getSouth()
        const west = normalizeLongitude(mapBounds.getWest())
        const north = mapBounds.getNorth()
        const east = normalizeLongitude(mapBounds.getEast())

        const params = new URLSearchParams({
          south: south.toString(),
          west: west.toString(),
          north: north.toString(),
          east: east.toString(),
          limit: '25000'
        })

        response = await fetch(`/api/overpass-heights/bbox-search?${params}`, {
          headers: {
            'Authorization': `Bearer ${safeStorage.getItem('token')}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setHeights(data.overpasses || [])
          console.log(`Loaded ${data.count} height restrictions`)
        }
      }
    } catch (error) {
      console.error('Failed to search heights:', error)
    }
  }

  // Search for railroad crossings in current viewport
  const searchRailroadCrossings = async () => {
    if (!mapBounds) return

    try {
      const south = mapBounds.getSouth()
      const west = normalizeLongitude(mapBounds.getWest())
      const north = mapBounds.getNorth()
      const east = normalizeLongitude(mapBounds.getEast())

      const params = new URLSearchParams({
        south: south.toString(),
        west: west.toString(),
        north: north.toString(),
        east: east.toString(),
        limit: '10000'
      })

      const response = await fetch(`/api/railroad-crossings/bbox-search?${params}`, {
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setRailroadCrossings(data.crossings || [])
        console.log(`Loaded ${data.count} railroad crossings`)
      }
    } catch (error) {
      console.error('Failed to search railroad crossings:', error)
    }
  }

  // Search for railroad crossings along the route (more efficient than viewport search)
  const searchRailroadCrossingsAlongRoute = async () => {
    if (routeCoords.length === 0) return

    try {
      // Sample route coordinates to reduce payload (every 10th point)
      const sampledCoords = routeCoords.filter((_, i) => i % 10 === 0)

      // Determine radius based on filter mode
      const radius = railroadFilterMode === 'onRoute' ? 0.1 : railroadRadiusMiles

      const response = await fetch('/api/railroad-crossings/route-search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route_coords: sampledCoords,
          radius_miles: radius,
          limit: 1000
        })
      })

      if (response.ok) {
        const data = await response.json()
        setRailroadCrossings(data.crossings || [])
        console.log(`Loaded ${data.count} railroad crossings along route`)
      }
    } catch (error) {
      console.error('Failed to search railroad crossings along route:', error)
    }
  }

  const determineType = (tags: any): string => {
    if (tags.amenity === 'sanitary_dump_station') return 'dump_stations'
    if (tags.highway === 'rest_area') return 'rest_areas'
    if (tags.tourism === 'camp_site' || tags.tourism === 'caravan_site') return 'campgrounds'
    if (tags.leisure === 'nature_reserve' && tags.protect_class === '2') return 'national_parks'
    if (tags.leisure === 'park' && tags.operator?.includes('State')) return 'state_parks'
    if (tags.hgv === 'yes' || tags.name?.match(/Pilot|Flying J|TA|Petro|Love/i)) return 'truck_stops'
    if (tags.amenity === 'fuel') return 'gas_stations'
    return 'gas_stations'
  }

  const handleTripChange = async (tripId: number) => {
    const trip = trips.find(t => t.id === tripId)
    setSelectedTrip(trip)
    setRouteCoords([]) // Clear previous route

    if (trip?.stops?.length > 0) {
      setCenter([trip.stops[0].latitude, trip.stops[0].longitude])
      setShouldUpdateMap(true) // Trigger map to center on new trip

      // Fetch the actual road route
      if (trip.stops.length >= 2) {
        setRouteLoading(true)
        try {
          const response = await fetch(`/api/trips/${tripId}/route`, {
            headers: {
              'Authorization': `Bearer ${safeStorage.getItem('token')}`
            }
          })
          if (response.ok) {
            const data = await response.json()
            if (data.route && data.route.length > 0) {
              setRouteCoords(data.route)
              console.log(`Loaded route with ${data.route.length} points, fallback: ${data.is_fallback}`)
            }
          }
        } catch (error) {
          console.error('Failed to load route:', error)
          // Fall back to straight lines
          setRouteCoords(trip.stops.map((s: any) => [s.latitude, s.longitude]))
        } finally {
          setRouteLoading(false)
        }

        // Load gap suggestions for this trip (try saved first, then analyze)
        try {
          // First try to load saved gap suggestions (instant)
          const savedGapResponse = await fetch(`/api/trips/${tripId}/gap-suggestions`, {
            headers: {
              'Authorization': `Bearer ${safeStorage.getItem('token')}`
            }
          })
          if (savedGapResponse.ok) {
            const savedGapData = await savedGapResponse.json()
            if (savedGapData.gaps && savedGapData.gaps.length > 0) {
              setGapSuggestions(savedGapData.gaps)
              console.log(`Loaded ${savedGapData.gaps.length} saved gap suggestions`)
            } else {
              // No saved gaps, analyze and save
              const gapResponse = await fetch(`/api/trips/${tripId}/analyze-gaps`, {
                headers: {
                  'Authorization': `Bearer ${safeStorage.getItem('token')}`
                }
              })
              if (gapResponse.ok) {
                const gapData = await gapResponse.json()
                setGapSuggestions(gapData.gaps || [])
                console.log(`Analyzed and saved ${gapData.gaps?.length || 0} gap suggestions`)
              }
            }
          }
        } catch (error) {
          console.error('Failed to load gap suggestions:', error)
          setGapSuggestions([])
        }

        // Auto-load weather forecasts for the trip
        try {
          const forecastResponse = await weatherApi.getTripForecasts(tripId)
          setTripForecasts(forecastResponse.data.stop_forecasts || [])
        } catch (error) {
          console.error('Failed to load forecasts:', error)
          setTripForecasts([])
        }
      }
    } else {
      setGapSuggestions([])
      setTripForecasts([])
    }
    // Clear any stop range isochrone when changing trips
    setStopRangeLayers(null)
    setStopRangeCenter(null)
  }

  // Fetch layered isochrones showing driveable range from a stop
  const fetchStopRange = async (lat: number, lon: number, name: string) => {
    setStopRangeLoading(true)
    setStopRangeCenter({ lat, lon, name })
    try {
      const response = await fetch(`/api/trips/isochrone?lat=${lat}&lon=${lon}&max_drive_time=45`, {
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setStopRangeLayers(data.layers || null)
        console.log(`Loaded layered isochrones`)
      }
    } catch (error) {
      console.error('Failed to fetch stop range:', error)
      setStopRangeLayers(null)
    } finally {
      setStopRangeLoading(false)
    }
  }

  // Clear the stop range display
  const clearStopRange = () => {
    setStopRangeLayers(null)
    setStopRangeCenter(null)
  }

  const toggleCategory = (category: string) => {
    const newCategories = new Set(selectedCategories)
    if (newCategories.has(category)) {
      newCategories.delete(category)
    } else {
      newCategories.add(category)
    }
    setSelectedCategories(newCategories)
    // Categories are automatically saved via useEffect hook
  }

  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/pois/cache-stats', {
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const stats = await response.json()
        setCacheStats(stats)
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error)
    }
  }

  const handleRefreshRegion = async () => {
    if (!center) return
    setRefreshing(true)
    try {
      const params = new URLSearchParams({
        latitude: center[0].toString(),
        longitude: center[1].toString(),
        radius_miles: '50'
      })

      const response = await fetch(`/api/pois/refresh-region?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${safeStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log(`Refreshed ${result.count} POIs`)
        // Reload cache stats and POIs
        await loadCacheStats()
        await searchPOIs()
      }
    } catch (error) {
      console.error('Failed to refresh POIs:', error)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div>
      <h1>Map View</h1>

      {/* Map at the top */}
      <div className="card mb-4" style={{ height: 'calc(100vh - 200px)', minHeight: '600px', padding: '0', overflow: 'hidden', position: 'relative' }}>
        {!center ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading map...
          </div>
        ) : (
        <MapContainer
          center={center}
          zoom={10}
          maxZoom={22}
          style={{ height: '100%', width: '100%' }}
        >
          <MapUpdater center={center} shouldUpdate={shouldUpdateMap} onUpdated={() => setShouldUpdateMap(false)} />
          <MapEventHandler onBoundsChange={setMapBounds} onCenterChange={setCenter} />
          <UserLocationMarker />
          <MapContextMenu />

          {/* Map Tile Layer - controlled by dropdown */}
          {TILE_LAYERS[selectedTileLayer] && (
            <TileLayer
              key={selectedTileLayer}
              attribution={TILE_LAYERS[selectedTileLayer].attribution}
              url={TILE_LAYERS[selectedTileLayer].url}
              maxZoom={22}
              maxNativeZoom={TILE_LAYERS[selectedTileLayer].maxNativeZoom}
            />
          )}

          {/* Weather Radar Overlay - Using Iowa State University RIDGE tiles */}
          {showWeatherRadar && (
            <TileLayer
              key={`weather-radar-${radarProduct}-${Date.now()}`}
              url={`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-${radarProduct}-900913/{z}/{x}/{y}.png`}
              attribution="NOAA/NWS via Iowa State University"
              opacity={weatherOverlayOpacity}
              zIndex={100}
            />
          )}

          {/* Radar Legend Overlay */}
          {showWeatherRadar && showRadarLegend && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '20px',
              background: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '8px',
              padding: '12px',
              zIndex: 1000,
              minWidth: '200px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: 'white',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
                paddingBottom: '6px'
              }}>
                {radarProduct === 'n0q' && 'Reflectivity (dBZ)'}
                {radarProduct === 'n0u' && 'Velocity (knots)'}
                {radarProduct === 'net' && 'Echo Tops (ft)'}
                {radarProduct === 'n0s' && 'Storm Motion (knots)'}
                {radarProduct === 'n0r' && 'Reflectivity (dBZ)'}
              </div>

              {radarProduct === 'n0q' || radarProduct === 'n0r' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {[
                    { color: '#04e9e7', label: '75+', desc: 'Extreme' },
                    { color: '#00c4ff', label: '70-74', desc: 'Intense' },
                    { color: '#00a0ff', label: '65-69', desc: 'Very Heavy' },
                    { color: '#0080ff', label: '60-64', desc: 'Heavy' },
                    { color: '#00ff00', label: '55-59', desc: 'Heavy' },
                    { color: '#00d000', label: '50-54', desc: 'Moderate' },
                    { color: '#00aa00', label: '45-49', desc: 'Moderate' },
                    { color: '#ffff00', label: '40-44', desc: 'Light' },
                    { color: '#e7c000', label: '35-39', desc: 'Light' },
                    { color: '#ff0000', label: '30-34', desc: 'Light' },
                    { color: '#d00000', label: '25-29', desc: 'Very Light' },
                    { color: '#c00000', label: '20-24', desc: 'Very Light' },
                    { color: '#a00000', label: '15-19', desc: 'Very Light' }
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
                      <div style={{
                        width: '30px',
                        height: '14px',
                        background: item.color,
                        borderRadius: '3px',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }} />
                      <span style={{ color: 'white', fontFamily: 'monospace', width: '45px' }}>{item.label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{item.desc}</span>
                    </div>
                  ))}
                </div>
              ) : radarProduct === 'n0u' ? (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.9)', lineHeight: '1.4' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: '#00ff00', fontWeight: 'bold' }}>Green:</span> Away from radar
                  </div>
                  <div>
                    <span style={{ color: '#ff0000', fontWeight: 'bold' }}>Red:</span> Toward radar
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>
                    Brighter colors = stronger winds
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
                  Color scale varies by product
                </div>
              )}

              <div style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.2)',
                fontSize: '9px',
                color: 'rgba(255,255,255,0.5)',
                textAlign: 'center'
              }}>
                NOAA/NWS NEXRAD
              </div>
            </div>
          )}

          {/* Map Controls - Top Right */}
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1000,
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start'
          }}>
            {/* Weather Radar Button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  if (showWeatherRadar) {
                    setShowWeatherControls(!showWeatherControls)
                  } else {
                    setShowWeatherRadar(true)
                    setShowWeatherControls(true)
                  }
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: showWeatherRadar ? '#3B82F6' : 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: showWeatherRadar ? 'white' : 'var(--text-primary)',
                  transition: 'all 0.2s'
                }}
                title={showWeatherRadar ? 'Weather Radar Settings' : 'Show Weather Radar'}
              >
                🌧️
              </button>

              {/* Weather Radar Controls Popup */}
              {showWeatherControls && (
                <div style={{
                  position: 'absolute',
                  top: '48px',
                  right: '0',
                  background: 'var(--card-bg)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-color)',
                  padding: '12px',
                  width: '220px',
                  maxHeight: 'calc(100vh - 100px)',
                  overflowY: 'auto',
                  zIndex: 1001
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'var(--text-secondary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>NEXRAD Radar</span>
                    <button
                      onClick={() => {
                        setShowWeatherRadar(false)
                        setShowWeatherControls(false)
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#DC2626',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    >
                      OFF
                    </button>
                  </div>

                  {/* Opacity Slider */}
                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginBottom: '4px'
                    }}>
                      <span>Opacity</span>
                      <span>{Math.round(weatherOverlayOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={weatherOverlayOpacity}
                      onChange={(e) => setWeatherOverlayOpacity(parseFloat(e.target.value))}
                      style={{
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* Radar Product Selection */}
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      fontWeight: 'bold'
                    }}>
                      Radar Type
                    </div>
                    <select
                      value={radarProduct}
                      onChange={(e) => setRadarProduct(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="n0q">Base Reflectivity</option>
                      <option value="n0u">Base Velocity</option>
                      <option value="net">Echo Tops</option>
                      <option value="n0s">Storm Relative Motion</option>
                      <option value="n0r">Legacy Reflectivity</option>
                    </select>
                  </div>

                  {/* Radar Controls */}
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <button
                      onClick={() => {
                        // Refresh radar by regenerating frames
                        const frames: string[] = []
                        const now = new Date()
                        for (let i = 23; i >= 0; i--) {
                          const time = new Date(now.getTime() - i * 5 * 60 * 1000)
                          time.setMinutes(Math.floor(time.getMinutes() / 5) * 5, 0, 0)
                          const year = time.getUTCFullYear()
                          const month = String(time.getUTCMonth() + 1).padStart(2, '0')
                          const day = String(time.getUTCDate()).padStart(2, '0')
                          const hour = String(time.getUTCHours()).padStart(2, '0')
                          const minute = String(time.getUTCMinutes()).padStart(2, '0')
                          frames.push(`${year}${month}${day}T${hour}${minute}`)
                        }
                        setRadarFrameIndex(frames.length - 1)
                        window.location.reload() // Force refresh tiles
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      🔄 Refresh Radar
                    </button>

                    <button
                      onClick={() => setShowRadarLegend(!showRadarLegend)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: showRadarLegend ? '#3B82F6' : 'var(--bg-secondary)',
                        color: showRadarLegend ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      📊 {showRadarLegend ? 'Hide' : 'Show'} Legend
                    </button>
                  </div>

                  {/* Animation Controls */}
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      fontWeight: 'bold'
                    }}>
                      Animation
                    </div>

                    {/* Play/Pause Button */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '8px'
                    }}>
                      <button
                        onClick={() => setIsRadarAnimating(!isRadarAnimating)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isRadarAnimating ? '#EF4444' : '#10B981',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        {isRadarAnimating ? '⏸' : '▶'} {isRadarAnimating ? 'Pause' : 'Play'}
                      </button>
                      <button
                        onClick={() => {
                          setRadarFrameIndex(radarFrames.length - 1)
                          setIsRadarAnimating(false)
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                        title="Jump to latest"
                      >
                        ⏭
                      </button>
                      <button
                        onClick={() => {
                          refreshRadarFrames()
                          setIsRadarAnimating(false)
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                        title="Refresh radar data"
                      >
                        🔄
                      </button>
                    </div>

                    {/* Speed Control */}
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '9px',
                        color: 'var(--text-muted)',
                        marginBottom: '4px'
                      }}>
                        <span>Speed</span>
                        <span>{radarAnimationSpeed === 200 ? 'Fast' : radarAnimationSpeed === 500 ? 'Normal' : 'Slow'}</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '4px'
                      }}>
                        {[1000, 500, 200].map(speed => (
                          <button
                            key={speed}
                            onClick={() => setRadarAnimationSpeed(speed)}
                            style={{
                              flex: 1,
                              padding: '4px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: radarAnimationSpeed === speed ? '#3B82F6' : 'var(--bg-secondary)',
                              color: radarAnimationSpeed === speed ? 'white' : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '9px'
                            }}
                          >
                            {speed === 200 ? '2x' : speed === 500 ? '1x' : '0.5x'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time Info */}
                    <div style={{
                      fontSize: '9px',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginTop: '8px',
                      fontFamily: 'monospace'
                    }}>
                      Live Radar
                      <br />
                      Current conditions
                    </div>
                  </div>

                  {/* Update Info */}
                  <div style={{
                    fontSize: '9px',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    Past 2 hours (5-min intervals)
                  </div>
                </div>
              )}
            </div>

            {/* Gear Icon Button */}
            <button
              onClick={() => setShowMapSettings(!showMapSettings)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: showMapSettings ? 'var(--accent-primary)' : 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: showMapSettings ? 'white' : 'var(--text-primary)',
                transition: 'all 0.2s'
              }}
              title="Map Settings"
            >
              ⚙️
            </button>

            {/* Settings Panel */}
            {showMapSettings && (
              <div style={{
                position: 'fixed',
                top: '70px',
                right: '20px',
                background: 'var(--card-bg)',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                border: '1px solid var(--border-color)',
                padding: '15px',
                width: '300px',
                maxHeight: 'calc(100vh - 90px)',
                overflowY: 'auto',
                zIndex: 1001
              }}>
                {/* Map Style Section */}
                <div style={{ marginBottom: '15px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    🗺️ Map Style
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '6px'
                  }}>
                    {Object.entries(TILE_LAYERS).slice(0, 12).map(([key, layer]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedTileLayer(key)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '6px',
                          border: selectedTileLayer === key ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                          background: selectedTileLayer === key ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                          cursor: 'pointer',
                          fontSize: '10px',
                          color: 'var(--text-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                        title={layer.name}
                      >
                        <span style={{ fontSize: '14px' }}>{layer.name.split(' ')[0]}</span>
                        <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>
                          {layer.name.replace(/^[^\s]+\s/, '').substring(0, 10)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {Object.keys(TILE_LAYERS).length > 12 && (
                    <select
                      value={selectedTileLayer}
                      onChange={(e) => setSelectedTileLayer(e.target.value)}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '11px'
                      }}
                    >
                      {Object.entries(TILE_LAYERS).map(([key, layer]) => (
                        <option key={key} value={key}>{layer.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Divider */}
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '10px 0' }} />

                {/* Heights Section */}
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ Height Restrictions
                    </span>
                    <button
                      onClick={() => setShowHeights(!showHeights)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: 'none',
                        background: showHeights ? '#DC2626' : 'var(--bg-tertiary)',
                        color: showHeights ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    >
                      {showHeights ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {showHeights && (
                    <>
                      {/* RV Height Input */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Your RV Height:
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            value={userRvHeight}
                            onChange={(e) => {
                              const newHeight = parseFloat(e.target.value) || 12.5
                              setUserRvHeight(newHeight)
                              preferencesApi.save('user_rv_height', newHeight).catch(err =>
                                console.error('Failed to save RV height:', err)
                              )
                            }}
                            step="0.1"
                            min="6"
                            max="15"
                            style={{
                              width: '60px',
                              padding: '4px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--input-bg)',
                              color: 'var(--text-primary)',
                              fontSize: '12px'
                            }}
                          />
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>ft</span>
                          <span style={{ marginLeft: '8px', fontSize: '9px', color: 'var(--text-muted)' }}>
                            (Red = within 5")
                          </span>
                        </div>
                      </div>

                      {/* Filter Mode */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Show heights:
                        </label>
                        <select
                          value={heightFilterMode}
                          onChange={(e) => setHeightFilterMode(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '11px'
                          }}
                        >
                          <option value="route">On Route Only</option>
                          <option value="viewport">In current view</option>
                          <option value="all">All heights</option>
                        </select>
                      </div>

                      {/* Radius slider - hidden for route mode (On Route Only uses minimal radius) */}
                      {false && heightFilterMode === 'route' && (
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            Distance from route:
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="range"
                              min="0.5"
                              max="10"
                              step="0.5"
                              value={heightRadiusMiles}
                              onChange={(e) => setHeightRadiusMiles(parseFloat(e.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', fontSize: '11px', color: 'var(--text-primary)' }}>{heightRadiusMiles}mi</span>
                          </div>
                        </div>
                      )}

                      {/* Height Thresholds */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Height thresholds:
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <input
                              type="number"
                              placeholder="Min"
                              value={heightMinFilter || ''}
                              onChange={(e) => setHeightMinFilter(e.target.value ? parseFloat(e.target.value) : null)}
                              style={{
                                width: '100%',
                                padding: '4px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                fontSize: '10px'
                              }}
                            />
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>to</span>
                          <div style={{ flex: 1 }}>
                            <input
                              type="number"
                              placeholder="Max"
                              value={heightMaxFilter || ''}
                              onChange={(e) => setHeightMaxFilter(e.target.value ? parseFloat(e.target.value) : null)}
                              style={{
                                width: '100%',
                                padding: '4px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                fontSize: '10px'
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Show dangerous/safe toggles */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          marginBottom: '4px',
                          fontSize: '11px'
                        }}>
                          <input
                            type="checkbox"
                            checked={heightShowDangerous}
                            onChange={(e) => setHeightShowDangerous(e.target.checked)}
                          />
                          <span style={{ color: '#ef4444' }}>Dangerous (below RV)</span>
                        </label>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}>
                          <input
                            type="checkbox"
                            checked={heightShowSafe}
                            onChange={(e) => setHeightShowSafe(e.target.checked)}
                          />
                          <span style={{ color: '#10b981' }}>Safe (above RV)</span>
                        </label>
                      </div>

                      {/* Max results */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Max results:
                        </label>
                        <select
                          value={heightMaxResults || 'all'}
                          onChange={(e) => setHeightMaxResults(e.target.value === 'all' ? null : parseInt(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '11px'
                          }}
                        >
                          <option value="100">100</option>
                          <option value="500">500</option>
                          <option value="1000">1,000</option>
                          <option value="5000">5,000</option>
                          <option value="all">All</option>
                        </select>
                      </div>

                      {/* Height count display */}
                      <div style={{
                        marginTop: '10px',
                        padding: '8px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        textAlign: 'center'
                      }}>
                        Showing {filteredHeights.length} of {heights.length} restrictions
                      </div>
                    </>
                  )}

                  {/* Railroad Crossings Toggle */}
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🚂 Railroad Crossings
                    </span>
                    <button
                      onClick={() => setShowRailroadCrossings(!showRailroadCrossings)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: 'none',
                        background: showRailroadCrossings ? '#7C3AED' : 'var(--bg-tertiary)',
                        color: showRailroadCrossings ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    >
                      {showRailroadCrossings ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {showRailroadCrossings && (
                    <div style={{ marginTop: '8px' }}>
                      {/* Filter Mode */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Show crossings:
                        </label>
                        <select
                          value={railroadFilterMode}
                          onChange={(e) => setRailroadFilterMode(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '11px'
                          }}
                        >
                          <option value="onRoute">Only crossings we drive over</option>
                          <option value="nearby">Nearby route ({railroadRadiusMiles}mi)</option>
                          <option value="viewport">In current view</option>
                          <option value="all">All crossings</option>
                        </select>
                      </div>

                      {/* Radius for nearby mode */}
                      {railroadFilterMode === 'nearby' && (
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            Distance from route:
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="range"
                              min="0.5"
                              max="5"
                              step="0.5"
                              value={railroadRadiusMiles}
                              onChange={(e) => setRailroadRadiusMiles(parseFloat(e.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', fontSize: '11px', color: 'var(--text-primary)' }}>{railroadRadiusMiles}mi</span>
                          </div>
                        </div>
                      )}

                      {/* Count display */}
                      <div style={{
                        padding: '8px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        textAlign: 'center'
                      }}>
                        Showing {filteredRailroadCrossings.length} crossings
                        {filteredRailroadCrossings.filter(c => c.onRoute).length > 0 && (
                          <div style={{ marginTop: '4px', color: '#06B6D4', fontWeight: 'bold' }}>
                            {filteredRailroadCrossings.filter(c => c.onRoute).length} on your route
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Distance Circles Toggle */}
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                        ⏱️ Drive-Time Zones
                      </span>
                      <button
                        onClick={() => {
                          setShowIsochrones(!showIsochrones)
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          border: 'none',
                          background: showIsochrones ? '#10B981' : 'var(--bg-tertiary)',
                          color: showIsochrones ? 'white' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}
                      >
                        {showIsochrones ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    {showIsochrones && (
                      <>
                        {isochronesLoading && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
                            ⏳ Loading drive-time zones...
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                          Shows areas reachable within driving time from each stop
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* 15-minute layer toggle */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            background: isochroneLayer15 ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                            borderRadius: '6px',
                            border: isochroneLayer15 ? '1px solid #10B981' : '1px solid var(--border-color)'
                          }}>
                            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: '#10B981', fontSize: '14px' }}>●</span>
                              15 minutes
                            </span>
                            <button
                              onClick={() => setIsochroneLayer15(!isochroneLayer15)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isochroneLayer15 ? '#10B981' : 'var(--bg-secondary)',
                                color: isochroneLayer15 ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '9px',
                                fontWeight: 'bold'
                              }}
                            >
                              {isochroneLayer15 ? 'ON' : 'OFF'}
                            </button>
                          </div>

                          {/* 30-minute layer toggle */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            background: isochroneLayer30 ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                            borderRadius: '6px',
                            border: isochroneLayer30 ? '1px solid #3B82F6' : '1px solid var(--border-color)'
                          }}>
                            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: '#3B82F6', fontSize: '14px' }}>●</span>
                              30 minutes
                            </span>
                            <button
                              onClick={() => setIsochroneLayer30(!isochroneLayer30)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isochroneLayer30 ? '#3B82F6' : 'var(--bg-secondary)',
                                color: isochroneLayer30 ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '9px',
                                fontWeight: 'bold'
                              }}
                            >
                              {isochroneLayer30 ? 'ON' : 'OFF'}
                            </button>
                          </div>

                          {/* 45-minute layer toggle */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            background: isochroneLayer45 ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)',
                            borderRadius: '6px',
                            border: isochroneLayer45 ? '1px solid #F59E0B' : '1px solid var(--border-color)'
                          }}>
                            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: '#F59E0B', fontSize: '14px' }}>●</span>
                              45 minutes
                            </span>
                            <button
                              onClick={() => setIsochroneLayer45(!isochroneLayer45)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isochroneLayer45 ? '#F59E0B' : 'var(--bg-secondary)',
                                color: isochroneLayer45 ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '9px',
                                fontWeight: 'bold'
                              }}
                            >
                              {isochroneLayer45 ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Weather Radar Toggle */}
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🌧️ Weather Radar
                    </span>
                    <button
                      onClick={() => setShowWeatherRadar(!showWeatherRadar)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: 'none',
                        background: showWeatherRadar ? '#3B82F6' : 'var(--bg-tertiary)',
                        color: showWeatherRadar ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    >
                      {showWeatherRadar ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {showWeatherRadar && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px'
                      }}>
                        <span style={{ color: 'var(--text-muted)' }}>Opacity:</span>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.1"
                          value={weatherOverlayOpacity}
                          onChange={(e) => setWeatherOverlayOpacity(parseFloat(e.target.value))}
                          style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: '35px', textAlign: 'right' }}>{Math.round(weatherOverlayOpacity * 100)}%</span>
                      </div>
                      <div style={{
                        fontSize: '9px',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        marginTop: '4px'
                      }}>
                        NEXRAD Radar (updates ~5 min)
                      </div>
                    </div>
                  )}

                  {/* Weather Forecast Button */}
                  {selectedTrip && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={async () => {
                          setShowWeatherPanel(!showWeatherPanel)
                          if (!showWeatherPanel && tripForecasts.length === 0) {
                            setForecastLoading(true)
                            try {
                              const response = await weatherApi.getTripForecasts(selectedTrip.id)
                              setTripForecasts(response.data.stop_forecasts || [])
                            } catch (error) {
                              console.error('Failed to load forecasts:', error)
                            } finally {
                              setForecastLoading(false)
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: 'none',
                          background: showWeatherPanel ? '#F59E0B' : 'var(--bg-tertiary)',
                          color: showWeatherPanel ? 'white' : 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        🌤️ Trip Weather Forecast
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RV Height Display - Bottom Left */}
          <div
            onClick={() => navigate('/rv-profiles')}
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '10px',
              zIndex: 1000,
              background: 'var(--card-bg)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color)',
              padding: '10px 14px',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              minWidth: '120px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
            }}
            title="Click to manage RV profiles"
          >
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              {selectedRvProfile ? selectedRvProfile.name : 'RV Height'}
            </div>
            <div style={{
              fontSize: '22px',
              fontWeight: 'bold',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'baseline',
              gap: '4px'
            }}>
              <span>{userRvHeight.toFixed(1)}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ft</span>
            </div>
            {selectedRvProfile && (
              <>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {selectedRvProfile.year} {selectedRvProfile.make}
                </div>
                {selectedRvProfile.weight_gross && (
                  <div style={{ fontSize: '10px', color: 'var(--text-primary)', marginTop: '4px', fontWeight: '500' }}>
                    {selectedRvProfile.has_tow_vehicle && selectedRvProfile.tow_vehicle_weight
                      ? `${((selectedRvProfile.weight_gross + selectedRvProfile.tow_vehicle_weight) / 1000).toFixed(1)}K lbs (combined)`
                      : `${(selectedRvProfile.weight_gross / 1000).toFixed(1)}K lbs`
                    }
                  </div>
                )}
              </>
            )}
          </div>

          {/* Weather Forecast Panel */}
          {showWeatherPanel && (
            <div style={{
              position: 'absolute',
              bottom: '80px',
              left: '10px',
              zIndex: 1000,
              background: 'var(--card-bg)',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
              padding: '12px',
              maxWidth: '350px',
              maxHeight: '400px',
              overflowY: 'auto'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <h4 style={{ margin: 0, fontSize: '14px' }}>🌤️ Trip Weather</h4>
                <button
                  onClick={() => setShowWeatherPanel(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: 'var(--text-muted)'
                  }}
                >
                  ×
                </button>
              </div>

              {forecastLoading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  Loading forecasts...
                </div>
              ) : tripForecasts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  No forecast data available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tripForecasts.map((stopForecast: any, index: number) => (
                    <div
                      key={stopForecast.stop_id}
                      style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        padding: '8px'
                      }}
                    >
                      <div style={{
                        fontWeight: 'bold',
                        fontSize: '12px',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span style={{
                          background: index === 0 ? '#22c55e' : index === tripForecasts.length - 1 ? '#ef4444' : '#3B82F6',
                          color: 'white',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px'
                        }}>
                          {index + 1}
                        </span>
                        {stopForecast.stop_name}
                      </div>

                      {stopForecast.forecast?.periods?.[0] ? (
                        <div style={{ fontSize: '11px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            {stopForecast.forecast.periods[0].icon && (
                              <img
                                src={stopForecast.forecast.periods[0].icon}
                                alt=""
                                style={{ width: '32px', height: '32px' }}
                              />
                            )}
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                                {stopForecast.forecast.periods[0].temperature}°{stopForecast.forecast.periods[0].temperature_unit}
                              </div>
                              <div style={{ color: 'var(--text-muted)' }}>
                                {stopForecast.forecast.periods[0].short_forecast}
                              </div>
                            </div>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                            Wind: {stopForecast.forecast.periods[0].wind_speed} {stopForecast.forecast.periods[0].wind_direction}
                          </div>
                          {stopForecast.forecast.location?.city && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '9px', marginTop: '2px' }}>
                              {stopForecast.forecast.location.city}, {stopForecast.forecast.location.state}
                            </div>
                          )}
                        </div>
                      ) : stopForecast.error ? (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {stopForecast.error}
                        </div>
                      ) : (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          No forecast available
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                marginTop: '8px',
                fontSize: '9px',
                color: 'var(--text-muted)',
                textAlign: 'center'
              }}>
                Data from NOAA Weather API
              </div>
            </div>
          )}


          {/* Distance circles around stops */}
          {showDistanceCircles && selectedTrip?.stops?.map((stop: any) => (
            <Circle
              key={`distance-circle-${stop.id}`}
              center={[stop.latitude, stop.longitude]}
              radius={distanceCircleRadius * 1609.34} // Convert miles to meters
              pathOptions={{
                color: '#3B82F6',
                weight: 2,
                opacity: 0.5,
                fillColor: '#3B82F6',
                fillOpacity: 0.08,
                dashArray: '5, 5'
              }}
            />
          ))}

          {/* Trip stops */}
          {selectedTrip?.stops?.map((stop: any, index: number) => {
            // Sort stops by stop_order to get correct previous/next
            const sortedStops = [...(selectedTrip.stops || [])].sort((a: any, b: any) => a.stop_order - b.stop_order)
            const stopIndex = sortedStops.findIndex((s: any) => s.id === stop.id)
            const prevStop = stopIndex > 0 ? sortedStops[stopIndex - 1] : null
            const nextStop = stopIndex < sortedStops.length - 1 ? sortedStops[stopIndex + 1] : null
            const isFirstStop = stopIndex === 0
            const isLastStop = stopIndex === sortedStops.length - 1
            const totalStops = sortedStops.length

            // Calculate distances
            const distFromPrev = prevStop
              ? getDistanceMiles(prevStop.latitude, prevStop.longitude, stop.latitude, stop.longitude)
              : null
            const distToNext = nextStop
              ? getDistanceMiles(stop.latitude, stop.longitude, nextStop.latitude, nextStop.longitude)
              : null

            // Use trip's RV profile MPG or default to 8 MPG for RVs
            const avgMpg = selectedTrip?.rv_profile?.avg_mpg || 8

            // Calculate estimated fuel (gallons)
            const fuelFromPrev = distFromPrev ? distFromPrev / avgMpg : null
            const fuelToNext = distToNext ? distToNext / avgMpg : null

            // Calculate estimated arrival date
            // Use stored arrival_time if available, otherwise estimate from trip start_date and stop index
            let estimatedArrivalDate: string | null = stop.arrival_time
            if (!estimatedArrivalDate && selectedTrip.start_date) {
              // Estimate: each stop after the first is roughly 1 day later
              // This is a simple estimate - actual would use driving distance/time
              const startDate = new Date(selectedTrip.start_date)
              startDate.setDate(startDate.getDate() + stopIndex)
              estimatedArrivalDate = startDate.toISOString()
            }

            // Get weather forecast for this stop
            const stopForecast = tripForecasts.find((f: any) => f.stop_id === stop.id)
            const weatherIcon = stopForecast?.forecast?.periods?.[0]?.icon || undefined

            // Determine which icon to use
            let icon
            if (isFirstStop) {
              icon = createStartIcon(estimatedArrivalDate || undefined, weatherIcon)
            } else if (isLastStop) {
              icon = createFinishIcon(estimatedArrivalDate || undefined, weatherIcon)
            } else {
              // For intermediate stops, number them 1, 2, 3... (excluding start/finish)
              icon = createStopIcon(stopIndex, estimatedArrivalDate, stop.needs_user_selection, stop.is_overnight, weatherIcon)
            }

            return (
              <Marker
                key={`stop-${stop.id}`}
                position={[stop.latitude, stop.longitude]}
                icon={icon}
              >
                <Popup>
                  <div style={{ minWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{
                        background: isFirstStop ? '#10B981' : isLastStop ? '#EF4444' : '#3B82F6',
                        color: 'white',
                        borderRadius: isFirstStop || isLastStop ? '6px' : '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isFirstStop || isLastStop ? '14px' : '12px',
                        fontWeight: 'bold'
                      }}>
                        {isFirstStop ? '🚩' : isLastStop ? '🏁' : stopIndex}
                      </span>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '14px' }}>
                          {isFirstStop ? 'Start' : isLastStop ? 'Finish' : `Stop ${stopIndex}`}
                        </h3>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6B7280' }}>
                          {stop.name || 'Trip Stop'}
                        </p>
                      </div>
                    </div>

                    {/* Address or coordinates */}
                    {stop.address ? (
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#374151' }}>
                        {stop.address}
                      </p>
                    ) : null}
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7280' }}>
                      {[stop.city, stop.state, stop.zip_code].filter(Boolean).join(', ') ||
                       `${stop.latitude?.toFixed(5)}, ${stop.longitude?.toFixed(5)}`}
                    </p>

                    {/* Distance & Fuel Calculations */}
                    {(distFromPrev || distToNext) && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '600', color: '#374151' }}>
                          Trip Leg Info
                        </p>
                        {distFromPrev !== null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                            <span style={{ color: '#6B7280' }}>From prev:</span>
                            <span style={{ color: '#374151' }}>
                              {distFromPrev.toFixed(1)} mi / ~{fuelFromPrev?.toFixed(1)} gal
                            </span>
                          </div>
                        )}
                        {distToNext !== null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                            <span style={{ color: '#6B7280' }}>To next:</span>
                            <span style={{ color: '#374151' }}>
                              {distToNext.toFixed(1)} mi / ~{fuelToNext?.toFixed(1)} gal
                            </span>
                          </div>
                        )}
                        {(distFromPrev || distToNext) && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#9CA3AF', fontStyle: 'italic' }}>
                            Est. @ {avgMpg} MPG
                          </p>
                        )}
                      </div>
                    )}

                    {/* Arrival/Departure times */}
                    {(stop.arrival_time || stop.departure_time) && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB' }}>
                        {stop.arrival_time && (
                          <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: '#059669' }}>
                            Arrive: {new Date(stop.arrival_time).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}{stop.arrival_tentative ? ' (tentative)' : ''}
                          </p>
                        )}
                        {stop.departure_time && (
                          <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: '#DC2626' }}>
                            Depart: {new Date(stop.departure_time).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}{stop.departure_tentative ? ' (tentative)' : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Overnight indicator */}
                    {stop.is_overnight && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#7C3AED', fontWeight: '600' }}>
                        Overnight Stay
                      </p>
                    )}

                    {/* Weather forecast */}
                    {stopForecast?.forecast?.periods?.[0] && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '600', color: '#374151' }}>
                          Weather Forecast
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {stopForecast.forecast.periods[0].icon && (
                            <img
                              src={stopForecast.forecast.periods[0].icon}
                              alt=""
                              style={{ width: '32px', height: '32px' }}
                            />
                          )}
                          <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: '600' }}>
                              {stopForecast.forecast.periods[0].temperature}°{stopForecast.forecast.periods[0].temperature_unit}
                            </p>
                            <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#6B7280' }}>
                              {stopForecast.forecast.periods[0].short_forecast}
                            </p>
                          </div>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#9CA3AF' }}>
                          Wind: {stopForecast.forecast.periods[0].wind_speed} {stopForecast.forecast.periods[0].wind_direction}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {stop.notes && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                          {stop.notes.length > 100 ? stop.notes.substring(0, 100) + '...' : stop.notes}
                        </p>
                      </div>
                    )}

                    {/* Show Drive Range Button */}
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB' }}>
                      <button
                        onClick={() => fetchStopRange(stop.latitude, stop.longitude, stop.name || `Stop ${stopIndex}`)}
                        disabled={stopRangeLoading}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: stopRangeCenter?.lat === stop.latitude && stopRangeCenter?.lon === stop.longitude
                            ? '#10B981'
                            : '#3B82F6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: stopRangeLoading ? 'wait' : 'pointer'
                        }}
                      >
                        {stopRangeLoading && stopRangeCenter?.lat === stop.latitude
                          ? '⏳ Loading...'
                          : stopRangeCenter?.lat === stop.latitude && stopRangeCenter?.lon === stop.longitude
                            ? '✓ Range Shown'
                            : '🚗 Show 30-min Drive Range'}
                      </button>
                    </div>

                    {/* Coordinates */}
                    <p style={{ margin: '8px 0 0 0', fontSize: '10px', color: '#9CA3AF' }}>
                      {stop.latitude?.toFixed(5)}, {stop.longitude?.toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Gap suggestion markers with layered search area polygons */}
          {gapSuggestions.map((gap, index) => (
            <>
              {/* Layered drive-time isochrones (45min outer, 30min middle, 15min inner) */}
              {gap.isochrone_layers ? (
                <>
                  {/* 45 min - outer layer (lightest) */}
                  {gap.isochrone_layers['45min']?.length > 2 && (
                    <Polygon
                      key={`gap-iso-45-${index}`}
                      positions={gap.isochrone_layers['45min']}
                      pathOptions={{
                        color: '#F59E0B',
                        weight: 1,
                        opacity: 0.4,
                        fillColor: '#FEF3C7',
                        fillOpacity: 0.1
                      }}
                    />
                  )}
                  {/* 30 min - middle layer */}
                  {gap.isochrone_layers['30min']?.length > 2 && (
                    <Polygon
                      key={`gap-iso-30-${index}`}
                      positions={gap.isochrone_layers['30min']}
                      pathOptions={{
                        color: '#F59E0B',
                        weight: 1.5,
                        opacity: 0.6,
                        fillColor: '#FCD34D',
                        fillOpacity: 0.15
                      }}
                    />
                  )}
                  {/* 15 min - inner layer (darkest) */}
                  {gap.isochrone_layers['15min']?.length > 2 && (
                    <Polygon
                      key={`gap-iso-15-${index}`}
                      positions={gap.isochrone_layers['15min']}
                      pathOptions={{
                        color: '#D97706',
                        weight: 2,
                        opacity: 0.8,
                        fillColor: '#F59E0B',
                        fillOpacity: 0.25
                      }}
                    />
                  )}
                </>
              ) : gap.isochrone && gap.isochrone.length > 2 ? (
                <Polygon
                  key={`gap-isochrone-${index}`}
                  positions={gap.isochrone}
                  pathOptions={{
                    color: '#F59E0B',
                    weight: 2,
                    opacity: 0.7,
                    fillColor: '#FEF3C7',
                    fillOpacity: 0.2,
                    dashArray: '6, 4'
                  }}
                />
              ) : (
                <Circle
                  key={`gap-circle-${index}`}
                  center={[gap.suggested_latitude, gap.suggested_longitude]}
                  radius={gap.search_radius_miles * 1609.34}
                  pathOptions={{
                    color: '#F59E0B',
                    weight: 2,
                    opacity: 0.6,
                    fillColor: '#FEF3C7',
                    fillOpacity: 0.15,
                    dashArray: '8, 6'
                  }}
                />
              )}
              {/* Gap marker */}
              <Marker
                key={`gap-marker-${index}`}
                position={[gap.suggested_latitude, gap.suggested_longitude]}
                icon={createGapSuggestionIcon(gap.estimated_date)}
                zIndexOffset={2000}
              >
                <Popup>
                  <div style={{ minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>🏕️</span>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '14px', color: '#D97706' }}>
                          Overnight Stop Needed
                        </h3>
                        {gap.estimated_date && (
                          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#059669', fontWeight: '600' }}>
                            📅 {new Date(gap.estimated_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                            {gap.day_number ? ` (Day ${gap.day_number})` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      padding: '8px',
                      borderRadius: '4px',
                      marginBottom: '8px'
                    }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '600' }}>
                        {gap.from_stop} → {gap.to_stop}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#6B7280' }}>
                        <span style={{ color: '#D97706', fontWeight: '600' }}>{gap.segment_distance} miles</span>
                        {' '}exceeds your {gap.max_daily_distance}-mile daily limit
                      </p>
                    </div>

                    <div style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      padding: '8px',
                      borderRadius: '4px',
                      marginBottom: '8px'
                    }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '600', color: '#F59E0B' }}>
                        Suggested Search Area
                      </p>
                      <p style={{ margin: 0, fontSize: '11px' }}>
                        📍 {gap.suggested_area}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#6B7280' }}>
                        {gap.isochrone && gap.isochrone.length > 2
                          ? 'Search within the 30-minute drive area for campgrounds, RV parks, or Harvest Hosts'
                          : `Search within ${gap.search_radius_miles} miles for campgrounds, RV parks, or Harvest Hosts`}
                      </p>
                    </div>

                    <p style={{ margin: 0, fontSize: '10px', color: '#9CA3AF' }}>
                      {gap.suggested_latitude.toFixed(5)}, {gap.suggested_longitude.toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            </>
          ))}

          {/* Stop range isochrones - layered showing driveable area from selected stop */}
          {stopRangeLayers && stopRangeCenter && (
            <>
              {/* Outer layer (100% / ~45 min) */}
              {stopRangeLayers.outer?.isochrone?.length > 2 && (
                <Polygon
                  positions={stopRangeLayers.outer.isochrone}
                  pathOptions={{
                    color: '#3B82F6',
                    weight: 1,
                    opacity: 0.4,
                    fillColor: '#DBEAFE',
                    fillOpacity: 0.1
                  }}
                />
              )}
              {/* Middle layer (67% / ~30 min) */}
              {stopRangeLayers.middle?.isochrone?.length > 2 && (
                <Polygon
                  positions={stopRangeLayers.middle.isochrone}
                  pathOptions={{
                    color: '#3B82F6',
                    weight: 1.5,
                    opacity: 0.6,
                    fillColor: '#93C5FD',
                    fillOpacity: 0.15
                  }}
                />
              )}
              {/* Inner layer (33% / ~15 min) - with popup */}
              {stopRangeLayers.inner?.isochrone?.length > 2 && (
                <Polygon
                  positions={stopRangeLayers.inner.isochrone}
                  pathOptions={{
                    color: '#1D4ED8',
                    weight: 2,
                    opacity: 0.8,
                    fillColor: '#3B82F6',
                    fillOpacity: 0.25
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: '220px' }}>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#3B82F6' }}>
                        🚗 Drive Range from Stop
                      </h3>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px' }}>
                        From: <strong>{stopRangeCenter.name}</strong>
                      </p>
                      <div style={{ fontSize: '11px', color: '#374151', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ width: '12px', height: '12px', background: '#3B82F6', borderRadius: '2px' }}></span>
                          <span>Inner: ~{stopRangeLayers.inner.minutes} min ({stopRangeLayers.inner.percentage}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ width: '12px', height: '12px', background: '#93C5FD', borderRadius: '2px' }}></span>
                          <span>Middle: ~{stopRangeLayers.middle.minutes} min ({stopRangeLayers.middle.percentage}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', background: '#DBEAFE', borderRadius: '2px' }}></span>
                          <span>Outer: ~{stopRangeLayers.outer.minutes} min ({stopRangeLayers.outer.percentage}%)</span>
                        </div>
                      </div>
                      <button
                        onClick={clearStopRange}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '10px',
                          background: '#EF4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Clear Range
                      </button>
                    </div>
                  </Popup>
                </Polygon>
              )}
            </>
          )}

          {/* POIs - clustered for performance */}
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            disableClusteringAtZoom={16}
          >
            {pois.map((poi) => {
              const category = POI_CATEGORIES[poi.type as keyof typeof POI_CATEGORIES]
              if (!category || !selectedCategories.has(poi.type)) return null

              // Filter by route distance when a trip route is displayed
              if (routeCoords.length > 0 && routeDistanceFilter > 0) {
                const distanceToRoute = getMinDistanceToRoute(poi.lat, poi.lon, routeCoords)
                if (distanceToRoute > routeDistanceFilter) return null
              }

              return (
                <Marker
                  key={`poi-${poi.id}`}
                  position={[poi.lat, poi.lon]}
                  icon={category.icon}
                >
                  <Popup>
                    <div>
                      <h3 style={{ margin: '0 0 5px 0', color: category.color }}>{poi.name}</h3>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                        {category.name}
                      </p>
                      {poi.tags.phone && (
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
                          📞 {poi.tags.phone}
                        </p>
                      )}
                      {poi.tags.website && (
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
                          <a href={poi.tags.website} target="_blank" rel="noopener noreferrer">
                            Visit Website
                          </a>
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>

          {/* Height Restrictions - clustered for performance */}
          {showHeights && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={50}
              spiderfyOnMaxZoom={true}
              showCoverageOnHover={false}
              zoomToBoundsOnClick={true}
              disableClusteringAtZoom={14}
              iconCreateFunction={(cluster: any) => {
                const count = cluster.getChildCount()
                return L.divIcon({
                  html: `<div style="
                    background-color: #F59E0B;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    font-size: 12px;
                    font-weight: bold;
                    color: white;
                  ">⚠️${count}</div>`,
                  className: 'height-cluster-icon',
                  iconSize: L.point(36, 36),
                })
              }}
            >
              {filteredHeights.map((height) => (
                <Marker
                  key={`height-${height.id}`}
                  position={[height.latitude, height.longitude]}
                  icon={createHeightIcon(height.height_feet, height.is_parking_garage, userRvHeight, height.onRoute)}
                >
                  <Popup>
                    <div style={{ minWidth: '200px' }}>
                      <h3 style={{
                        margin: '0 0 8px 0',
                        color: height.is_parking_garage ? '#6366F1' : (height.height_feet < 11 ? '#DC2626' : height.height_feet < 13 ? '#F59E0B' : '#10B981'),
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span style={{ fontSize: '20px' }}>{height.is_parking_garage ? '🅿️' : '⚠️'}</span>
                        {height.is_parking_garage ? 'Parking Garage' : 'Low Clearance'}
                      </h3>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        padding: '10px',
                        background: height.is_parking_garage ? '#EEF2FF' : (height.height_feet < 11 ? '#FEE2E2' : height.height_feet < 13 ? '#FEF3C7' : '#D1FAE5'),
                        borderRadius: '6px',
                        marginBottom: '10px'
                      }}>
                        {height.height_feet.toFixed(1)} ft
                      </div>
                      {height.name && height.name !== 'Low Clearance' && (
                        <p style={{ margin: '5px 0', fontSize: '13px', fontWeight: 'bold' }}>
                          {height.name}
                        </p>
                      )}
                      {height.road_name && (
                        <p style={{ margin: '5px 0', fontSize: '12px', color: '#6b7280' }}>
                          📍 {height.road_name}
                        </p>
                      )}
                      {height.description && (
                        <p style={{ margin: '5px 0', fontSize: '12px', color: '#6b7280' }}>
                          {height.description}
                        </p>
                      )}
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid #e5e7eb',
                        fontSize: '11px',
                        color: '#9CA3AF'
                      }}>
                        Always verify clearance before passing
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}

          {/* Railroad Crossing Markers */}
          {showRailroadCrossings && filteredRailroadCrossings.length > 0 && (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={40}
              iconCreateFunction={(cluster: any) => {
                const count = cluster.getChildCount()
                return L.divIcon({
                  html: `<div style="
                    background-color: #7C3AED;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    font-size: 11px;
                    font-weight: bold;
                    color: white;
                  ">🚂${count}</div>`,
                  className: 'railroad-cluster-icon',
                  iconSize: L.point(32, 32),
                })
              }}
            >
              {filteredRailroadCrossings.map((crossing) => (
                <Marker
                  key={`crossing-${crossing.id}`}
                  position={[crossing.latitude, crossing.longitude]}
                  icon={createRailroadCrossingIcon(crossing.safety_level, crossing.onRoute)}
                >
                  <Popup>
                    <div style={{ minWidth: '200px' }}>
                      <h3 style={{
                        margin: '0 0 8px 0',
                        color: crossing.safety_level === 'protected' ? '#10B981' : crossing.safety_level === 'warning' ? '#F59E0B' : '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span style={{ fontSize: '20px' }}>🚂</span>
                        Railroad Crossing
                      </h3>
                      {crossing.onRoute && (
                        <div style={{
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          padding: '6px',
                          background: '#06B6D4',
                          color: 'white',
                          borderRadius: '6px',
                          marginBottom: '8px'
                        }}>
                          📍 ON YOUR ROUTE
                        </div>
                      )}
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        padding: '8px',
                        background: crossing.safety_level === 'protected' ? '#D1FAE5' : crossing.safety_level === 'warning' ? '#FEF3C7' : '#FEE2E2',
                        borderRadius: '6px',
                        marginBottom: '10px'
                      }}>
                        {crossing.safety_level === 'protected' ? '✅ Protected (Gates)' :
                         crossing.safety_level === 'warning' ? '⚠️ Warning Devices' :
                         '❌ Unprotected'}
                      </div>
                      {crossing.name && crossing.name !== 'Railroad Crossing' && (
                        <p style={{ margin: '5px 0', fontSize: '13px', fontWeight: 'bold' }}>
                          {crossing.name}
                        </p>
                      )}
                      {crossing.road_name && (
                        <p style={{ margin: '5px 0', fontSize: '12px', color: '#6b7280' }}>
                          📍 {crossing.road_name}
                        </p>
                      )}
                      {crossing.railway_name && (
                        <p style={{ margin: '5px 0', fontSize: '12px', color: '#6b7280' }}>
                          🛤️ {crossing.railway_name}
                        </p>
                      )}
                      <div style={{ fontSize: '12px', marginTop: '8px' }}>
                        {crossing.gates && <span style={{ marginRight: '8px' }}>🚧 Gates</span>}
                        {crossing.light && <span style={{ marginRight: '8px' }}>💡 Lights</span>}
                        {crossing.bell && <span style={{ marginRight: '8px' }}>🔔 Bell</span>}
                        {crossing.tracks && <span>🛤️ {crossing.tracks} track(s)</span>}
                      </div>
                      {/* RV Safety Warnings */}
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid #e5e7eb',
                        fontSize: '11px',
                        background: '#FEF3C7',
                        padding: '8px',
                        borderRadius: '4px',
                        marginBottom: '8px'
                      }}>
                        <div style={{ fontWeight: 'bold', color: '#92400E', marginBottom: '4px' }}>
                          ⚠️ RV Safety Warning
                        </div>
                        <div style={{ color: '#78350F', lineHeight: '1.4' }}>
                          <strong>Ground Clearance:</strong> Cross slowly to avoid bottoming out or high-siding on raised tracks.
                        </div>
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#9CA3AF',
                        textAlign: 'center'
                      }}>
                        Always stop, look, and listen
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}

          {/* Drive-time Isochrones (15min, 30min, 45min layers) */}
          {showIsochrones && selectedTrip?.stops && Object.keys(stopIsochrones).length > 0 && (
            <>
              {selectedTrip.stops.map((stop: any) => {
                const isochrones = stopIsochrones[stop.id]
                if (!isochrones) return null

                return (
                  <React.Fragment key={`isochrone-${stop.id}`}>
                    {/* 45-minute layer (outermost, most transparent) */}
                    {isochroneLayer45 && isochrones['45min'] && isochrones['45min'].length > 0 && (
                      <Polygon
                        positions={isochrones['45min'].map((coord: number[]) => [coord[1], coord[0]])}
                        pathOptions={{
                          color: '#F59E0B',
                          weight: 2,
                          opacity: 0.6,
                          fillColor: '#F59E0B',
                          fillOpacity: 0.1
                        }}
                      >
                        <Popup>
                          <div style={{ padding: '4px' }}>
                            <strong>{stop.name}</strong>
                            <br />
                            <span style={{ color: '#F59E0B' }}>⏱️ 45-minute drive time</span>
                          </div>
                        </Popup>
                      </Polygon>
                    )}

                    {/* 30-minute layer (middle) */}
                    {isochroneLayer30 && isochrones['30min'] && isochrones['30min'].length > 0 && (
                      <Polygon
                        positions={isochrones['30min'].map((coord: number[]) => [coord[1], coord[0]])}
                        pathOptions={{
                          color: '#3B82F6',
                          weight: 2,
                          opacity: 0.7,
                          fillColor: '#3B82F6',
                          fillOpacity: 0.15
                        }}
                      >
                        <Popup>
                          <div style={{ padding: '4px' }}>
                            <strong>{stop.name}</strong>
                            <br />
                            <span style={{ color: '#3B82F6' }}>⏱️ 30-minute drive time</span>
                          </div>
                        </Popup>
                      </Polygon>
                    )}

                    {/* 15-minute layer (innermost, most opaque) */}
                    {isochroneLayer15 && isochrones['15min'] && isochrones['15min'].length > 0 && (
                      <Polygon
                        positions={isochrones['15min'].map((coord: number[]) => [coord[1], coord[0]])}
                        pathOptions={{
                          color: '#10B981',
                          weight: 2,
                          opacity: 0.8,
                          fillColor: '#10B981',
                          fillOpacity: 0.2
                        }}
                      >
                        <Popup>
                          <div style={{ padding: '4px' }}>
                            <strong>{stop.name}</strong>
                            <br />
                            <span style={{ color: '#10B981' }}>⏱️ 15-minute drive time</span>
                          </div>
                        </Popup>
                      </Polygon>
                    )}
                  </React.Fragment>
                )
              })}
            </>
          )}

          {/* Target reticle marker from Dashboard navigation */}
          {targetMarker && (
            <Marker
              position={[targetMarker.lat, targetMarker.lon]}
              icon={createReticleIcon()}
              zIndexOffset={10000}
            />
          )}

          {/* Trip route - colored by leg */}
          {routeCoords.length > 1 && selectedTrip?.stops && (() => {
            // Color palette for trip legs - distinct, high-contrast colors
            const legColors = [
              '#3B82F6', // Blue
              '#10B981', // Emerald
              '#F59E0B', // Amber
              '#EF4444', // Red
              '#8B5CF6', // Violet
              '#EC4899', // Pink
              '#06B6D4', // Cyan
              '#F97316', // Orange
              '#84CC16', // Lime
              '#6366F1', // Indigo
            ]

            // Get sorted stops
            const sortedStops = [...selectedTrip.stops].sort((a: any, b: any) => a.stop_order - b.stop_order)

            if (sortedStops.length < 2) {
              return (
                <Polyline
                  positions={routeCoords}
                  color={legColors[0]}
                  weight={4}
                  opacity={0.8}
                />
              )
            }

            // Find the closest route point index for each stop
            const stopIndices: number[] = sortedStops.map((stop: any) => {
              let minDist = Infinity
              let minIdx = 0
              for (let i = 0; i < routeCoords.length; i++) {
                const dist = getDistanceMiles(stop.latitude, stop.longitude, routeCoords[i][0], routeCoords[i][1])
                if (dist < minDist) {
                  minDist = dist
                  minIdx = i
                }
              }
              return minIdx
            })

            // Split route into segments
            const segments: [number, number][][] = []
            for (let i = 0; i < stopIndices.length - 1; i++) {
              const startIdx = stopIndices[i]
              const endIdx = stopIndices[i + 1]
              // Ensure we have at least 2 points and indices are in order
              if (endIdx > startIdx) {
                segments.push(routeCoords.slice(startIdx, endIdx + 1))
              } else {
                // Fallback: straight line between stops
                segments.push([
                  [sortedStops[i].latitude, sortedStops[i].longitude],
                  [sortedStops[i + 1].latitude, sortedStops[i + 1].longitude]
                ])
              }
            }

            // Detect overlapping segments and create combined dashed patterns
            // For each segment, check if any other segment shares the same path
            const renderedSegments: JSX.Element[] = []
            const processedOverlaps = new Set<string>()

            // Helper to check if two points are close enough to be considered the same
            const pointsMatch = (p1: [number, number], p2: [number, number], tolerance = 0.0001) => {
              return Math.abs(p1[0] - p2[0]) < tolerance && Math.abs(p1[1] - p2[1]) < tolerance
            }

            // Helper to check if segment B is contained in segment A (reverse allowed)
            const segmentsOverlap = (segA: [number, number][], segB: [number, number][]) => {
              if (segA.length < 2 || segB.length < 2) return false
              // Check if B's endpoints match A's endpoints (forward or reverse)
              const aStart = segA[0], aEnd = segA[segA.length - 1]
              const bStart = segB[0], bEnd = segB[segB.length - 1]
              return (pointsMatch(aStart, bEnd) && pointsMatch(aEnd, bStart)) ||
                     (pointsMatch(aStart, bStart) && pointsMatch(aEnd, bEnd))
            }

            for (let idx = 0; idx < segments.length; idx++) {
              const segment = segments[idx]
              const color1 = legColors[idx % legColors.length]

              // Find any overlapping segments with higher index
              const overlappingLegs: number[] = []
              for (let j = idx + 1; j < segments.length; j++) {
                if (segmentsOverlap(segment, segments[j])) {
                  const overlapKey = `${Math.min(idx, j)}-${Math.max(idx, j)}`
                  if (!processedOverlaps.has(overlapKey)) {
                    overlappingLegs.push(j)
                    processedOverlaps.add(overlapKey)
                  }
                }
              }

              if (overlappingLegs.length > 0) {
                // Render overlapping segment with alternating dash pattern
                const color2 = legColors[overlappingLegs[0] % legColors.length]
                // Render two dashed lines offset slightly for visibility
                renderedSegments.push(
                  <Polyline
                    key={`route-leg-${idx}-base`}
                    positions={segment}
                    color={color1}
                    weight={5}
                    opacity={0.9}
                    dashArray="12, 12"
                  />,
                  <Polyline
                    key={`route-leg-${idx}-overlay`}
                    positions={segment}
                    color={color2}
                    weight={5}
                    opacity={0.9}
                    dashArray="12, 12"
                    dashOffset="12"
                  />
                )
              } else {
                // Check if this segment is the second part of an already-processed overlap
                let isProcessed = false
                for (let j = 0; j < idx; j++) {
                  const overlapKey = `${Math.min(idx, j)}-${Math.max(idx, j)}`
                  if (processedOverlaps.has(overlapKey)) {
                    isProcessed = true
                    break
                  }
                }

                if (!isProcessed) {
                  // Normal non-overlapping segment
                  renderedSegments.push(
                    <Polyline
                      key={`route-leg-${idx}`}
                      positions={segment}
                      color={color1}
                      weight={4}
                      opacity={0.85}
                    />
                  )
                }
              }
            }

            return renderedSegments
          })()}
          {/* Fallback to straight lines if route not loaded */}
          {routeCoords.length === 0 && selectedTrip?.stops && selectedTrip.stops.length > 1 && (() => {
            const legColors = [
              '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
              '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'
            ]
            const sortedStops = [...selectedTrip.stops].sort((a: any, b: any) => a.stop_order - b.stop_order)

            return sortedStops.slice(0, -1).map((stop: any, idx: number) => {
              const nextStop = sortedStops[idx + 1]
              return (
                <Polyline
                  key={`fallback-leg-${idx}`}
                  positions={[
                    [stop.latitude, stop.longitude],
                    [nextStop.latitude, nextStop.longitude]
                  ]}
                  color={legColors[idx % legColors.length]}
                  weight={3}
                  dashArray="10, 10"
                  opacity={0.6}
                />
              )
            })
          })()}
        </MapContainer>
        )}

        {/* POI count */}
        {pois.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            background: 'var(--card-bg)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            fontSize: '12px',
            zIndex: 1000,
            color: 'var(--text-primary)'
          }}>
            Found {pois.length} POI{pois.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="card mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label className="label">Select Trip:</label>
            <select
              className="input"
              onChange={(e) => handleTripChange(parseInt(e.target.value))}
              value={selectedTrip?.id || ''}
            >
              <option value="">Choose a trip...</option>
              {trips.map(trip => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">POI Distance from Route:</label>
            <select
              className="input"
              value={routeDistanceFilter}
              onChange={(e) => setRouteDistanceFilter(parseInt(e.target.value))}
              disabled={!selectedTrip || routeCoords.length === 0}
            >
              <option value={0}>Show all POIs (no filter)</option>
              <option value={5}>Within 5 miles</option>
              <option value={10}>Within 10 miles</option>
              <option value={20}>Within 20 miles</option>
              <option value={40}>Within 40 miles</option>
              <option value={60}>Within 60 miles</option>
              <option value={100}>Within 100 miles</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 style={{ margin: 0 }}>RV POI Filters</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {loading && <span style={{ fontSize: '12px', color: '#6b7280' }}>Searching...</span>}
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="btn btn-secondary"
              style={{ padding: '5px 10px', fontSize: '12px' }}
            >
              {showLegend ? 'Hide' : 'Show'} Legend
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {Object.entries(POI_CATEGORIES).map(([key, category]) => (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              style={{
                padding: '8px 12px',
                border: selectedCategories.has(key) ? `2px solid ${category.color}` : '2px solid var(--border-color)',
                background: selectedCategories.has(key) ? `${category.color}20` : 'var(--card-bg)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: selectedCategories.has(key) ? 'bold' : 'normal',
                transition: 'all 0.2s',
                color: 'var(--text-primary)'
              }}
            >
              {category.name}
            </button>
          ))}
        </div>

        {showLegend && (
          <div style={{ marginTop: '15px', padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <strong style={{ marginBottom: '10px', display: 'block', color: 'var(--text-primary)' }}>Legend:</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {Object.entries(POI_CATEGORIES).map(([key, category]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: category.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px'
                  }}>
                    {key === 'fuel_stations' && '⛽'}
                    {key === 'ev_charging' && '🔌'}
                    {key === 'rest_areas' && '🅿️'}
                    {key === 'campgrounds' && '⛺'}
                    {key === 'lodging' && '🏨'}
                    {key === 'parks' && '🌳'}
                    {key === 'national_parks' && '🏞️'}
                    {key === 'shopping' && '🛒'}
                    {key === 'convenience_stores' && '🏪'}
                    {key === 'dining' && '🍽️'}
                    {key === 'dump_stations' && '🚽'}
                    {key === 'visitor_centers' && 'ℹ️'}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{category.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {cacheStats && (
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 style={{ margin: 0 }}>POI Cache Status</h3>
            <button
              onClick={handleRefreshRegion}
              disabled={refreshing}
              className="btn btn-primary"
              style={{
                padding: '5px 15px',
                fontSize: '13px',
                opacity: refreshing ? 0.6 : 1,
                cursor: refreshing ? 'not-allowed' : 'pointer'
              }}
            >
              {refreshing ? 'Refreshing...' : 'Refresh This Region'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div style={{
              padding: '12px',
              background: cacheStats.cache_status === 'empty' ? '#fef2f2' : '#f0fdf4',
              borderRadius: '6px',
              border: `2px solid ${cacheStats.cache_status === 'empty' ? '#fca5a5' : '#86efac'}`
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Status</div>
              <div style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: cacheStats.cache_status === 'empty' ? '#dc2626' : '#16a34a'
              }}>
                {cacheStats.cache_status === 'empty' ? '⚠️ Empty' : '✓ Populated'}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '2px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Total POIs</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {cacheStats.total_pois.toLocaleString()}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '2px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Last Updated</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {cacheStats.last_updated
                  ? new Date(cacheStats.last_updated).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>

          {cacheStats.categories && Object.keys(cacheStats.categories).length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '10px', color: 'var(--text-primary)' }}>Category Breakdown:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {Object.entries(cacheStats.categories).map(([category, count]) => {
                  const categoryInfo = POI_CATEGORIES[category as keyof typeof POI_CATEGORIES]
                  return (
                    <div
                      key={category}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: categoryInfo ? `${categoryInfo.color}15` : 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span>{categoryInfo?.name || category}</span>
                      <span style={{ fontWeight: 'bold' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {cacheStats.cache_status === 'empty' && (
            <div style={{
              marginTop: '15px',
              padding: '12px',
              background: '#fef3c7',
              borderRadius: '6px',
              border: '2px solid #fbbf24',
              fontSize: '13px'
            }}>
              <strong>Note:</strong> The POI cache is empty. The background service will automatically populate it every 6 hours.
              You can also manually refresh this region using the button above.
            </div>
          )}
        </div>
      )}

      {selectedTrip && (
        <div className="card mt-4">
          <h2>{selectedTrip.name}</h2>
          <p style={{ color: '#6b7280' }}>{selectedTrip.description}</p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '15px', flexWrap: 'wrap' }}>
            <div>
              <strong>Distance:</strong> {selectedTrip.total_distance_miles?.toFixed(1) || 0} miles
            </div>
            <div>
              <strong>Stops:</strong> {selectedTrip.stops?.length || 0}
            </div>
            <div>
              <strong>Status:</strong> {selectedTrip.status}
            </div>
          </div>
        </div>
      )}

      {/* Height Detail Modal from Dashboard navigation */}
      {targetHeightModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }} onClick={() => {
          setTargetHeightModal(null)
          setTargetMarker(null)
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                Low Clearance
              </h2>
              <button onClick={() => {
                setTargetHeightModal(null)
                setTargetMarker(null)
              }} style={{
                background: 'var(--accent-danger)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '18px'
              }}>×</button>
            </div>

            <div style={{
              fontSize: '48px',
              fontWeight: 'bold',
              textAlign: 'center',
              padding: '20px',
              background: targetHeightModal.height_feet < 11 ? '#FEE2E2' : targetHeightModal.height_feet < 13 ? '#FEF3C7' : '#D1FAE5',
              borderRadius: '8px',
              marginBottom: '20px',
              color: targetHeightModal.height_feet < 11 ? '#DC2626' : targetHeightModal.height_feet < 13 ? '#D97706' : '#059669'
            }}>
              {targetHeightModal.height_feet.toFixed(1)} ft
            </div>

            {targetHeightModal.road_name && (
              <p style={{ margin: '10px 0', fontSize: '16px', color: 'var(--text-primary)' }}>
                <strong>Road:</strong> {targetHeightModal.road_name}
              </p>
            )}

            {targetHeightModal.name && targetHeightModal.name !== 'Unnamed' && (
              <p style={{ margin: '10px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <strong>Name:</strong> {targetHeightModal.name}
              </p>
            )}

            <p style={{ margin: '10px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Coordinates: {targetHeightModal.lat.toFixed(6)}, {targetHeightModal.lon.toFixed(6)}
            </p>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${targetHeightModal.lat},${targetHeightModal.lon}`,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Open Street View
              </button>
              <button
                onClick={() => {
                  setTargetHeightModal(null)
                  setTargetMarker(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Close
              </button>
            </div>

            <p style={{
              margin: '15px 0 0 0',
              padding: '10px',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              textAlign: 'center'
            }}>
              Always verify clearance before passing
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
