import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './main.server';

// ── API-Routen: Proxy für Nominatim & OSRM ───────────────────────────────────
// Schützt die öffentlichen APIs vor direktem Bot-Zugriff und ermöglicht
// serverseitiges IP-Rate-Limiting.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OSRM_URL      = 'https://router.project-osrm.org';

/** Max. 30 API-Anfragen pro 10 Minuten pro IP */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte warten Sie einige Minuten.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1', // localhost ausschließen
});

function addApiRoutes(server: express.Express): void {
  server.use('/api/', apiLimiter);

  // GET /api/geocode?plz=53757
  server.get('/api/geocode', async (req, res) => {
    const plz = String(req.query['plz'] ?? '').trim();
    if (!/^\d{5}$/.test(plz)) {
      res.status(400).json({ error: 'Ungültige PLZ' });
      return;
    }

    try {
      const url =
        `${NOMINATIM_URL}/search` +
        `?postalcode=${encodeURIComponent(plz)}&country=DE&format=json&limit=1`;

      const upstream = await fetch(url, {
        headers: {
          'Accept-Language': 'de',
          'User-Agent': 'EKS-Website/1.0 (info@euro-kurier-su.de)',
        },
      });
      if (!upstream.ok) { res.status(502).json({ error: 'Geocoding fehlgeschlagen' }); return; }

      const data = await upstream.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) { res.status(404).json({ error: 'PLZ nicht gefunden' }); return; }

      res.json({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name });
    } catch {
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  // GET /api/route?startLon=7.18&startLat=50.77&endLon=9.18&endLat=48.77
  server.get('/api/route', async (req, res) => {
    const startLat = parseFloat(String(req.query['startLat'] ?? ''));
    const startLon = parseFloat(String(req.query['startLon'] ?? ''));
    const endLat   = parseFloat(String(req.query['endLat']   ?? ''));
    const endLon   = parseFloat(String(req.query['endLon']   ?? ''));

    if ([startLat, startLon, endLat, endLon].some(isNaN)) {
      res.status(400).json({ error: 'Ungültige Koordinaten' });
      return;
    }

    try {
      const url =
        `${OSRM_URL}/route/v1/driving/` +
        `${startLon},${startLat};${endLon},${endLat}` +
        `?overview=full&geometries=geojson`;

      const upstream = await fetch(url);
      if (!upstream.ok) { res.status(502).json({ error: 'Routing fehlgeschlagen' }); return; }

      const data = await upstream.json() as { code: string; routes: unknown[] };
      if (data.code !== 'Ok' || !data.routes.length) {
        res.status(404).json({ error: 'Keine Route gefunden' });
        return;
      }
      res.json(data.routes[0]);
    } catch {
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });
}

export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // API-Proxy-Routen (müssen vor static + Angular-Handler stehen)
  addApiRoutes(server);

  // Serve static files from the browser build with aggressive caching
  server.get(
    '*.*',
    express.static(browserDistFolder, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      immutable: true,
    })
  );

  // Health check endpoint
  server.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  const server = app();
  server.listen(port, () => {
    console.log(`EKS Node Express server listening on http://localhost:${port}`);
  });
}

run();
