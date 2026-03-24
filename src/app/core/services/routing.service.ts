import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import type { LineString } from 'geojson';

export interface GeoResult {
  lat: number;
  lon: number;
  name: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  trafficDelayMin: number; // 0 wenn kein Live-Traffic verfügbar
  geometry: LineString;
}

export interface PriceBreakdown {
  basePrice: number;
  perKmRate: number;
  total: number;
}

// ── Zustellzeit-Konfiguration ─────────────────────────────────────────────────
/** Minuten zwischen Auftragseingang und Abfahrt (Ladezeit, Papiere, etc.) */
export const PICKUP_BUFFER_MIN = 90;

/** Ab dieser Stunde (Mo–Fr) ist telefonische Anmeldung erforderlich */
export const NIGHT_PICKUP_START = 22;
export const NIGHT_PICKUP_END   = 6;

/** Firmennummer für zeitabhängige Einblendung */
export const COMPANY_PHONE     = '+49 2241 301 97 03';
export const COMPANY_PHONE_TEL = 'tel:+4922413019703';

// ── Fahrzeugtypen ─────────────────────────────────────────────────────────────
export interface Vehicle {
  id:               'pkw' | 'caddy' | 'transporter' | 'sprinter';
  name:             string;
  subtitle:         string;
  maxWeightKg:      number;
  requiresPallet:   boolean;
  maxPallets?:      number;
  maxPalletHeightCm?: number;
  dimensions?: { widthCm: number; lengthCm: number; heightCm: number };
}

export const VEHICLES: readonly Vehicle[] = [
  {
    id:            'pkw',
    name:          'PKW',
    subtitle:      'Kleine Sendungen',
    maxWeightKg:   50,
    requiresPallet: false,
    dimensions:    { widthCm: 60, lengthCm: 120, heightCm: 30 },
  },
  {
    id:               'caddy',
    name:             'Caddy',
    subtitle:         'Kompakt-Transporter',
    maxWeightKg:      400,
    requiresPallet:   true,
    maxPallets:       1,
    maxPalletHeightCm: 120,
  },
  {
    id:               'transporter',
    name:             'Transporter',
    subtitle:         'Standard-Transporter',
    maxWeightKg:      1000,
    requiresPallet:   true,
    maxPallets:       2,
    maxPalletHeightCm: 120,
  },
  {
    id:               'sprinter',
    name:             'Sprinter',
    subtitle:         'Groß-Transporter',
    maxWeightKg:      1400,
    requiresPallet:   true,
    maxPallets:       4,
    maxPalletHeightCm: 160,
  },
];

/**
 * Gibt zurück ob die Telefonnummer eingeblendet werden soll:
 * Mo–Fr ab 22:00, Wochenende ganztägig.
 */
export function isPhoneRequired(): boolean {
  const now  = new Date();
  const day  = now.getDay();  // 0=So … 6=Sa
  const hour = now.getHours();
  const isWeekend    = day === 0 || day === 6;
  const isNightWeek  = day >= 1 && day <= 5 && hour >= NIGHT_PICKUP_START;
  return isWeekend || isNightWeek;
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
      let route: { distance: number; duration: number; geometry: LineString };

      let raw: { distance: number; duration: number; trafficDelay?: number; geometry: LineString };

      if (environment.production) {
        const params = new URLSearchParams({
          startLat: String(start.lat), startLon: String(start.lon),
          endLat:   String(end.lat),   endLon:   String(end.lon),
        });
        const res = await fetch(`/api/route?${params}`);
        if (!res.ok) return null;
        raw = (await res.json()) as typeof raw;
      } else {
        // Dev: direkt an OSRM (kein API-Key nötig)
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${start.lon},${start.lat};${end.lon},${end.lat}` +
          `?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as { code: string; routes: Array<{ distance: number; duration: number; geometry: LineString }> };
        if (data.code !== 'Ok' || !data.routes.length) return null;
        raw = { ...data.routes[0], trafficDelay: 0 };
      }

      return {
        distanceKm:      raw.distance / 1000,
        durationMin:     raw.duration / 60,
        trafficDelayMin: (raw.trafficDelay ?? 0) / 60,
        geometry:        raw.geometry,
      };
    } catch {
      return null;
    }
  }

  // ── Zustellzeit-Berechnung ───────────────────────────────────────────────────

  /**
   * Berechnet Abholzeit und voraussichtliche Zustellzeit mit Traffic.
   *
   * Logik Abholzeit:
   *  - Kein Wunsch → jetzt + PICKUP_BUFFER_MIN (Mindestvorbereitung)
   *  - Wunschzeit > jetzt + PICKUP_BUFFER_MIN → Wunschzeit wird verwendet (kein Puffer nötig)
   *  - Wunschzeit < jetzt + PICKUP_BUFFER_MIN → Mindestvorbereitung greift, Wunsch nicht haltbar
   */
  /**
   * Berechnet Abholzeit und voraussichtliche Zustellzeit.
   *
   * Puffer-Logik:
   *  - Zukunfts-Datum gewählt → Wunschzeit gilt direkt, kein Puffer nötig
   *  - Kein Datum / heutiges Datum → Mindestpuffer PICKUP_BUFFER_MIN prüfen
   *  - Wunschzeit zu kurzfristig → Puffer erzwingen
   */
  calculateEstimatedDelivery(
    durationMin: number,
    requestedPickupTime?: string, // "HH:MM"
    requestedPickupDate?: string, // "YYYY-MM-DD"
  ): {
    pickupAt:       Date;
    arrival:        Date;
    nightPickup:    boolean;
    bufferEnforced: boolean;
  } {
    const now     = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const isFutureDate =
      !!requestedPickupDate && requestedPickupDate > todayStr;

    const earliestPickup = new Date(now.getTime() + PICKUP_BUFFER_MIN * 60 * 1000);

    let pickupAt: Date;
    let bufferEnforced = false;

    if (requestedPickupDate || requestedPickupTime) {
      // Basis-Datum ermitteln
      const baseDate = requestedPickupDate
        ? new Date(requestedPickupDate + 'T00:00:00')
        : new Date(now);

      if (requestedPickupTime) {
        const [h, m] = requestedPickupTime.split(':').map(Number);
        baseDate.setHours(h, m, 0, 0);
      } else {
        // Kein Wunsch-Zeit + Zukunfts-Datum → 08:00 Uhr annehmen
        baseDate.setHours(8, 0, 0, 0);
      }

      // Heute ohne Datum: falls Wunschzeit in der Vergangenheit liegt → morgen
      if (!requestedPickupDate && baseDate <= now) {
        baseDate.setDate(baseDate.getDate() + 1);
      }

      if (isFutureDate) {
        // Zukunfts-Buchung → kein Puffer, Wunschzeit direkt
        pickupAt = baseDate;
      } else if (baseDate >= earliestPickup) {
        pickupAt = baseDate;
      } else {
        // Kurzfristig → Mindestpuffer erzwingen
        pickupAt       = earliestPickup;
        bufferEnforced = true;
      }
    } else {
      // Keine Angaben → frühestmöglich
      pickupAt = earliestPickup;
    }

    const arrival    = new Date(pickupAt.getTime() + durationMin * 60 * 1000);
    const pickupHour = pickupAt.getHours();
    const nightPickup =
      pickupHour >= NIGHT_PICKUP_START || pickupHour < NIGHT_PICKUP_END;

    return { pickupAt, arrival, nightPickup, bufferEnforced };
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
