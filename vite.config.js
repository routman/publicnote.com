import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/api': process.env.PUBLICNOTE_API || 'http://localhost:3001'
    }
  },
  build: {
    target: 'es2019'
  }
});
