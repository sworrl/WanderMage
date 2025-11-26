import ThemeSelector from '../components/ThemeSelector'
import './Settings.css'

export default function Settings() {

  return (
    <div className="settings-container">
      <h1>Settings</h1>
      <p className="settings-description">
        Configure your personal preferences for WanderMage.
      </p>

      {/* Theme Selector Section */}
      <div className="settings-section">
        <ThemeSelector />
      </div>

      <div className="settings-section">
        <h2>About Settings</h2>
        <p>
          These settings are personal preferences that apply to your account.
          For trip preferences like daily driving limits, visit the <a href="/rv-profiles">RV Profiles</a> page.
        </p>
        <p>
          For admin settings like API keys, SSL certificates, and user management,
          please visit the <a href="/admin">Admin Panel</a>.
        </p>
      </div>
    </div>
  )
}
