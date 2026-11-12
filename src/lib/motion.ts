/** The animation preference: follow the device, always on, or off. Stored in this browser only. */
export type Motion = 'auto' | 'on' | 'off'
const KEY = 'forged_motion'

export function getMotion(): Motion {
  try { const v = localStorage.getItem(KEY); if (v === 'on' || v === 'off') return v } catch { /* storage blocked */ }
  return 'auto'
}

/** Puts the choice on the page so the stylesheets can read it. */
export function applyMotion(m: Motion = getMotion()) {
  if (m === 'auto') delete document.documentElement.dataset.motion
  else document.documentElement.dataset.motion = m
}

export function setMotion(m: Motion) {
  try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m) } catch { /* storage blocked */ }
  applyMotion(m)
}

export const deviceReducesMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
