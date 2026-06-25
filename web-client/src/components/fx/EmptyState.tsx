import { useEffect, useRef, ReactNode } from 'react'

// Bespoke WebGL empty-state: a slow drift of brand-colored motes — distant lights on the
// open road, the feeling of territory not yet explored. House style: graphics are WebGL.
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision highp float;
uniform vec2 u_r; uniform float u_t;
float hash(vec2 p){return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);}
void main(){
  vec2 uv = gl_FragCoord.xy / u_r;
  vec2 p = uv; p.x *= u_r.x / u_r.y;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 seed = vec2(hash(vec2(fi, 1.0)), hash(vec2(fi, 2.0)));
    float spd = 0.02 + 0.05 * hash(vec2(fi, 3.0));
    vec2 pos = vec2(fract(seed.x + u_t * spd * 0.25), seed.y);
    pos.x *= u_r.x / u_r.y;
    float d = length(p - pos);
    float tw = 0.45 + 0.55 * sin(u_t * 1.4 + fi * 1.7);
    col += vec3(0.486, 0.514, 1.0) * 0.45 * tw * exp(-260.0 * d * d);
    col += vec3(0.659, 0.333, 0.969) * 0.28 * tw * exp(-520.0 * d * d);
  }
  col += vec3(0.09, 0.12, 0.26) * pow(1.0 - uv.y, 3.0) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`

export default function EmptyState({
  title, hint, children, minHeight = 220,
}: { title: string; hint?: string; children?: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const gl = cv.getContext('webgl')
    if (!gl) return
    function size() {
      const r = cv!.getBoundingClientRect()
      const d = Math.min(window.devicePixelRatio || 1, 2)
      cv!.width = Math.max(2, r.width * d)
      cv!.height = Math.max(2, r.height * d)
      gl!.viewport(0, 0, cv!.width, cv!.height)
    }
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); return o }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(pr); gl.useProgram(pr)
    const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const lp = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0)
    const ur = gl.getUniformLocation(pr, 'u_r'), ut = gl.getUniformLocation(pr, 'u_t')
    size(); window.addEventListener('resize', size)
    let raf = 0, t0: number | null = null
    const frame = (ts: number) => {
      if (t0 === null) t0 = ts
      gl.uniform2f(ur, cv.width, cv.height); gl.uniform1f(ut, (ts - t0) / 1000)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [])

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', minHeight,
      border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '32px 24px' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 650, color: 'var(--text-primary, #fff)' }}>{title}</h3>
        {hint && <p style={{ margin: '8px auto 0', maxWidth: 360, fontSize: 14, color: 'var(--text-secondary, #b8b8c8)' }}>{hint}</p>}
        {children && <div style={{ marginTop: 18 }}>{children}</div>}
      </div>
    </div>
  )
}
