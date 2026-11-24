import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (name: string) => resolve(process.cwd(), name);

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: page('index.html'),
        metodologia: page('metodologia.html'),
        privacidad: page('privacidad.html'),
        terminos: page('terminos.html'),
        sobre: page('sobre.html'),
        contacto: page('contacto.html'),
        'guia-rechazos': page('guias/por-que-adsense-rechaza.html'),
        'guia-bajo-valor': page('guias/contenido-de-bajo-valor.html'),
        'guia-politicas': page('guias/politicas-por-tema.html'),
      },
    },
  },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
