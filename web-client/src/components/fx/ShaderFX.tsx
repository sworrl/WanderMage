import { useEffect, useRef } from 'react'

// WanderMage WebGL background renderer.
// Draws one full-screen triangle and runs a fragment shader with a small uniform set
// (time, resolution, three theme colors). Caps DPR + frame rate, pauses when the tab is
// hidden, and honors prefers-reduced-motion (one static frame). Original implementation.

const VERTEX_SRC = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

// Shared prelude: uniforms + value-noise/fbm helpers available to every effect.
const FRAG_PRELUDE = `
precision highp float;
uniform float uTime;
uniform vec2  uRes;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export interface ShaderFXProps {
  frag: string
  colors?: [string, string, string]
  className?: string
  scale?: number
  fps?: number
  intensity?: number
}

export function ShaderFX({
  frag,
  colors = ['#7c83ff', '#a855f7', '#0a0a0f'],
  className,
  scale = 0.6,
  fps = 36,
  intensity = 1,
}: ShaderFXProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef(colors)
  colorsRef.current = colors

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    if (!gl) return

    const build = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[shaderfx]', gl.getShaderInfoLog(sh))
        return null
      }
      return sh
    }

    const vs = build(gl.VERTEX_SHADER, VERTEX_SRC)
    const fs = build(gl.FRAGMENT_SHADER, FRAG_PRELUDE + frag)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[shaderfx]', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uA = gl.getUniformLocation(prog, 'uColorA')
    const uB = gl.getUniformLocation(prog, 'uColorB')
    const uC = gl.getUniformLocation(prog, 'uColorC')

    const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale
    const fit = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const minFrame = 1000 / fps
    let raf = 0
    let t = 0
    let last = performance.now()
    let hidden = document.hidden

    const render = () => {
      fit()
      const [ar, ag, ab] = hexToRgb(colorsRef.current[0])
      const [br, bg, bb] = hexToRgb(colorsRef.current[1])
      const [cr, cg, cb] = hexToRgb(colorsRef.current[2])
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform3f(uA, ar, ag, ab)
      gl.uniform3f(uB, br, bg, bb)
      gl.uniform3f(uC, cr, cg, cb)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < minFrame) return
      const dt = Math.min(now - last, 50)
      last = now
      if (!hidden) t += dt * 0.001
      render()
    }

    const onVis = () => {
      hidden = document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    if (reduce) render()
    else raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [frag, scale, fps])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ opacity: intensity, display: 'block', width: '100%', height: '100%' }}
    />
  )
}
