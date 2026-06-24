import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { ShaderFX } from './fx/ShaderFX'
import { FX_BY_ID, DEFAULT_FX, randomFxId } from './fx/shaders'
import { safeStorage } from '../utils/storage'

interface ShaderBackgroundProps {
  /** Effect id from the fx library. Defaults to localStorage 'wandermage_fx', else a random one (different per mount). */
  effect?: string
  /** Canvas opacity 0..1. */
  intensity?: number
  /** When true, fills the nearest positioned ancestor instead of the viewport. */
  absolute?: boolean
}

/**
 * Theme-aware WebGL background. Pulls its 3 shader colors from the active theme
 * and (by default) picks a different effect from the 130+ library on each mount.
 * Cheap to render (half-res, capped FPS) and pauses when offscreen/hidden.
 */
export default function ShaderBackground({ effect, intensity = 0.7, absolute = false }: ShaderBackgroundProps) {
  const { theme } = useTheme()
  // Resolve once per mount so the effect stays stable across re-renders.
  const [id] = useState(() => effect || safeStorage.getItem('wandermage_fx') || randomFxId())
  const fx = FX_BY_ID[effect || id] || FX_BY_ID[DEFAULT_FX]

  const colors: [string, string, string] = [
    theme.colors.accentPrimary,
    theme.colors.accentSecondary,
    theme.colors.bgPrimary,
  ]

  return (
    <div
      aria-hidden="true"
      style={{ position: absolute ? 'absolute' : 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <ShaderFX frag={fx.frag} colors={colors} intensity={intensity} scale={0.5} fps={36} />
    </div>
  )
}
