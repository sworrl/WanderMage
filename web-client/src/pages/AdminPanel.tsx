import { useState, useEffect } from 'react'
import { settings, auth, users as usersApi } from '../services/api'
import ScraperDashboard from '../components/ScraperDashboard'
import './AdminPanel.css'

interface SSLInfo {
  installed: boolean
  valid?: boolean
  common_name?: string
  organization?: string
  issuer?: string
  not_before?: string
  not_after?: string
  is_self_signed?: boolean
  serial_number?: string
  error?: string
  message?: string
}

interface EiaKeyStatus {
  configured: boolean
  masked_value: string | null
  description: string
  updated_at: string | null
  get_key_url: string
}

interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  last_login?: string
}

type AdminTab = 'users' | 'api-keys' | 'scraping' | 'ssl'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userRole, setUserRole] = useState<string>('')

  // User Management State
  const [usersList, setUsersList] = useState<User[]>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirmPassword: ''
  })

  // SSL State
  const [sslInfo, setSSLInfo] = useState<SSLInfo | null>(null)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [hostname, setHostname] = useState('')
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // EIA API Key State
  const [eiaKeyStatus, setEiaKeyStatus] = useState<EiaKeyStatus | null>(null)
  const [eiaApiKey, setEiaApiKey] = useState('')
  const [savingEiaKey, setSavingEiaKey] = useState(false)
  const [testingEiaKey, setTestingEiaKey] = useState(false)
  const [showEiaKeyInput, setShowEiaKeyInput] = useState(false)

  // Harvest Hosts Credentials State
  const [hhStatus, setHHStatus] = useState<{ configured: boolean; email: string | null; updated_at: string | null } | null>(null)
  const [hhEmail, setHHEmail] = useState('')
  const [hhPassword, setHHPassword] = useState('')
  const [savingHHCreds, setSavingHHCreds] = useState(false)
  const [showHHInput, setShowHHInput] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      // Load user role
      const meResponse = await auth.me()
      setUserRole(meResponse.data.role || '')

      // Load users list
      await loadUsers()

      // Load SSL info
      await loadSSLInfo()

      // Load EIA key status
      await loadEiaKeyStatus()

      // Load HH credentials status
      await loadHHStatus()

      // Set default hostname
      setHostname(window.location.hostname || 'localhost')
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('You do not have permission to access the admin panel.')
      } else {
        setError('Failed to load admin panel data')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll()
      setUsersList(response.data || [])
    } catch (err) {
      console.error('Failed to load users:', err)
    }
  }

  const loadSSLInfo = async () => {
    try {
      const response = await settings.getSSLInfo()
      setSSLInfo(response.data)
    } catch (err) {
      console.error('Error loading SSL info:', err)
    }
  }

  const loadEiaKeyStatus = async () => {
    try {
      const response = await settings.getEiaApiKeyStatus()
      setEiaKeyStatus(response.data)
    } catch (err) {
      console.error('Error loading EIA key status:', err)
    }
  }

  const loadHHStatus = async () => {
    try {
      const response = await settings.getHHCredentialsStatus()
      setHHStatus(response.data)
    } catch (err) {
      console.error('Error loading HH credentials status:', err)
    }
  }

  // User Management Functions
  const handleUserFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleCreateUser = async (e: React.FormEvent) => {
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
      setShowUserForm(false)
      setFormData({
        username: '',
        email: '',
        full_name: '',
        password: '',
        confirmPassword: ''
      })

      // Reload users list
      await loadUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user')
    }
  }

  // EIA API Key Functions
  const handleSaveEiaKey = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!eiaApiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    try {
      setSavingEiaKey(true)
      setError('')
      setSuccess('')

      await settings.setEiaApiKey(eiaApiKey)

      setSuccess('EIA API key saved successfully!')
      setEiaApiKey('')
      setShowEiaKeyInput(false)

      await loadEiaKeyStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save API key')
    } finally {
      setSavingEiaKey(false)
    }
  }

  const handleTestEiaKey = async () => {
    try {
      setTestingEiaKey(true)
      setError('')
      setSuccess('')

      const response = await settings.testEiaApiKey()

      if (response.data.success) {
        setSuccess(response.data.message)
      } else {
        setError(response.data.message)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to test API key')
    } finally {
      setTestingEiaKey(false)
    }
  }

  const handleDeleteEiaKey = async () => {
    try {
      setError('')
      setSuccess('')

      await settings.deleteEiaApiKey()

      setSuccess('EIA API key deleted')
      await loadEiaKeyStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete API key')
    }
  }

  // Harvest Hosts Credentials Functions
  const handleSaveHHCreds = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hhEmail.trim() || !hhPassword.trim()) {
      setError('Please enter both email and password')
      return
    }

    try {
      setSavingHHCreds(true)
      setError('')
      setSuccess('')

      await settings.setHHCredentials(hhEmail, hhPassword)

      setSuccess('Harvest Hosts credentials saved successfully!')
      setHHEmail('')
      setHHPassword('')
      setShowHHInput(false)

      await loadHHStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save credentials')
    } finally {
      setSavingHHCreds(false)
    }
  }

  const handleDeleteHHCreds = async () => {
    try {
      setError('')
      setSuccess('')

      await settings.deleteHHCredentials()

      setSuccess('Harvest Hosts credentials deleted')
      await loadHHStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete credentials')
    }
  }

  // SSL Functions
  const handleUploadCertificate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!certificateFile || !keyFile) {
      setError('Please select both certificate and private key files')
      return
    }

    try {
      setUploading(true)
      setError('')
      setSuccess('')

      const response = await settings.uploadSSLCertificate(certificateFile, keyFile)

      setSuccess(response.data.message || 'Certificate uploaded successfully!')
      if (response.data.restart_required) {
        setSuccess(prev => prev + ' Server restart required for changes to take effect.')
      }

      setCertificateFile(null)
      setKeyFile(null)
      await loadSSLInfo()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload certificate')
    } finally {
      setUploading(false)
    }
  }

  const handleGenerateSelfSigned = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hostname.trim()) {
      setError('Please enter a hostname')
      return
    }

    try {
      setGenerating(true)
      setError('')
      setSuccess('')

      const response = await settings.generateSelfSignedCert(hostname)

      setSuccess(response.data.message || 'Self-signed certificate generated successfully!')
      if (response.data.restart_required) {
        setSuccess(prev => prev + ' Server restart required for changes to take effect.')
      }

      await loadSSLInfo()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate self-signed certificate')
    } finally {
      setGenerating(false)
    }
  }

  const handleDeleteCertificate = async () => {
    try {
      setDeleting(true)
      setError('')
      setSuccess('')

      const response = await settings.deleteSSLCertificate()

      setSuccess(response.data.message || 'Certificate deleted successfully')
      setShowDeleteConfirm(false)

      await loadSSLInfo()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete certificate')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const isExpiringSoon = () => {
    if (!sslInfo?.not_after) return false
    const expiryDate = new Date(sslInfo.not_after)
    const daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return daysUntilExpiry < 30 && daysUntilExpiry > 0
  }

  const isExpired = () => {
    if (!sslInfo?.not_after) return false
    return new Date(sslInfo.not_after) < new Date()
  }

  if (loading) {
    return (
      <div className="admin-panel">
        <div className="admin-loading">Loading admin panel...</div>
      </div>
    )
  }

  // Check if user has admin access
  const hasAdminAccess = ['admin', 'superadmin', 'owner'].includes(userRole)

  if (!hasAdminAccess) {
    return (
      <div className="admin-panel">
        <div className="admin-error">
          <h2>Access Denied</h2>
          <p>You do not have permission to access the admin panel. Only administrators can view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p className="admin-subtitle">Manage users, API keys, and system settings</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span className="tab-icon">👥</span>
          Users
        </button>
        <button
          className={`tab-btn ${activeTab === 'api-keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('api-keys')}
        >
          <span className="tab-icon">🔑</span>
          API Keys
        </button>
        <button
          className={`tab-btn ${activeTab === 'scraping' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraping')}
        >
          <span className="tab-icon">🕷️</span>
          Scraping
        </button>
        <button
          className={`tab-btn ${activeTab === 'ssl' ? 'active' : ''}`}
          onClick={() => setActiveTab('ssl')}
        >
          <span className="tab-icon">🔒</span>
          SSL
        </button>
      </div>

      {/* Tab Content */}
      <div className="admin-content">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="admin-section">
            <div className="section-header">
              <h2>User Management</h2>
              <button onClick={() => setShowUserForm(true)} className="btn btn-primary">
                + Create User
              </button>
            </div>

            {showUserForm && (
              <div className="admin-card">
                <h3>Create New User</h3>
                <form onSubmit={handleCreateUser} className="user-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Username *</label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleUserFormChange}
                        required
                        placeholder="Enter username"
                      />
                    </div>
                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleUserFormChange}
                        required
                        placeholder="Enter email"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleUserFormChange}
                      required
                      placeholder="Enter full name"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Password *</label>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleUserFormChange}
                        required
                        minLength={8}
                        placeholder="Minimum 8 characters"
                      />
                    </div>
                    <div className="form-group">
                      <label>Confirm Password *</label>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleUserFormChange}
                        required
                        minLength={8}
                        placeholder="Confirm password"
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      Create User
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserForm(false)
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

            {/* Users List */}
            <div className="users-list">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(user => (
                    <tr key={user.id}>
                      <td className="username-cell">{user.username}</td>
                      <td>{user.email}</td>
                      <td>{user.full_name}</td>
                      <td>
                        <span className={`role-badge role-${user.role}`}>
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {usersList.length === 0 && (
                <div className="empty-state">
                  <p>No users found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="admin-section">
            <h2>API Keys</h2>
            <p className="section-description">
              Configure API keys for external services.
            </p>

            <div className="admin-card">
              <h3>EIA Fuel Prices API</h3>
              <p className="card-description">
                The EIA (Energy Information Administration) API provides weekly fuel price data by region.
                This is used to calculate accurate trip fuel costs.
              </p>

              {eiaKeyStatus?.configured ? (
                <div>
                  <div className="key-status key-configured">
                    <span className="status-icon">✅</span>
                    <span>API Key Configured</span>
                  </div>

                  <div className="key-details">
                    <div className="detail-row">
                      <span className="detail-label">Key:</span>
                      <span className="detail-value">{eiaKeyStatus.masked_value}</span>
                    </div>
                    {eiaKeyStatus.updated_at && (
                      <div className="detail-row">
                        <span className="detail-label">Last Updated:</span>
                        <span className="detail-value">{formatDate(eiaKeyStatus.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="key-actions">
                    <button
                      onClick={handleTestEiaKey}
                      className="btn btn-secondary"
                      disabled={testingEiaKey}
                    >
                      {testingEiaKey ? 'Testing...' : 'Test Key'}
                    </button>
                    <button
                      onClick={() => setShowEiaKeyInput(true)}
                      className="btn btn-primary"
                    >
                      Update Key
                    </button>
                    <button
                      onClick={handleDeleteEiaKey}
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="key-status key-missing">
                    <span className="status-icon">⚠️</span>
                    <span>API Key Not Configured</span>
                  </div>
                  <p className="key-note">
                    Default fuel prices will be used until an API key is configured.
                  </p>
                  <button
                    onClick={() => setShowEiaKeyInput(true)}
                    className="btn btn-primary"
                  >
                    Add API Key
                  </button>
                </div>
              )}

              {showEiaKeyInput && (
                <form onSubmit={handleSaveEiaKey} className="key-form">
                  <div className="form-group">
                    <label>EIA API Key</label>
                    <input
                      type="text"
                      value={eiaApiKey}
                      onChange={(e) => setEiaApiKey(e.target.value)}
                      placeholder="Enter your EIA API key"
                      disabled={savingEiaKey}
                      required
                    />
                    <span className="field-hint">
                      Get a free API key at{' '}
                      <a
                        href={eiaKeyStatus?.get_key_url || 'https://www.eia.gov/opendata/register.php'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        eia.gov/opendata/register.php
                      </a>
                    </span>
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={savingEiaKey || !eiaApiKey.trim()}
                    >
                      {savingEiaKey ? 'Saving...' : 'Save Key'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEiaKeyInput(false)
                        setEiaApiKey('')
                      }}
                      className="btn btn-secondary"
                      disabled={savingEiaKey}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Harvest Hosts Credentials */}
            <div className="admin-card">
              <h3>Harvest Hosts Credentials</h3>
              <p className="card-description">
                Harvest Hosts membership credentials are required to scrape campground data from their platform.
                These credentials are used by the Harvest Hosts scraper.
              </p>

              {hhStatus?.configured ? (
                <div>
                  <div className="key-status key-configured">
                    <span className="status-icon">✅</span>
                    <span>Credentials Configured</span>
                  </div>

                  <div className="key-details">
                    <div className="detail-row">
                      <span className="detail-label">Email:</span>
                      <span className="detail-value">{hhStatus.email}</span>
                    </div>
                    {hhStatus.updated_at && (
                      <div className="detail-row">
                        <span className="detail-label">Last Updated:</span>
                        <span className="detail-value">{formatDate(hhStatus.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="key-actions">
                    <button
                      onClick={() => setShowHHInput(true)}
                      className="btn btn-primary"
                    >
                      Update Credentials
                    </button>
                    <button
                      onClick={handleDeleteHHCreds}
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="key-status key-missing">
                    <span className="status-icon">⚠️</span>
                    <span>Credentials Not Configured</span>
                  </div>
                  <p className="key-note">
                    The Harvest Hosts scraper requires valid membership credentials to access campground data.
                  </p>
                  <button
                    onClick={() => setShowHHInput(true)}
                    className="btn btn-primary"
                  >
                    Add Credentials
                  </button>
                </div>
              )}

              {showHHInput && (
                <form onSubmit={handleSaveHHCreds} className="key-form">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={hhEmail}
                      onChange={(e) => setHHEmail(e.target.value)}
                      placeholder="Enter your Harvest Hosts email"
                      disabled={savingHHCreds}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={hhPassword}
                      onChange={(e) => setHHPassword(e.target.value)}
                      placeholder="Enter your Harvest Hosts password"
                      disabled={savingHHCreds}
                      required
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={savingHHCreds || !hhEmail.trim() || !hhPassword.trim()}
                    >
                      {savingHHCreds ? 'Saving...' : 'Save Credentials'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHHInput(false)
                        setHHEmail('')
                        setHHPassword('')
                      }}
                      className="btn btn-secondary"
                      disabled={savingHHCreds}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Scraping Tab */}
        {activeTab === 'scraping' && (
          <div className="admin-section">
            <ScraperDashboard />
          </div>
        )}

        {/* SSL Tab */}
        {activeTab === 'ssl' && (
          <div className="admin-section">
            <h2>SSL Certificate Management</h2>
            <p className="section-description">
              Manage SSL certificates for secure HTTPS connections.
            </p>

            {/* Current Certificate */}
            <div className="admin-card">
              <h3>Current Certificate</h3>
              {!sslInfo?.installed ? (
                <div className="cert-status cert-none">
                  <span className="status-icon">⚠️</span>
                  <span>No SSL certificate installed</span>
                </div>
              ) : !sslInfo.valid ? (
                <div className="cert-status cert-invalid">
                  <span className="status-icon">❌</span>
                  <span>Invalid certificate: {sslInfo.error || sslInfo.message}</span>
                </div>
              ) : (
                <>
                  <div className={`cert-status ${isExpired() ? 'cert-expired' : isExpiringSoon() ? 'cert-warning' : 'cert-valid'}`}>
                    <span className="status-icon">
                      {isExpired() ? '❌' : isExpiringSoon() ? '⚠️' : '✅'}
                    </span>
                    <span>
                      {isExpired() ? 'Certificate Expired' : isExpiringSoon() ? 'Expires Soon' : 'Valid Certificate'}
                    </span>
                  </div>

                  <div className="cert-details">
                    <div className="detail-row">
                      <span className="detail-label">Common Name:</span>
                      <span className="detail-value">{sslInfo.common_name}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Organization:</span>
                      <span className="detail-value">{sslInfo.organization}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Issuer:</span>
                      <span className="detail-value">{sslInfo.issuer}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Type:</span>
                      <span className="detail-value">
                        {sslInfo.is_self_signed ? 'Self-Signed' : 'CA-Signed'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Valid Until:</span>
                      <span className="detail-value">{formatDate(sslInfo.not_after)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn btn-danger"
                    disabled={deleting}
                  >
                    Delete Certificate
                  </button>
                </>
              )}
            </div>

            {/* Upload Certificate */}
            <div className="admin-card">
              <h3>Upload SSL Certificate</h3>
              <p className="card-description">
                Upload a custom SSL certificate and private key (e.g., from Let's Encrypt).
              </p>

              <form onSubmit={handleUploadCertificate} className="ssl-form">
                <div className="form-group">
                  <label>Certificate File (.pem, .crt)</label>
                  <input
                    type="file"
                    accept=".pem,.crt"
                    onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
                    disabled={uploading}
                  />
                  {certificateFile && (
                    <span className="file-selected">Selected: {certificateFile.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label>Private Key File (.pem, .key)</label>
                  <input
                    type="file"
                    accept=".pem,.key"
                    onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                    disabled={uploading}
                  />
                  {keyFile && (
                    <span className="file-selected">Selected: {keyFile.name}</span>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={uploading || !certificateFile || !keyFile}
                >
                  {uploading ? 'Uploading...' : 'Upload Certificate'}
                </button>
              </form>
            </div>

            {/* Generate Self-Signed */}
            <div className="admin-card">
              <h3>Generate Self-Signed Certificate</h3>
              <p className="card-description">
                Generate a self-signed certificate for testing or initial setup.
              </p>

              <form onSubmit={handleGenerateSelfSigned} className="ssl-form">
                <div className="form-group">
                  <label>Hostname</label>
                  <input
                    type="text"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="wandermage.example.com"
                    disabled={generating}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={generating || !hostname.trim()}
                >
                  {generating ? 'Generating...' : 'Generate Certificate'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete the current SSL certificate?
              A backup will be created before deletion.
            </p>
            <div className="modal-actions">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCertificate}
                className="btn btn-danger"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
