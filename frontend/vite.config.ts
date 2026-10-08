import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,        // Sets your permanent dev port (e.g., 3000 instead of 5173)
    strictPort: true,  // Fails if port 3000 is in use, preventing auto-switching to 3001
    host: true,        // Exposes dev server on network/Docker container interfaces
    proxy: { '/api': 'http://localhost:80' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'html'],
    },
  },
});
