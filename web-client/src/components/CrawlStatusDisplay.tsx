import { useEffect, useState } from 'react';
import axios from 'axios';
import { safeStorage } from '../utils/storage';
import './CrawlStatusDisplay.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface CrawlStatus {
  id: number;
  crawl_type: string;
  target_region: string | null;
  status: string;
  current_state: string | null;
  current_cell: number;
  total_cells: number;
  states_completed: number;
  total_states: number;
  pois_fetched: number;
  pois_saved: number;
  start_time: string;
  end_time: string | null;
  last_update: string;
  estimated_completion: string | null;
  errors_count: number;
  last_error: string | null;
  rate_limit_hits: number;
  categories: string | null;
  notes: string | null;
  progress_percentage: number;
  elapsed_time_seconds: number;
  avg_time_per_cell: number;
  estimated_time_remaining_seconds: number;
  total_pois_in_db?: number;
  pois_by_category?: Record<string, number>;
}

export default function CrawlStatusDisplay() {
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const [prevCrawlStatus, setPrevCrawlStatus] = useState<CrawlStatus | null>(null);
  const [initialTotalPois, setInitialTotalPois] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = safeStorage.getItem('token');
        const response = await axios.get(`${API_URL}/crawl-status/current`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Store previous status for trend calculation
        if (crawlStatus) {
          setPrevCrawlStatus(crawlStatus);
        }

        // Store initial total POIs when crawl starts
        if (!initialTotalPois && response.data.total_pois_in_db) {
          setInitialTotalPois(response.data.total_pois_in_db);
        }

        setCrawlStatus(response.data);
        setError(null);
      } catch (err: any) {
        if (err.response?.status !== 404) {
          setError('Failed to fetch crawl status');
        } else {
          setCrawlStatus(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Poll for updates every 3 seconds if there's an active crawl
    const interval = setInterval(() => {
      if (crawlStatus?.status === 'running' || crawlStatus?.status === 'paused') {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [crawlStatus?.status]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running':
        return '#4caf50';
      case 'completed':
        return '#2196f3';
      case 'failed':
        return '#f44336';
      case 'paused':
        return '#ff9800';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'running':
        return '⚡';
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'paused':
        return '⏸';
      default:
        return '○';
    }
  };

  const getTrendIndicator = (current: number, previous: number | undefined): JSX.Element | null => {
    if (!previous || previous === current) {
      return null;
    }

    if (current > previous) {
      return <span style={{ color: '#4caf50', marginLeft: '5px', fontSize: '14px' }}>↗</span>;
    } else if (current < previous) {
      return <span style={{ color: '#f44336', marginLeft: '5px', fontSize: '14px' }}>↘</span>;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="crawl-status-container">
        <div className="loading">Loading crawl status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crawl-status-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!crawlStatus) {
    return (
      <div className="crawl-status-container">
        <div className="no-crawl">
          <h3>No Active POI Crawl</h3>
          <p>There is currently no active POI crawl running.</p>
        </div>
      </div>
    );
  }

  // Calculate additional metrics
  const cellsPerMinute = crawlStatus.elapsed_time_seconds > 0
    ? (crawlStatus.current_cell / crawlStatus.elapsed_time_seconds) * 60
    : 0;

  const poisPerMinute = crawlStatus.elapsed_time_seconds > 0
    ? (crawlStatus.pois_saved / crawlStatus.elapsed_time_seconds) * 60
    : 0;

  const avgPoisPerCell = crawlStatus.current_cell > 0
    ? crawlStatus.pois_saved / crawlStatus.current_cell
    : 0;

  const successRate = crawlStatus.current_cell > 0
    ? ((crawlStatus.current_cell - crawlStatus.errors_count) / crawlStatus.current_cell) * 100
    : 100;

  const stateProgress = crawlStatus.total_states > 0
    ? ((crawlStatus.states_completed / crawlStatus.total_states) * 100).toFixed(1)
    : '0.0';

  // Calculate POIs Updated (increase in total DB POIs since crawl started)
  const poisUpdated = (crawlStatus.total_pois_in_db && initialTotalPois)
    ? crawlStatus.total_pois_in_db - initialTotalPois
    : 0;

  return (
    <div className="crawl-status-container">
      <div className="crawl-status-card">
        <div className="status-header">
          <h2>
            <span className="status-icon" style={{ color: getStatusColor(crawlStatus.status) }}>
              {getStatusIcon(crawlStatus.status)}
            </span>
            POI Crawl Status
          </h2>
          <div className="status-badge" style={{ backgroundColor: getStatusColor(crawlStatus.status) }}>
            {crawlStatus.status.toUpperCase()}
          </div>
        </div>

        <div className="crawl-info">
          <div className="info-row">
            <span className="label">Crawl Type:</span>
            <span className="value">{crawlStatus.crawl_type}</span>
          </div>
          {crawlStatus.target_region && (
            <div className="info-row">
              <span className="label">Target Region:</span>
              <span className="value">{crawlStatus.target_region}</span>
            </div>
          )}
          {crawlStatus.current_state && (
            <div className="info-row">
              <span className="label">Current State:</span>
              <span className="value">{crawlStatus.current_state}</span>
            </div>
          )}
        </div>

        {/* State Progress */}
        {crawlStatus.total_states > 0 && (
          <div className="progress-section">
            <div className="progress-header">
              <span>State Progress: {crawlStatus.states_completed} / {crawlStatus.total_states} states</span>
              <span className="progress-percentage">{stateProgress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${stateProgress}%`,
                  backgroundColor: '#3b82f6'
                }}
              />
            </div>
          </div>
        )}

        {/* Cell Progress */}
        <div className="progress-section">
          <div className="progress-header">
            <span>Cell Progress: {crawlStatus.current_cell.toLocaleString()} / {crawlStatus.total_cells.toLocaleString()} cells</span>
            <span className="progress-percentage">{crawlStatus.progress_percentage.toFixed(2)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${crawlStatus.progress_percentage}%`,
                backgroundColor: getStatusColor(crawlStatus.status)
              }}
            />
          </div>
        </div>

        {/* Main Statistics Grid */}
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">POIs Fetched</div>
            <div className="stat-value">
              {crawlStatus.pois_fetched.toLocaleString()}
              {getTrendIndicator(crawlStatus.pois_fetched, prevCrawlStatus?.pois_fetched)}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">POIs Saved</div>
            <div className="stat-value">
              {crawlStatus.pois_saved.toLocaleString()}
              {getTrendIndicator(crawlStatus.pois_saved, prevCrawlStatus?.pois_saved)}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">POIs Updated</div>
            <div className="stat-value" style={{ color: poisUpdated > 0 ? '#4caf50' : '#9e9e9e' }}>
              {poisUpdated > 0 ? '+' : ''}{poisUpdated.toLocaleString()}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Total in DB</div>
            <div className="stat-value">
              {crawlStatus.total_pois_in_db?.toLocaleString() || 'N/A'}
              {getTrendIndicator(crawlStatus.total_pois_in_db || 0, prevCrawlStatus?.total_pois_in_db)}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Success Rate</div>
            <div className="stat-value" style={{ color: successRate > 95 ? '#4caf50' : successRate > 80 ? '#ff9800' : '#f44336' }}>
              {successRate.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Cells/Min</div>
            <div className="stat-value">{cellsPerMinute.toFixed(2)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">POIs/Min</div>
            <div className="stat-value">{poisPerMinute.toFixed(2)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Avg POIs/Cell</div>
            <div className="stat-value">{avgPoisPerCell.toFixed(2)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Avg Time/Cell</div>
            <div className="stat-value">{crawlStatus.avg_time_per_cell.toFixed(2)}s</div>
          </div>
        </div>

        {/* Error Statistics */}
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Errors</div>
            <div className="stat-value" style={{ color: crawlStatus.errors_count > 0 ? '#f44336' : '#4caf50' }}>
              {crawlStatus.errors_count}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Rate Limits</div>
            <div className="stat-value" style={{ color: crawlStatus.rate_limit_hits > 0 ? '#ff9800' : '#4caf50' }}>
              {crawlStatus.rate_limit_hits}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Error Rate</div>
            <div className="stat-value" style={{ color: crawlStatus.current_cell > 0 && (crawlStatus.errors_count / crawlStatus.current_cell * 100) > 5 ? '#f44336' : '#4caf50' }}>
              {crawlStatus.current_cell > 0 ? ((crawlStatus.errors_count / crawlStatus.current_cell) * 100).toFixed(2) : '0.00'}%
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Cells Remaining</div>
            <div className="stat-value">{(crawlStatus.total_cells - crawlStatus.current_cell).toLocaleString()}</div>
          </div>
        </div>

        {/* POI Category Breakdown */}
        {crawlStatus.pois_by_category && Object.keys(crawlStatus.pois_by_category).length > 0 && (
          <div className="category-breakdown">
            <h3>POI Distribution by Category</h3>
            <div className="category-list">
              {Object.entries(crawlStatus.pois_by_category)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => {
                  const percentage = crawlStatus.total_pois_in_db && crawlStatus.total_pois_in_db > 0
                    ? ((count / crawlStatus.total_pois_in_db) * 100).toFixed(1)
                    : '0.0';
                  return (
                    <div key={category} className="category-item">
                      <div className="category-header">
                        <span className="category-name">{category.replace(/_/g, ' ').toUpperCase()}</span>
                        <span className="category-count">{count.toLocaleString()} ({percentage}%)</span>
                      </div>
                      <div className="category-bar">
                        <div
                          className="category-fill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: getStatusColor('running')
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Timing Information */}
        <div className="time-section">
          <div className="time-row">
            <span className="label">Started:</span>
            <span className="value">{formatDateTime(crawlStatus.start_time)}</span>
          </div>
          <div className="time-row">
            <span className="label">Last Update:</span>
            <span className="value">{formatDateTime(crawlStatus.last_update)}</span>
          </div>
          <div className="time-row">
            <span className="label">Elapsed Time:</span>
            <span className="value">{formatDuration(crawlStatus.elapsed_time_seconds)}</span>
          </div>
          {crawlStatus.status === 'running' && (
            <>
              <div className="time-row">
                <span className="label">Est. Remaining:</span>
                <span className="value">{formatDuration(crawlStatus.estimated_time_remaining_seconds)}</span>
              </div>
              {crawlStatus.estimated_completion && (
                <div className="time-row">
                  <span className="label">Est. Completion:</span>
                  <span className="value">{formatDateTime(crawlStatus.estimated_completion)}</span>
                </div>
              )}
            </>
          )}
          {crawlStatus.end_time && (
            <div className="time-row">
              <span className="label">Completed:</span>
              <span className="value">{formatDateTime(crawlStatus.end_time)}</span>
            </div>
          )}
        </div>

        {crawlStatus.last_error && (
          <div className="error-section">
            <h4>Last Error:</h4>
            <div className="error-message">{crawlStatus.last_error}</div>
          </div>
        )}

        {crawlStatus.status === 'running' && (
          <div className="live-indicator">
            <span className="pulse"></span>
            Live Update (refreshes every 3s)
          </div>
        )}
      </div>
    </div>
  );
}
