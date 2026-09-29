import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app runs on :5173 and the API on :3000.
// The proxy forwards /tasks calls to the API, so the frontend code can always use relative URLs.
// In production Express serves the built files itself, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/tasks': 'http://localhost:3000' },
  },
});
