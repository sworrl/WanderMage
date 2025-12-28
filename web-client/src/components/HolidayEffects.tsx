import { useState, useEffect, useMemo } from 'react'
import { Z_INDEX } from '../styles/zIndex'

// Firework type for fully randomized fireworks - all animation is CSS-driven
interface Firework {
  id: number
  left: number
  top: number
  palette: string[]
  particles: Array<{
    tx: number
    ty: number
    color: string
    size: number
  }>
  sparkles: Array<{
    tx: number
    ty: number
    color: string
  }>
}

// Fully randomized fireworks display component - Pure CSS animations
function FireworksDisplay({ isUSA }: { isUSA: boolean }) {
  const [fireworks, setFireworks] = useState<Firework[]>([])

  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 60,
      size: 1 + Math.random() * 2,
      duration: 2 + Math.random() * 3,
      delay: Math.random() * 5
    })), []
  )

  const colorPalettes = useMemo(() => isUSA
    ? [
        ['#ff0000', '#ff3333', '#ff6666'],
        ['#ffffff', '#f0f0ff', '#e8e8ff'],
        ['#0044ff', '#0066ff', '#3388ff'],
      ]
    : [
        ['#ff0000', '#ff4444', '#ff8888'],
        ['#00ff00', '#44ff44', '#88ff88'],
        ['#ffff00', '#ffff44', '#ffff88'],
        ['#ff00ff', '#ff44ff', '#ff88ff'],
        ['#00ffff', '#44ffff', '#88ffff'],
        ['#ff8800', '#ffaa44', '#ffcc88'],
        ['#ff69b4', '#ff88cc', '#ffaadd'],
        ['#9933ff', '#aa55ff', '#cc88ff'],
        ['#00ff88', '#44ffaa', '#88ffcc'],
        ['#ffd700', '#ffdf44', '#ffe788'],
        ['#ff1493', '#ff44aa', '#ff88cc'],
      ], [isUSA]
  )

  useEffect(() => {
    let counter = 0

    const createFirework = (): Firework => {
      const palette = colorPalettes[Math.floor(Math.random() * colorPalettes.length)]
      const particleCount = 24 + Math.floor(Math.random() * 16)
      const size = 0.7 + Math.random() * 0.6

      // Pre-generate all particle data
      const particles = Array.from({ length: particleCount }, (_, j) => {
        const baseAngle = (j / particleCount) * 360
        const angleVar = (Math.random() - 0.5) * 25
        const angle = baseAngle + angleVar
        const distance = (60 + Math.random() * 60) * size
        const rad = angle * Math.PI / 180
        return {
          tx: Math.cos(rad) * distance,
          ty: Math.sin(rad) * distance,
          color: palette[Math.floor(Math.random() * palette.length)],
          size: 3 + Math.random() * 4
        }
      })

      // Pre-generate sparkle ring
      const sparkles = Array.from({ length: 14 }, (_, k) => {
        const angle = (k / 14) * 360
        const dist = (30 + Math.random() * 30) * size
        const rad = angle * Math.PI / 180
        return {
          tx: Math.cos(rad) * dist,
          ty: Math.sin(rad) * dist,
          color: palette[Math.floor(Math.random() * palette.length)]
        }
      })

      return {
        id: counter++,
        left: 8 + Math.random() * 84,
        top: 12 + Math.random() * 38,
        palette,
        particles,
        sparkles
      }
    }

    // Start with initial fireworks
    setFireworks(Array.from({ length: 4 }, createFirework))

    // Add new fireworks and remove old ones
    const interval = setInterval(() => {
      setFireworks(prev => {
        // Keep last 10, add 1-2 new ones
        const kept = prev.slice(-10)
        const newCount = 1 + Math.floor(Math.random() * 2)
        const newOnes = Array.from({ length: newCount }, createFirework)
        return [...kept, ...newOnes]
      })
    }, 600 + Math.random() * 400)

    return () => clearInterval(interval)
  }, [colorPalettes])

  // Total animation cycle: 0.8s rocket + 2.5s explosion = 3.3s
  const ROCKET_DURATION = 0.8
  const EXPLOSION_DELAY = ROCKET_DURATION
  const EXPLOSION_DURATION = 2.2
  const TOTAL_CYCLE = 3.5

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: Z_INDEX.BACKGROUND.EFFECTS,
      overflow: 'hidden'
    }}>
      <style>{`
        @keyframes fw-rocket {
          0% { transform: translateY(70vh); opacity: 0; }
          10% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(0); opacity: 0; }
        }

        @keyframes fw-burst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          40% { opacity: 0.8; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.15); opacity: 0; }
        }

        @keyframes fw-flash {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(4); opacity: 0; }
        }

        @keyframes fw-sparkle {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)); opacity: 0; }
        }

        @keyframes fw-twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.9; }
        }
      `}</style>

      {/* Background stars */}
      {stars.map(star => (
        <div
          key={star.id}
          style={{
            position: 'absolute',
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: '#fff',
            borderRadius: '50%',
            animation: `fw-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            boxShadow: '0 0 4px #fff'
          }}
        />
      ))}

      {/* Fireworks - each is a complete animation sequence */}
      {fireworks.map(fw => (
        <div key={fw.id} style={{ position: 'absolute', left: `${fw.left}%`, top: `${fw.top}%` }}>
          {/* Rocket trail - animates up then disappears */}
          <div style={{
            position: 'absolute',
            animation: `fw-rocket ${ROCKET_DURATION}s ease-out forwards`,
            willChange: 'transform, opacity'
          }}>
            <div style={{
              width: '4px',
              height: '24px',
              background: `linear-gradient(to top, ${fw.palette[0]}, ${fw.palette[1]}, transparent)`,
              borderRadius: '2px',
              boxShadow: `0 0 8px ${fw.palette[0]}, 0 0 16px ${fw.palette[1]}`
            }} />
          </div>

          {/* Explosion container - starts after rocket finishes */}
          <div style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            animationDelay: `${EXPLOSION_DELAY}s`
          }}>
            {/* Central flash - hidden until animation starts */}
            <div style={{
              position: 'absolute',
              left: '-40px',
              top: '-40px',
              width: '80px',
              height: '80px',
              background: `radial-gradient(circle, rgba(255,255,255,0.85) 0%, ${fw.palette[0]}77 25%, ${fw.palette[1]}44 50%, transparent 75%)`,
              borderRadius: '50%',
              opacity: 0,
              animation: `fw-flash 0.35s ease-out ${EXPLOSION_DELAY}s forwards`,
              willChange: 'transform, opacity'
            }} />

            {/* Main explosion particles - hidden until animation starts */}
            {fw.particles.map((p, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  background: p.color,
                  borderRadius: '50%',
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}, 0 0 ${p.size * 3}px ${p.color}`,
                  '--tx': `${p.tx}px`,
                  '--ty': `${p.ty}px`,
                  opacity: 0,
                  animation: `fw-burst ${EXPLOSION_DURATION}s ease-out ${EXPLOSION_DELAY}s forwards`,
                  willChange: 'transform, opacity'
                } as React.CSSProperties}
              />
            ))}

            {/* Sparkle ring - hidden until animation starts */}
            {fw.sparkles.map((sp, k) => (
              <div
                key={`sp-${k}`}
                style={{
                  position: 'absolute',
                  width: '3px',
                  height: '3px',
                  background: sp.color,
                  borderRadius: '50%',
                  boxShadow: `0 0 4px ${sp.color}`,
                  '--tx': `${sp.tx}px`,
                  '--ty': `${sp.ty}px`,
                  opacity: 0,
                  animation: `fw-sparkle ${EXPLOSION_DURATION * 0.6}s ease-out ${EXPLOSION_DELAY}s forwards`,
                  willChange: 'transform, opacity'
                } as React.CSSProperties}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Holiday Effects Component - adds seasonal decorations for US holidays
type HolidayEffect = 'snow' | 'fireworks' | 'fireworks-usa' | 'hearts' | 'shamrocks' | 'eggs' | 'flags' | 'spooky' | 'leaves' | null

type HolidayInfo = {
  effect: HolidayEffect
  name: string
  emoji: string
}

// Helper functions for calculating holiday dates
const getNthWeekday = (year: number, month: number, weekday: number, n: number): number => {
  let count = 0
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d)
    if (date.getMonth() !== month) break
    if (date.getDay() === weekday) {
      count++
      if (count === n) return d
    }
  }
  return 0
}

const getLastWeekday = (year: number, month: number, weekday: number): number => {
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let d = lastDay; d >= 1; d--) {
    const date = new Date(year, month, d)
    if (date.getDay() === weekday) return d
  }
  return 0
}

