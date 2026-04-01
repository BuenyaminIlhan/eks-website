import {
  Component,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type * as LeafletType from 'leaflet';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import {
  RoutingService,
  GeoResult,
  PriceBreakdown,
  TrafficSegment,
  PICKUP_BUFFER_MIN,
  NIGHT_PICKUP_START,
  COMPANY_PHONE,
  COMPANY_PHONE_TEL,
  VEHICLES,
  Vehicle,
  isPhoneRequired,
} from '../../../core/services/routing.service';

type CalcStatus = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-route-calculator',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './route-calculator.component.html',
  styleUrls: ['./route-calculator.component.scss'],
})
export class RouteCalculatorComponent implements AfterViewInit, OnDestroy {
  private readonly fb             = inject(FormBuilder);
  readonly routingService         = inject(RoutingService);

  // ── Konstanten für das Template ──────────────────────────────────────────────
  readonly vehicles         = VEHICLES;
  readonly pickupBufferMin  = PICKUP_BUFFER_MIN;
  readonly nightPickupStart = NIGHT_PICKUP_START;
  readonly companyPhone     = COMPANY_PHONE;
  readonly companyPhoneTel  = COMPANY_PHONE_TEL;

  /** Frühestes wählbares Datum = heute (YYYY-MM-DD) */
  readonly minDate = new Date().toISOString().slice(0, 10);

  // ── Signale ──────────────────────────────────────────────────────────────────
  readonly showPhone   = signal(false);
  readonly status      = signal<CalcStatus>('idle');
  readonly errorKey    = signal('');
  readonly mapLoadError = signal(false);

  readonly result = signal<{
    distanceKm:           number;
    durationMin:          number;
    trafficDelayMin:      number;
    trafficSegments:      TrafficSegment[];
    price:                PriceBreakdown;
    plzStart:             string;
    plzEnd:               string;
    vehicle:              Vehicle;
    pickupAt:             Date;
    estimatedArrival:     Date;
    nightPickup:          boolean;
    bufferEnforced:       boolean;
    requestedPickupTime:  string;
    desiredDelivery:      Date | null;   // Wunsch-Zustellzeit (null = keine Angabe)
    deliveryFeasible:     boolean | null; // null = keine Angabe
  } | null>(null);

