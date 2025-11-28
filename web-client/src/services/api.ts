import axios from 'axios'
import { safeStorage } from '../utils/storage'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
})

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = safeStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      safeStorage.removeItem('token')

      // Only redirect to login if not already on login/setup page
      const currentPath = window.location.pathname
      if (currentPath !== '/login' && currentPath !== '/setup') {
        // Use window.location to force a full page reload
        // This will trigger App.tsx useEffect to check auth state
        window.location.replace('/login')
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const auth = {
  login: (username: string, password: string) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    return api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// Users
export const users = {
  getAll: () => api.get('/users'),
  getById: (id: number) => api.get(`/users/${id}`),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
}

// RV Profiles
export const rvProfiles = {
  getAll: () => api.get('/rv-profiles/'),
  getById: (id: number) => api.get(`/rv-profiles/${id}`),
  create: (data: any) => api.post('/rv-profiles/', data),
  update: (id: number, data: any) => api.put(`/rv-profiles/${id}`, data),
  delete: (id: number) => api.delete(`/rv-profiles/${id}`),
  uploadPhoto: (id: number, formData: FormData) => {
    return api.post(`/rv-profiles/${id}/photo`, formData, {
      headers: { 'Content-Type': undefined },
    })
  },
}

// Trips
export const trips = {
  getAll: (params?: any) => api.get('/trips', { params }),
  getById: (id: number) => api.get(`/trips/${id}`),
  create: (data: any) => api.post('/trips', data),
  update: (id: number, data: any) => api.put(`/trips/${id}`, data),
  delete: (id: number) => api.delete(`/trips/${id}`),
  addStop: (tripId: number, data: any) => api.post(`/trips/${tripId}/stops`, data),
  getStops: (tripId: number) => api.get(`/trips/${tripId}/stops`),
  updateStop: (tripId: number, stopId: number, data: any) => api.put(`/trips/${tripId}/stops/${stopId}`, data),
  deleteStop: (tripId: number, stopId: number) => api.delete(`/trips/${tripId}/stops/${stopId}`),
  addNote: (tripId: number, data: any) => api.post(`/trips/${tripId}/notes`, data),
  getNotes: (tripId: number) => api.get(`/trips/${tripId}/notes`),
  deleteNote: (tripId: number, noteId: number) => api.delete(`/trips/${tripId}/notes/${noteId}`),
  // Routing
  getRoute: (tripId: number, forceRefresh?: boolean) => api.get(`/trips/${tripId}/route`, { params: { force_refresh: forceRefresh } }),
  // Trip planning
  plan: (data: any) => api.post('/trips/plan', data),
  planAndCreate: (data: any) => api.post('/trips/plan-and-create', data),
  // Gap analysis
  analyzeGaps: (tripId: number) => api.get(`/trips/${tripId}/analyze-gaps`),
  getGapSuggestions: (tripId: number) => api.get(`/trips/${tripId}/gap-suggestions`),
  // Isochrones
  getIsochrones: (lat: number, lon: number, intervals?: string) =>
    api.get('/trips/isochrones', { params: { lat, lon, intervals: intervals || '15,30,45' } }),
}

// POIs
export const pois = {
  getAll: (params?: any) => api.get('/pois', { params }),
  getById: (id: number) => api.get(`/pois/${id}`),
  create: (data: any) => api.post('/pois', data),
  delete: (id: number) => api.delete(`/pois/${id}`),
  search: (params: any) => api.get('/pois/search', { params }),
  searchOverpass: (params: any) => api.get('/pois/overpass/search', { params }),
  getOverpassAlongRoute: (params: any) => api.get('/pois/overpass/along-route', { params }),
  getDatabaseStats: () => api.get('/pois/database-stats'),
  getOverpassHeightsStats: () => api.get('/pois/overpass-heights-stats'),
  getSubcategoryStats: () => api.get('/pois/subcategory-stats'),
  getRailroadCrossingsStats: () => api.get('/railroad-crossings/stats'),
}

// Fuel Logs
export const fuelLogs = {
  getAll: (params?: any) => api.get('/fuel-logs', { params }),
  getById: (id: number) => api.get(`/fuel-logs/${id}`),
  create: (data: any) => api.post('/fuel-logs', data),
  delete: (id: number) => api.delete(`/fuel-logs/${id}`),
}

// Metrics
export const metrics = {
  getTripMetrics: () => api.get('/metrics/trip-metrics'),
  getFuelMetrics: () => api.get('/metrics/fuel-metrics'),
  getFuelPrices: () => api.get('/metrics/fuel-prices'),
  getMonthly: (year?: number) => api.get('/metrics/monthly', { params: { year } }),
  getByState: () => api.get('/metrics/by-state'),
  getStatistics: (year?: number) => api.get('/metrics/statistics', { params: { year } }),
}

// State Visits
export const stateVisits = {
  getAll: () => api.get('/state-visits'),
  create: (data: any) => api.post('/state-visits', data),
  update: (id: number, data: any) => api.put(`/state-visits/${id}`, data),
  delete: (id: number) => api.delete(`/state-visits/${id}`),
}

// Settings
export const settings = {
  // SSL Certificate Management
  getSSLInfo: () => api.get('/settings/ssl/info'),
  uploadSSLCertificate: (certificate: File, privateKey: File) => {
    const formData = new FormData()
    formData.append('certificate', certificate)
    formData.append('private_key', privateKey)
    return api.post('/settings/ssl/upload', formData, {
      headers: { 'Content-Type': undefined },
    })
  },
  generateSelfSignedCert: (hostname: string) =>
    api.post('/settings/ssl/generate-self-signed', null, { params: { hostname } }),
  deleteSSLCertificate: () => api.delete('/settings/ssl/certificate'),

  // API Keys Management
  getEiaApiKeyStatus: () => api.get('/settings/api-keys/eia'),
  setEiaApiKey: (apiKey: string) => api.post('/settings/api-keys/eia', { api_key: apiKey }),
  deleteEiaApiKey: () => api.delete('/settings/api-keys/eia'),
  testEiaApiKey: () => api.post('/settings/api-keys/eia/test'),

  // Harvest Hosts Credentials
  getHHCredentialsStatus: () => api.get('/settings/api-keys/harvest-hosts'),
  setHHCredentials: (email: string, password: string) =>
    api.post('/settings/api-keys/harvest-hosts', { email, password }),
  deleteHHCredentials: () => api.delete('/settings/api-keys/harvest-hosts'),
}

// Database Credentials
export const credentials = {
  getStatus: () => api.get('/credentials/status'),
  changePassword: (newPassword?: string, dbUser?: string) =>
    api.post('/credentials/change-password', {
      new_password: newPassword,
      db_user: dbUser || 'wandermage'
    }),
  rotate: () => api.post('/credentials/rotate'),
  generatePassword: (length?: number) =>
    api.post('/credentials/generate-password', { length: length || 32 }),
  securityCheck: () => api.get('/credentials/security-check'),
  getEnvVars: () => api.get('/credentials/env-vars'),
}

// User Preferences (legacy endpoint)
export const preferences = {
  get: () => api.get('/user/preferences'),
  save: (key: string, value: any) => api.post('/user/preferences', { key, value }),
  update: (preferences: Record<string, any>) => api.put('/user/preferences', { preferences }),
  delete: (key: string) => api.delete(`/user/preferences/${key}`),
}

// User Preferences API
export const userPreferences = {
  getAll: () => api.get('/user/preferences'),
  get: (key: string) => api.get(`/user/preferences/${key}`),
  save: (key: string, value: any) => api.post('/user/preferences', { key, value }),
  update: (preferences: Record<string, any>) => api.put('/user/preferences', { preferences }),
  delete: (key: string) => api.delete(`/user/preferences/${key}`),
}

// POI Search (Local database text search - fast)
export const poiSearch = {
  textSearch: (query: string, latitude: number, longitude: number, radius?: number, limit?: number) =>
    api.get('/pois/text-search', {
      params: { query, latitude, longitude, radius_miles: radius, limit }
    }),
}

// Overpass Search (Natural Language OSM Search - slower but more comprehensive)
export const overpassSearch = {
  search: (query: string, radius?: number, limit?: number) =>
    api.get('/overpass-search/search', {
      params: { query, radius, limit },
      timeout: 60000  // 60 second timeout for Overpass API
    }),
  getSuggestions: () => api.get('/overpass-search/suggestions'),
}

// System
export const system = {
  getVersion: () => api.get('/version'),
}

// Achievements
export const achievements = {
  getMine: () => api.get('/achievements/'),
  getDefinitions: () => api.get('/achievements/definitions'),
  getProgress: () => api.get('/achievements/progress'),
  check: () => api.post('/achievements/check'),
  getSummary: () => api.get('/achievements/summary'),
  getMetrics: () => api.get('/achievements/metrics'),
  toggleFavorite: (achievementId: number) => api.patch(`/achievements/${achievementId}/favorite`),
}

// Scraping Control
export const scraping = {
  getCategories: () => api.get('/scraping/categories'),
  getStatus: () => api.get('/scraping/status'),
  startCrawl: (categories: string[], states?: string[]) =>
    api.post('/scraping/start', { categories, states }),
  stopCrawl: () => api.post('/scraping/stop'),
  deleteHistory: (crawlId: number) => api.delete(`/scraping/history/${crawlId}`),
  getQueueStatus: () => api.get('/scraping/queue-status'),
}

// Scraper Dashboard (Unified Scraper Control)
export const scraperDashboard = {
  getAllStatus: () => api.get('/scraper-dashboard/status'),
  getStatus: (scraperType: string) => api.get(`/scraper-dashboard/status/${scraperType}`),
  start: (scraperType: string, config?: {
    categories?: string[],
    states?: string[],
    hh_email?: string,
    hh_password?: string,
    scrape_hosts?: boolean,
    scrape_stays?: boolean
  }) =>
    api.post(`/scraper-dashboard/start/${scraperType}`, config || {}),
  stop: (scraperType: string) => api.post(`/scraper-dashboard/stop/${scraperType}`),
  reset: (scraperType: string) => api.post(`/scraper-dashboard/reset/${scraperType}`),
  getHistory: () => api.get('/scraper-dashboard/history'),
  getPOIOptions: () => api.get('/scraper-dashboard/poi-options'),
}

// Weather
export const weather = {
  getForecast: (lat: number, lon: number) =>
    api.get('/weather/forecast', { params: { lat, lon } }),
  getHourlyForecast: (lat: number, lon: number) =>
    api.get('/weather/forecast/hourly', { params: { lat, lon } }),
  getAlerts: (lat: number, lon: number) =>
    api.get('/weather/alerts', { params: { lat, lon } }),
  getTripForecasts: (tripId: number) =>
    api.get(`/weather/trip/${tripId}/forecasts`),
  getRadarTiles: () => api.get('/weather/radar-tiles'),
  // User location weather
  updateUserLocation: (lat: number, lon: number, locationName?: string) =>
    api.post('/weather/user-location', { latitude: lat, longitude: lon, location_name: locationName }),
  getUserLocationForecast: () =>
    api.get('/weather/user-location'),
}

export default api
