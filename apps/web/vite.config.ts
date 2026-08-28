import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  // Route splitting is a build concern; component tests need the actual route component.
  plugins: [...(process.env.VITEST ? [] : [tanstackRouter({ target: 'react', autoCodeSplitting: true })]), react()],
});
