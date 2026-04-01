import 'dotenv/config';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger, format, transports } from 'winston';
import { decode as decodeFlexPolyline } from '@here/flexpolyline';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './main.server';

// ── Strukturiertes Logging ────────────────────────────────────────────────────
const isProd = process.env['NODE_ENV'] === 'production';

const logger = createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    isProd ? format.json() : format.combine(format.colorize(), format.simple()),
  ),
  transports: [new transports.Console()],
});

// ── Umgebungsvariablen ────────────────────────────────────────────────────────
const NOMINATIM_URL    = 'https://nominatim.openstreetmap.org';
const HERE_ROUTER_URL  = 'https://router.hereapi.com/v8/routes';
const OSRM_URL         = 'https://router.project-osrm.org';

const HERE_API_KEY        = process.env['HERE_API_KEY']        ?? '';
const EMAILJS_SERVICE_ID  = process.env['EMAILJS_SERVICE_ID']  ?? '';
const EMAILJS_TEMPLATE_ID = process.env['EMAILJS_TEMPLATE_ID'] ?? '';
const EMAILJS_PUBLIC_KEY  = process.env['EMAILJS_PUBLIC_KEY']  ?? '';
const EMAILJS_PRIVATE_KEY = process.env['EMAILJS_PRIVATE_KEY'] ?? '';

if (HERE_API_KEY) {
  logger.info('HERE Routing API aktiv (Live-Traffic aktiviert)');
} else {
  logger.warn('HERE_API_KEY nicht gesetzt – Fallback auf OSRM (kein Live-Traffic)');
}
if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
  logger.warn('EmailJS-Credentials unvollständig – Kontaktformular nicht funktionsfähig');
}

// ── Rate-Limiter ──────────────────────────────────────────────────────────────
/** Max. 30 API-Anfragen pro 10 Minuten pro IP */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte warten Sie einige Minuten.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
});

/** Strikteres Limit für das Kontaktformular: max. 5 Submissions pro 15 Minuten pro IP */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Nachrichten. Bitte warten Sie 15 Minuten.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
});

// ── Fetch-Hilfsfunktion mit Timeout ──────────────────────────────────────────
/** Fetch mit 10-Sekunden-Timeout – verhindert hängende Anfragen */
function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
}

// ── E-Mail-Validierung ────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  // RFC 5322 vereinfacht – robuster als der einfache [^\s@]+ Regex
  return (
    email.length <= 254 &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email)
  );
}

