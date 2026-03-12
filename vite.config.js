import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    // Add the specific host to the allowed list
    allowedHosts: ['wfm.balajihomeserver.qzz.io'],},
  plugins: [react()],
})