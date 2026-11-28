import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { localMediaRequestAllowed } from './scripts/local-media-policy.ts';

const local = process.env.LYRA_LOCAL_MEDIA_MODE === '1' && /^[0-9a-f]{64}$/.test(process.env.LYRA_LOCAL_MEDIA_KEY || '');
const mediaPort = Number(process.env.MEDIA_PORT || 8787);
if (!Number.isInteger(mediaPort) || mediaPort < 1 || mediaPort > 65535) throw new Error('MEDIA_PORT không hợp lệ.');
export default defineConfig({
  plugins: [react(), {
    name: 'lyra-local-media-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/media/local/')) return next();
        if (!localMediaRequestAllowed(local,req.socket.remoteAddress,req.headers.host,req.method,req.headers.origin,
          typeof req.headers['sec-fetch-site']==='string'?req.headers['sec-fetch-site']:undefined)) {
          res.writeHead(403, {'Content-Type':'application/json','Cache-Control':'no-store'});
          res.end(JSON.stringify({error:'Media thử nghiệm chỉ dành cho localhost.'}));
          return;
        }
        next();
      });
    },
  }],
  server: {
    ...(local ? {host:'127.0.0.1'} : {}),
    proxy: {
      '/api/media': {
        target: `http://127.0.0.1:${mediaPort}`,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.removeHeader('x-lyra-local-gateway');
            if (req.url?.startsWith('/api/media/local/') && localMediaRequestAllowed(local,req.socket.remoteAddress,req.headers.host,req.method,req.headers.origin,typeof req.headers['sec-fetch-site']==='string'?req.headers['sec-fetch-site']:undefined)) proxyReq.setHeader('x-lyra-local-gateway',process.env.LYRA_LOCAL_MEDIA_KEY!);
          });
        },
      },
    },
  },
});
