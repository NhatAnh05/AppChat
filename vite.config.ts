import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/media': 'http://127.0.0.1:8787', '/api/calls': { target: 'http://127.0.0.1:8788', ws: true } } },
});
