import { useState } from 'react'
import { auth } from '../services/api'
import { QRCodeSVG } from 'qrcode.react'
import { useTheme } from '../contexts/ThemeContext'
import ShaderBackground from '../components/ShaderBackground'
import './Login.css'

interface LoginProps {
  onLogin: (token: string) => void
}

export default function Login({ onLogin }: LoginProps) {
  const { theme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await auth.login(username, password)
      onLogin(response.data.access_token)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="login-container">
      {/* Full-page animated WebGL background (random effect from the library) */}
      <ShaderBackground intensity={0.65} />

      <div className="login-shell">
        {/* Left panel: brand + QR to open on a phone. Its own (different) WebGL effect. */}
        <aside className="login-aside">
          <ShaderBackground absolute intensity={0.9} />
          <div className="login-aside-inner">
            <img src="/icon-192.png" alt="WanderMage" className="login-logo" />
            <h1 className="login-brand">WanderMage</h1>
            <p className="login-tagline">A Trip Wizard for Your RV Life</p>

            <div className="login-qr">
              <QRCodeSVG
                value={appUrl}
                size={168}
                bgColor="transparent"
                fgColor={theme.colors.textPrimary}
                level="M"
              />
            </div>
            <p className="login-qr-hint">Scan to open WanderMage on your phone</p>
          </div>
        </aside>

        {/* Right panel: credentials */}
        <section className="login-main">
          <div className="login-main-inner">
            <h2 className="login-heading">Sign in</h2>
            <p className="login-sub">Welcome back, wanderer.</p>

            <form onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label className="label">Username</label>
                <input
                  type="text"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
