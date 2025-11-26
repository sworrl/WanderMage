import { useState } from 'react'
import { auth } from '../services/api'

export default function Users() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      await auth.register({
        username: formData.username,
        email: formData.email,
        full_name: formData.full_name,
        password: formData.password
      })

      setSuccess(`User ${formData.username} created successfully!`)
      setShowForm(false)
      setFormData({
        username: '',
        email: '',
        full_name: '',
        password: '',
        confirmPassword: ''
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1>User Management</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          Create New User
        </button>
      </div>

      {success && (
        <div className="card mb-4" style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e' }}>
          <p style={{ color: '#166534', margin: 0 }}>{success}</p>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <h2>Create New User Account</h2>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
            <div className="form-group">
              <label className="label">Username *</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="input"
                placeholder="Enter username"
              />
            </div>

            <div className="form-group">
              <label className="label">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="input"
                placeholder="Enter email"
              />
            </div>

            <div className="form-group">
              <label className="label">Full Name *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                className="input"
                placeholder="Enter full name"
              />
            </div>

            <div className="form-group">
              <label className="label">Password *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                className="input"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div className="form-group">
              <label className="label">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
                className="input"
                placeholder="Confirm password"
              />
            </div>

            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                Create User
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setError('')
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2>About User Management</h2>
        <p>
          Create additional user accounts to give family members or travel companions access to WanderMage.
          Each user will have their own login credentials but share access to all RV profiles, trips, and data.
        </p>
        <div style={{ marginTop: '15px', padding: '15px', background: '#fef3c7', borderRadius: '6px', color: '#78350f' }}>
          <strong style={{ color: '#78350f' }}>Note:</strong> All users currently have the same access level. User permissions and roles
          can be added in the future if needed.
        </div>
      </div>
    </div>
  )
}
