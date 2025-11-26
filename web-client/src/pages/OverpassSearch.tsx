import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { overpassSearch, poiSearch, trips } from '../services/api'
import './OverpassSearch.css'

type SearchMode = 'quick' | 'overpass'

interface SearchResult {
  id: number
  type: string
  name: string
  latitude: number
  longitude: number
  tags: Record<string, string>
  description: string
  website: string
  phone: string
  address: string
  opening_hours: string
}

interface SearchResponse {
  query: string
  search_term: string
  location: string
  center: { lat: number; lon: number }
  radius_miles: number
  count: number
  results: SearchResult[]
}

interface Suggestions {
  categories: Record<string, string[]>
  tip: string
}

interface Trip {
  id: number
  name: string
  start_location: string
  end_location: string
  start_date: string
  status: string
}

interface LocationOption {
  id: string
  label: string
  sublabel?: string
  lat?: number
  lon?: number
  isCurrentLocation?: boolean
}

export default function OverpassSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState(25)
  const [limit, setLimit] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('quick')

  // Load trips and build location options on mount
  useEffect(() => {
    const loadTrips = async () => {
      try {
        const response = await trips.getAll()
        const tripData: Trip[] = response.data

        const options: LocationOption[] = []

        // Add trips with start/end locations
        tripData.forEach((trip) => {
          if (trip.start_location) {
            options.push({
              id: `trip-start-${trip.id}`,
              label: trip.name,
              sublabel: `Start: ${trip.start_location}`,
            })
          }
          if (trip.end_location && trip.end_location !== trip.start_location) {
            options.push({
              id: `trip-end-${trip.id}`,
              label: trip.name,
              sublabel: `End: ${trip.end_location}`,
            })
          }
        })

        setLocationOptions(options)
      } catch (err) {
        console.error('Failed to load trips:', err)
      }
    }

    loadTrips()
  }, [])

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      return
    }

    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ lat: latitude, lon: longitude })
        setGettingLocation(false)

        // Update query with current location
        const searchTerm = query.replace(/\s+near\s+.*/i, '').trim()
        if (searchTerm) {
          setQuery(`${searchTerm} near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        } else {
          setQuery(`near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        }
        setShowLocationPicker(false)
      },
      (err) => {
        setError(`Failed to get location: ${err.message}`)
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const selectLocation = (option: LocationOption) => {
    const searchTerm = query.replace(/\s+near\s+.*/i, '').trim()
    const locationText = option.sublabel?.replace(/^(Start|End): /, '') || option.label

    if (searchTerm) {
      setQuery(`${searchTerm} near ${locationText}`)
    } else {
      setQuery(`near ${locationText}`)
    }
    setShowLocationPicker(false)
  }

  // Parse coordinates from query string like "Car wash near 38.9972, -90.7444"
  const parseLocationFromQuery = (queryStr: string): { searchTerm: string; lat: number; lon: number } | null => {
    // Match "near lat, lon" or "near lat lon" patterns
    const match = queryStr.match(/(.+?)\s+near\s+(-?\d+\.?\d*)[,\s]+\s*(-?\d+\.?\d*)/i)
    if (match) {
      return {
        searchTerm: match[1].trim(),
        lat: parseFloat(match[2]),
        lon: parseFloat(match[3])
      }
    }
    return null
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError('')
    setResults(null)

    try {
      if (searchMode === 'quick') {
        // Quick search - use local database
        const parsed = parseLocationFromQuery(query)
        if (!parsed) {
          setError('Please include a location. Example: "Car wash near 38.9972, -90.7444" or use Pick Location.')
          setLoading(false)
          return
        }

        const response = await poiSearch.textSearch(
          parsed.searchTerm,
          parsed.lat,
          parsed.lon,
          radius,
          limit
        )
        setResults(response.data)
      } else {
        // Overpass Turbo mode - use external API
        const response = await overpassSearch.search(query, radius, limit)
        setResults(response.data)
      }
    } catch (err: any) {
      if (searchMode === 'quick') {
        setError(err.response?.data?.detail || 'Search failed. Try a different search term.')
      } else {
        setError(err.response?.data?.detail || 'Overpass API timeout. Try Quick Search mode or a smaller radius.')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadSuggestions = async () => {
    if (suggestions) {
      setShowSuggestions(!showSuggestions)
      return
    }

    try {
      const response = await overpassSearch.getSuggestions()
      setSuggestions(response.data)
      setShowSuggestions(true)
    } catch (err) {
      console.error('Failed to load suggestions:', err)
    }
  }

  const showOnMap = (result: SearchResult) => {
    sessionStorage.setItem('mapTarget', JSON.stringify({
      lat: result.latitude,
      lon: result.longitude,
      zoom: 16,
      poiData: {
        name: result.name,
        type: result.type
      }
    }))
    navigate('/map')
  }

  const openStreetView = (lat: number, lon: number) => {
    window.open(
      `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const openDirections = (lat: number, lon: number) => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <div className="overpass-search">
      <h1>POI Search</h1>
      <p className="subtitle">Find points of interest from our database or OpenStreetMap</p>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${searchMode === 'quick' ? 'active' : ''}`}
            onClick={() => setSearchMode('quick')}
          >
            Quick Search
          </button>
          <button
            type="button"
            className={`mode-btn ${searchMode === 'overpass' ? 'active' : ''}`}
            onClick={() => setSearchMode('overpass')}
          >
            Overpass Turbo
          </button>
        </div>
        <p className="mode-description">
          {searchMode === 'quick'
            ? 'Fast search of our cached POI database'
            : 'Comprehensive search using OpenStreetMap API (may be slow)'}
        </p>

        <div className="search-input-container">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchMode === 'quick'
              ? "e.g., Gas station near 38.9972, -90.7444"
              : "e.g., Covered bridges near Phoenixville, PA"}
            className="search-input"
          />
          <button type="submit" disabled={loading || !query.trim()} className="btn btn-primary">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="search-options">
          <div className="option">
            <label>Radius (miles):</label>
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              min={1}
              max={100}
            />
          </div>
          <div className="option">
            <label>Max results:</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min={10}
              max={500}
            />
          </div>
          <div className="location-picker-container">
            <button
              type="button"
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className="btn btn-secondary"
            >
              Pick Location
            </button>
            {showLocationPicker && (
              <div className="location-picker-dropdown">
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="location-option current-location"
                  disabled={gettingLocation}
                >
                  <span className="location-icon">📍</span>
                  <div className="location-text">
                    <span className="location-label">
                      {gettingLocation ? 'Getting location...' : 'Use Current Location'}
                    </span>
                    {currentLocation && (
                      <span className="location-sublabel">
                        {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
                      </span>
                    )}
                  </div>
                </button>

                {locationOptions.length > 0 && (
                  <>
                    <div className="location-divider">Trip Locations</div>
                    {locationOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectLocation(option)}
                        className="location-option"
                      >
                        <span className="location-icon">🗺️</span>
                        <div className="location-text">
                          <span className="location-label">{option.label}</span>
                          {option.sublabel && (
                            <span className="location-sublabel">{option.sublabel}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={loadSuggestions} className="btn btn-secondary">
            {showSuggestions ? 'Hide' : 'Show'} Search Ideas
          </button>
        </div>
      </form>

      {showSuggestions && suggestions && (
        <div className="suggestions-panel">
          <h3>Search Ideas</h3>
          <p className="tip">{suggestions.tip}</p>
          <div className="categories">
            {Object.entries(suggestions.categories).map(([category, terms]) => (
              <div key={category} className="category">
                <h4>{category}</h4>
                <div className="terms">
                  {terms.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(`${term} near `)}
                      className="term-btn"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {results && (
        <div className="results-section">
          <div className="results-header">
            <h2>Results</h2>
            <div className="results-meta">
              <span>Found {results.count} results</span>
              <span>for "{results.search_term}"</span>
              <span>near {results.location}</span>
              <span>({results.radius_miles} mi radius)</span>
            </div>
          </div>

          {results.count === 0 ? (
            <p className="no-results">No results found. Try a different search term or location.</p>
          ) : (
            <div className="results-grid">
              {results.results.map((result) => (
                <div key={`${result.type}-${result.id}`} className="result-card">
                  <div className="result-header">
                    <h3>{result.name}</h3>
                    <span className="result-type">{result.type}</span>
                  </div>

                  {result.address && (
                    <p className="result-address">{result.address}</p>
                  )}

                  {result.description && (
                    <p className="result-description">{result.description}</p>
                  )}

                  <div className="result-details">
                    {result.phone && (
                      <a href={`tel:${result.phone}`} className="detail-link">
                        {result.phone}
                      </a>
                    )}
                    {result.website && (
                      <a href={result.website} target="_blank" rel="noopener noreferrer" className="detail-link">
                        Website
                      </a>
                    )}
                    {result.opening_hours && (
                      <span className="detail-hours">{result.opening_hours}</span>
                    )}
                  </div>

                  <div className="result-actions">
                    <button onClick={() => showOnMap(result)} className="btn btn-sm btn-primary">
                      Show on Map
                    </button>
                    <button onClick={() => openStreetView(result.latitude, result.longitude)} className="btn btn-sm btn-secondary">
                      Street View
                    </button>
                    <button onClick={() => openDirections(result.latitude, result.longitude)} className="btn btn-sm btn-secondary">
                      Directions
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
}
