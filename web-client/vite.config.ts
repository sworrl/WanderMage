import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Check if SSL certificates exist
const sslKeyPath = path.resolve(__dirname, '../backend/ssl/key.pem')
const sslCertPath = path.resolve(__dirname, '../backend/ssl/cert.pem')
const sslEnabled = fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Only enable HTTPS if SSL certificates exist
    ...(sslEnabled && {
      https: {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      },
    }),
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
