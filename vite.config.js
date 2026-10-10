import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // enables --host / LAN access for mobile phone testing
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'framer-motion'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
