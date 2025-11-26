import { useEffect, useState } from 'react'
import { fuelLogs as fuelApi } from '../services/api'
import { format } from 'date-fns'

export default function FuelLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const response = await fuelApi.getAll()
      setLogs(response.data)
    } catch (error) {
      console.error('Failed to load fuel logs:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Loading fuel logs...</div>
  }

  return (
    <div>
      <h1>Fuel Logs</h1>

      {logs.length === 0 ? (
        <div className="card">
          <p>No fuel logs yet.</p>
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Location</th>
                <th style={{ padding: '12px' }}>Gallons</th>
                <th style={{ padding: '12px' }}>Price/Gal</th>
                <th style={{ padding: '12px' }}>Total Cost</th>
                <th style={{ padding: '12px' }}>MPG</th>
                <th style={{ padding: '12px' }}>Odometer</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    {format(new Date(log.date), 'MMM dd, yyyy')}
                  </td>
                  <td style={{ padding: '12px' }}>{log.location_name || 'N/A'}</td>
                  <td style={{ padding: '12px' }}>{log.gallons.toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>${log.price_per_gallon.toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>${log.total_cost.toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>
                    {log.calculated_mpg ? log.calculated_mpg.toFixed(1) : 'N/A'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {log.odometer_reading ? log.odometer_reading.toLocaleString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
