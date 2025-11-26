import { useState, useEffect } from 'react';
import axios from 'axios';
import { US_STATE_PATHS } from '../data/usStatePaths';
import { safeStorage } from '../utils/storage';
import './POIDataMap.css';

interface StateData {
  state: string;
  count: number;
}

interface CrawlStatus {
  id: number;
  status: string;
  current_state: string | null;
  pois_saved: number;
  progress_percentage: number;
  states_completed: number;
}

interface HeightStats {
  state: string;
  count: number;
}

interface POIDataMapProps {
  stateData: StateData[];
}

// US State codes and names
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

export default function POIDataMap({ stateData }: POIDataMapProps) {
  const [hoveredState, setHoveredState] = useState<{
    name: string;
    code: string;
    poiCount: number;
    heightCount: number;
    isActive: boolean;
    status: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [crawlStatuses, setCrawlStatuses] = useState<CrawlStatus[]>([]);
  const [heightsByState, setHeightsByState] = useState<Map<string, number>>(new Map());
  const [completedStates, setCompletedStates] = useState<Set<string>>(new Set());

  // Fetch crawl status and heights data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = safeStorage.getItem('token');

        // Fetch active crawl statuses
        const crawlResponse = await axios.get('/api/crawl-status/all', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (Array.isArray(crawlResponse.data)) {
          setCrawlStatuses(crawlResponse.data);
        }

        // Fetch height stats by state
        try {
          const heightsResponse = await axios.get('/api/pois/heights-by-state', {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (heightsResponse.data && Array.isArray(heightsResponse.data)) {
            const heightsMap = new Map<string, number>();
            heightsResponse.data.forEach((item: HeightStats) => {
              heightsMap.set(item.state.toUpperCase(), item.count);
            });
            setHeightsByState(heightsMap);
          }
        } catch (err) {
          // Heights endpoint may not exist, that's okay
        }

        // Fetch completed states from crawl history
        try {
          const historyResponse = await axios.get('/api/crawl-status/completed-states', {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (historyResponse.data) {
            // Handle both array and object responses
            const completedData = Array.isArray(historyResponse.data)
              ? historyResponse.data
              : (historyResponse.data.completed_states || []);
            setCompletedStates(new Set(completedData.map((s: string) => s.toUpperCase())));
          }
        } catch (err) {
          // Fallback: derive from stateData
          const statesWithData = new Set(stateData.map(s => s.state.toUpperCase()));
          setCompletedStates(statesWithData);
        }
      } catch (err) {
        console.error('Failed to fetch crawl data:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [stateData]);

  const getStateCount = (stateCode: string): number => {
    const stateInfo = stateData.find((s) => s.state.toUpperCase() === stateCode.toUpperCase());
    return stateInfo?.count || 0;
  };

  const getHeightCount = (stateCode: string): number => {
    return heightsByState.get(stateCode.toUpperCase()) || 0;
  };

  const isStateActive = (stateCode: string): boolean => {
    return crawlStatuses.some(
      status => status.current_state?.toUpperCase() === stateCode.toUpperCase() &&
                (status.status === 'running' || status.status === 'rate_limited')
    );
  };

  const getStateStatus = (stateCode: string): string => {
    const upperCode = stateCode.toUpperCase();

    // Check if currently being scraped
    const activeStatus = crawlStatuses.find(
      status => status.current_state?.toUpperCase() === upperCode
    );
    if (activeStatus) {
      return activeStatus.status;
    }

    // Check if has data (completed)
    if (getStateCount(stateCode) > 0) {
      return 'completed';
    }

    // Pending
    return 'pending';
  };

  const getColorForCount = (count: number, status: string): string => {
    // Active states get special treatment
    if (status === 'running') {
      return '#22c55e'; // Bright green for active
    }
    if (status === 'rate_limited') {
      return '#f59e0b'; // Orange for rate limited
    }

    // Color by POI count for completed states
    if (count === 0) return '#1f2937'; // Dark gray for no data
    if (count < 100) return '#1e3a5f'; // Dark blue
    if (count < 500) return '#2563eb'; // Blue
    if (count < 1000) return '#7c3aed'; // Purple
    if (count < 2500) return '#a855f7'; // Light purple
    if (count < 5000) return '#ec4899'; // Pink
    if (count < 10000) return '#f97316'; // Orange
    return '#10b981'; // Green for 10000+
  };

  const handleMouseEnter = (state: { code: string; name: string }, e: React.MouseEvent) => {
    const poiCount = getStateCount(state.code);
    const heightCount = getHeightCount(state.code);
    const isActive = isStateActive(state.code);
    const status = getStateStatus(state.code);

    setHoveredState({
      name: state.name,
      code: state.code,
      poiCount,
      heightCount,
      isActive,
      status
    });
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredState(null);
  };

  // Calculate statistics
  const totalPOIs = stateData.reduce((sum, s) => sum + s.count, 0);
  const statesWithData = stateData.filter(s => s.count > 0).length;
  const activeStates = crawlStatuses.filter(s => s.status === 'running' || s.status === 'rate_limited').length;

  return (
    <div className="poi-data-map-container">
      <h3>POI Data Coverage Map</h3>

      {/* Summary Stats */}
      <div className="poi-map-stats">
        <div className="poi-stat">
          <span className="poi-stat-value">{totalPOIs.toLocaleString()}</span>
          <span className="poi-stat-label">Total POIs</span>
        </div>
        <div className="poi-stat">
          <span className="poi-stat-value">{statesWithData}/50</span>
          <span className="poi-stat-label">States Covered</span>
        </div>
        <div className="poi-stat">
          <span className="poi-stat-value">{activeStates}</span>
          <span className="poi-stat-label">Active Scrapes</span>
        </div>
      </div>

      {/* Legend */}
      <div className="poi-map-legend">
        <div className="legend-section">
          <span className="legend-title">Status:</span>
          <div className="legend-item">
            <div className="legend-color legend-active"></div>
            <span>Scraping</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div>
            <span>Rate Limited</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#1f2937' }}></div>
            <span>Pending</span>
          </div>
        </div>
        <div className="legend-section">
          <span className="legend-title">POI Count:</span>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#1e3a5f' }}></div>
            <span>1-99</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#2563eb' }}></div>
            <span>100-499</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#7c3aed' }}></div>
            <span>500-999</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#a855f7' }}></div>
            <span>1K-2.5K</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ec4899' }}></div>
            <span>2.5K-5K</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#f97316' }}></div>
            <span>5K-10K</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
            <span>10K+</span>
          </div>
        </div>
      </div>

      {/* Map SVG */}
      <div className="poi-map-svg">
        <svg viewBox="0 0 960 600" className="us-map-svg">
          <defs>
            {/* Animated pulse gradient for active states */}
            <radialGradient id="activeGradient">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="1">
                <animate attributeName="stopOpacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
              </stop>
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.6"/>
            </radialGradient>

            {/* Glow filter for active states */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {US_STATES.map(state => {
            const count = getStateCount(state.code);
            const status = getStateStatus(state.code);
            const isActive = isStateActive(state.code);

            return (
              <g key={state.code}>
                <path
                  d={US_STATE_PATHS[state.code] || ''}
                  data-state={state.code}
                  fill={getColorForCount(count, status)}
                  stroke={isActive ? '#22c55e' : '#374151'}
                  strokeWidth={isActive ? '2' : '1'}
                  filter={isActive ? 'url(#glow)' : undefined}
                  onMouseEnter={(e) => handleMouseEnter(state, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className={`state-path ${isActive ? 'state-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                />
                {/* Animated overlay for active states */}
                {isActive && (
                  <path
                    d={US_STATE_PATHS[state.code] || ''}
                    fill="url(#activeGradient)"
                    stroke="none"
                    pointerEvents="none"
                    opacity="0.5"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.3;0.6;0.3"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </path>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hoveredState && (
        <div
          className="poi-map-tooltip"
          style={{
            left: tooltipPos.x + 15,
            top: tooltipPos.y + 15,
          }}
        >
          <div className="tooltip-header">
            <strong>{hoveredState.name}</strong>
            {hoveredState.isActive && (
              <span className="tooltip-status-badge active">
                {hoveredState.status === 'rate_limited' ? 'RATE LIMITED' : 'SCRAPING'}
              </span>
            )}
          </div>
          <div className="tooltip-stats">
            <div className="tooltip-stat">
              <span className="tooltip-stat-label">POIs:</span>
              <span className="tooltip-stat-value">{hoveredState.poiCount.toLocaleString()}</span>
            </div>
            {hoveredState.heightCount > 0 && (
              <div className="tooltip-stat">
                <span className="tooltip-stat-label">Heights:</span>
                <span className="tooltip-stat-value">{hoveredState.heightCount.toLocaleString()}</span>
              </div>
            )}
            <div className="tooltip-stat">
              <span className="tooltip-stat-label">Status:</span>
              <span className={`tooltip-stat-value status-${hoveredState.status}`}>
                {hoveredState.status === 'running' ? 'Scraping' :
                 hoveredState.status === 'rate_limited' ? 'Paused' :
                 hoveredState.status === 'completed' ? 'Complete' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
