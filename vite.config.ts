import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Set PREVIEW_ALLOWED_HOST when the dev server is reached through a preview
  // proxy; no hostname is baked into the repository.
  const env = loadEnv(mode, '.', '');
  const allowedHost = env.PREVIEW_ALLOWED_HOST?.trim();

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: allowedHost ? [allowedHost] : undefined,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
