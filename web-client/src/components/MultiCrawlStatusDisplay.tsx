import { useEffect, useState } from 'react';
import axios from 'axios';
import { safeStorage } from '../utils/storage';
import './MultiCrawlStatusDisplay.css';

interface ScraperStatus {
  scraper_type: string;
  display_name: string;
  description: string;
  icon: string;
  status: string;
  current_activity: string | null;
  current_detail: string | null;
  current_region: string | null;
  current_category: string | null;
  items_found: number;
  items_saved: number;
  items_updated: number;
  items_skipped: number;
  current_segment: number;
  total_segments: number;
  segment_name: string | null;
  started_at: string | null;
  last_activity_at: string | null;
  completed_at: string | null;
  errors_count: number;
  last_error: string | null;
  avg_items_per_minute: number;
  health_status: string;
  progress_percentage: number;
  elapsed_seconds: number;
  eta_seconds: number;
}

interface OverallStats {
  total_pois_in_db: number;
  total_items_saved: number;
  total_items_found: number;
  running_count: number;
  avg_items_per_minute: number;
}

export default function MultiCrawlStatusDisplay() {
  const [scraperStatuses, setScraperStatuses] = useState<ScraperStatus[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllStatuses = async () => {
      try {
        const token = safeStorage.getItem('token');

        // Fetch all scraper statuses from the unified API
        const response = await axios.get('/api/scraper-dashboard/status', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.data && response.data.scrapers) {
          // ONLY show running scrapers (filter out idle, completed, failed)
          const runningScrapers = response.data.scrapers.filter((status: ScraperStatus) =>
            status.status === 'running' || status.status === 'rate_limited' || status.status === 'paused'
          );
          setScraperStatuses(runningScrapers);

          // Calculate overall statistics from RUNNING scrapers only
          const totalItemsSaved = runningScrapers.reduce((sum: number, status: ScraperStatus) => sum + (status.items_saved || 0), 0);
          const totalItemsFound = runningScrapers.reduce((sum: number, status: ScraperStatus) => sum + (status.items_found || 0), 0);
          const totalElapsedTime = runningScrapers.reduce((sum: number, status: ScraperStatus) => sum + (status.elapsed_seconds || 0), 0);

          // Calculate speed based on items found
          const avgItemsPerMinute = totalElapsedTime > 0 ? (totalItemsFound / totalElapsedTime) * 60 : 0;

          setOverallStats({
            total_pois_in_db: 0, // Will be fetched separately if needed
            total_items_saved: totalItemsSaved,
            total_items_found: totalItemsFound,
            running_count: runningScrapers.length,
            avg_items_per_minute: avgItemsPerMinute,
          });
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          console.error('Failed to fetch scraper statuses:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAllStatuses();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchAllStatuses, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
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
      case 'rate_limited':
        return '#ff5722';
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
      case 'rate_limited':
        return '⏳';
      default:
        return '○';
    }
  };

  if (loading) {
    return (
      <div className="multi-crawl-container">
        <div className="loading">Loading crawler statuses...</div>
      </div>
    );
  }

  if (scraperStatuses.length === 0) {
    return (
      <div className="multi-crawl-container">
        <h2>Scraper Status</h2>
        <div className="no-crawlers">
          <p>No active scrapers running</p>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-crawl-container">
      <div className="multi-crawl-header">
        <h2>Scraper Status</h2>
        <div className="crawler-count">
          {scraperStatuses.length} active scraper{scraperStatuses.length !== 1 ? 's' : ''}
        </div>
      </div>

      {overallStats && (
        <div className="overall-stats">
          <div className="stat-box">
            <span className="stat-label">Items Found</span>
            <span className="stat-value">{overallStats.total_items_found.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Scrape Speed</span>
            <span className="stat-value">{overallStats.avg_items_per_minute.toFixed(1)} items/min</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Items Saved</span>
            <span className="stat-value">{overallStats.total_items_saved.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Running Scrapers</span>
            <span className="stat-value">{overallStats.running_count}</span>
          </div>
        </div>
      )}

      <div className="crawler-list-verbose">
        {scraperStatuses.map((status) => {
          if (!status) return null;

          const itemsFoundPerMinute = status.elapsed_seconds > 0
            ? ((status.items_found || 0) / status.elapsed_seconds) * 60
            : 0;

          const itemsSavedPerMinute = status.elapsed_seconds > 0
            ? ((status.items_saved || 0) / status.elapsed_seconds) * 60
            : 0;

          const lastUpdate = status.last_activity_at ? new Date(status.last_activity_at).toLocaleTimeString() : 'N/A';
          const startTime = status.started_at ? new Date(status.started_at).toLocaleString() : 'N/A';

          return (
            <div key={status.scraper_type} className="crawler-card-verbose">
              {/* Header */}
              <div className="crawler-header-verbose">
                <div className="crawler-title-section">
                  <span
                    className="status-icon-large"
                    style={{ color: getStatusColor(status.status) }}
                  >
                    {status.icon || getStatusIcon(status.status)}
                  </span>
                  <div className="crawler-title-info">
                    <h3>{status.display_name}</h3>
                    <span className="crawler-region">
                      {status.current_activity || 'Initializing'} {status.current_detail ? `- ${status.current_detail}` : ''}
                    </span>
                  </div>
                </div>
                <div className="crawler-status-section">
                  <div
                    className="status-badge-large"
                    style={{ backgroundColor: getStatusColor(status.status) }}
                  >
                    {status.status.toUpperCase()}
                  </div>
                  {status.status === 'running' && (
                    <div className="live-indicator-verbose">
                      <span className="pulse-verbose"></span>
                      LIVE
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Section */}
              <div className="progress-section-verbose">
                <div className="progress-header">
                  <span className="progress-label">Progress</span>
                  <span className="progress-percent">{(status.progress_percentage || 0).toFixed(1)}%</span>
                </div>
                <div className="progress-bar-verbose">
                  <div
                    className="progress-fill-verbose"
                    style={{
                      width: `${status.progress_percentage || 0}%`,
                      backgroundColor: getStatusColor(status.status),
                    }}
                  />
                </div>
                <div className="progress-details">
                  <span>Segment: {(status.current_segment || 0).toLocaleString()} / {(status.total_segments || 0).toLocaleString()}</span>
                  {status.segment_name && <span>Current: {status.segment_name}</span>}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid-verbose">
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">Items Found</span>
                  <span className="stat-value-verbose">{(status.items_found || 0).toLocaleString()}</span>
                  <span className="stat-rate">{itemsFoundPerMinute.toFixed(1)}/min</span>
                </div>
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">Items Saved</span>
                  <span className="stat-value-verbose">{(status.items_saved || 0).toLocaleString()}</span>
                  <span className="stat-rate">{itemsSavedPerMinute.toFixed(1)}/min</span>
                </div>
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">Updated</span>
                  <span className="stat-value-verbose">{(status.items_updated || 0).toLocaleString()}</span>
                  <span className="stat-rate">existing</span>
                </div>
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">Skipped</span>
                  <span className="stat-value-verbose">{(status.items_skipped || 0).toLocaleString()}</span>
                  <span className="stat-rate">duplicates</span>
                </div>
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">Errors</span>
                  <span className="stat-value-verbose" style={{ color: (status.errors_count || 0) > 0 ? '#f44336' : '#4caf50' }}>
                    {status.errors_count || 0}
                  </span>
                  <span className="stat-rate">total</span>
                </div>
                <div className="stat-box-verbose">
                  <span className="stat-label-verbose">ETA</span>
                  <span className="stat-value-verbose">
                    {status.status === 'running' && status.eta_seconds > 0 ? formatDuration(status.eta_seconds) : '--'}
                  </span>
                  <span className="stat-rate">remaining</span>
                </div>
              </div>

              {/* Time Info */}
              <div className="time-info-verbose">
                <span>Started: {startTime}</span>
                <span>Elapsed: {formatDuration(status.elapsed_seconds || 0)}</span>
                <span>Last Update: {lastUpdate}</span>
              </div>

              {/* Error Display */}
              {status.last_error && (
                <div className="error-display-verbose">
                  <strong>Last Error:</strong> {status.last_error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
