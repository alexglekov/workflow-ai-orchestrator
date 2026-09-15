/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server:{
    port: 4200,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setTimeout(300_000);
          });
          proxy.on('error', (err, _req, res) => {
            if (
              res &&
              'headersSent' in res &&
              !res.headersSent &&
              'writeHead' in res
            ) {
              const down =
                'code' in err &&
                (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET');
              res.writeHead(down ? 502 : 504, {
                'Content-Type': 'application/json',
              });
              res.end(
                JSON.stringify({
                  message: down
                    ? 'API не запущен. Подождите секунду и повторите.'
                    : 'API не ответил вовремя. Повторите запрос или выберите другого агента.',
                }),
              );
            }
          });
        },
      },
    },
  },
  preview:{
    port: 4200,
    host: '127.0.0.1',
  },
  plugins: [!process.env.VITEST && reactRouter(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
