import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

export interface GeoResult {
  lat: number;
  lon: number;
  name: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: GeoJSON.LineString;
}

export interface PriceBreakdown {
  basePrice: number;
  perKmRate: number;
  total: number;
}

// ── Platzhalter-Preistabelle ──────────────────────────────────────────────────
// Bitte mit den tatsächlichen Preisen ersetzen.
const PRICE_TIERS = [
  { maxKm: 50,       basePrice: 8.00,  perKm: 0.80 },
  { maxKm: 150,      basePrice: 15.00, perKm: 0.65 },
  { maxKm: Infinity, basePrice: 30.00, perKm: 0.55 },
];

// ── Client-seitiges Rate-Limit ────────────────────────────────────────────────
const CLIENT_LIMIT_KEY      = 'eks_route_calc_timestamps';
const CLIENT_MAX_REQUESTS   = 5;   // max. Berechnungen …
const CLIENT_WINDOW_MS      = 60_000; // … pro Minute

@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Sekunden bis das Client-Limit abläuft (0 = kein Limit aktiv) */
  readonly clientCooldownSeconds = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  /** In-Memory-Cache für Geocoding-Ergebnisse (PLZ → GeoResult) */
  private readonly geoCache = new Map<string, GeoResult>();

  // ── Client-Rate-Limit ───────────────────────────────────────────────────────

  isClientRateLimited(): boolean {
    return this.getRemainingCooldownSeconds() > 0;
  }

  recordClientRequest(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const now = Date.now();
    const stored = localStorage.getItem(CLIENT_LIMIT_KEY);
    const timestamps: number[] = stored ? JSON.parse(stored) : [];

    // Nur Einträge innerhalb des Fensters behalten
    const recent = timestamps.filter((t) => now - t < CLIENT_WINDOW_MS);
    recent.push(now);
    localStorage.setItem(CLIENT_LIMIT_KEY, JSON.stringify(recent));

    if (recent.length >= CLIENT_MAX_REQUESTS) {
      this.startCooldownTimer();
    }
  }

  initCooldownIfActive(): void {
    if (this.isClientRateLimited()) this.startCooldownTimer();
  }

  private getRemainingCooldownSeconds(): number {
    if (!isPlatformBrowser(this.platformId)) return 0;
    const stored = localStorage.getItem(CLIENT_LIMIT_KEY);
    if (!stored) return 0;
    const timestamps: number[] = JSON.parse(stored);
    const now = Date.now();
    const recent = timestamps.filter((t) => now - t < CLIENT_WINDOW_MS);
    if (recent.length < CLIENT_MAX_REQUESTS) return 0;
    const oldest = Math.min(...recent);
    return Math.max(0, Math.ceil((CLIENT_WINDOW_MS - (now - oldest)) / 1000));
  }

  private startCooldownTimer(): void {
    this.clientCooldownSeconds.set(this.getRemainingCooldownSeconds());
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);

    this.cooldownTimer = setInterval(() => {
      const remaining = this.getRemainingCooldownSeconds();
      this.clientCooldownSeconds.set(remaining);
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer!);
        this.cooldownTimer = null;
      }
    }, 1000);
  }

  // ── Geocoding ────────────────────────────────────────────────────────────────
  // Production: Express-Proxy /api/geocode (rate-limitiert, IP-geschützt)
  // Development: direkter Nominatim-Aufruf (kein Express-Server nötig)

  async geocodePlz(plz: string): Promise<GeoResult | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    // Cache-Hit?
    if (this.geoCache.has(plz)) return this.geoCache.get(plz)!;

    try {
      let data: GeoResult;

      if (environment.production) {
        const res = await fetch(`/api/geocode?plz=${encodeURIComponent(plz)}`);
        if (!res.ok) return null;
        data = (await res.json()) as GeoResult;
      } else {
        // Dev: direkt an Nominatim
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?postalcode=${encodeURIComponent(plz)}&country=DE&format=json&limit=1`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'de', 'User-Agent': 'EKS-Website-Dev/1.0' },
        });
        if (!res.ok) return null;
        const raw = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
        if (!raw.length) return null;
        data = { lat: parseFloat(raw[0].lat), lon: parseFloat(raw[0].lon), name: raw[0].display_name };
      }

      this.geoCache.set(plz, data);
      return data;
    } catch {
      return null;
    }
  }

  // ── Routing ──────────────────────────────────────────────────────────────────
  // Production: Express-Proxy /api/route
  // Development: direkter OSRM-Aufruf

  async calculateRoute(start: GeoResult, end: GeoResult): Promise<RouteResult | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    try {
      let route: { distance: number; duration: number; geometry: GeoJSON.LineString };

      if (environment.production) {
        const params = new URLSearchParams({
          startLat: String(start.lat), startLon: String(start.lon),
          endLat:   String(end.lat),   endLon:   String(end.lon),
        });
        const res = await fetch(`/api/route?${params}`);
        if (!res.ok) return null;
        route = (await res.json()) as typeof route;
      } else {
        // Dev: direkt an OSRM
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${start.lon},${start.lat};${end.lon},${end.lat}` +
          `?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as { code: string; routes: typeof route[] };
        if (data.code !== 'Ok' || !data.routes.length) return null;
        route = data.routes[0];
      }

      return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry:    route.geometry,
      };
    } catch {
      return null;
    }
  }

  // ── Preisberechnung ─────────────────────────────────────────────────────────

  calculatePrice(distanceKm: number): PriceBreakdown {
    const tier = PRICE_TIERS.find((t) => distanceKm <= t.maxKm)!;
    const total = tier.basePrice + distanceKm * tier.perKm;
    return {
      basePrice:  tier.basePrice,
      perKmRate:  tier.perKm,
      total:      Math.ceil(total * 100) / 100,
    };
  }
}
