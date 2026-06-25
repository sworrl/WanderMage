/**
 * Bespoke geometric glyph set, drawn in TypeScript — the app's replacement for emoji icons.
 *
 * Each glyph is hand-built from simple stroke geometry on a 24x24 grid and inherits the
 * surrounding text color (`currentColor`), so it themes for free. WebGL is reserved for the
 * full-screen shader backgrounds; for inline UI and the hundreds of Leaflet markers a vector
 * stroke is the right tool (no per-marker GL context, crisp at every zoom).
 *
 * Two consumers:
 *   <Icon name="fuel" />        — React, for nav/buttons/labels
 *   iconSvg("fuel", {size,color}) — raw <svg> string, for Leaflet divIcon html
 */

// Inner SVG geometry per glyph. Group sets fill:none + round joins; glyphs only declare shapes.
const GLYPHS: Record<string, string> = {
  dashboard: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="4" rx="1"/><rect x="13" y="11" width="7" height="9" rx="1"/><rect x="4" y="14" width="7" height="6" rx="1"/>',
  map: '<polygon points="3,6 9,3.5 15,6 21,3.5 21,18 15,20.5 9,18 3,20.5"/><line x1="9" y1="3.5" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="12,5 13.6,12 12,19 10.4,12"/><polygon points="5,12 12,10.4 19,12 12,13.6"/>',
  rv: '<rect x="2" y="7" width="13" height="9" rx="1"/><path d="M15 9 h3 l3 3 v4 h-6 z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  fuel: '<rect x="4" y="4" width="9" height="16" rx="1"/><line x1="4" y1="11" x2="13" y2="11"/><path d="M13 8 h3 v7 a2 2 0 0 0 4 0 V10 l-2-2"/>',
  tools: '<path d="M14.5 6.5 a4 4 0 1 0 3 3 L21 13 l-2 2 -3-3 a4 4 0 0 1-3-3 z"/><line x1="9" y1="11" x2="4" y2="16"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3 v3 M12 18 v3 M3 12 h3 M18 12 h3 M5.6 5.6 l2.1 2.1 M16.3 16.3 l2.1 2.1 M18.4 5.6 l-2.1 2.1 M7.7 16.3 l-2.1 2.1"/>',
  logout: '<path d="M14 4 H6 a2 2 0 0 0-2 2 v12 a2 2 0 0 0 2 2 h8"/><line x1="11" y1="12" x2="21" y2="12"/><polyline points="18,9 21,12 18,15"/>',
  truck: '<rect x="2" y="8" width="11" height="8" rx="1"/><path d="M13 10 h4 l3 3 v3 h-7 z"/><circle cx="6" cy="18" r="1.7"/><circle cx="17" cy="18" r="1.7"/>',
  droplet: '<path d="M12 3 C7.5 10 6 13 6 16 a6 6 0 0 0 12 0 c0-3-1.5-6-6-13 z"/>',
  tent: '<polygon points="12,4 21,20 3,20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  mountain: '<polygon points="3,20 9,9 13,15 16,10 21,20"/>',
  tree: '<polygon points="12,3 17,12 13.5,12 18,18 6,18 10.5,12 7,12"/><line x1="12" y1="18" x2="12" y2="21"/>',
  shelter: '<polyline points="4,10 12,4 20,10"/><line x1="12" y1="10" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>',
  flame: '<path d="M12 3 c3 4 5 6 5 10 a5 5 0 0 1-10 0 c0-2 1-4.5 5-10 z"/><path d="M12 12 c1.2 1.4 1.6 2.4 1.6 3.6 a1.6 1.6 0 0 1-3.2 0 c0-1 .4-1.8 1.6-3.6 z"/>',
  crossing: '<circle cx="12" cy="12" r="9"/><path d="M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5"/>',
  clearance: '<path d="M3 19 V11 a9 5 0 0 1 18 0 v8"/><line x1="8" y1="19" x2="8" y2="13"/><polyline points="6,15 8,13 10,15"/><polyline points="6,17 8,19 10,17"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1"/><line x1="7" y1="8" x2="7" y2="12"/><line x1="11" y1="8" x2="11" y2="13"/><line x1="15" y1="8" x2="15" y2="12"/><line x1="19" y1="8" x2="19" y2="13"/>',
  road: '<path d="M8 21 L11 3 M16 21 L13 3"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="12" y1="13" x2="12" y2="16"/>',
  food: '<path d="M6 3 v7 a2 2 0 0 0 4 0 V3 M8 10 V21 M17 3 c-2 0-3 2-3 5 s1 4 3 4 v9"/>',
  bed: '<path d="M3 18 V8 M3 13 h18 v5 M21 18 v-5 a2 2 0 0 0-2-2 H10 v4"/><circle cx="7" cy="11" r="1.6"/>',
  pin: '<path d="M12 21 C6.5 14 5 11 5 9 a7 7 0 0 1 14 0 c0 2-1.5 5-7 12 z"/><circle cx="12" cy="9" r="2.5"/>',
  check: '<polyline points="5,13 10,18 19,6"/>',
  warn: '<polygon points="12,4 22,20 2,20"/><line x1="12" y1="10" x2="12" y2="15"/><line x1="12" y1="17.6" x2="12" y2="17.8"/>',
  cross: '<path d="M6 6 L18 18 M18 6 L6 18"/>',
  pause: '<line x1="9" y1="6" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="18"/>',
  refresh: '<path d="M20 12 a8 8 0 1 1-2.3-5.6"/><polyline points="20,4 20,8 16,8"/>',
  chevronLeft: '<polyline points="15,6 9,12 15,18"/>',
  chevronRight: '<polyline points="9,6 15,12 9,18"/>',
  ev: '<path d="M13 3 L6 13 h5 l-1 8 8-11 h-5 z"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4 h2 l2.5 11 h10 l2-7 H6.5"/>',
  store: '<path d="M4 9 V20 h16 V9"/><path d="M3 9 l2-5 h14 l2 5 z"/><polyline points="10,20 10,14 14,14 14,20"/>',
  restroom: '<circle cx="12" cy="5.5" r="2.2"/><path d="M12 8 v6 M8 11 h8 M9.6 20 l1-6 M14.4 20 l-1-6"/>',
  medical: '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  mail: '<rect x="3" y="6" width="18" height="12" rx="1"/><polyline points="3,7.5 12,13 21,7.5"/>',
  building: '<polyline points="3,9 12,4 21,9"/><line x1="5" y1="9" x2="5" y2="19"/><line x1="10" y1="9" x2="10" y2="19"/><line x1="14" y1="9" x2="14" y2="19"/><line x1="19" y1="9" x2="19" y2="19"/><line x1="3" y1="20" x2="21" y2="20"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="7.8"/>',
  laundry: '<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="12" cy="13" r="4"/><line x1="8" y1="6" x2="8.2" y2="6"/>',
  paw: '<ellipse cx="12" cy="16" rx="4" ry="3"/><circle cx="6.5" cy="11" r="1.5"/><circle cx="10.5" cy="8.5" r="1.5"/><circle cx="14" cy="9" r="1.5"/>',
  pill: '<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(45 12 12)"/><line x1="9" y1="9" x2="15" y2="15"/>',
  tire: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  flag: '<line x1="6" y1="3" x2="6" y2="21"/><path d="M6 4 h11 l-2.5 4 2.5 4 H6 z"/>',
  flagCheckered: '<line x1="6" y1="3" x2="6" y2="21"/><rect x="6" y="4" width="12" height="8"/><rect x="6" y="4" width="3" height="2" fill="currentColor"/><rect x="12" y="4" width="3" height="2" fill="currentColor"/><rect x="9" y="6" width="3" height="2" fill="currentColor"/><rect x="15" y="6" width="3" height="2" fill="currentColor"/><rect x="6" y="8" width="3" height="2" fill="currentColor"/><rect x="12" y="8" width="3" height="2" fill="currentColor"/>',
  moon: '<path d="M16.5 13 A6 6 0 1 1 11 6.5 4.6 4.6 0 0 0 16.5 13 z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/>',
  star: '<polygon points="12,3 14.6,9 21,9.5 16,13.8 17.6,20 12,16.5 6.4,20 8,13.8 3,9.5 9.4,9"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
  home: '<path d="M4 11 L12 4 L20 11"/><path d="M6 10 V20 H18 V10"/>',
  search: '<circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="21" y2="21"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="14" y2="15"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7 l1.5-2.5 h5 L16 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2 v2 M12 20 v2 M2 12 h2 M20 12 h2 M5 5 l1.4 1.4 M17.6 17.6 L19 19 M19 5 l-1.4 1.4 M6.4 17.6 L5 19"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="16" y1="3" x2="16" y2="6"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="20"/><path d="M5 13 a7 7 0 0 0 14 0"/><line x1="8" y1="12" x2="16" y2="12"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20 a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5 a3 3 0 0 1 0 5.5 M17 13.5 a6 6 0 0 1 3.5 5.5"/>',
  key: '<circle cx="8" cy="12" r="4"/><line x1="12" y1="12" x2="21" y2="12"/><line x1="18" y1="12" x2="18" y2="16"/><line x1="21" y1="12" x2="21" y2="15"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6 v12 a7 3 0 0 0 14 0 V6"/><path d="M5 12 a7 3 0 0 0 14 0"/>',
  menu: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/>',
  heart: '<path d="M12 20 C5 14 3 10 3 7.5 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 21 7.5 C21 10 19 14 12 20 z"/>',
  leaf: '<path d="M5 19 C5 9 12 4 20 4 C20 14 13 19 5 19 z"/><line x1="5" y1="19" x2="13" y2="11"/>',
  spark: '<path d="M12 3 l1.6 6.4 L20 11 l-6.4 1.6 L12 19 l-1.6-6.4 L4 11 l6.4-1.6 z"/>',
  wash: '<path d="M6 11 a6 6 0 0 1 12 0"/><line x1="12" y1="3" x2="12" y2="5"/><line x1="8" y1="15" x2="7" y2="18"/><line x1="12" y1="15.5" x2="11" y2="19"/><line x1="16" y1="15" x2="15" y2="18"/>',
}

