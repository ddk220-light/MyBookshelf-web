import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { policyTextPlugin } from '../shared/policy-effective-date.mjs';

export default defineConfig({
  // As the build (vite.config.js): the policy texts arrive with their date.
  plugins: [react(), policyTextPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
});
