import { useEffect, useRef } from 'react'

// Bespoke WebGL loader — a rotating energy ring with a pulsing core in the brand colors.
// House style: graphics are WebGL, not spinners/GIFs. Transparent so it sits on any background.
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision highp float;
uniform vec2 u_r; uniform float u_t;
void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_r) / min(u_r.x, u_r.y);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float sweep = 0.5 + 0.5 * sin(a - u_t * 3.0);
  float ring = smoothstep(0.03, 0.0, abs(r - 0.55)) * (0.25 + 0.75 * sweep);
  float glow = exp(-3.5 * abs(r - 0.55)) * sweep * 0.7;
  float core = exp(-9.0 * r) * (0.55 + 0.45 * sin(u_t * 2.2));
  vec3 ca = vec3(0.486, 0.514, 1.0);
  vec3 cb = vec3(0.659, 0.333, 0.969);
  vec3 col = mix(ca, cb, 0.5 + 0.5 * sin(a + u_t));
  float i = ring + glow + core;
  gl_FragColor = vec4(col * i, i);
}`

export default function Loader({ size = 120, label }: { size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = size * dpr
    cv.height = size * dpr
    gl.viewport(0, 0, cv.width, cv.height)
    const sh = (t: number, s: string) => {
      const o = gl.createShader(t)!
      gl.shaderSource(o, s)
      gl.compileShader(o)
      return o
    }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(pr)
    gl.useProgram(pr)
    const bf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const lp = gl.getAttribLocation(pr, 'p')
    gl.enableVertexAttribArray(lp)
    gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    const ur = gl.getUniformLocation(pr, 'u_r')
    const ut = gl.getUniformLocation(pr, 'u_t')
    let raf = 0
    let t0: number | null = null
    const frame = (ts: number) => {
      if (t0 === null) t0 = ts
      gl.uniform2f(ur, cv.width, cv.height)
      gl.uniform1f(ut, (ts - t0) / 1000)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <canvas ref={ref} style={{ width: size, height: size }} />
      {label && (
        <div style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{label}</div>
      )}
    </div>
  )
}