// Map the app's semantic / category keys onto the glyph set above.
const ALIAS: Record<string, string> = {
  trips: 'map', world: 'globe', wizard: 'compass', settings: 'gear', admin: 'gear',
  truck_stops: 'truck', truck_stop: 'truck',
  dump_stations: 'droplet', dump_station: 'droplet', water: 'droplet',
  campgrounds: 'tent', campground: 'tent', rv_parks: 'tent',
  national_parks: 'mountain', state_parks: 'tree',
  rest_areas: 'shelter', rest_area: 'shelter',
  gas_stations: 'fuel', gas_station: 'fuel',
  propane: 'flame',
  railroad_crossings: 'crossing', overpass_heights: 'clearance', height_restrictions: 'ruler',
  restaurants: 'food', lodging: 'bed',
  ok: 'check', success: 'check', error: 'cross', failed: 'cross', rate_limited: 'pause',
  running: 'refresh', crawling: 'refresh',
}

function glyph(name: string): string {
  return GLYPHS[name] || GLYPHS[ALIAS[name]] || GLYPHS.pin
}

export function iconSvg(name: string, opts: { size?: number; color?: string; strokeWidth?: number } = {}): string {
  const { size = 18, color = 'currentColor', strokeWidth = 2 } = opts
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${glyph(name)}</svg>`
}

export default function Icon({ name, size = 18, strokeWidth = 2, className, title }:
  { name: string; size?: number; strokeWidth?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={!title}
      dangerouslySetInnerHTML={{ __html: glyph(name) }}
    />
  )
}
