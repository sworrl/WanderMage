import { useState, useEffect } from 'react';
import { stateVisits } from '../services/api';
import { US_STATE_PATHS } from '../data/usStatePaths';
import './StatesVisitedMap.css';

// US State codes and names
const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

interface StateVisit {
  id?: number;
  state_code: string;
  state_name: string;
  visit_count: number;
  nightly_stops: number;
  monthly_stays: number;
}

interface StatesVisitedMapProps {
  onUpdate?: () => void;
}

export default function StatesVisitedMap({ onUpdate }: StatesVisitedMapProps) {
  const [visits, setVisits] = useState<Map<string, StateVisit>>(new Map());
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [nightlyStops, setNightlyStops] = useState<number>(0);
  const [monthlyStays, setMonthlyStays] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStateVisits();
  }, []);

  const loadStateVisits = async () => {
    try {
      const response = await stateVisits.getAll();
      const visitsMap = new Map<string, StateVisit>();
      response.data.forEach((visit: StateVisit) => {
        visitsMap.set(visit.state_code, visit);
      });
      setVisits(visitsMap);
    } catch (error) {
      console.error('Failed to load state visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStateClick = (stateCode: string, stateName: string) => {
    setSelectedState(stateCode);
    const visit = visits.get(stateCode);
    setNightlyStops(visit?.nightly_stops || 0);
    setMonthlyStays(visit?.monthly_stays || 0);
  };

  const handleSave = async () => {
    if (!selectedState) return;

    const state = US_STATES.find(s => s.code === selectedState);
    if (!state) return;

    try {
      if (nightlyStops === 0 && monthlyStays === 0) {
        // Delete if both are 0 and visit exists
        const visit = visits.get(selectedState);
        if (visit?.id) {
          await stateVisits.delete(visit.id);
          const newVisits = new Map(visits);
          newVisits.delete(selectedState);
          setVisits(newVisits);
        }
      } else {
        // Create or update
        await stateVisits.create({
          state_code: selectedState,
          state_name: state.name,
          visit_count: nightlyStops + monthlyStays, // Total for legacy compatibility
          nightly_stops: nightlyStops,
          monthly_stays: monthlyStays,
        });
        await loadStateVisits();
      }

      setSelectedState(null);
      setNightlyStops(0);
      setMonthlyStays(0);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to save state visit:', error);
    }
  };

  const handleCancel = () => {
    setSelectedState(null);
    setNightlyStops(0);
    setMonthlyStays(0);
  };

  const getStateColor = (stateCode: string) => {
    const visit = visits.get(stateCode);
    // Check for no visit, or all fields are 0 (including legacy visit_count)
    if (!visit || (visit.nightly_stops === 0 && visit.monthly_stays === 0 && visit.visit_count === 0)) {
      return '#404040'; // dark gray for not visited
    }

    // Color based on monthly stays (solid colors for longer stays)
    // Use HSL color space for smooth gradients
    // Start at blue (240°), move through purple (280°), magenta (320°), to red (0°)
    const maxMonthlyStays = Math.max(...Array.from(visits.values()).map(v => v.monthly_stays || 0), 1);
    const normalizedCount = Math.min(visit.monthly_stays / Math.max(maxMonthlyStays, 10), 1); // Cap at 10 for color scale

    // If only nightly stops but no monthly stays, use a light blue
    if (visit.monthly_stays === 0 && visit.nightly_stops > 0) {
      return '#4a90a4'; // Light blue for nightly-only visits
    }

    // Handle legacy data: if visit_count > 0 but nightly_stops and monthly_stays are 0
    // Show as light blue (treat as nightly visits)
    if (visit.monthly_stays === 0 && visit.nightly_stops === 0 && visit.visit_count > 0) {
      return '#4a90a4'; // Light blue for legacy visits
    }

    // Color progression: Blue (240°) → Purple (280°) → Magenta (320°) → Red-Orange (20°)
    const hue = 240 - (normalizedCount * 220); // 240 to 20 degrees
    const saturation = 70 + (normalizedCount * 20); // 70% to 90% saturation (more vivid as visits increase)
    const lightness = 55 - (normalizedCount * 10); // 55% to 45% lightness (slightly darker as visits increase)

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  // Check if state has nightly stops (for speckle pattern)
  const hasNightlyStops = (stateCode: string) => {
    const visit = visits.get(stateCode);
    return visit && visit.nightly_stops > 0;
  };

  if (loading) {
    return <div className="text-center p-4">Loading states...</div>;
  }

  return (
    <div className="states-map-container">
      <h2 className="states-map-title">States Visited</h2>

      <div className="us-map-svg-container">
        <svg viewBox="0 0 960 600" className="us-map-svg">
          {/* Define speckle patterns for nightly stops */}
          <defs>
            {US_STATES.map(state => {
              const visit = visits.get(state.code);
              if (visit && visit.nightly_stops > 0) {
                // Generate speckle pattern based on nightly stops count
                const speckleCount = Math.min(visit.nightly_stops * 3, 30);
                const speckles = [];
                for (let i = 0; i < speckleCount; i++) {
                  // Use deterministic positioning based on state code
                  const x = ((i * 7 + state.code.charCodeAt(0)) % 20);
                  const y = ((i * 11 + state.code.charCodeAt(1)) % 20);
                  speckles.push(
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={1.2}
                      fill="rgba(255, 255, 255, 0.7)"
                    />
                  );
                }
                return (
                  <pattern
                    key={`speckle-${state.code}`}
                    id={`speckle-${state.code}`}
                    patternUnits="userSpaceOnUse"
                    width="20"
                    height="20"
                  >
                    <rect width="20" height="20" fill={getStateColor(state.code)} />
                    {speckles}
                  </pattern>
                );
              }
              return null;
            })}
          </defs>

          {US_STATES.map(state => (
            <path
              key={state.code}
              d={US_STATE_PATHS[state.code] || ''}
              data-state={state.code}
              fill={hasNightlyStops(state.code) ? `url(#speckle-${state.code})` : getStateColor(state.code)}
              stroke="var(--border-color)"
              strokeWidth="1"
              onClick={() => handleStateClick(state.code, state.name)}
              className="state-path"
            />
          ))}
        </svg>
      </div>

      {selectedState && (
        <div className="state-edit-panel">
          <h3>
            {US_STATES.find(s => s.code === selectedState)?.name}
          </h3>
          <div className="state-edit-fields">
            <div className="state-edit-field">
              <label>
                Nightly Stops
              </label>
              <input
                type="number"
                min="0"
                value={nightlyStops}
                onChange={(e) => setNightlyStops(parseInt(e.target.value) || 0)}
              />
              <span className="field-hint">Overnight stays, camping</span>
            </div>
            <div className="state-edit-field">
              <label>
                Monthly Stays
              </label>
              <input
                type="number"
                min="0"
                value={monthlyStays}
                onChange={(e) => setMonthlyStays(parseInt(e.target.value) || 0)}
              />
              <span className="field-hint">Extended stays (week+)</span>
            </div>
          </div>
          <div className="state-edit-buttons">
            <button
              onClick={handleSave}
              className="btn-save"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="btn-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="state-stats">
        <p>Total states visited: {visits.size} / 50</p>
        <p>Total nightly stops: {Array.from(visits.values()).reduce((sum, v) => sum + (v.nightly_stops || 0), 0)}</p>
        <p>Total monthly stays: {Array.from(visits.values()).reduce((sum, v) => sum + (v.monthly_stays || 0), 0)}</p>
      </div>
    </div>
  );
}
