import { useMemo } from 'react';
import './TripCalendar.css';

interface Stop {
  id?: string | number;
  name?: string;
  address: string;
  city: string;
  state: string;
  arrival_time: string;
  departure_time: string;
  arrival_tentative: boolean;
  departure_tentative: boolean;
  is_overnight: boolean;
  notes: string;
}

interface TripCalendarProps {
  startDate: string;
  endDate: string;
  startDateTentative: boolean;
  endDateTentative: boolean;
  stops: Stop[];
  onDateClick?: (date: Date) => void;
}

export default function TripCalendar({
  startDate,
  endDate,
  startDateTentative,
  endDateTentative,
  stops,
  onDateClick
}: TripCalendarProps) {
  const calendarData = useMemo(() => {
    if (!startDate) return null;

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start);

    // Extend to show full weeks
    const firstDay = new Date(start);
    firstDay.setDate(1);
    const lastDay = new Date(end);
    lastDay.setMonth(lastDay.getMonth() + 1, 0);

    // Calculate weeks
    const weeks: Date[][] = [];
    let currentDate = new Date(firstDay);

    // Start from Sunday of the week containing the first day
    currentDate.setDate(currentDate.getDate() - currentDate.getDay());

    while (currentDate <= lastDay) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(week);
    }

    return { weeks, start, end };
  }, [startDate, endDate]);

  const getStopsForDate = (date: Date) => {
    return stops.filter(stop => {
      if (!stop.arrival_time) return false;
      const stopDate = new Date(stop.arrival_time);
      return stopDate.toDateString() === date.toDateString();
    });
  };

  const isInTrip = (date: Date) => {
    if (!calendarData) return false;
    return date >= calendarData.start && date <= calendarData.end;
  };

  const isStartDate = (date: Date) => {
    if (!calendarData) return false;
    return date.toDateString() === calendarData.start.toDateString();
  };

  const isEndDate = (date: Date) => {
    if (!calendarData) return false;
    return date.toDateString() === calendarData.end.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    if (!calendarData) return false;
    const month = calendarData.start.getMonth();
    return date.getMonth() === month || date.getMonth() === calendarData.end.getMonth();
  };

  if (!calendarData) {
    return (
      <div className="trip-calendar-empty">
        <p>Set a start date to view the calendar</p>
      </div>
    );
  }

  return (
    <div className="trip-calendar">
      <div className="calendar-header">
        <h3>Trip Timeline</h3>
        <div className="calendar-legend">
          <span className="legend-item">
            <span className="legend-color trip-day"></span>
            Trip Days
          </span>
          <span className="legend-item">
            <span className="legend-color stop-day"></span>
            Stops
          </span>
          <span className="legend-item">
            <span className="legend-color tentative"></span>
            Tentative
          </span>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="weekday-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday-name">{day}</div>
          ))}
        </div>

        <div className="calendar-body">
          {calendarData.weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="calendar-week">
              {week.map((date, dayIdx) => {
                const dayStops = getStopsForDate(date);
                const inTrip = isInTrip(date);
                const isStart = isStartDate(date);
                const isEnd = isEndDate(date);
                const hasStops = dayStops.length > 0;
                const currentMonth = isCurrentMonth(date);
                const isTentative = (isStart && startDateTentative) || (isEnd && endDateTentative);

                return (
                  <div
                    key={dayIdx}
                    className={`
                      calendar-day
                      ${inTrip ? 'in-trip' : ''}
                      ${isStart ? 'trip-start' : ''}
                      ${isEnd ? 'trip-end' : ''}
                      ${hasStops ? 'has-stops' : ''}
                      ${!currentMonth ? 'other-month' : ''}
                      ${isTentative ? 'tentative' : ''}
                    `}
                    onClick={() => onDateClick?.(date)}
                  >
                    <div className="day-number">{date.getDate()}</div>

                    {isStart && (
                      <div className="day-badge start-badge">
                        Start {startDateTentative && '?'}
                      </div>
                    )}

                    {isEnd && !isStart && (
                      <div className="day-badge end-badge">
                        End {endDateTentative && '?'}
                      </div>
                    )}

                    {hasStops && (
                      <div className="day-stops">
                        {dayStops.map((stop, idx) => (
                          <div
                            key={idx}
                            className={`stop-marker ${stop.arrival_tentative || stop.departure_tentative ? 'tentative-stop' : ''}`}
                            title={`${stop.city}, ${stop.state}${stop.arrival_tentative || stop.departure_tentative ? ' (tentative)' : ''}`}
                          >
                            <span className="stop-icon">📍</span>
                            <span className="stop-name">{stop.city}</span>
                            {stop.is_overnight && <span className="overnight-icon">🌙</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