const getEasterDate = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

// Get current holiday info
export function getCurrentHoliday(): HolidayInfo | null {
  const now = new Date()
  const month = now.getMonth()
  const day = now.getDate()
  const year = now.getFullYear()

  // New Year's Day: Jan 1-2
  if (month === 0 && day <= 2) {
    return { effect: 'fireworks', name: 'New Year', emoji: '🎆' }
  }
  // MLK Day: 3rd Monday of January
  if (month === 0) {
    const mlkDay = getNthWeekday(year, 0, 1, 3)
    if (day >= mlkDay - 3 && day <= mlkDay) {
      return { effect: 'flags', name: 'MLK Day', emoji: '🇺🇸' }
    }
  }
  // Valentine's Day: Feb 12-14
  if (month === 1 && day >= 12 && day <= 14) {
    return { effect: 'hearts', name: "Valentine's Day", emoji: '❤️' }
  }
  // Presidents' Day: 3rd Monday of February
  if (month === 1) {
    const presDay = getNthWeekday(year, 1, 1, 3)
    if (day >= presDay - 2 && day <= presDay) {
      return { effect: 'flags', name: "Presidents' Day", emoji: '🇺🇸' }
    }
  }
  // St. Patrick's Day: March 15-17
  if (month === 2 && day >= 15 && day <= 17) {
    return { effect: 'shamrocks', name: "St. Patrick's Day", emoji: '☘️' }
  }
  // Easter: Variable
  if ((month === 2 && day >= 28) || (month === 3 && day <= 25)) {
    const easter = getEasterDate(year)
    if (Math.abs(now.getTime() - easter.getTime()) < 3 * 24 * 60 * 60 * 1000) {
      return { effect: 'eggs', name: 'Easter', emoji: '🐰' }
    }
  }
  // Memorial Day: Last Monday of May
  if (month === 4) {
    const memDay = getLastWeekday(year, 4, 1)
    if (day >= memDay - 3 && day <= memDay) {
      return { effect: 'flags', name: 'Memorial Day', emoji: '🇺🇸' }
    }
  }
  // Independence Day: July 1-4
  if (month === 6 && day >= 1 && day <= 4) {
    return { effect: 'fireworks-usa', name: 'Independence Day', emoji: '🎇' }
  }
  // Labor Day: 1st Monday of September
  if (month === 8) {
    const laborDay = getNthWeekday(year, 8, 1, 1)
    if (day >= laborDay - 2 && day <= laborDay) {
      return { effect: 'flags', name: 'Labor Day', emoji: '🇺🇸' }
    }
  }
  // Halloween: Oct 28-31
  if (month === 9 && day >= 28 && day <= 31) {
    return { effect: 'spooky', name: 'Halloween', emoji: '🎃' }
  }
  // Veterans Day: Nov 10-11
  if (month === 10 && day >= 10 && day <= 11) {
    return { effect: 'flags', name: 'Veterans Day', emoji: '🇺🇸' }
  }
  // Thanksgiving: 4th Thursday of November
  if (month === 10) {
    const thanksgiving = getNthWeekday(year, 10, 4, 4)
    if (day >= thanksgiving - 1 && day <= thanksgiving + 1) {
      return { effect: 'leaves', name: 'Thanksgiving', emoji: '🦃' }
    }
  }
  // Christmas season: Dec 20 - Dec 26 (through the day after Christmas)
  if (month === 11 && day >= 20 && day <= 26) {
    return { effect: 'snow', name: 'Christmas', emoji: '🎄' }
  }
  // New Year's Eve: Dec 27-31 (leading up to and including NYE)
  if (month === 11 && day >= 27 && day <= 31) {
    return { effect: 'fireworks', name: "New Year's Eve", emoji: '🎇' }
  }

  return null
}