// ── API-Routen ────────────────────────────────────────────────────────────────
function addApiRoutes(server: express.Express): void {
  // Rate-Limit nur auf teure Routen – Traffic-Tiles sind gecachte Bilder und kommen pro Kartenansicht massenhaft
  server.use('/api/geocode', apiLimiter);
  server.use('/api/route', apiLimiter);

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

      const upstream = await fetchWithTimeout(url, {
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

  // POST /api/contact – leitet Kontaktanfragen server-seitig an EmailJS weiter
  server.post('/api/contact', express.json({ limit: '16kb' }), contactLimiter, async (req, res) => {
    const { name, email, company, phone, message } = req.body ?? {};

    if (typeof name    !== 'string' || name.trim().length    < 2  || name.trim().length    > 100) {
      res.status(400).json({ error: 'Ungültiger Name' }); return;
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      res.status(400).json({ error: 'Ungültige E-Mail' }); return;
    }
    if (typeof message !== 'string' || message.trim().length < 20 || message.trim().length > 5000) {
      res.status(400).json({ error: 'Ungültige Nachricht' }); return;
    }
    if (company !== undefined && (typeof company !== 'string' || company.length > 200)) {
      res.status(400).json({ error: 'Ungültiger Firmenname' }); return;
    }
    if (phone !== undefined && (typeof phone !== 'string' || phone.length > 50)) {
      res.status(400).json({ error: 'Ungültige Telefonnummer' }); return;
    }

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
      res.status(503).json({ error: 'E-Mail-Dienst nicht konfiguriert' }); return;
    }

    try {
      const ejsRes = await fetchWithTimeout('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:      EMAILJS_SERVICE_ID,
          template_id:     EMAILJS_TEMPLATE_ID,
          user_id:         EMAILJS_PUBLIC_KEY,
          accessToken:     EMAILJS_PRIVATE_KEY,
          template_params: {
            from_name:  name.trim(),
            from_email: email.trim(),
            company:    (company as string | undefined)?.trim() || '–',
            phone:      (phone   as string | undefined)?.trim() || '–',
            message:    message.trim(),
          },
        }),
      });

      if (!ejsRes.ok) {
        logger.error('EmailJS Fehler', { status: ejsRes.status });
        res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' }); return;
      }

      res.status(200).json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  // GET /api/traffictile/:z/:x/:y – proxied HERE Traffic Flow Tiles
  server.get('/api/traffictile/:z/:x/:y', async (req, res) => {
    if (!HERE_API_KEY) { res.status(204).end(); return; }

    const z = parseInt(req.params['z'], 10);
    const x = parseInt(req.params['x'], 10);
    const y = parseInt(req.params['y'], 10);
    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 20 || x < 0 || y < 0) {
      res.status(400).end(); return;
    }

    const url = `https://traffic.maps.hereapi.com/v3/flow/mc/${z}/${x}/${y}/png?apiKey=${HERE_API_KEY}`;

    try {
      const upstream = await fetchWithTimeout(url);
      if (!upstream.ok) { res.status(upstream.status).end(); return; }

      res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
      res.set('Cache-Control', 'public, max-age=60');
      const buffer = await upstream.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch {
      res.status(502).end();
    }
  });

  // GET /api/route
  server.get('/api/route', async (req, res) => {
    const startLat = parseFloat(String(req.query['startLat'] ?? ''));
    const startLon = parseFloat(String(req.query['startLon'] ?? ''));
    const endLat   = parseFloat(String(req.query['endLat']   ?? ''));
    const endLon   = parseFloat(String(req.query['endLon']   ?? ''));

    if ([startLat, startLon, endLat, endLon].some(isNaN)) {
      res.status(400).json({ error: 'Ungültige Koordinaten' }); return;
    }

    // Bounding Box Deutschland – verhindert SSRF-Missbrauch
    const DE = { latMin: 47.0, latMax: 55.5, lonMin: 5.5, lonMax: 15.5 };
    const inBounds = (lat: number, lon: number) =>
      lat >= DE.latMin && lat <= DE.latMax && lon >= DE.lonMin && lon <= DE.lonMax;

    if (!inBounds(startLat, startLon) || !inBounds(endLat, endLon)) {
      res.status(400).json({ error: 'Koordinaten außerhalb des unterstützten Bereichs (Deutschland)' }); return;
    }

    try {
      if (HERE_API_KEY) {
        const params = new URLSearchParams({
          transportMode: 'car',
          origin:        `${startLat},${startLon}`,
          destination:   `${endLat},${endLon}`,
          return:        'summary,polyline',
          spans:         'dynamicSpeedInfo',
          departureTime: new Date().toISOString(),
          apikey:        HERE_API_KEY,
        });

        const upstream = await fetchWithTimeout(`${HERE_ROUTER_URL}?${params}`);
        if (!upstream.ok) {
          logger.error('HERE Routing Fehler', { status: upstream.status });
          res.status(502).json({ error: 'Routing fehlgeschlagen' }); return;
        }

        const data = await upstream.json() as {
          routes: Array<{
            sections: Array<{
              summary: { duration: number; length: number; baseDuration: number };
              polyline: string;
              spans?: Array<{
                offset: number;
                dynamicSpeedInfo?: { trafficSpeed: number; baseSpeed: number };
              }>;
            }>;
          }>;
        };

        if (!data.routes?.length || !data.routes[0].sections?.length) {
          logger.warn('HERE: Keine Route gefunden');
          res.status(404).json({ error: 'Keine Route gefunden' }); return;
        }

        const firstSection = data.routes[0].sections[0];
        logger.info('HERE Route berechnet', {
          spans:        firstSection.spans?.length ?? 0,
          duration:     firstSection.summary.duration,
          trafficDelay: firstSection.summary.duration - firstSection.summary.baseDuration,
        });

        type TrafficLevel = 'none' | 'moderate' | 'heavy';
        type TrafficSegment = { coords: [number, number][]; level: TrafficLevel };

        function speedRatioToLevel(trafficSpeed: number, baseSpeed: number): TrafficLevel {
          if (baseSpeed <= 0) return 'none';
          const ratio = trafficSpeed / baseSpeed;
          if (ratio >= 0.75) return 'none';
          if (ratio >= 0.45) return 'moderate';
          return 'heavy';
        }

        const sections      = data.routes[0].sections;
        const totalDistance = sections.reduce((s, sec) => s + sec.summary.length, 0);
        const totalDuration = sections.reduce((s, sec) => s + sec.summary.duration, 0);
        const baseDuration  = sections.reduce((s, sec) => s + sec.summary.baseDuration, 0);

        const allCoords: [number, number][]   = [];
        const trafficSegments: TrafficSegment[] = [];

        for (const section of sections) {
          const decoded = decodeFlexPolyline(section.polyline);
          const sectionCoords: [number, number][] = decoded.polyline.map(p => [p[1], p[0]]);
          allCoords.push(...sectionCoords);

          const spans = section.spans ?? [];
          if (spans.length === 0) {
            trafficSegments.push({ coords: sectionCoords, level: 'none' });
          } else {
            for (let i = 0; i < spans.length; i++) {
              const start    = spans[i].offset;
              const end      = i + 1 < spans.length ? spans[i + 1].offset + 1 : sectionCoords.length;
              const segCoords = sectionCoords.slice(start, end);
              if (segCoords.length < 2) continue;
              const dsi   = spans[i].dynamicSpeedInfo;
              const level = dsi ? speedRatioToLevel(dsi.trafficSpeed, dsi.baseSpeed) : 'none';
              trafficSegments.push({ coords: segCoords, level });
            }
          }
        }

        res.json({
          distance: totalDistance, duration: totalDuration, baseDuration,
          trafficDelay: Math.max(0, totalDuration - baseDuration),
          geometry: { type: 'LineString', coordinates: allCoords },
          trafficSegments,
        });

      } else {
        const url =
          `${OSRM_URL}/route/v1/driving/` +
          `${startLon},${startLat};${endLon},${endLat}` +
          `?overview=full&geometries=geojson`;

        const upstream = await fetchWithTimeout(url);
        if (!upstream.ok) {
          logger.error('OSRM Fehler', { status: upstream.status });
          res.status(502).json({ error: 'Routing fehlgeschlagen' }); return;
        }

        const osrm = await upstream.json() as {
          code: string;
          routes: Array<{ distance: number; duration: number; geometry: unknown }>;
        };
        if (osrm.code !== 'Ok' || !osrm.routes.length) {
          res.status(404).json({ error: 'Keine Route gefunden' }); return;
        }

        const r = osrm.routes[0];
        res.json({
          distance: r.distance, duration: r.duration, baseDuration: r.duration,
          trafficDelay: 0, geometry: r.geometry,
        });
      }
    } catch {
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });
}

// ── Express App ───────────────────────────────────────────────────────────────
export function app(): express.Express {
  const server = express();
  const serverDistFolder  = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml         = join(serverDistFolder, 'index.server.html');

  const allowedHosts = process.env['ALLOWED_HOSTS']
    ? process.env['ALLOWED_HOSTS'].split(',').map((h) => h.trim())
    : ['localhost', '127.0.0.1', '::1'];

  const commonEngine = new CommonEngine({ allowedHosts });

  // ── Vertraue dem ersten Proxy (nginx / Load-Balancer) für echte Client-IPs ──
  server.set('trust proxy', 1);

  // ── HTTPS-Redirect (nur in Produktion / hinter Proxy) ────────────────────────
  server.use((req, res, next) => {
    if (isProd && req.header('x-forwarded-proto') === 'http') {
      res.redirect(301, `https://${req.header('host')}${req.url}`);
      return;
    }
    next();
  });

  // ── Response-Kompression (gzip/brotli) ────────────────────────────────────────
  server.use(compression());

  // ── Sicherheits-Header (Helmet) ───────────────────────────────────────────────
  server.use(helmet({
    // CSP: schützt gegen XSS, Clickjacking und Datenexfiltration
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        // unsafe-inline benötigt für Angular SSR Hydration State-Transfer
        scriptSrc:   ["'self'", "'unsafe-inline'", 'https://www.google.com', 'https://www.gstatic.com'],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
        // data: für Leaflet-Icons; https: für Map-Tiles
        imgSrc:      ["'self'", 'data:', 'https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com'],
        // reCAPTCHA benötigt Verbindung zu Google
        connectSrc:  ["'self'", 'https://www.google.com'],
        // reCAPTCHA läuft in einem iframe
        frameSrc:    ['https://www.google.com'],
        objectSrc:      ["'none'"],
        baseUri:        ["'self'"],
        formAction:     ["'self'"],
        // Leaflet + reCAPTCHA setzen inline Event-Handler → script-src-attr muss erlaubt sein
        scriptSrcAttr:  ["'unsafe-inline'"],
      },
    },
    // crossOriginEmbedderPolicy deaktiviert: benötigt von Leaflet Maps
    crossOriginEmbedderPolicy: false,
  }));

  // ── Body-Limit global (verhindert Payload-Flooding) ───────────────────────────
  server.use(express.json({ limit: '100kb' }));
  server.use(express.urlencoded({ extended: false, limit: '100kb' }));

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // API-Proxy-Routen (vor static + Angular-Handler)
  addApiRoutes(server);

  // Statische Dateien mit aggressivem Caching
  server.get(
    '*.*',
    express.static(browserDistFolder, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      immutable: true,
    })
  );

  // Health-Check
  server.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Angular SSR
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
    logger.info(`EKS Server läuft auf http://localhost:${port}`);
  });
}

run();
