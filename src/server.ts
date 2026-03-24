import 'dotenv/config';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { decode as decodeFlexPolyline } from '@here/flexpolyline';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './main.server';

// ── API-Routen: Proxy für Nominatim & HERE Routing ───────────────────────────
// Schützt die APIs vor direktem Bot-Zugriff und hält den HERE API-Key sicher
// auf dem Server (nie im Client-Bundle).

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const HERE_ROUTER_URL = 'https://router.hereapi.com/v8/routes';
const OSRM_URL = 'https://router.project-osrm.org'; // Fallback ohne API-Key

const HERE_API_KEY = process.env['HERE_API_KEY'] ?? '';

if (HERE_API_KEY) {
  console.log('HERE Routing API aktiv (Live-Traffic aktiviert)');
} else {
  console.warn('⚠ HERE_API_KEY nicht gesetzt – Fallback auf OSRM (kein Live-Traffic)');
}

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

  // GET /api/here-key – gibt HERE API Key für das clientseitige Maps JS SDK zurück
  server.get('/api/here-key', (_req, res) => {
    if (!HERE_API_KEY) { res.status(404).json({ error: 'Kein HERE API Key konfiguriert' }); return; }
    res.json({ apiKey: HERE_API_KEY });
  });

  // GET /api/traffictile/:z/:x/:y – proxied HERE Traffic Flow tiles (API-Key bleibt server-seitig)
  server.get('/api/traffictile/:z/:x/:y', async (req, res) => {
    if (!HERE_API_KEY) { res.status(204).end(); return; }

    const { z, x, y } = req.params;
    const url =
      `https://traffic.maps.hereapi.com/v3/flow/mc/${z}/${x}/${y}/png?apiKey=${HERE_API_KEY}`;

    try {
      const upstream = await fetch(url);
      if (!upstream.ok) { res.status(upstream.status).end(); return; }

      res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
      res.set('Cache-Control', 'public, max-age=60'); // Traffic-Tiles 60 s cachen
      const buffer = await upstream.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch {
      res.status(502).end();
    }
  });

  // GET /api/route?startLat=50.77&startLon=7.18&endLat=48.77&endLon=9.18
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
      if (HERE_API_KEY) {
        // ── HERE Routing API (Live-Traffic) ──────────────────────────────────
        const params = new URLSearchParams({
          transportMode: 'car',
          origin:        `${startLat},${startLon}`,
          destination:   `${endLat},${endLon}`,
          return:        'summary,polyline',
          apikey:        HERE_API_KEY,
        });

        const upstream = await fetch(`${HERE_ROUTER_URL}?${params}`);
        if (!upstream.ok) { res.status(502).json({ error: 'Routing fehlgeschlagen' }); return; }

        const data = await upstream.json() as {
          routes: Array<{
            sections: Array<{
              summary: { duration: number; length: number; baseDuration: number };
              polyline: string;
            }>;
          }>;
        };

        if (!data.routes?.length || !data.routes[0].sections?.length) {
          res.status(404).json({ error: 'Keine Route gefunden' }); return;
        }

        // Alle Sections summieren (Fähren, etc.) und Polylines zusammenführen
        const sections = data.routes[0].sections;
        const totalDistance = sections.reduce((s, sec) => s + sec.summary.length, 0);
        const totalDuration = sections.reduce((s, sec) => s + sec.summary.duration, 0);
        const baseDuration  = sections.reduce((s, sec) => s + sec.summary.baseDuration, 0);

        // HERE Flexible Polyline → GeoJSON LineString
        const allCoords: [number, number][] = [];
        for (const section of sections) {
          const decoded = decodeFlexPolyline(section.polyline);
          for (const point of decoded.polyline) {
            allCoords.push([point[1], point[0]]); // HERE: [lat,lng] → GeoJSON: [lng,lat]
          }
        }

        res.json({
          distance:     totalDistance,
          duration:     totalDuration,
          baseDuration: baseDuration,
          trafficDelay: Math.max(0, totalDuration - baseDuration),
          geometry: { type: 'LineString', coordinates: allCoords },
        });

      } else {
        // ── OSRM Fallback (kein Live-Traffic) ────────────────────────────────
        const url =
          `${OSRM_URL}/route/v1/driving/` +
          `${startLon},${startLat};${endLon},${endLat}` +
          `?overview=full&geometries=geojson`;

        const upstream = await fetch(url);
        if (!upstream.ok) { res.status(502).json({ error: 'Routing fehlgeschlagen' }); return; }

        const osrm = await upstream.json() as { code: string; routes: Array<{ distance: number; duration: number; geometry: unknown }> };
        if (osrm.code !== 'Ok' || !osrm.routes.length) {
          res.status(404).json({ error: 'Keine Route gefunden' }); return;
        }

        const r = osrm.routes[0];
        res.json({ distance: r.distance, duration: r.duration, baseDuration: r.duration, trafficDelay: 0, geometry: r.geometry });
      }
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

  const allowedHosts = process.env['ALLOWED_HOSTS']
    ? process.env['ALLOWED_HOSTS'].split(',').map((h) => h.trim())
    : ['localhost', '127.0.0.1', '::1'];

  const commonEngine = new CommonEngine({ allowedHosts });

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