  // ── Formular ─────────────────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    vehicle:          ['',  Validators.required],
    plzStart:         ['',  [Validators.required, Validators.pattern(/^\d{5}$/)]],
    plzEnd:           ['',  [Validators.required, Validators.pattern(/^\d{5}$/)]],
    pickupDate:       [''],  // optional YYYY-MM-DD
    pickupTime:       [''],  // optional HH:MM
    deliveryDate:     [''],  // optional YYYY-MM-DD
    deliveryTime:     [''],  // optional HH:MM
    hasForklifts:     [false],
    acceptNoHazmat:   [false, Validators.requiredTrue],
  });

  // ── Map (Leaflet – npm, kein CDN) ────────────────────────────────────────────
  private L:          typeof LeafletType | null = null;
  private map:        LeafletType.Map | null = null;
  private routeGroup: LeafletType.LayerGroup | null = null;

  private phoneTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.routingService.initCooldownIfActive();

    // Telefon-Anzeige initial setzen und jede Minute prüfen
    this.showPhone.set(isPhoneRequired());
    this.phoneTimer = setInterval(() => {
      this.showPhone.set(isPhoneRequired());
    }, 60_000);

    requestAnimationFrame(() => void this.initMap());
  }

  ngOnDestroy(): void {
    if (this.phoneTimer) clearInterval(this.phoneTimer);
    if (this.map) { this.map.remove(); this.map = null; }
  }

  // ── Computed / Getter ────────────────────────────────────────────────────────

  /** Gibt das aktuell gewählte Fahrzeug-Objekt zurück */
  get selectedVehicle(): Vehicle | undefined {
    return VEHICLES.find(v => v.id === this.form.getRawValue().vehicle);
  }

  /** Wahr wenn das gewählte Fahrzeug Paletten transportiert */
  get requiresPallet(): boolean {
    return this.selectedVehicle?.requiresPallet ?? false;
  }

  isFieldInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && (ctrl.dirty || ctrl.touched));
  }

  // ── Berechnung ───────────────────────────────────────────────────────────────

  async onCalculate(): Promise<void> {
    // Manuelle Validierung: Fahrzeug + Paletten-Stapler + Gefahrgut-Bestätigung
    this.form.markAllAsTouched();

    if (this.form.get('vehicle')?.invalid) return;

    if (this.requiresPallet && !this.form.getRawValue().hasForklifts) {
      this.errorKey.set('routeCalc.errors.forkliftsRequired');
      this.status.set('error');
      return;
    }

    if (!this.form.getRawValue().acceptNoHazmat) {
      this.errorKey.set('routeCalc.errors.hazmatRequired');
      this.status.set('error');
      return;
    }

    if (
      this.form.get('plzStart')?.invalid ||
      this.form.get('plzEnd')?.invalid
    ) return;

    if (this.routingService.isClientRateLimited()) {
      this.errorKey.set('routeCalc.errors.rateLimited');
      this.status.set('error');
      return;
    }

    this.status.set('loading');
    this.result.set(null);
    this.errorKey.set('');

    const { plzStart, plzEnd, pickupTime, pickupDate, deliveryDate, deliveryTime, vehicle } =
      this.form.getRawValue();

    const [geoStart, geoEnd] = await Promise.all([
      this.routingService.geocodePlz(plzStart),
      this.routingService.geocodePlz(plzEnd),
    ]);

    if (!geoStart) {
      this.errorKey.set('routeCalc.errors.plzStartNotFound');
      this.status.set('error');
      return;
    }
    if (!geoEnd) {
      this.errorKey.set('routeCalc.errors.plzEndNotFound');
      this.status.set('error');
      return;
    }

    const route = await this.routingService.calculateRoute(geoStart, geoEnd);
    if (!route) {
      this.errorKey.set('routeCalc.errors.routeError');
      this.status.set('error');
      return;
    }

    const foundVehicle = VEHICLES.find(v => v.id === vehicle);
    if (!foundVehicle) {
      this.errorKey.set('routeCalc.errors.routeError');
      this.status.set('error');
      return;
    }

    this.routingService.recordClientRequest();
    this.drawRoute(geoStart, geoEnd, route.geometry, route.trafficSegments, plzStart, plzEnd);

    const delivery = this.routingService.calculateEstimatedDelivery(
      route.durationMin + route.trafficDelayMin,
      pickupTime  || undefined,
      pickupDate  || undefined,
    );

    // ── Wunsch-Zustellzeit berechnen ──────────────────────────────────────────
    let desiredDelivery: Date | null = null;
    let deliveryFeasible: boolean | null = null;

    if (deliveryDate || deliveryTime) {
      // Basis-Datum: explizites Datum oder Ankunftsdatum als Fallback
      const base = deliveryDate
        ? new Date(deliveryDate + 'T00:00:00')
        : new Date(delivery.arrival);

      if (deliveryTime) {
        const [h, m] = deliveryTime.split(':').map(Number);
        base.setHours(h, m, 0, 0);
      } else {
        // Nur Datum angegeben → Ende des Geschäftstags (18:00) als Wunsch
        base.setHours(18, 0, 0, 0);
      }

      desiredDelivery  = base;
      deliveryFeasible = desiredDelivery >= delivery.arrival;
    }

    this.result.set({
      distanceKm:           route.distanceKm,
      durationMin:          route.durationMin,
      trafficDelayMin:      route.trafficDelayMin,
      trafficSegments:      route.trafficSegments,
      price:                this.routingService.calculatePrice(route.distanceKm),
      plzStart,
      plzEnd,
      vehicle:              foundVehicle,
      pickupAt:             delivery.pickupAt,
      estimatedArrival:     delivery.arrival,
      nightPickup:          delivery.nightPickup,
      bufferEnforced:       delivery.bufferEnforced,
      requestedPickupTime:  pickupTime,
      desiredDelivery,
      deliveryFeasible,
    });
    this.status.set('success');
  }

  // ── Hilfsmethoden ────────────────────────────────────────────────────────────

  /** Verkehrsstufe aus Segment-Daten ableiten (dominanteste Stufe > 20 % der Route) */
  getTrafficLevel(delayMin: number, totalMin: number): 'none' | 'moderate' | 'heavy' {
    const r = this.result();
    if (r?.trafficSegments?.length) {
      const total    = r.trafficSegments.reduce((n: number, s: TrafficSegment) => n + s.coords.length, 0);
      const heavy    = r.trafficSegments.filter((s: TrafficSegment) => s.level === 'heavy')   .reduce((n: number, s: TrafficSegment) => n + s.coords.length, 0);
      const moderate = r.trafficSegments.filter((s: TrafficSegment) => s.level === 'moderate').reduce((n: number, s: TrafficSegment) => n + s.coords.length, 0);
      if (total > 0 && heavy    / total > 0.1) return 'heavy';
      if (total > 0 && moderate / total > 0.1) return 'moderate';
      return 'none';
    }
    // Fallback: Delay-basiert (OSRM oder HERE ohne Spans)
    if (delayMin < 1) return 'none';
    const baseMin = totalMin - delayMin;
    const ratio   = baseMin > 0 ? delayMin / baseMin : 0;
    return (delayMin >= 15 || ratio >= 0.2) ? 'heavy' : 'moderate';
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(date: Date): string {
    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString())    return 'heute';
    if (date.toDateString() === tomorrow.toDateString()) return 'morgen';
    return date.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit',
    });
  }

  scrollToForm(): void {
    document
      .getElementById('contact-form-heading')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Karte (Leaflet – npm Bundle, kein CDN) ───────────────────────────────────

  private async initMap(): Promise<void> {
    const container = document.getElementById('route-map');
    if (!container) return;

    // Dynamischer Import → wird als eigener Chunk gebaut, läuft nie server-seitig
    try {
      this.L = await import('leaflet');
    } catch {
      console.error('Leaflet konnte nicht geladen werden');
      this.mapLoadError.set(true);
      return;
    }

    const L = this.L;

    this.map = L.map(container, {
      center:    [50.7748, 7.1836],
      zoom:      9,
      zoomSnap:  0,
      zoomDelta: 1,
    });

    // CartoDB Voyager – professionelles Kartendesign
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> ' +
          '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      },
    ).addTo(this.map);

    // HERE Traffic Flow Overlay (server-seitig proxied)
    L.tileLayer('/api/traffictile/{z}/{x}/{y}', {
      opacity:     0.80,
      maxZoom:     19,
      attribution: 'Traffic © HERE',
    }).addTo(this.map);

    L.marker([50.7748, 7.1836]).addTo(this.map);
  }

  private drawRoute(
    start: GeoResult,
    end: GeoResult,
    geometry: { coordinates: number[][] },
    trafficSegments: TrafficSegment[],
    _plzStart: string,
    _plzEnd: string,
  ): void {
    if (!this.map || !this.L) return;
    const L = this.L;

    if (this.routeGroup) { this.routeGroup.remove(); this.routeGroup = null; }

    const trafficColors = { none: '#1a73e8', moderate: '#f97316', heavy: '#dc2626' };
    const layers: LeafletType.Layer[] = [];

    if (trafficSegments.length > 0) {
      // ── Segment-Färbung (HERE Span-Daten) ──────────────────────────────────
      // HERE liefert [lng,lat] (GeoJSON) → Leaflet erwartet [lat,lng]
      // Erst alle weißen Outlines, dann farbige Linien → klares Bild
      for (const seg of trafficSegments) {
        const latlngs = seg.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        layers.push(L.polyline(latlngs, {
          color: '#ffffff', weight: 11, opacity: 0.75,
          lineJoin: 'round', lineCap: 'butt',
        }));
      }
      for (const seg of trafficSegments) {
        const latlngs = seg.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        layers.push(L.polyline(latlngs, {
          color: trafficColors[seg.level], weight: 5, opacity: 0.95,
          lineJoin: 'round', lineCap: 'butt',
        }));
      }
    } else {
      // ── Fallback: einfarbige Route (OSRM) ──────────────────────────────────
      const latlngs = geometry.coordinates.map((pos: number[]) => [pos[1], pos[0]] as [number, number]);
      layers.push(L.polyline(latlngs, { color: '#ffffff', weight: 11, opacity: 0.8, lineJoin: 'round', lineCap: 'round' }));
      layers.push(L.polyline(latlngs, { color: '#1a73e8', weight: 6,  opacity: 1,   lineJoin: 'round', lineCap: 'round' }));
    }

    const markerStart = L.marker([start.lat, start.lon]);
    const markerEnd   = L.marker([end.lat,   end.lon]);

    // Bounding Box aus der Gesamtgeometrie berechnen
    const allLatlngs = geometry.coordinates.map((pos: number[]) => [pos[1], pos[0]] as [number, number]);
    const boundsLine = L.polyline(allLatlngs);

    this.routeGroup = L.layerGroup([...layers, markerStart, markerEnd]);
    this.routeGroup.addTo(this.map);
    this.map.fitBounds(boundsLine.getBounds(), { padding: [40, 40] });
  }
}
