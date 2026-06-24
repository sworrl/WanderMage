// Bespoke WanderMage WebGL backgrounds. Each effect is a fragment-shader body that uses
// the uniforms + helpers provided by ShaderFX (uTime, uRes, uColorA/B/C, hash/vnoise/fbm).
// Themed for the road: distant ridgelines, drifting terrain, night skies, map contours.

export interface FxDef {
  id: string
  name: string
  frag: string
}

export const FX: FxDef[] = [
  {
    id: 'horizon',
    name: 'Horizon',
    frag: `
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      float t = uTime * 0.05;
      float ridges = 0.0;
      for (int i = 0; i < 4; i++){
        float fi = float(i);
        float line = 0.30 + fi * 0.13 + 0.06 * fbm(vec2(uv.x * 3.0 + fi * 7.0 + t, fi));
        ridges += smoothstep(0.012, 0.0, abs(uv.y - line)) * (0.55 - fi * 0.11);
      }
      vec3 sky = mix(uColorC, uColorA, pow(uv.y, 1.5));
      vec3 col = sky + ridges * uColorB;
      gl_FragColor = vec4(col, 1.0);
    }`,
  },
  {
    id: 'drift',
    name: 'Drift',
    frag: `
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      vec2 p = uv * 3.0;
      float t = uTime * 0.08;
      vec2 q = vec2(fbm(p + t), fbm(p + vec2(3.1, 1.7) - t));
      float v = fbm(p + 2.5 * q);
      vec3 col = mix(uColorC, uColorA, v);
      col = mix(col, uColorB, smoothstep(0.55, 0.95, v));
      gl_FragColor = vec4(col, 1.0);
    }`,
  },
  {
    id: 'nightdrive',
    name: 'Night Drive',
    frag: `
    float spark(vec2 g){
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id);
      vec2 c = (vec2(hash(id + 1.0), hash(id + 3.0)) - 0.5) * 0.6;
      return smoothstep(0.06, 0.0, length(f - c)) * step(0.86, h);
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes.xy) / uRes.y;
      float t = uTime * 0.3;
      vec3 col = uColorC * (1.0 - length(uv) * 0.4);
      for (int i = 1; i <= 3; i++){
        float fi = float(i);
        float s = spark(uv * (6.0 * fi) + vec2(t * fi * 0.2, 0.0));
        col += s * mix(uColorA, uColorB, hash(vec2(fi, 2.0))) * (0.7 / fi);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
  },
  {
    id: 'contour',
    name: 'Contour',
    frag: `
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      float t = uTime * 0.03;
      float h = fbm(uv * 4.0 + vec2(t, 0.0));
      float lines = smoothstep(0.04, 0.0, abs(fract(h * 9.0) - 0.5));
      vec3 col = mix(uColorC, uColorA, h);
      col += lines * uColorB * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }`,
  },
]

export const FX_BY_ID: Record<string, FxDef> = Object.fromEntries(FX.map((f) => [f.id, f]))
export const DEFAULT_FX = 'horizon'
export function randomFxId(): string {
  return FX[Math.floor(Math.random() * FX.length)].id
}
