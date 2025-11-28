import { useState, useEffect, useCallback } from 'react'
import './SerializationManager.css'

interface SerializedItem {
  serial: string
  name: string
  category: string | null
  brand: string | null
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  is_verified: boolean
  is_blacklisted: boolean
  source: string | null
  created_at: string | null
  updated_at: string | null
  google_maps_url: string | null
}

interface SerializationStats {
  total_serialized: number
  missing_serials: number
  active: number
  blacklisted: number
  verified: number
  by_category: Record<string, number>
  by_state: Record<string, number>
  by_brand: Record<string, number>
}

interface SearchResult {
  items: SerializedItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const API_BASE = '/api/serialization'

export default function SerializationManager() {
  const [stats, setStats] = useState<SerializationStats | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterState, setFilterState] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Selected item for detail view
  const [selectedItem, setSelectedItem] = useState<SerializedItem | null>(null)
  const [updatingFlags, setUpdatingFlags] = useState(false)

  // Filter options
  const [categories, setCategories] = useState<{category: string, count: number}[]>([])
  const [states, setStates] = useState<{state: string, count: number}[]>([])

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token')
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`, {
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error('Failed to load stats')
      const data = await response.json()
      setStats(data)
    } catch (err: any) {
      console.error('Failed to load stats:', err)
    }
  }, [])

  const loadFilterOptions = useCallback(async () => {
    try {
      const [catRes, stateRes] = await Promise.all([
        fetch(`${API_BASE}/categories`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/states`, { headers: getAuthHeaders() })
      ])
      if (catRes.ok) setCategories(await catRes.json())
      if (stateRes.ok) setStates(await stateRes.json())
    } catch (err) {
      console.error('Failed to load filter options:', err)
    }
  }, [])

  const searchItems = useCallback(async (page: number = 1) => {
    setSearching(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.append('q', searchQuery)
      if (filterCategory) params.append('category', filterCategory)
      if (filterState) params.append('state', filterState)
      if (filterStatus) params.append('status', filterStatus)
      params.append('page', page.toString())
      params.append('page_size', '25')

      const response = await fetch(`${API_BASE}/search?${params}`, {
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      setSearchResults(data)
      setCurrentPage(page)
    } catch (err: any) {
      setError(err.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [searchQuery, filterCategory, filterState, filterStatus])

  const updateItemFlags = async (serial: string, flags: {
    is_active?: boolean
    is_verified?: boolean
    is_blacklisted?: boolean
  }) => {
    setUpdatingFlags(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/item/${serial}/flags`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(flags)
      })
      if (!response.ok) throw new Error('Failed to update flags')
      const data = await response.json()
      setSuccess(`Updated flags for ${serial}`)

      // Update local state
      if (selectedItem && selectedItem.serial === serial) {
        setSelectedItem({
          ...selectedItem,
          is_active: data.is_active,
          is_verified: data.is_verified,
          is_blacklisted: data.is_blacklisted
        })
      }

      // Refresh search results
      await searchItems(currentPage)
      await loadStats()

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update flags')
    } finally {
      setUpdatingFlags(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([loadStats(), loadFilterOptions()])
      await searchItems(1)
      setLoading(false)
    }
    init()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    searchItems(1)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  if (loading) {
    return <div className="serial-manager-loading">Loading serialization data...</div>
  }

  return (
    <div className="serial-manager">
      <div className="serial-header">
        <h2>Serialization Manager</h2>
        <p className="serial-subtitle">
          View and manage serialized items. Serial numbers are immutable and cannot be changed or deleted.
        </p>
      </div>

      {error && (
        <div className="serial-alert error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {success && (
        <div className="serial-alert success">
          {success}
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="serial-stats">
          <div className="stat-card">
            <span className="stat-value">{stats.total_serialized.toLocaleString()}</span>
            <span className="stat-label">Total Serialized</span>
          </div>
          <div className="stat-card active">
            <span className="stat-value">{stats.active.toLocaleString()}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-card verified">
            <span className="stat-value">{stats.verified.toLocaleString()}</span>
            <span className="stat-label">Verified</span>
          </div>
          <div className="stat-card blacklisted">
            <span className="stat-value">{stats.blacklisted.toLocaleString()}</span>
            <span className="stat-label">Blacklisted</span>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="serial-search-section">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by serial, name, or brand..."
            className="search-input"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.count})
              </option>
            ))}
          </select>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="filter-select"
          >
            <option value="">All States</option>
            {states.map(s => (
              <option key={s.state} value={s.state}>
                {s.state} ({s.count})
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blacklisted">Blacklisted</option>
            <option value="unverified">Unverified</option>
          </select>
          <button type="submit" className="btn-search" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Results Table */}
      {searchResults && (
        <div className="serial-results">
          <div className="results-header">
            <span>{searchResults.total.toLocaleString()} items found</span>
            <span>Page {searchResults.page} of {searchResults.total_pages}</span>
          </div>

          <table className="serial-table">
            <thead>
              <tr>
                <th>Serial</th>
                <th>Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.items.map(item => (
                <tr key={item.serial} className={item.is_blacklisted ? 'blacklisted' : ''}>
                  <td className="serial-cell" title={item.serial}>
                    {item.serial.substring(0, 20)}...
                  </td>
                  <td>{item.name}</td>
                  <td>{item.brand || '-'}</td>
                  <td>{item.category || '-'}</td>
                  <td>{item.city ? `${item.city}, ${item.state}` : item.state || '-'}</td>
                  <td className="status-cell">
                    {item.is_blacklisted && <span className="badge blacklisted">Blacklisted</span>}
                    {item.is_verified && <span className="badge verified">Verified</span>}
                    {!item.is_active && <span className="badge inactive">Inactive</span>}
                    {item.is_active && !item.is_blacklisted && !item.is_verified && (
                      <span className="badge active">Active</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="btn-action"
                      title="View Details"
                    >
                      View
                    </button>
                    {item.google_maps_url && (
                      <a
                        href={item.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-action maps"
                        title="Open in Google Maps"
                      >
                        Map
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination">
            <button
              onClick={() => searchItems(currentPage - 1)}
              disabled={currentPage <= 1 || searching}
            >
              Previous
            </button>
            <span>Page {currentPage} of {searchResults.total_pages}</span>
            <button
              onClick={() => searchItems(currentPage + 1)}
              disabled={currentPage >= searchResults.total_pages || searching}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Item Details</h3>
              <button onClick={() => setSelectedItem(null)} className="modal-close">×</button>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h4>Serial Number (Immutable)</h4>
                <code className="serial-display">{selectedItem.serial}</code>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <label>Name</label>
                  <span>{selectedItem.name}</span>
                </div>
                <div className="detail-item">
                  <label>Brand</label>
                  <span>{selectedItem.brand || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Category</label>
                  <span>{selectedItem.category || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Location</label>
                  <span>
                    {selectedItem.city ? `${selectedItem.city}, ` : ''}
                    {selectedItem.state || '-'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Coordinates</label>
                  <span>
                    {selectedItem.latitude && selectedItem.longitude
                      ? `${selectedItem.latitude.toFixed(4)}, ${selectedItem.longitude.toFixed(4)}`
                      : '-'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Source</label>
                  <span>{selectedItem.source || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Created</label>
                  <span>{formatDate(selectedItem.created_at)}</span>
                </div>
                <div className="detail-item">
                  <label>Updated</label>
                  <span>{formatDate(selectedItem.updated_at)}</span>
                </div>
              </div>

              {/* Status Flags */}
              <div className="flags-section">
                <h4>Status Flags</h4>
                <div className="flag-controls">
                  <label className="flag-toggle">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_active}
                      onChange={(e) => updateItemFlags(selectedItem.serial, { is_active: e.target.checked })}
                      disabled={updatingFlags}
                    />
                    <span>Active</span>
                  </label>
                  <label className="flag-toggle">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_verified}
                      onChange={(e) => updateItemFlags(selectedItem.serial, { is_verified: e.target.checked })}
                      disabled={updatingFlags}
                    />
                    <span>Verified</span>
                  </label>
                  <label className="flag-toggle blacklist">
                    <input
                      type="checkbox"
                      checked={selectedItem.is_blacklisted}
                      onChange={(e) => updateItemFlags(selectedItem.serial, { is_blacklisted: e.target.checked })}
                      disabled={updatingFlags}
                    />
                    <span>Blacklisted</span>
                  </label>
                </div>
                <p className="flag-note">
                  Note: Serial numbers cannot be modified or deleted. Only status flags can be changed.
                </p>
              </div>

              {selectedItem.google_maps_url && (
                <div className="maps-link">
                  <a
                    href={selectedItem.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-maps"
                  >
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
