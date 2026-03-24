import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  AfterViewInit,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { RoutingService, GeoResult, PriceBreakdown } from '../../../core/services/routing.service';

type CalcStatus = 'idle' | 'loading' | 'success' | 'error';

// Leaflet wird nur im Browser dynamisch geladen – kein SSR-Import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletLib = any;

@Component({
  selector: 'app-route-calculator',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './route-calculator.component.html',
  styleUrls: ['./route-calculator.component.scss'],
})
export class RouteCalculatorComponent implements AfterViewInit, OnDestroy {
  private readonly fb           = inject(FormBuilder);
  private readonly platformId   = inject(PLATFORM_ID);
  readonly routingService = inject(RoutingService);
  private readonly cdr          = inject(ChangeDetectorRef);

  // Leaflet-Instanzen (nur Browser)
  private L: LeafletLib = null;
  private map: LeafletLib = null;
  private routeLayer: LeafletLib = null;

  readonly status    = signal<CalcStatus>('idle');
  readonly errorKey  = signal('');
  readonly result    = signal<{
    distanceKm: number;
    durationMin: number;
    price: PriceBreakdown;
    plzStart: string;
    plzEnd: string;
  } | null>(null);

  readonly form = this.fb.nonNullable.group({
    plzStart: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
    plzEnd:   ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
  });

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.routingService.initCooldownIfActive();
    await this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  isFieldInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && (ctrl.dirty || ctrl.touched));
  }

  async onCalculate(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Client-seitiges Rate-Limit prüfen
    if (this.routingService.isClientRateLimited()) {
      this.errorKey.set('routeCalc.errors.rateLimited');
      this.status.set('error');
      this.cdr.markForCheck();
      return;
    }

    this.status.set('loading');
    this.result.set(null);
    this.errorKey.set('');
    this.cdr.markForCheck();

    const { plzStart, plzEnd } = this.form.getRawValue();

    // Beide PLZ parallel geocodieren
    const [geoStart, geoEnd] = await Promise.all([
      this.routingService.geocodePlz(plzStart),
      this.routingService.geocodePlz(plzEnd),
    ]);

    if (!geoStart) {
      this.errorKey.set('routeCalc.errors.plzStartNotFound');
      this.status.set('error');
      this.cdr.markForCheck();
      return;
    }
    if (!geoEnd) {
      this.errorKey.set('routeCalc.errors.plzEndNotFound');
      this.status.set('error');
      this.cdr.markForCheck();
      return;
    }

    const route = await this.routingService.calculateRoute(geoStart, geoEnd);
    if (!route) {
      this.errorKey.set('routeCalc.errors.routeError');
      this.status.set('error');
      this.cdr.markForCheck();
      return;
    }

    // Anfrage zählen (vor Ergebnisanzeige)
    this.routingService.recordClientRequest();

    this.drawRoute(geoStart, geoEnd, route.geometry, plzStart, plzEnd);

    this.result.set({
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      price: this.routingService.calculatePrice(route.distanceKm),
      plzStart,
      plzEnd,
    });
    this.status.set('success');
    this.cdr.markForCheck();
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
  }

  scrollToForm(): void {
    document.getElementById('contact-form-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Karte ───────────────────────────────────────────────────────────────────

  private async initMap(): Promise<void> {
    const L = await import('leaflet');
    this.L = L;

    // Leaflet-Marker-Icons manuell setzen (bekanntes Angular-Build-Problem)
    const icon = L.icon({
      iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize:   [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    L.Marker.prototype.options.icon = icon;

    this.map = L.map('route-map', { zoomControl: true }).setView([50.7748, 7.1836], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(this.map);

    // Standort-Marker der Firma
    L.marker([50.7748, 7.1836])
      .addTo(this.map)
      .bindPopup('<b>EKS Euro-Kurier-Su</b><br>Ilmenaustr. 16, 53757 Sankt Augustin')
      .openPopup();
  }

  private drawRoute(
    start: GeoResult,
    end: GeoResult,
    geometry: GeoJSON.LineString,
    plzStart: string,
    plzEnd: string,
  ): void {
    if (!this.map || !this.L) return;

    // Vorherige Route entfernen
    if (this.routeLayer) {
      this.routeLayer.remove();
      this.routeLayer = null;
    }

    const L = this.L;

    const routeLine = L.geoJSON(geometry, {
      style: { color: '#3982AA', weight: 5, opacity: 0.85 },
    });

    const markerStart = L.marker([start.lat, start.lon])
      .bindPopup(`<b>Abholung</b><br>PLZ ${plzStart}<br><small>${start.name.split(',').slice(0, 2).join(',')}</small>`);

    const markerEnd = L.marker([end.lat, end.lon])
      .bindPopup(`<b>Lieferung</b><br>PLZ ${plzEnd}<br><small>${end.name.split(',').slice(0, 2).join(',')}</small>`);

    this.routeLayer = L.layerGroup([routeLine, markerStart, markerEnd]).addTo(this.map);

    this.map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
  }
}
