import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vite.dev/config/
// export default defineConfig({
//     plugins: [react()],
//     define: {
//       //"process.env.NODE_ENV": JSON.stringify("production"), // 👈 фикс
//       'process.env': {}
//     },
//     build: {
//       lib: {
//         entry: "src/main.tsx",
//         name: "MyWidget",
//         fileName: "widget",
//         formats: ["iife"], // один JS-файл для вставки <script>
//       },
//       rollupOptions: {
//         output: {
//           globals: {
//             react: "React",
//             "react-dom": "ReactDOM",
//           },
//         },
//       },
//     },
//     server: {
//           cors: {
//               origin: '*', // Allow all origins
//               methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
//               allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
//           },
//           allowedHosts: true,
//           proxy: {
//             "/api": {
//               target: import.meta.env.VITE_BACKEND_URL, //"https://logical-flea-mildly.ngrok-free.app/api", // your backend
//               changeOrigin: true,
//             },
//           },
//       },
// })

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
      nodePolyfills(),
    ],
    define: {
      //"process.env.NODE_ENV": JSON.stringify("production"), // 👈 фикс
      'process.env': {}
    },
    build: {
      lib: {
        entry: "src/main.tsx",
        name: "MyWidget",
        fileName: "widget",
        formats: ["iife"], // один JS-файл для вставки <script>
      },
      rollupOptions: {
        output: {
          globals: {
            react: "React",
            "react-dom": "ReactDOM",
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ["@the-vault"]
    },
    preview: {
      https: {
        key: fs.readFileSync(path.resolve(__dirname, '.cert/server.key')),
        cert: fs.readFileSync(path.resolve(__dirname, '.cert/server.crt')),
      },
    },
    server: {
          cors: {
              origin: '*', // Allow all origins
              methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
              allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
          },
          allowedHosts: true,
          proxy: {
            "/api": {
              target: env.VITE_BACKEND_URL,
              changeOrigin: true,
            },
          },
      },
}
})
