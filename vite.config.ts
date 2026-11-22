import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // "@" is the New Forge root (src/new), so shadcn-style imports like "@/components/ui/..." stay inside it.
  resolve: { alias: { '@': fileURLToPath(new URL('./src/new', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5174 },
  test: { include: ['src/**/*.test.ts', 'supabase/**/*.test.ts', 'scripts/**/*.test.ts'] },
})
