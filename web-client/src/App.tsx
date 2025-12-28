import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import HolidayEffects, { getCurrentHoliday } from './components/HolidayEffects'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Trips from './pages/Trips'
import TripDetail from './pages/TripDetail'
import TripForm from './pages/TripForm'
import TripPlanWizard from './pages/TripPlanWizard'
import RVProfiles from './pages/RVProfiles'
import FuelLogs from './pages/FuelLogs'
import MapView from './pages/MapView'
import AdminPanel from './pages/AdminPanel'
import Settings from './pages/Settings'
import EngageTheMage from './pages/EngageTheMage'
import api from './services/api'
import { safeStorage } from './utils/storage'

function App() {
  // Check token synchronously on mount for instant render
  const hasToken = !!safeStorage.getItem('token')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(hasToken)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(hasToken ? false : null)
  const [loading, setLoading] = useState(!hasToken) // Only show loading if no token

  // Holiday effects state - only show if there's an active holiday
  const [holidayEffectsEnabled, setHolidayEffectsEnabled] = useState(() => {
    const saved = safeStorage.getItem('holidayEffectsEnabled')
    return saved !== 'false' // Default to true
  })
  const currentHoliday = getCurrentHoliday()
  const hasActiveHoliday = !!currentHoliday

  // Debug log for holiday detection
  console.log('Holiday check:', { currentHoliday, hasActiveHoliday, holidayEffectsEnabled })

  // Save holiday preference
  useEffect(() => {
    safeStorage.setItem('holidayEffectsEnabled', holidayEffectsEnabled.toString())
  }, [holidayEffectsEnabled])

  // Listen for holiday toggle events from QuickSettings
  useEffect(() => {
    const handleHolidayToggle = (event: CustomEvent) => {
      setHolidayEffectsEnabled(event.detail)
    }
    window.addEventListener('holidayToggle', handleHolidayToggle as EventListener)
    return () => {
      window.removeEventListener('holidayToggle', handleHolidayToggle as EventListener)
    }
  }, [])

  useEffect(() => {
    // If already authenticated, no need to check setup
    if (hasToken) {
      return
    }

    const checkSetup = async () => {
      try {
        console.log('Checking setup status...')
        // First check if setup is required (no authentication needed for this endpoint)
        const response = await api.get('/auth/setup-required')
        const needsSetup = response.data.setup_required
        console.log('Setup required:', needsSetup)
        setSetupRequired(needsSetup)

        // Only check authentication if setup is NOT required
        if (!needsSetup) {
          const token = safeStorage.getItem('token')
          console.log('Setup not required, checking auth token:', !!token)
          setIsAuthenticated(!!token)
        } else {
          // Clear any existing token if setup is required
          console.log('Setup required, clearing auth token')
          safeStorage.removeItem('token')
          setIsAuthenticated(false)
        }
      } catch (error) {
        console.error('Failed to check setup status:', error)
        // If we can't reach the backend, assume setup is required
        setSetupRequired(true)
        safeStorage.removeItem('token')
        setIsAuthenticated(false)
      } finally {
        setLoading(false)
      }
    }

    checkSetup()
  }, [])

  const handleLogin = (token: string) => {
    console.log('Login successful, setting auth state')
    safeStorage.setItem('token', token)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    console.log('Logging out, clearing auth state')
    safeStorage.removeItem('token')
    setIsAuthenticated(false)
  }

  // Protected Route wrapper
  const ProtectedRoute = () => {
    // Check BOTH state and localStorage for auth
    const hasToken = !!safeStorage.getItem('token')
    const isAuth = isAuthenticated || hasToken

    console.log('ProtectedRoute check - isAuthenticated:', isAuthenticated, 'hasToken:', hasToken, 'isAuth:', isAuth)

    if (!isAuth) {
      return <Navigate to="/login" replace />
    }

    // Update state if we have a token but state is false
    if (hasToken && !isAuthenticated) {
      setIsAuthenticated(true)
    }

    return (
      <Layout onLogout={handleLogout}>
        <Outlet />
      </Layout>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  // Redirect to setup if required
  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return (
    <>
      {/* Holiday Effects - global, on every page (toggle moved to QuickSettings) */}
      {hasActiveHoliday && <HolidayEffects enabled={holidayEffectsEnabled} />}

      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />
        } />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/new" element={<TripPlanWizard />} />
          <Route path="/trips/manual" element={<TripForm />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="/trips/:id/edit" element={<TripForm />} />
          <Route path="/rv-profiles" element={<RVProfiles />} />
          <Route path="/fuel-logs" element={<FuelLogs />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/engage-the-mage" element={<EngageTheMage />} />
          <Route path="/overpass-search" element={<Navigate to="/engage-the-mage" replace />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/users" element={<Navigate to="/admin" replace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </>
  )
}

export default App
