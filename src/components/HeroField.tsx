/**
 * The home background, drawn in code: a navy field with a fine dot grid, and a DEXA hub joined to one
 * point per data source (13), with soft pulses travelling in along the links. One gateway, many sources.
 * Pure SVG, so it is sharp at any size and costs almost nothing to load.
 */
const HUB = { x: 1010, y: 470 }

// 13 sources: an outer ring of ten and three closer in. Kept to the centre and right so the welcome text stays clear.
const NODES: [number, number][] = [
  [760, 250], [905, 168], [1120, 196], [1302, 292], [1424, 452],
  [1332, 640], [1150, 762], [930, 790], [756, 660], [688, 462],
  [1222, 472], [858, 418], [1060, 328],
]
// a few links between neighbours, so it reads as a network and not only a star
const RING: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [10, 4], [10, 3], [11, 9], [11, 0], [12, 1], [12, 2]]

export function HeroField() {
  return (
    <svg className="hf" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="hf-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="1" fill="#fff" />
        </pattern>
        <radialGradient id="hf-fade" cx={HUB.x / 1600} cy={HUB.y / 1000} r="0.62">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="hf-mask"><rect width="1600" height="1000" fill="url(#hf-fade)" /></mask>
        <radialGradient id="hf-glow" cx={HUB.x / 1600} cy={HUB.y / 1000} r="0.42">
          <stop offset="0" stopColor="#3b6fe0" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#24468f" stopOpacity="0.14" />
          <stop offset="1" stopColor="#0b1526" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#hf-glow)" />
      <rect width="1600" height="1000" fill="url(#hf-dots)" opacity="0.09" mask="url(#hf-mask)" />

      {/* rings around the hub */}
      <g fill="none" stroke="#fff">
        {[90, 175, 290, 420].map((r, i) => (
          <circle key={r} className={`hf__ring hf__ring--${i}`} cx={HUB.x} cy={HUB.y} r={r} strokeOpacity={0.09 - i * 0.015} strokeWidth="1" />
        ))}
      </g>

      {/* links: neighbours, then every source to the hub */}
      <g stroke="#cfe0ff" strokeLinecap="round" fill="none">
        {RING.map(([a, b]) => (
          <line key={`r${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} strokeOpacity="0.13" strokeWidth="1" />
        ))}
        {NODES.map(([x, y], i) => (
          <line key={`s${i}`} x1={x} y1={y} x2={HUB.x} y2={HUB.y} strokeOpacity="0.2" strokeWidth="1" />
        ))}
      </g>

      {/* pulses travelling in to the hub */}
      <g stroke="#fff" strokeLinecap="round" fill="none">
        {NODES.map(([x, y], i) => (
          <line key={`p${i}`} className="hf__pulse" style={{ animationDelay: `${(i * 0.73) % 6}s` }}
            x1={x} y1={y} x2={HUB.x} y2={HUB.y} pathLength={100} strokeWidth="2.4" />
        ))}
      </g>

      {/* the sources */}
      <g>
        {NODES.map(([x, y], i) => (
          <g key={`n${i}`}>
            <circle cx={x} cy={y} r="10" fill="#9dbcff" fillOpacity="0.1" />
            <circle className="hf__node" style={{ animationDelay: `${(i * 0.41) % 4}s` }} cx={x} cy={y} r="3.6" fill="#fff" />
          </g>
        ))}
      </g>

      {/* the DEXA hub */}
      <circle cx={HUB.x} cy={HUB.y} r="64" fill="#0b1526" fillOpacity="0.55" stroke="#fff" strokeOpacity="0.28" />
      <circle className="hf__halo" cx={HUB.x} cy={HUB.y} r="64" fill="none" stroke="#9dbcff" strokeOpacity="0.5" />
      <image className="hf__logo" href="/dexa-logo-navy.png" x={HUB.x - 42} y={HUB.y - 9} width="84" height="18" preserveAspectRatio="xMidYMid meet" />
    </svg>
  )
}