// Holiday toggle component - only shows when a holiday is active
export function HolidayToggle({ enabled, onToggle }: { enabled: boolean, onToggle: (enabled: boolean) => void }) {
  const holiday = getCurrentHoliday()

  if (!holiday) return null

  return (
    <div
      onClick={() => onToggle(!enabled)}
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        background: enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        border: '2px solid var(--border-color)',
        borderRadius: '25px',
        padding: '8px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: Z_INDEX.HOLIDAY_TOGGLE,
        boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
        transition: 'all 0.2s ease',
        fontSize: '14px'
      }}
      title={`Toggle ${holiday.name} effects`}
    >
      <span style={{ fontSize: '18px' }}>{holiday.emoji}</span>
      <span style={{ color: enabled ? 'white' : 'var(--text-primary)' }}>
        {holiday.name}
      </span>
      <div style={{
        width: '36px',
        height: '20px',
        background: enabled ? 'rgba(255,255,255,0.3)' : 'var(--bg-secondary)',
        borderRadius: '10px',
        position: 'relative',
        transition: 'all 0.2s ease'
      }}>
        <div style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '18px' : '2px',
          width: '16px',
          height: '16px',
          background: 'white',
          borderRadius: '50%',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
      </div>
    </div>
  )
}

// Main Holiday Effects component
export default function HolidayEffects({ enabled = true }: { enabled?: boolean }) {
  const [holiday, setHoliday] = useState<HolidayInfo | null>(null)

  useEffect(() => {
    setHoliday(getCurrentHoliday())
  }, [])

  if (!enabled || !holiday) return null

  const effect = holiday.effect

  // Snow effect for Christmas
  if (effect === 'snow') {
    const snowflakes = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 7,
      size: 4 + Math.random() * 8,
      opacity: 0.3 + Math.random() * 0.5
    }))

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: Z_INDEX.BACKGROUND.EFFECTS,
        overflow: 'hidden'
      }}>
        <style>{`
          @keyframes snowfall {
            0% { transform: translateY(-10vh) rotate(0deg); }
            100% { transform: translateY(110vh) rotate(360deg); }
          }
          @keyframes sway {
            0%, 100% { margin-left: 0; }
            50% { margin-left: 20px; }
          }
        `}</style>
        {snowflakes.map(flake => (
          <div
            key={flake.id}
            style={{
              position: 'absolute',
              left: `${flake.left}%`,
              top: '-20px',
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              background: 'white',
              borderRadius: '50%',
              opacity: flake.opacity,
              animation: `snowfall ${flake.duration}s linear ${flake.delay}s infinite, sway ${3 + Math.random() * 2}s ease-in-out infinite`,
              boxShadow: '0 0 5px rgba(255,255,255,0.5)'
            }}
          />
        ))}
      </div>
    )
  }

  // Fireworks effect for New Year's - Fully randomized spectacular explosions!
  if (effect === 'fireworks' || effect === 'fireworks-usa') {
    return <FireworksDisplay isUSA={effect === 'fireworks-usa'} />
  }

  // Hearts effect for Valentine's Day
  if (effect === 'hearts') {
    const hearts = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 10 + Math.random() * 5,
      size: 10 + Math.random() * 15,
      opacity: 0.3 + Math.random() * 0.4
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes float-up {
            0% { transform: translateY(110vh) scale(1); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-10vh) scale(1.2); opacity: 0; }
          }
        `}</style>
        {hearts.map(heart => (
          <div key={heart.id} style={{
            position: 'absolute',
            left: `${heart.left}%`,
            fontSize: `${heart.size}px`,
            opacity: heart.opacity,
            animation: `float-up ${heart.duration}s ease-in-out ${heart.delay}s infinite`,
            color: `hsl(${340 + Math.random() * 20}, 80%, 60%)`
          }}>
            ❤️
          </div>
        ))}
      </div>
    )
  }

  // Shamrocks effect for St. Patrick's Day
  if (effect === 'shamrocks') {
    const shamrocks = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 8,
      duration: 8 + Math.random() * 6,
      size: 12 + Math.random() * 18,
      opacity: 0.4 + Math.random() * 0.4
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes shamrock-fall {
            0% { transform: translateY(-10vh) rotate(0deg); }
            100% { transform: translateY(110vh) rotate(360deg); }
          }
        `}</style>
        {shamrocks.map(s => (
          <div key={s.id} style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: '-20px',
            fontSize: `${s.size}px`,
            opacity: s.opacity,
            animation: `shamrock-fall ${s.duration}s linear ${s.delay}s infinite`
          }}>
            ☘️
          </div>
        ))}
      </div>
    )
  }

  // Easter eggs effect
  if (effect === 'eggs') {
    const eggs = ['🥚', '🐣', '🐰', '🌷', '🥕']
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      duration: 12 + Math.random() * 6,
      size: 14 + Math.random() * 14,
      opacity: 0.5 + Math.random() * 0.4,
      emoji: eggs[Math.floor(Math.random() * eggs.length)]
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes egg-fall {
            0% { transform: translateY(-10vh) rotate(0deg); }
            100% { transform: translateY(110vh) rotate(180deg); }
          }
        `}</style>
        {items.map(item => (
          <div key={item.id} style={{
            position: 'absolute',
            left: `${item.left}%`,
            top: '-20px',
            fontSize: `${item.size}px`,
            opacity: item.opacity,
            animation: `egg-fall ${item.duration}s linear ${item.delay}s infinite`
          }}>
            {item.emoji}
          </div>
        ))}
      </div>
    )
  }

  // Flags effect for patriotic holidays
  if (effect === 'flags') {
    const flags = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 8,
      duration: 10 + Math.random() * 5,
      size: 20 + Math.random() * 15,
      opacity: 0.5 + Math.random() * 0.4
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes flag-wave {
            0% { transform: translateY(-10vh) rotate(-5deg); }
            50% { transform: translateY(50vh) rotate(5deg); }
            100% { transform: translateY(110vh) rotate(-5deg); }
          }
        `}</style>
        {flags.map(flag => (
          <div key={flag.id} style={{
            position: 'absolute',
            left: `${flag.left}%`,
            top: '-30px',
            fontSize: `${flag.size}px`,
            opacity: flag.opacity,
            animation: `flag-wave ${flag.duration}s ease-in-out ${flag.delay}s infinite`
          }}>
            🇺🇸
          </div>
        ))}
      </div>
    )
  }

  // Spooky effect for Halloween
  if (effect === 'spooky') {
    const spookyItems = ['🎃', '👻', '🦇', '🕷️', '💀', '🕸️']
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 8,
      size: 16 + Math.random() * 20,
      opacity: 0.4 + Math.random() * 0.5,
      emoji: spookyItems[Math.floor(Math.random() * spookyItems.length)]
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes spooky-float {
            0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 0; }
            10% { opacity: 1; }
            50% { transform: translateY(50vh) rotate(180deg) scale(1.2); }
            90% { opacity: 1; }
            100% { transform: translateY(110vh) rotate(360deg) scale(1); opacity: 0; }
          }
        `}</style>
        {items.map(item => (
          <div key={item.id} style={{
            position: 'absolute',
            left: `${item.left}%`,
            top: '-30px',
            fontSize: `${item.size}px`,
            opacity: item.opacity,
            animation: `spooky-float ${item.duration}s ease-in-out ${item.delay}s infinite`
          }}>
            {item.emoji}
          </div>
        ))}
      </div>
    )
  }

  // Leaves effect for Thanksgiving
  if (effect === 'leaves') {
    const leafEmojis = ['🍂', '🍁', '🦃', '🌽', '🥧']
    const leaves = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 6,
      size: 14 + Math.random() * 16,
      opacity: 0.4 + Math.random() * 0.5,
      emoji: leafEmojis[Math.floor(Math.random() * leafEmojis.length)]
    }))

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: Z_INDEX.BACKGROUND.EFFECTS, overflow: 'hidden'
      }}>
        <style>{`
          @keyframes leaf-fall {
            0% { transform: translateY(-10vh) rotate(0deg) translateX(0); }
            25% { transform: translateY(25vh) rotate(90deg) translateX(30px); }
            50% { transform: translateY(50vh) rotate(180deg) translateX(-30px); }
            75% { transform: translateY(75vh) rotate(270deg) translateX(30px); }
            100% { transform: translateY(110vh) rotate(360deg) translateX(0); }
          }
        `}</style>
        {leaves.map(leaf => (
          <div key={leaf.id} style={{
            position: 'absolute',
            left: `${leaf.left}%`,
            top: '-20px',
            fontSize: `${leaf.size}px`,
            opacity: leaf.opacity,
            animation: `leaf-fall ${leaf.duration}s ease-in-out ${leaf.delay}s infinite`
          }}>
            {leaf.emoji}
          </div>
        ))}
      </div>
    )
  }

  return null
}
