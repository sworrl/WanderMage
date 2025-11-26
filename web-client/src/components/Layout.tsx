import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import QuickSettings from './QuickSettings'
import { achievements as achievementsApi, system as systemApi } from '../services/api'
import './Layout.css'

// Achievement from API
interface Achievement {
  id: number
  code: string
  name: string
  description: string
  icon: string
  category: string
  points: number
  rarity: string
}

interface UserAchievement {
  id: number
  achievement_id: number
  earned_at: string
  achievement: Achievement
}

interface LayoutProps {
  children: React.ReactNode
  onLogout: () => void
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [version, setVersion] = useState<string>('')
  const [achievements, setAchievements] = useState<UserAchievement[]>([])

  // Fetch version on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await systemApi.getVersion()
        setVersion(response.data.version)
      } catch (error) {
        console.error('Failed to fetch version:', error)
      }
    }
    fetchVersion()
  }, [])

  // Fetch achievements on mount
  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        // Check for new achievements
        await achievementsApi.check()

        // Get user's achievements
        const response = await achievementsApi.getMine()
        setAchievements(response.data || [])
      } catch (error) {
        console.error('Failed to fetch achievements:', error)
      }
    }

    fetchAchievements()
  }, [])

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="layout">
      <nav className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-container">
            <img src="/icon-192.png" alt="WanderMage" className="brand-icon" />
            {!sidebarCollapsed && (
              <div className="brand-text">
                <h2 style={{ color: 'var(--text-primary)' }}>WanderMage</h2>
                <span className="tagline" style={{ color: 'var(--text-muted)' }}>A Trip Wizard for Your RV Life!</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed && achievements.length > 0 && (
            <div className="achievements-display">
              <div className="achievements-header">
                <span className="achievements-count">{achievements.length}</span>
                <span className="achievements-label">Achievements</span>
              </div>
              <div className="achievements-icons">
                {achievements.slice(0, 12).map(ua => (
                  <span
                    key={ua.id}
                    className="achievement-badge"
                    title={`${ua.achievement.name}: ${ua.achievement.description}`}
                  >
                    {ua.achievement.icon}
                  </span>
                ))}
                {achievements.length > 12 && (
                  <span className="achievement-more" title={`+${achievements.length - 12} more achievements`}>
                    +{achievements.length - 12}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <ul className="nav-links">
          <li>
            <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''} title="Dashboard">
              <span className="nav-icon">📊</span>
              {!sidebarCollapsed && <span className="nav-text">Dashboard</span>}
            </Link>
          </li>
          <li>
            <Link to="/trips" className={isActive('/trips') ? 'active' : ''} title="Trips">
              <span className="nav-icon">🗺️</span>
              {!sidebarCollapsed && <span className="nav-text">Trips</span>}
            </Link>
          </li>
          <li>
            <Link to="/map" className={isActive('/map') ? 'active' : ''} title="Map">
              <span className="nav-icon">🌍</span>
              {!sidebarCollapsed && <span className="nav-text">Map</span>}
            </Link>
          </li>
          <li>
            <Link to="/engage-the-mage" className={isActive('/engage-the-mage') ? 'active' : ''} title="Engage the Mage">
              <span className="nav-icon">🧙‍♂️</span>
              {!sidebarCollapsed && <span className="nav-text">Engage the Mage</span>}
            </Link>
          </li>
          <li>
            <Link to="/rv-profiles" className={isActive('/rv-profiles') ? 'active' : ''} title="RV Profiles">
              <span className="nav-icon">🚐</span>
              {!sidebarCollapsed && <span className="nav-text">RV Profiles</span>}
            </Link>
          </li>
          <li>
            <Link to="/fuel-logs" className={isActive('/fuel-logs') ? 'active' : ''} title="Fuel Logs">
              <span className="nav-icon">⛽</span>
              {!sidebarCollapsed && <span className="nav-text">Fuel Logs</span>}
            </Link>
          </li>
          <li>
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''} title="Admin Panel">
              <span className="nav-icon">🛠️</span>
              {!sidebarCollapsed && <span className="nav-text">Admin Panel</span>}
            </Link>
          </li>
          <li>
            <Link to="/settings" className={isActive('/settings') ? 'active' : ''} title="Settings">
              <span className="nav-icon">⚙️</span>
              {!sidebarCollapsed && <span className="nav-text">Settings</span>}
            </Link>
          </li>
        </ul>
        <div className="sidebar-footer">
          {!sidebarCollapsed && <QuickSettings />}
          <button onClick={onLogout} className="btn btn-secondary" title="Logout">
            {sidebarCollapsed ? '🚪' : 'Logout'}
          </button>
          {!sidebarCollapsed && version && (
            <div className="version-display" style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
              v{version}
            </div>
          )}
        </div>
      </nav>
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? '→' : '←'}
      </button>
      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {children}
      </main>
    </div>
  )
}
