import { useEffect, useState } from 'react';
import axios from 'axios';
import { safeStorage } from '../utils/storage';
import './MultiCrawlStatusDisplay.css';

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
  progress_percentage: number;
  elapsed_time_seconds: number;
  avg_time_per_cell: number;
  estimated_time_remaining_seconds: number;
  notes: string | null;
}

interface OverallStats {
  total_pois_in_db: number;
  total_pois_saved: number;
  total_states_completed: number;
  avg_pois_per_minute: number;
}

export default function MultiCrawlStatusDisplay() {
  const [crawlerStatuses, setCrawlerStatuses] = useState<CrawlStatus[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllStatuses = async () => {
      try {
        const token = safeStorage.getItem('token');

        // Fetch all active crawler statuses (running or paused)
        const response = await axios.get('/api/crawl-status/all', {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Also fetch the current status for total database stats
        const currentResponse = await axios.get('/api/crawl-status/current', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (Array.isArray(response.data)) {
          setCrawlerStatuses(response.data);

          // Calculate overall statistics
          const totalPoisSaved = response.data.reduce((sum: number, status: CrawlStatus) => sum + status.pois_saved, 0);
          const totalStatesCompleted = response.data.reduce((sum: number, status: CrawlStatus) => sum + status.states_completed, 0);
          const totalElapsedTime = response.data.reduce((sum: number, status: CrawlStatus) => sum + status.elapsed_time_seconds, 0);
          const avgPoisPerMinute = totalElapsedTime > 0 ? (totalPoisSaved / totalElapsedTime) * 60 : 0;

          setOverallStats({
            total_pois_in_db: currentResponse.data?.total_pois_in_db || 0,
            total_pois_saved: totalPoisSaved,
            total_states_completed: totalStatesCompleted,
            avg_pois_per_minute: avgPoisPerMinute,
          });
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          console.error('Failed to fetch crawl statuses:', err);
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

  if (crawlerStatuses.length === 0) {
    return (
      <div className="multi-crawl-container">
        <h2>POI Crawler Status</h2>
        <div className="no-crawlers">
          <p>No active crawlers running</p>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-crawl-container">
      <div className="multi-crawl-header">
        <h2>POI Crawler Status</h2>
        <div className="crawler-count">
          {crawlerStatuses.length} active crawler{crawlerStatuses.length !== 1 ? 's' : ''}
        </div>
      </div>

      {overallStats && (
        <div className="overall-stats">
          <div className="stat-box">
            <span className="stat-label">Total POIs in Database</span>
            <span className="stat-value">{overallStats.total_pois_in_db.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Scrape Speed</span>
            <span className="stat-value">{overallStats.avg_pois_per_minute.toFixed(1)} POIs/min</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">States Completed</span>
            <span className="stat-value">{overallStats.total_states_completed} / 50</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Current Scrape Session</span>
            <span className="stat-value">{overallStats.total_pois_saved.toLocaleString()} POIs</span>
          </div>
        </div>
      )}

      <div className={`crawler-grid crawler-count-${Math.min(crawlerStatuses.length, 10)}`}>
        {crawlerStatuses.map((status) => {
          if (!status) return null;

          const cellsPerMinute = status.elapsed_time_seconds > 0
            ? (status.current_cell / status.elapsed_time_seconds) * 60
            : 0;

          const poisPerMinute = status.elapsed_time_seconds > 0
            ? (status.pois_saved / status.elapsed_time_seconds) * 60
            : 0;

          return (
            <div key={status.id} className="crawler-card">
              <div className="crawler-card-header">
                <div className="state-title">
                  <span
                    className="status-icon"
                    style={{ color: getStatusColor(status.status) }}
                  >
                    {getStatusIcon(status.status)}
                  </span>
                  <h3>{status.current_state || 'Unknown'}</h3>
                </div>
                <div
                  className="status-badge-mini"
                  style={{ backgroundColor: getStatusColor(status.status) }}
                >
                  {status.status.toUpperCase()}
                </div>
              </div>

              <div className="progress-mini">
                <div className="progress-text">
                  <span>{status.progress_percentage.toFixed(1)}%</span>
                  <span className="cells-text">
                    {status.current_cell.toLocaleString()} / {status.total_cells.toLocaleString()}
                  </span>
                </div>
                <div className="progress-bar-mini">
                  <div
                    className="progress-fill-mini"
                    style={{
                      width: `${status.progress_percentage}%`,
                      backgroundColor: getStatusColor(status.status),
                    }}
                  />
                </div>
              </div>

              <div className="crawler-stats">
                <div className="stat-mini">
                  <span className="stat-label-mini">POIs Saved</span>
                  <span className="stat-value-mini">{status.pois_saved.toLocaleString()}</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-label-mini">POIs/Min</span>
                  <span className="stat-value-mini">{poisPerMinute.toFixed(1)}</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-label-mini">Cells/Min</span>
                  <span className="stat-value-mini">{cellsPerMinute.toFixed(1)}</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-label-mini">Errors</span>
                  <span
                    className="stat-value-mini"
                    style={{ color: status.errors_count > 0 ? '#f44336' : '#4caf50' }}
                  >
                    {status.errors_count}
                  </span>
                </div>
              </div>

              <div className="crawler-time">
                <span>Elapsed: {formatDuration(status.elapsed_time_seconds)}</span>
                {status.status === 'running' && (
                  <span>ETA: {formatDuration(status.estimated_time_remaining_seconds)}</span>
                )}
              </div>

              {status.status === 'rate_limited' && status.notes && (
                <div className="rate-limit-notice" style={{
                  fontSize: '11px',
                  padding: '6px 8px',
                  background: 'rgba(255, 87, 34, 0.2)',
                  borderRadius: '4px',
                  marginTop: '6px',
                  color: '#ff5722',
                  textAlign: 'center'
                }}>
                  {status.notes}
                </div>
              )}

              {status.status === 'running' && (
                <div className="live-indicator-mini">
                  <span className="pulse-mini"></span>
                  Live
                </div>
              )}

              {status.status === 'rate_limited' && (
                <div className="live-indicator-mini" style={{ color: '#ff5722' }}>
                  <span className="pulse-mini" style={{ background: '#ff5722' }}></span>
                  Paused
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
