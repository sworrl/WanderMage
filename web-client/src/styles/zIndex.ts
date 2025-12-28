/**
 * Z-Index System for WanderMage
 *
 * Defines consistent z-index values across the application.
 * All z-index values should reference this file to maintain consistency.
 *
 * Layers (bottom to top):
 * - BACKGROUND: Background elements, decorations, effects that should be behind content
 * - BASE: Default content layer
 * - ELEVATED: Cards, panels, raised content
 * - OVERLAY: Overlays that cover content but are below modals
 * - MODAL: Modal dialogs, drawers, popups
 * - TOOLTIP: Tooltips, popovers that appear over modals
 * - TOP: Always on top elements (critical notifications, loading screens)
 */

export const Z_INDEX = {
  // Background layer - holiday effects, decorative elements
  BACKGROUND: {
    EFFECTS: 10,           // Holiday effects (snow, fireworks, etc.)
    DECORATIONS: 20,       // Other decorative background elements
  },

  // Base content layer
  BASE: {
    CONTENT: 100,          // Normal page content
    SIDEBAR: 200,          // Sidebar navigation
    SIDEBAR_TOGGLE: 210,   // Sidebar collapse button
  },

  // Map-specific layers
  MAP: {
    TILES: 100,            // Map tiles (default leaflet)
    OVERLAYS: 400,         // Map overlays (leaflet panes)
    MARKERS: 600,          // Map markers (leaflet)
    CONTROLS: 800,         // Zoom controls, layer controls
    POPUPS: 900,           // Map popups
    PANELS: 950,           // Map settings panels, info panels
  },

  // Elevated content
  ELEVATED: {
    CARDS: 100,            // Floating cards
    DROPDOWNS: 500,        // Dropdown menus
    STICKY: 600,           // Sticky headers, nav bars
  },

  // Overlay layer
  OVERLAY: {
    BACKDROP: 1000,        // Modal/drawer backdrops
    DRAWER: 1050,          // Side drawers
    FLOATING_BUTTONS: 1100, // FABs, floating action buttons
  },

  // Modal layer
  MODAL: {
    BACKDROP: 2000,        // Modal backdrop
    CONTENT: 2100,         // Modal content
    NESTED: 2200,          // Nested modals
  },

  // Tooltip layer
  TOOLTIP: {
    DEFAULT: 3000,         // Tooltips, popovers
    DROPDOWN: 3100,        // Dropdowns within modals
  },

  // Top layer - always visible
  TOP: {
    LOADING: 9000,         // Full-screen loading indicators
    TOAST: 9500,           // Toast notifications
    CRITICAL: 9900,        // Critical system notifications
    DEBUG: 10000,          // Debug overlays
  },

  // Holiday toggle button - should be above overlays but below modals
  HOLIDAY_TOGGLE: 1500,
} as const

// Type for accessing z-index values
export type ZIndexCategory = keyof typeof Z_INDEX

// Helper to get a z-index value with optional offset
export function getZIndex(category: keyof typeof Z_INDEX, subcategory?: string, offset = 0): number {
  const categoryValue = Z_INDEX[category]
  if (typeof categoryValue === 'number') {
    return categoryValue + offset
  }
  if (subcategory && typeof categoryValue === 'object' && subcategory in categoryValue) {
    return (categoryValue as Record<string, number>)[subcategory] + offset
  }
  // Return first value in category if no subcategory specified
  if (typeof categoryValue === 'object') {
    return Object.values(categoryValue)[0] + offset
  }
  return 100 + offset // Default fallback
}
