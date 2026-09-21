import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import packageJson from './package.json'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  const keyPath = path.resolve(__dirname, '.cert/server.key')
  const certificatePath = path.resolve(__dirname, '.cert/server.crt')
  const previewHttps =
    fs.existsSync(keyPath) && fs.existsSync(certificatePath)
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certificatePath),
        }
      : undefined

  return {
    envPrefix: ['VITE_', 'DISABLE_BACKEND_PREFIX', 'IMAGE_URL_PREFIX'],
    plugins: [react(), nodePolyfills()],
    define: {
      'process.env': {},
      'import.meta.env.VITE_WIDGET_VERSION': JSON.stringify(
        env.VITE_WIDGET_VERSION?.trim() || packageJson.version
      ),
    },
    build: {
      lib: {
        entry: 'src/main.tsx',
        name: 'DeepStakeWidget',
        fileName: 'widget',
        formats: ['iife'], // один JS-файл для вставки <script>
      },
      rollupOptions: {
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['@the-vault'],
    },
    preview: previewHttps ? { https: previewHttps } : {},
    server: {
      cors: {
        origin: '*', // Allow all origins
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
        allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
      },
      allowedHosts: true,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL,
          changeOrigin: true,
        },
      },
    },
  }
})
