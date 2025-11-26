import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { trips as tripsApi } from '../services/api'

export default function Trips() {
  const [trips, setTrips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrips()
  }, [])

  const loadTrips = async () => {
    try {
      const response = await tripsApi.getAll()
      setTrips(response.data)
    } catch (error) {
      console.error('Failed to load trips:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this trip?')) {
      try {
        await tripsApi.delete(id)
        setTrips(trips.filter(t => t.id !== id))
      } catch (error) {
        console.error('Failed to delete trip:', error)
      }
    }
  }

  if (loading) {
    return <div>Loading trips...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1>Trips</h1>
        <Link to="/trips/new" className="btn btn-primary">
          Create New Trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="card">
          <p>No trips yet. Create your first trip to get started!</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
          {trips.map(trip => (
            <div key={trip.id} className="card">
              <div className="flex gap-4">
                {/* Trip Map Image */}
                <div style={{ flexShrink: 0 }}>
                  <img
                    src={`/uploads/trip_maps/trip_${trip.id}.png`}
                    alt={`${trip.name} route map`}
                    style={{
                      width: '150px',
                      height: '150px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const placeholder = target.nextElementSibling as HTMLElement
                      if (placeholder) placeholder.style.display = 'flex'
                    }}
                  />
                  <div style={{
                    display: 'none',
                    width: '150px',
                    height: '150px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12px'
                  }}>
                    No route map
                  </div>
                </div>

                {/* Trip Details */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ margin: '0 0 8px 0' }}>{trip.name}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', fontSize: '14px', marginBottom: '8px' }}>
                      <span>
                        <strong>Status:</strong> {trip.status}
                      </span>
                      <span>
                        <strong>Distance:</strong> {trip.total_distance_miles.toFixed(1)} mi
                      </span>
                      <span>
                        <strong>Fuel Cost:</strong> ${trip.total_fuel_cost.toFixed(2)}
                      </span>
                    </div>
                    {/* Stops List */}
                    {trip.stops && trip.stops.length > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        <strong>Stops:</strong>
                        <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', listStyleType: 'disc' }}>
                          {trip.stops
                            .sort((a: any, b: any) => a.stop_order - b.stop_order)
                            .map((stop: any, idx: number) => {
                              // Format date
                              let dateStr = ''
                              if (stop.arrival_time) {
                                const date = new Date(stop.arrival_time)
                                dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              }

                              // Get POI name
                              let poiName = stop.name
                              if (!poiName || poiName === 'Messages') {
                                poiName = stop.city || `Stop ${idx + 1}`
                              }

                              return (
                                <li key={stop.id} style={{ marginBottom: '2px' }}>
                                  {dateStr && <span style={{ fontWeight: 500 }}>{dateStr}</span>}
                                  {dateStr && ' - '}
                                  {stop.state && <span>{stop.state}: </span>}
                                  {poiName}
                                </li>
                              )
                            })
                          }
                        </ul>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <Link to={`/trips/${trip.id}`} className="btn btn-primary">
                      View
                    </Link>
                    <Link to={`/trips/${trip.id}/edit`} className="btn btn-secondary">
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(trip.id)}
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
