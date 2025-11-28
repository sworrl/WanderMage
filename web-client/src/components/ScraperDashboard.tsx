import { useState, useEffect, useCallback } from 'react'
import { scraperDashboard, settings } from '../services/api'
import './ScraperDashboard.css'

interface ScraperConfig {
  categories?: string[]
  states?: string[]
}

interface ScraperStatus {
  id: number
  scraper_type: string
  display_name: string
  description: string
  icon: string
  status: string
  is_enabled: boolean
  current_activity: string | null
  current_detail: string | null
  current_region: string | null
  current_category: string | null
  intelligent_status: string
  progress_percentage: number
  items_processed: number
  items_found: number
  items_saved: number
  items_updated: number
  current_segment: number
  total_segments: number
  segment_name: string | null
  started_at: string | null
  last_activity_at: string | null
  elapsed_seconds: number
  avg_items_per_minute: number
  errors_count: number
  last_error: string | null
  health_status: string
  last_item_name: string | null
  last_item_location: string | null
  last_item_details: any
  total_runs: number
  total_items_collected: number
  last_successful_run: string | null
  is_stale: boolean
  config: ScraperConfig | null
}

interface DashboardSummary {
  total: number
  running: number
  idle: number
  failed: number
  any_running: boolean
}

interface POICategory {
  id: string
  name: string
  icon: string
  description: string
}

interface USState {
  code: string
  name: string
}

