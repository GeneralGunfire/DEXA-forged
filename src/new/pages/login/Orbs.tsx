import { useEffect, useRef } from 'react'

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'

// A handful of smooth, lit grey spheres that drift, touch and part again. Each one is a bump with a finite reach,
// summed into a surface; the light, a rim and a fine ripple on the skin give them depth. Nothing here touches data.
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec2 uC;
const float T = 0.28;

float field(vec2 p) {
  float F = 0.0;
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    vec2 base = vec2(sin(k * 2.4 + 1.0), cos(k * 1.9 + 0.4)) * vec2(0.66, 0.44);
    vec2 c = uC + base + vec2(sin(uT * 0.23 * (1.0 + k * 0.27) + k * 2.1), cos(uT * 0.19 * (1.0 + k * 0.21) + k * 1.3)) * 0.17;
    float R = (k < 1.5 ? 0.66 : 0.44) + 0.05 * sin(uT * 0.4 + k * 1.7);
    float w = max(1.0 - dot(p - c, p - c) / (R * R), 0.0);
    F += w * w * w;
  }
  return F;
}
float height(vec2 p) {
  float h = sqrt(max(field(p) - T, 0.0)) * 0.5;
  return h + sin(p.x * 26.0 + uT * 0.6) * sin(p.y * 23.0 - uT * 0.5) * 0.004 * smoothstep(0.0, 0.2, h);
}
void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float f = field(p);
  float a = smoothstep(T - 0.01, T + 0.012, f);
  if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float e = 0.003;
  float h = height(p);
  vec2 g = vec2(height(p + vec2(e, 0.0)) - height(p - vec2(e, 0.0)), height(p + vec2(0.0, e)) - height(p - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-g * 0.85, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.65, 0.75));
  float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 R = reflect(-L, n);
  float spec = pow(max(R.z, 0.0), 40.0);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.4);
  vec3 col = mix(vec3(0.09), vec3(0.82), pow(diff, 1.5));
  col += vec3(0.95) * spec * 0.5 + vec3(0.6) * rim * 0.3;
  col *= 0.78 + 0.22 * smoothstep(0.0, 0.45, h);
  gl_FragColor = vec4(col * a, a);
}`

/** The moving orbs behind the sign-in form. Draws nothing if WebGL is not available. */
export function Orbs({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
    if (!canvas || !gl) return
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[Orbs] shader compile:', gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[Orbs] shader failed:', gl.getProgramInfoLog(prog)); return }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'uRes'), uT = gl.getUniformLocation(prog, 'uT'), uC = gl.getUniformLocation(prog, 'uC')
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0, last = 0, alive = true
    const draw = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      const aspect = w / h
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uT, t)
      // wide screens: the spheres sit to the right of the form; narrow screens: low down, behind it
      gl.uniform2f(uC, aspect > 1.1 ? aspect * 0.46 : 0.0, aspect > 1.1 ? -0.02 : -0.55)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const loop = (now: number) => {
      if (!alive) return
      // about 40 frames a second is plenty for slow drifting
      if (now - last > 24) { last = now; draw(now / 1000 + 6) }
      raf = requestAnimationFrame(loop)
    }
    const onResize = () => draw(9)
    if (calm) { draw(9); window.addEventListener('resize', onResize) } else raf = requestAnimationFrame(loop)
    // the context is left to be collected with the canvas: losing it here would break the second run React makes in development
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
