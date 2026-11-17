import { defineConfig } from 'vite';

// base relativa: l'app viene caricata da file locali dentro l'APK.
export default defineConfig({ base: './', build: { target: 'es2022' } });