export default function ScraperDashboard() {
  const [scrapers, setScrapers] = useState<ScraperStatus[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // POI configuration state
  const [showPOIConfig, setShowPOIConfig] = useState(false)
  const [poiCategories, setPOICategories] = useState<POICategory[]>([])
  const [usStates, setUSStates] = useState<USState[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set())

  // Harvest Hosts configuration state
  const [showHHConfig, setShowHHConfig] = useState(false)
  const [hhEmail, setHHEmail] = useState('')
  const [hhPassword, setHHPassword] = useState('')
  const [hhScrapeHosts, setHHScrapeHosts] = useState(false)  // Default to false - hosts POI scraper not working yet
  const [hhScrapeStays, setHHScrapeStays] = useState(true)
  const [hhCredentialsConfigured, setHHCredentialsConfigured] = useState(false)

  // EIA API key state
  const [eiaKeyConfigured, setEiaKeyConfigured] = useState(true)  // Default to true to avoid flash

  const loadData = useCallback(async () => {
    try {
      const response = await scraperDashboard.getAllStatus()
      setScrapers(response.data.scrapers)
      setSummary(response.data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load scraper status')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPOIOptions = useCallback(async () => {
    try {
      const response = await scraperDashboard.getPOIOptions()
      setPOICategories(response.data.categories)
      setUSStates(response.data.states)
    } catch (err: any) {
      console.error('Failed to load POI options:', err)
    }
  }, [])

  const checkHHCredentials = useCallback(async () => {
    try {
      const response = await settings.getHHCredentialsStatus()
      setHHCredentialsConfigured(response.data.configured)
    } catch (err: any) {
      console.error('Failed to check HH credentials:', err)
    }
  }, [])

  const checkEiaKeyStatus = useCallback(async () => {
    try {
      const response = await settings.getEiaApiKeyStatus()
      setEiaKeyConfigured(response.data.configured)
    } catch (err: any) {
      console.error('Failed to check EIA key status:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
    loadPOIOptions()
    checkHHCredentials()
    checkEiaKeyStatus()

    // Poll for updates every 3 seconds
    const interval = setInterval(loadData, 3000)

    return () => clearInterval(interval)
  }, [loadData, loadPOIOptions, checkHHCredentials, checkEiaKeyStatus])

  const handleStartPOI = async () => {
    setActionInProgress('poi_crawler')
    try {
      const config = {
        categories: selectedCategories.size > 0 ? Array.from(selectedCategories) : [],
        states: selectedStates.size > 0 ? Array.from(selectedStates) : []
      }
      await scraperDashboard.start('poi_crawler', config)
      setShowPOIConfig(false)
      setSelectedCategories(new Set())
      setSelectedStates(new Set())
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start POI crawler')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStartHH = async (useStoredCredentials: boolean = false) => {
    // If using stored credentials, just start with default config (hosts=false, stays=true)
    if (useStoredCredentials) {
      setActionInProgress('harvest_hosts')
      try {
        await scraperDashboard.start('harvest_hosts', {
          scrape_hosts: false,  // Hosts POI scraper not working yet
          scrape_stays: true    // Stays scraper works
        })
        await loadData()
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to start Harvest Hosts scraper')
      } finally {
        setActionInProgress(null)
      }
      return
    }

    // Using provided credentials from modal
    if (!hhEmail || !hhPassword) {
      setError('Email and password are required for Harvest Hosts')
      return
    }

    setActionInProgress('harvest_hosts')
    try {
      const config = {
        hh_email: hhEmail,
        hh_password: hhPassword,
        scrape_hosts: hhScrapeHosts,
        scrape_stays: hhScrapeStays
      }
      await scraperDashboard.start('harvest_hosts', config)
      setShowHHConfig(false)
      setHHPassword('') // Clear password for security
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start Harvest Hosts scraper')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStart = async (scraperType: string) => {
    if (scraperType === 'poi_crawler') {
      setShowPOIConfig(true)
      return
    }

    if (scraperType === 'harvest_hosts') {
      // If credentials are configured, start directly
      if (hhCredentialsConfigured) {
        handleStartHH(true)  // Use stored credentials, scrape_hosts=false, scrape_stays=true (from defaults)
      } else {
        setShowHHConfig(true)
      }
      return
    }

    setActionInProgress(scraperType)
    try {
      await scraperDashboard.start(scraperType)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to start ${scraperType}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStop = async (scraperType: string) => {
    setActionInProgress(scraperType)
    try {
      await scraperDashboard.stop(scraperType)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to stop ${scraperType}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReset = async (scraperType: string) => {
    setActionInProgress(scraperType)
    try {
      await scraperDashboard.reset(scraperType)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to reset ${scraperType}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const toggleCategory = (catId: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(catId)) {
        next.delete(catId)
      } else {
        next.add(catId)
      }
      return next
    })
  }

  const toggleState = (stateCode: string) => {
    setSelectedStates(prev => {
      const next = new Set(prev)
      if (next.has(stateCode)) {
        next.delete(stateCode)
      } else {
        next.add(stateCode)
      }
      return next
    })
  }

  const selectAllCategories = () => {
    setSelectedCategories(new Set(poiCategories.map(c => c.id)))
  }

  const selectNoCategories = () => {
    setSelectedCategories(new Set())
  }

  const selectAllStates = () => {
    setSelectedStates(new Set(usStates.map(s => s.code)))
  }

  const selectNoStates = () => {
    setSelectedStates(new Set())
  }

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running':
        return '#10b981'
      case 'completed':
        return '#3b82f6'
      case 'idle':
        return '#6b7280'
      case 'failed':
        return '#ef4444'
      case 'paused':
        return '#f59e0b'
      default:
        return '#6b7280'
    }
  }

  const getHealthColor = (health: string): string => {
    switch (health) {
      case 'healthy':
        return '#10b981'
      case 'degraded':
        return '#f59e0b'
      case 'warning':
        return '#f97316'
      case 'critical':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  if (loading) {
    return (
      <div className="scraper-dashboard">
        <h2>Scraper Dashboard</h2>
        <div className="dashboard-loading">
          Loading scraper status...
        </div>
      </div>
    )
  }

  return (
    <div className="scraper-dashboard">
      <div className="dashboard-header">
        <h2>Scraper Dashboard</h2>
        <p className="dashboard-subtitle">
          Unified control and monitoring for all data collection processes
        </p>
      </div>

      {error && (
        <div className="dashboard-error">
          {error}
          <button onClick={() => setError(null)} className="error-dismiss">×</button>
        </div>
      )}

      {/* Summary Stats */}
      {summary && (
        <div className="dashboard-summary">
          <div className="summary-stat">
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">Total Scrapers</span>
          </div>
          <div className="summary-stat running">
            <span className="stat-value">{summary.running}</span>
            <span className="stat-label">Running</span>
          </div>
          <div className="summary-stat idle">
            <span className="stat-value">{summary.idle}</span>
            <span className="stat-label">Idle</span>
          </div>
          <div className="summary-stat failed">
            <span className="stat-value">{summary.failed}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>
      )}

      {/* POI Configuration Modal */}
      {showPOIConfig && (
        <div className="modal-overlay" onClick={() => setShowPOIConfig(false)}>
          <div className="poi-config-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Configure POI Crawler</h3>
              <button onClick={() => setShowPOIConfig(false)} className="modal-close">×</button>
            </div>

            <div className="modal-body">
              {/* Category Selection */}
              <div className="selection-section">
                <div className="section-header">
                  <h4>Categories</h4>
                  <div className="selection-actions">
                    <button onClick={selectAllCategories} className="select-btn">All</button>
                    <button onClick={selectNoCategories} className="select-btn">None</button>
                  </div>
                </div>
                <p className="selection-hint">
                  {selectedCategories.size === 0 ? 'All categories will be scraped' : `${selectedCategories.size} selected`}
                </p>
                <div className="category-grid">
                  {poiCategories.map(cat => (
                    <div
                      key={cat.id}
                      className={`category-item ${selectedCategories.has(cat.id) ? 'selected' : ''}`}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <span className="cat-icon">{cat.icon}</span>
                      <span className="cat-name">{cat.name}</span>
                      {selectedCategories.has(cat.id) && <span className="check-mark">✓</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* State Selection */}
              <div className="selection-section">
                <div className="section-header">
                  <h4>States</h4>
                  <div className="selection-actions">
                    <button onClick={selectAllStates} className="select-btn">All</button>
                    <button onClick={selectNoStates} className="select-btn">None</button>
                  </div>
                </div>
                <p className="selection-hint">
                  {selectedStates.size === 0 ? 'All states will be scraped' : `${selectedStates.size} selected`}
                </p>
                <div className="state-grid">
                  {usStates.map(state => (
                    <div
                      key={state.code}
                      className={`state-item ${selectedStates.has(state.code) ? 'selected' : ''}`}
                      onClick={() => toggleState(state.code)}
                    >
                      <span className="state-code">{state.code}</span>
                      {selectedStates.has(state.code) && <span className="check-mark">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowPOIConfig(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleStartPOI}
                disabled={actionInProgress === 'poi_crawler'}
                className="btn btn-start"
              >
                {actionInProgress === 'poi_crawler' ? 'Starting...' : 'Start POI Crawler'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Harvest Hosts Configuration Modal */}
      {showHHConfig && (
        <div className="modal-overlay" onClick={() => setShowHHConfig(false)}>
          <div className="hh-config-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Harvest Hosts Login</h3>
              <button onClick={() => setShowHHConfig(false)} className="modal-close">&times;</button>
            </div>

            <div className="modal-body">
              <p className="hh-description">
                Enter your Harvest Hosts membership credentials to scrape the host database.
                Your password is not stored and is only used for this session.
              </p>

              <div className="hh-form">
                <div className="form-group">
                  <label htmlFor="hh-email">Email</label>
                  <input
                    id="hh-email"
                    type="email"
                    value={hhEmail}
                    onChange={e => setHHEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="hh-password">Password</label>
                  <input
                    id="hh-password"
                    type="password"
                    value={hhPassword}
                    onChange={e => setHHPassword(e.target.value)}
                    placeholder="Your password"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={hhScrapeHosts}
                      onChange={e => setHHScrapeHosts(e.target.checked)}
                    />
                    Scrape all hosts
                  </label>
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={hhScrapeStays}
                      onChange={e => setHHScrapeStays(e.target.checked)}
                    />
                    Sync my stays history
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowHHConfig(false)} className="btn btn-cancel">
                Cancel
              </button>
              <button
                onClick={handleStartHH}
                disabled={actionInProgress === 'harvest_hosts' || !hhEmail || !hhPassword}
                className="btn btn-start-crawl"
              >
                {actionInProgress === 'harvest_hosts' ? 'Starting...' : 'Start Scraper'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scraper Cards - Group HH scrapers together */}
      <div className="scraper-grid">
        {/* Regular scrapers (non-HH) */}
        {scrapers.filter(s => !s.scraper_type.startsWith('hh_')).map((scraper) => (
          <div
            key={scraper.scraper_type}
            className={`scraper-card ${scraper.status} ${scraper.is_stale ? 'stale' : ''}`}
          >
            {/* Card Header */}
            <div className="scraper-header">
              <div className="scraper-title">
                <span className="scraper-icon">{scraper.icon}</span>
                <div>
                  <h3>{scraper.display_name}</h3>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(scraper.status) }}
                  >
                    {scraper.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div
                className="health-indicator"
                style={{ backgroundColor: getHealthColor(scraper.health_status) }}
                title={`Health: ${scraper.health_status}`}
              />
            </div>

            {/* Intelligent Status */}
            <div className="intelligent-status">
              {scraper.status === 'running' && (
                <span className="live-pulse" />
              )}
              {scraper.intelligent_status}
            </div>

            {/* Current Activity Details */}
            {scraper.status === 'running' && (
              <div className="activity-details">
                {scraper.current_activity && (
                  <div className="activity-line">
                    <span className="activity-label">Activity:</span>
                    <span className="activity-value">{scraper.current_activity}</span>
                  </div>
                )}
                {scraper.current_category && (
                  <div className="activity-line">
                    <span className="activity-label">Categories:</span>
                    <span className="activity-value category-highlight">{scraper.current_category}</span>
                  </div>
                )}
                {scraper.current_region && (
                  <div className="activity-line">
                    <span className="activity-label">States:</span>
                    <span className="activity-value region-highlight">{scraper.current_region}</span>
                  </div>
                )}
                {scraper.current_detail && (
                  <div className="activity-line detail">
                    <span className="activity-value">{scraper.current_detail}</span>
                  </div>
                )}
                {scraper.last_item_name && (
                  <div className="activity-line last-item">
                    <span className="activity-label">Last Found:</span>
                    <span className="activity-value">
                      {scraper.last_item_name}
                      {scraper.last_item_location && (
                        <span className="item-location"> ({scraper.last_item_location})</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Progress Bar */}
            {scraper.total_segments > 0 && (
              <div className="progress-section">
                <div className="progress-header">
                  <span>Progress</span>
                  <span>{scraper.progress_percentage.toFixed(1)}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${scraper.progress_percentage}%`,
                      backgroundColor: getStatusColor(scraper.status)
                    }}
                  />
                </div>
                {scraper.segment_name && (
                  <div className="segment-info">
                    {scraper.segment_name} ({scraper.current_segment}/{scraper.total_segments})
                  </div>
                )}
              </div>
            )}

            {/* Scan Configuration (when running POI crawler) */}
            {scraper.status === 'running' && scraper.scraper_type === 'poi_crawler' && scraper.config && (
              <div className="scan-config">
                <div className="config-item">
                  <span className="config-label">Categories:</span>
                  <span className="config-value">
                    {scraper.config.categories && scraper.config.categories.length > 0
                      ? scraper.config.categories.length <= 5
                        ? scraper.config.categories.join(', ')
                        : `${scraper.config.categories.length} selected`
                      : 'All'}
                  </span>
                </div>
                <div className="config-item">
                  <span className="config-label">States:</span>
                  <span className="config-value">
                    {scraper.config.states && scraper.config.states.length > 0
                      ? scraper.config.states.length <= 8
                        ? scraper.config.states.join(', ')
                        : `${scraper.config.states.length} states`
                      : 'All'}
                  </span>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="scraper-stats">
              <div className="stat-item">
                <span className="stat-label">Found</span>
                <span className="stat-value">{scraper.items_found.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">New</span>
                <span className="stat-value">{scraper.items_saved.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Updated</span>
                <span className="stat-value">{(scraper.items_updated || 0).toLocaleString()}</span>
              </div>
              {scraper.status === 'running' && scraper.avg_items_per_minute > 0 && (
                <div className="stat-item">
                  <span className="stat-label">Rate</span>
                  <span className="stat-value">{scraper.avg_items_per_minute.toFixed(1)}/min</span>
                </div>
              )}
              {scraper.status === 'running' && scraper.elapsed_seconds > 0 && (
                <div className="stat-item">
                  <span className="stat-label">Elapsed</span>
                  <span className="stat-value">{formatDuration(scraper.elapsed_seconds)}</span>
                </div>
              )}
              {scraper.errors_count > 0 && (
                <div className="stat-item errors">
                  <span className="stat-label">Errors</span>
                  <span className="stat-value">{scraper.errors_count}</span>
                </div>
              )}
            </div>

            {/* Historical Stats */}
            <div className="historical-stats">
              <div className="hist-stat">
                <span>Total Runs:</span>
                <strong>{scraper.total_runs}</strong>
              </div>
              <div className="hist-stat">
                <span>Total Collected:</span>
                <strong>{scraper.total_items_collected.toLocaleString()}</strong>
              </div>
              {scraper.last_successful_run && (
                <div className="hist-stat">
                  <span>Last Success:</span>
                  <strong>{formatDate(scraper.last_successful_run)}</strong>
                </div>
              )}
            </div>

            {/* Error Display */}
            {scraper.last_error && scraper.status === 'failed' && (
              <div className="error-display">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{scraper.last_error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="scraper-actions">
              {scraper.status === 'running' ? (
                <button
                  onClick={() => handleStop(scraper.scraper_type)}
                  disabled={actionInProgress === scraper.scraper_type}
                  className="btn btn-stop"
                >
                  {actionInProgress === scraper.scraper_type ? 'Stopping...' : 'Stop'}
                </button>
              ) : (
                <button
                  onClick={() => handleStart(scraper.scraper_type)}
                  disabled={actionInProgress === scraper.scraper_type || !scraper.is_enabled}
                  className="btn btn-start"
                >
                  {actionInProgress === scraper.scraper_type ? 'Starting...' : 'Start'}
                </button>
              )}
              {(scraper.status === 'failed' || scraper.is_stale) && (
                <button
                  onClick={() => handleReset(scraper.scraper_type)}
                  disabled={actionInProgress === scraper.scraper_type}
                  className="btn btn-reset"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Description */}
            <div className="scraper-description">
              {scraper.description}
              {/* EIA API signup link for fuel prices scraper - only show if not configured */}
              {scraper.scraper_type === 'fuel_prices' && !eiaKeyConfigured && (
                <div className="api-signup-link">
                  <a
                    href="https://www.eia.gov/opendata/register.php"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get free EIA API key →
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Harvest Hosts Group */}
        {scrapers.some(s => s.scraper_type.startsWith('hh_')) && (
          <div className="scraper-group harvest-hosts-group">
            <div className="group-header">
              <span className="group-icon">🏡</span>
              <h3>Harvest Hosts</h3>
              <span className="group-badge">Membership Required</span>
            </div>
            <div className="group-scrapers">
              {scrapers.filter(s => s.scraper_type.startsWith('hh_')).map((scraper) => (
                <div
                  key={scraper.scraper_type}
                  className={`scraper-card mini ${scraper.status} ${scraper.is_stale ? 'stale' : ''} ${scraper.scraper_type === 'hh_hosts_database' ? 'out-of-order' : ''}`}
                >
                  {/* Out of Order Sticker for HH Hosts */}
                  {scraper.scraper_type === 'hh_hosts_database' && (
                    <div className="out-of-order-overlay">
                      <div className="out-of-order-sticker">
                        <span className="sticker-tape top"></span>
                        <div className="sticker-content">
                          <span className="sticker-icon">🔧</span>
                          <span className="sticker-text">OUT OF ORDER</span>
                          <span className="sticker-subtext">Gremlins in the code!</span>
                        </div>
                        <span className="sticker-tape bottom"></span>
                      </div>
                    </div>
                  )}

                  {/* Card Header */}
                  <div className="scraper-header">
                    <div className="scraper-title">
                      <span className="scraper-icon">{scraper.icon}</span>
                      <div>
                        <h3>{scraper.display_name}</h3>
                        <span
                          className="status-badge"
                          style={{ backgroundColor: scraper.scraper_type === 'hh_hosts_database' ? '#6b7280' : getStatusColor(scraper.status) }}
                        >
                          {scraper.scraper_type === 'hh_hosts_database' ? 'COMING SOON' : scraper.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div
                      className="health-indicator"
                      style={{ backgroundColor: getHealthColor(scraper.health_status) }}
                      title={`Health: ${scraper.health_status}`}
                    />
                  </div>

                  {/* Intelligent Status */}
                  <div className="intelligent-status">
                    {scraper.status === 'running' && scraper.scraper_type !== 'hh_hosts_database' && (
                      <span className="live-pulse" />
                    )}
                    {scraper.scraper_type === 'hh_hosts_database'
                      ? 'Under construction - check back soon!'
                      : scraper.intelligent_status}
                  </div>

                  {/* Activity Details (only for working scrapers) */}
                  {scraper.status === 'running' && scraper.scraper_type !== 'hh_hosts_database' && (
                    <div className="activity-details">
                      {scraper.current_activity && (
                        <div className="activity-line">
                          <span className="activity-label">Activity:</span>
                          <span className="activity-value">{scraper.current_activity}</span>
                        </div>
                      )}
                      {scraper.last_item_name && (
                        <div className="activity-line last-item">
                          <span className="activity-label">Last:</span>
                          <span className="activity-value">{scraper.last_item_name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="scraper-stats compact">
                    <div className="stat-item">
                      <span className="stat-label">Found</span>
                      <span className="stat-value">{scraper.items_found.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Saved</span>
                      <span className="stat-value">{scraper.items_saved.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="scraper-actions">
                    {scraper.scraper_type === 'hh_hosts_database' ? (
                      <button className="btn btn-disabled" disabled title="Coming soon!">
                        Not Ready Yet
                      </button>
                    ) : scraper.status === 'running' ? (
                      <button
                        onClick={() => handleStop(scraper.scraper_type)}
                        disabled={actionInProgress === scraper.scraper_type}
                        className="btn btn-stop"
                      >
                        {actionInProgress === scraper.scraper_type ? 'Stopping...' : 'Stop'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(scraper.scraper_type)}
                        disabled={actionInProgress === scraper.scraper_type || !scraper.is_enabled}
                        className="btn btn-start"
                      >
                        {actionInProgress === scraper.scraper_type ? 'Starting...' : 'Start'}
                      </button>
                    )}
                    {(scraper.status === 'failed' || scraper.is_stale) && scraper.scraper_type !== 'hh_hosts_database' && (
                      <button
                        onClick={() => handleReset(scraper.scraper_type)}
                        disabled={actionInProgress === scraper.scraper_type}
                        className="btn btn-reset"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Description */}
                  <div className="scraper-description">
                    {scraper.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
