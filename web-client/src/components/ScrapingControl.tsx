import { useState, useEffect, useCallback } from 'react'
import { scraping } from '../services/api'

interface Category {
  id: string
  name: string
  description: string
}

interface CategoryStat {
  count: number
  last_updated: string | null
}

interface CrawlHistory {
  id: number
  crawl_type: string
  status: string
  target_region: string
  categories: string[]
  start_time: string | null
  end_time: string | null
  pois_fetched: number
  pois_saved: number
  errors_count: number
  current_cell: number
  total_cells: number
  progress_percentage: number
  notes: string | null
}

interface ActiveCrawl {
  id: number
  categories: string[]
  status: string
  progress: number
  current_state: string
  pois_saved: number
}

// Category icons
const CATEGORY_ICONS: Record<string, string> = {
  truck_stops: '🚛',
  dump_stations: '🚰',
  rest_areas: '🛣️',
  campgrounds: '⛺',
  national_parks: '🏞️',
  state_parks: '🌲',
  gas_stations: '⛽',
  overpass_heights: '🚧',
  railroad_crossings: '🚂',
  height_restrictions: '📏'
}

export default function ScrapingControl() {
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [categoryStats, setCategoryStats] = useState<Record<string, CategoryStat>>({})
  const [activeCrawl, setActiveCrawl] = useState<ActiveCrawl | null>(null)
  const [crawlHistory, setCrawlHistory] = useState<CrawlHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [categoriesRes, statusRes] = await Promise.all([
        scraping.getCategories(),
        scraping.getStatus()
      ])

      setCategories(categoriesRes.data.categories)
      setCategoryStats(statusRes.data.category_stats)
      setActiveCrawl(statusRes.data.active_crawl)
      setCrawlHistory(statusRes.data.crawl_history)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load scraping status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // Poll for updates when there's an active crawl
    const interval = setInterval(() => {
      if (activeCrawl) {
        loadData()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [loadData, activeCrawl])

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedCategories(new Set(categories.map(c => c.id)))
  }

  const selectNone = () => {
    setSelectedCategories(new Set())
  }

  const startCrawl = async () => {
    if (selectedCategories.size === 0) {
      setError('Please select at least one category to scrape')
      return
    }

    setStarting(true)
    setError(null)

    try {
      await scraping.startCrawl(Array.from(selectedCategories))
      setSelectedCategories(new Set())
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start crawl')
    } finally {
      setStarting(false)
    }
  }

  const stopCrawl = async () => {
    setStopping(true)
    setError(null)

    try {
      await scraping.stopCrawl()
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to stop crawl')
    } finally {
      setStopping(false)
    }
  }

  const deleteCrawlHistory = async (crawlId: number) => {
    try {
      await scraping.deleteHistory(crawlId)
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete crawl history')
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '-'
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date()
    const diff = endDate.getTime() - startDate.getTime()

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return '#3b82f6'
      case 'completed':
        return '#10b981'
      case 'failed':
        return '#ef4444'
      case 'rate_limited':
        return '#f59e0b'
      case 'stopped':
        return '#6b7280'
      default:
        return '#6b7280'
    }
  }

  if (loading) {
    return (
      <div className="card">
        <h2>Scraping Control</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading scraping status...
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Scraping Control</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Select categories to scrape from OpenStreetMap. Admin access required.
      </p>

      {error && (
        <div style={{
          padding: '10px 15px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '6px',
          color: '#ef4444',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {/* Active Crawl Status */}
      {activeCrawl && (
        <div style={{
          padding: '15px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#3b82f6' }}>
              {activeCrawl.status === 'rate_limited' ? '⏸️ Rate Limited' : '🔄 Crawl In Progress'}
            </h3>
            <button
              onClick={stopCrawl}
              disabled={stopping}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: stopping ? 'not-allowed' : 'pointer',
                opacity: stopping ? 0.6 : 1
              }}
            >
              {stopping ? 'Stopping...' : 'Stop Crawl'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Categories</div>
              <div style={{ fontWeight: 600 }}>
                {activeCrawl.categories.map(c => CATEGORY_ICONS[c] || '📍').join(' ')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current State</div>
              <div style={{ fontWeight: 600 }}>{activeCrawl.current_state || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>POIs Saved</div>
              <div style={{ fontWeight: 600 }}>{activeCrawl.pois_saved.toLocaleString()}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '10px' }}>
            <div style={{
              height: '8px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${activeCrawl.progress}%`,
                backgroundColor: '#3b82f6',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
              {activeCrawl.progress.toFixed(1)}% complete
            </div>
          </div>
        </div>
      )}

      {/* Category Selection */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>Select Categories</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={selectAll}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              onClick={selectNone}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '10px'
        }}>
          {categories.map(category => {
            const isSelected = selectedCategories.has(category.id)
            const stats = categoryStats[category.id]

            return (
              <div
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                style={{
                  padding: '12px',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>{CATEGORY_ICONS[category.id] || '📍'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{category.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {stats ? `${stats.count.toLocaleString()} items` : 'No data'}
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '18px' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                  {category.description}
                </div>
                {stats?.last_updated && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Last updated: {formatDate(stats.last_updated)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Start Button */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={startCrawl}
          disabled={starting || activeCrawl !== null || selectedCategories.size === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: selectedCategories.size > 0 && !activeCrawl ? '#10b981' : 'var(--bg-tertiary)',
            color: selectedCategories.size > 0 && !activeCrawl ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            cursor: starting || activeCrawl !== null || selectedCategories.size === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            width: '100%'
          }}
        >
          {starting
            ? 'Starting...'
            : activeCrawl
            ? 'Crawl in progress...'
            : selectedCategories.size === 0
            ? 'Select categories to start crawl'
            : `Start Crawl (${selectedCategories.size} ${selectedCategories.size === 1 ? 'category' : 'categories'})`
          }
        </button>
      </div>

      {/* Crawl History */}
      <div>
        <h3 style={{ marginBottom: '10px' }}>Crawl History</h3>
        {crawlHistory.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No crawl history yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {crawlHistory.map(crawl => (
              <div
                key={crawl.id}
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: getStatusColor(crawl.status),
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {crawl.status}
                    </span>
                    <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {crawl.target_region}
                    </span>
                  </div>
                  {crawl.status !== 'running' && crawl.status !== 'rate_limited' && (
                    <button
                      onClick={() => deleteCrawlHistory(crawl.id)}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'transparent',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {crawl.categories.map(cat => (
                    <span
                      key={cat}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        fontSize: '11px'
                      }}
                    >
                      {CATEGORY_ICONS[cat] || '📍'} {cat.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Started</div>
                    <div>{formatDate(crawl.start_time)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Duration</div>
                    <div>{formatDuration(crawl.start_time, crawl.end_time)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>POIs Saved</div>
                    <div style={{ color: '#10b981', fontWeight: 600 }}>
                      {(crawl.pois_saved || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Errors</div>
                    <div style={{ color: crawl.errors_count > 0 ? '#ef4444' : 'inherit' }}>
                      {crawl.errors_count || 0}
                    </div>
                  </div>
                </div>

                {crawl.notes && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {crawl.notes}
                  </div>
                )}

                {crawl.progress_percentage > 0 && crawl.progress_percentage < 100 && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{
                      height: '4px',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${crawl.progress_percentage}%`,
                        backgroundColor: getStatusColor(crawl.status)
                      }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
