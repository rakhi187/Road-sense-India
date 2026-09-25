import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}
const localServerEnv = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '');

function googleRoutesProxy() {
  const middleware = async (req: any, res: any, next: () => void) => {
    if (req.method !== 'POST') { next(); return; }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || localServerEnv.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.statusCode = 204; res.end(); return; }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 16_384) { res.statusCode = 413; res.end('Request too large'); return; }
      }
      const parsed = JSON.parse(body) as { origin?: { latitude?: number; longitude?: number }; destination?: { latitude?: number; longitude?: number } };
      const validPoint = (point?: { latitude?: number; longitude?: number }) => point
        && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
        && point.latitude! >= -90 && point.latitude! <= 90
        && point.longitude! >= -180 && point.longitude! <= 180;
      if (!validPoint(parsed.origin) || !validPoint(parsed.destination)) {
        res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Valid route coordinates are required.' })); return;
      }
      const upstream = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: parsed.origin!.latitude, longitude: parsed.origin!.longitude } } },
          destination: { location: { latLng: { latitude: parsed.destination!.latitude, longitude: parsed.destination!.longitude } } },
          travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true,
          languageCode: 'en-IN', units: 'METRIC',
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const responseBody = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(responseBody);
    } catch {
      res.statusCode = 502; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Google Routes could not calculate this trip.' }));
    }
  };
  return {
    name: 'roadsense-google-routes-proxy',
    configureServer(server: any) { server.middlewares.use('/api/google-routes', middleware); },
    configurePreviewServer(server: any) { server.middlewares.use('/api/google-routes', middleware); },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    googleRoutesProxy(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
