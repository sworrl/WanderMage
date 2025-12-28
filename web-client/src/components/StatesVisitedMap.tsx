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

    // Get values with fallback to 0 for null/undefined
    const nightlyStops = visit?.nightly_stops ?? 0;
    const monthlyStays = visit?.monthly_stays ?? 0;
    const visitCount = visit?.visit_count ?? 0;
    const totalVisits = visitCount > 0 ? visitCount : (nightlyStops + monthlyStays);

    // Check for no visit, or all fields are 0
    if (!visit || totalVisits === 0) {
      return '#404040'; // dark gray for not visited
    }

    // Calculate max visits across all states for intensity scaling
    const maxTotalVisits = Math.max(
      ...Array.from(visits.values()).map(v => {
        const vc = v.visit_count ?? 0;
        const ns = v.nightly_stops ?? 0;
        const ms = v.monthly_stays ?? 0;
        return vc > 0 ? vc : (ns + ms);
      }),
      1
    );

    // Normalize visit count for intensity (0-1)
    const intensity = Math.min(totalVisits / Math.max(maxTotalVisits, 20), 1);
    const t = Math.pow(intensity, 0.7);

    // Calculate stay ratio: 0 = all nightly, 1 = all monthly
    const stayRatio = totalVisits > 0 ? monthlyStays / totalVisits : 0.5;

    // Create DISTINCT colors using multiple factors:
    // 1. State code adds unique offset (0-120 degrees based on state letters)
    const stateOffset = ((stateCode.charCodeAt(0) - 65) * 5 + (stateCode.charCodeAt(1) - 65) * 2) % 120;

    // 2. Total visits determines base hue region (spread across spectrum)
    const visitHue = (totalVisits * 17) % 360; // Spread visits across color wheel

    // 3. Stay ratio shifts within that region
    // Nightly-heavy shifts toward cooler, monthly-heavy shifts toward warmer
    const ratioShift = (stayRatio - 0.5) * 60; // -30 to +30 degrees

    // Combine for final hue - ensure wide distribution
    let baseHue = (stateOffset + visitHue + ratioShift + 360) % 360;

    // Avoid muddy yellows/greens (60-120) - shift to more vibrant ranges
    if (baseHue >= 60 && baseHue < 120) {
      baseHue = baseHue < 90 ? baseHue - 30 : baseHue + 60; // Shift to orange or cyan
    }

    // Intensity affects saturation and lightness
    const saturation = 55 + (t * 35); // 55% to 90%
    const lightness = 52 - (t * 14); // 52% to 38%

    return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
  };

  // Check if state has visits (for texture pattern)
  const hasVisits = (stateCode: string) => {
    const visit = visits.get(stateCode);
    if (!visit) return false;
    const total = (visit.visit_count ?? 0) || ((visit.nightly_stops ?? 0) + (visit.monthly_stays ?? 0));
    return total > 0;
  };

  // Get total visits for a state
  const getTotalVisits = (stateCode: string) => {
    const visit = visits.get(stateCode);
    if (!visit) return 0;
    const vc = visit.visit_count ?? 0;
    return vc > 0 ? vc : ((visit.nightly_stops ?? 0) + (visit.monthly_stays ?? 0));
  };

  // Seeded random number generator for deterministic patterns
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  // Pattern tile size - large enough to not look repetitive
  const PATTERN_SIZE = 200;

  // Generate unique pattern elements based on state code and visit count
  // Uses color variations that blend with the base state color
  // FEWER VISITS = CALMER/LESS BUSY, MORE VISITS = BUSIER
  const generatePatternElements = (stateCode: string, visitCount: number, baseHue: number) => {
    const baseSeed = stateCode.charCodeAt(0) * 1000 + stateCode.charCodeAt(1) * 100 + visitCount;
    const elements: JSX.Element[] = [];

    // Busyness factor: 0.2 (very calm) to 1.0 (very busy) based on visit count
    // 1 visit = 0.2, 5 visits = 0.5, 10+ visits = 1.0
    const busyness = Math.min(0.2 + (visitCount - 1) * 0.09, 1.0);

    // Helper to get blended color (opacity scaled by busyness)
    const getBlendedColor = (seed: number, baseOpacity: number) => {
      const opacity = baseOpacity * busyness;
      const isLighter = seededRandom(seed) > 0.5;
      const hueShift = (seededRandom(seed + 1) - 0.5) * 30;
      const elementHue = baseHue + hueShift;
      const saturation = 50 + seededRandom(seed + 2) * 40;
      const lightness = isLighter
        ? 60 + seededRandom(seed + 3) * 25
        : 25 + seededRandom(seed + 3) * 20;
      return `hsla(${elementHue}, ${saturation}%, ${lightness}%, ${opacity})`;
    };

    // === LAYER 1: Crosshatch pattern (spacing inversely scales with busyness) ===
    const crosshatchSpacing = 20 - (busyness * 12) + seededRandom(baseSeed) * 4; // 8-20px (wider when calm)
    const crosshatchAngle = seededRandom(baseSeed + 1) * 45;
    const crosshatchOpacity = 0.15 + seededRandom(baseSeed + 2) * 0.15;
    const crosshatchColor = getBlendedColor(baseSeed + 100, crosshatchOpacity);
    const crosshatchColor2 = getBlendedColor(baseSeed + 200, crosshatchOpacity);
    const strokeWidth = 0.4 + busyness * 0.4; // 0.4-0.8

    // Diagonal lines one direction
    for (let i = -PATTERN_SIZE; i < PATTERN_SIZE * 2; i += crosshatchSpacing) {
      elements.push(
        <line
          key={`ch1-${i}`}
          x1={i}
          y1={0}
          x2={i + PATTERN_SIZE}
          y2={PATTERN_SIZE}
          stroke={crosshatchColor}
          strokeWidth={strokeWidth}
          transform={`rotate(${crosshatchAngle}, ${PATTERN_SIZE/2}, ${PATTERN_SIZE/2})`}
        />
      );
    }
    // Diagonal lines other direction
    for (let i = -PATTERN_SIZE; i < PATTERN_SIZE * 2; i += crosshatchSpacing) {
      elements.push(
        <line
          key={`ch2-${i}`}
          x1={i}
          y1={PATTERN_SIZE}
          x2={i + PATTERN_SIZE}
          y2={0}
          stroke={crosshatchColor2}
          strokeWidth={strokeWidth}
          transform={`rotate(${crosshatchAngle}, ${PATTERN_SIZE/2}, ${PATTERN_SIZE/2})`}
        />
      );
    }

    // === LAYER 2: Houndstooth pattern (only appears at higher busyness) ===
    if (busyness > 0.4) {
      const houndstoothSize = 16 - (busyness * 8) + seededRandom(baseSeed + 50) * 4; // 8-16px
      const houndstoothOpacity = 0.2 + seededRandom(baseSeed + 51) * 0.15;
      const htColor1 = getBlendedColor(baseSeed + 300, houndstoothOpacity);
      const htColor2 = getBlendedColor(baseSeed + 400, houndstoothOpacity * 0.6);

      for (let row = 0; row < PATTERN_SIZE / houndstoothSize + 1; row++) {
        for (let col = 0; col < PATTERN_SIZE / houndstoothSize + 1; col++) {
          const x = col * houndstoothSize;
          const y = row * houndstoothSize;
          const isOffset = (row + col) % 2 === 0;

          if (isOffset) {
            const s = houndstoothSize / 2;
            elements.push(
              <polygon
                key={`ht-${row}-${col}`}
                points={`${x},${y} ${x + s},${y} ${x + s},${y + s} ${x + houndstoothSize},${y + s} ${x + houndstoothSize},${y + houndstoothSize} ${x + s},${y + houndstoothSize} ${x + s},${y + s} ${x},${y + s}`}
                fill={htColor1}
              />
            );
          } else {
            const s = houndstoothSize / 2;
            elements.push(
              <polygon
                key={`ht2-${row}-${col}`}
                points={`${x + s},${y} ${x + houndstoothSize},${y} ${x + houndstoothSize},${y + s} ${x + s},${y + s}`}
                fill={htColor2}
              />
            );
          }
        }
      }
    }

    // === LAYER 3: Scattered shapes (count scales with busyness) ===
    const shapeCount = Math.floor(20 + busyness * 180); // 20-200 shapes

    for (let i = 0; i < shapeCount; i++) {
      const seed = baseSeed + i * 137 + 1000;
      const x = seededRandom(seed) * PATTERN_SIZE;
      const y = seededRandom(seed + 1) * PATTERN_SIZE;
      const elementType = Math.floor(seededRandom(seed + 2) * 4);
      const size = 1 + seededRandom(seed + 3) * 3 * busyness; // Smaller when calm
      const rotation = seededRandom(seed + 5) * 360;
      const opacity = 0.25 + seededRandom(seed + 10) * 0.35;
      const color = getBlendedColor(seed + 500, opacity);

      if (elementType === 0) {
        elements.push(<circle key={`s-${i}`} cx={x} cy={y} r={size} fill={color} />);
      } else if (elementType === 1) {
        const s = size * 0.8;
        elements.push(
          <polygon
            key={`s-${i}`}
            points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
            fill={color}
            transform={`rotate(${rotation}, ${x}, ${y})`}
          />
        );
      } else if (elementType === 2) {
        elements.push(
          <g key={`s-${i}`} transform={`rotate(${rotation}, ${x}, ${y})`}>
            <line x1={x - size} y1={y} x2={x + size} y2={y} stroke={color} strokeWidth={1} />
            <line x1={x} y1={y - size} x2={x} y2={y + size} stroke={color} strokeWidth={1} />
          </g>
        );
      } else {
        const s = size * 0.7;
        elements.push(
          <polygon
            key={`s-${i}`}
            points={`${x},${y - s} ${x + s * 0.866},${y + s * 0.5} ${x - s * 0.866},${y + s * 0.5}`}
            fill={color}
            transform={`rotate(${rotation}, ${x}, ${y})`}
          />
        );
      }
    }

    // === LAYER 4: Fine stipple dots (only at higher busyness) ===
    if (busyness > 0.5) {
      const stippleCount = Math.floor((busyness - 0.5) * 400); // 0-200 dots
      for (let i = 0; i < stippleCount; i++) {
        const seed = baseSeed + i * 89 + 5000;
        const x = seededRandom(seed) * PATTERN_SIZE;
        const y = seededRandom(seed + 1) * PATTERN_SIZE;
        const size = 0.5 + seededRandom(seed + 2) * 1.5;
        const opacity = 0.15 + seededRandom(seed + 3) * 0.25;
        const color = getBlendedColor(seed + 600, opacity);
        elements.push(<circle key={`st-${i}`} cx={x} cy={y} r={size} fill={color} />);
      }
    }

    return elements;
  };

  // Get the hue value for a state's color (for pattern blending)
  // Matches the algorithm from getStateColor
  const getStateHue = (stateCode: string): number => {
    const visit = visits.get(stateCode);
    const nightlyStops = visit?.nightly_stops ?? 0;
    const monthlyStays = visit?.monthly_stays ?? 0;
    const visitCount = visit?.visit_count ?? 0;
    const totalVisits = visitCount > 0 ? visitCount : (nightlyStops + monthlyStays);

    if (totalVisits === 0) return 0;

    // Calculate stay ratio
    const stayRatio = totalVisits > 0 ? monthlyStays / totalVisits : 0.5;

    // Same algorithm as getStateColor
    const stateOffset = ((stateCode.charCodeAt(0) - 65) * 5 + (stateCode.charCodeAt(1) - 65) * 2) % 120;
    const visitHue = (totalVisits * 17) % 360;
    const ratioShift = (stayRatio - 0.5) * 60;
    let hue = (stateOffset + visitHue + ratioShift + 360) % 360;

    // Avoid muddy yellows/greens
    if (hue >= 60 && hue < 120) {
      hue = hue < 90 ? hue - 30 : hue + 60;
    }

    return hue;
  };

  if (loading) {
    return <div className="text-center p-4">Loading states...</div>;
  }

  return (
    <div className="states-map-container">
      <h2 className="states-map-title">States Visited</h2>

      <div className="us-map-svg-container">
        <svg viewBox="0 0 960 600" className="us-map-svg">
          {/* Define unique texture patterns for visited states */}
          <defs>
            {US_STATES.map(state => {
              const visitCount = getTotalVisits(state.code);
              if (visitCount > 0) {
                // Generate unique pattern based on state code, visit count, and base hue
                const baseHue = getStateHue(state.code);
                const patternElements = generatePatternElements(state.code, visitCount, baseHue);
                return (
                  <pattern
                    key={`texture-${state.code}`}
                    id={`texture-${state.code}`}
                    patternUnits="userSpaceOnUse"
                    width={PATTERN_SIZE}
                    height={PATTERN_SIZE}
                  >
                    <rect width={PATTERN_SIZE} height={PATTERN_SIZE} fill={getStateColor(state.code)} />
                    {patternElements}
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
              fill={hasVisits(state.code) ? `url(#texture-${state.code})` : getStateColor(state.code)}
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
