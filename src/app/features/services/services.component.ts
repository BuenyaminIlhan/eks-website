import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { SectionTitleComponent } from '../../shared/components/section-title/section-title.component';

interface ServiceDetail {
  icon: string;
  titleKey: string;
  descKey: string;
  features: string[];
  highlight?: boolean;
}

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective, SectionTitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.scss'],
})
export class ServicesComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  readonly services: ServiceDetail[] = [
    {
      icon: '⚡',
      titleKey: 'services.express.title',
      descKey: 'services.express.desc',
      features: [
        'Abholung in 60–90 Minuten',
        'Zustellung innerhalb von 2–4 Stunden',
        'Echtzeit-GPS-Tracking',
        'Direktfahrt ohne Umwege',
        'Vollkasko-versichert bis 50.000 €',
      ],
      highlight: true,
    },
    {
      icon: '🌅',
      titleKey: 'services.sameDay.title',
      descKey: 'services.sameDay.desc',
      features: [
        'Garantierte Zustellung bis 20:00 Uhr',
        'Abholung flexibel ab 07:00 Uhr',
        'Stadtgebiet Berlin & 80 km Umland',
        'Automatische Statusbenachrichtigung',
        'Unterschrift bei Empfang',
      ],
    },
    {
      icon: '🌍',
      titleKey: 'services.crossBorder.title',
      descKey: 'services.crossBorder.desc',
      features: [
        'EU-weite Lieferungen ohne Zollhindernisse',
        'Polen, Tschechien, Österreich, Benelux',
        'Mehrsprachige Kuriere verfügbar',
        'Zollabwicklung auf Wunsch',
        'Sendungsverfolgung bis zur Haustür',
      ],
    },
    {
      icon: '📅',
      titleKey: 'services.scheduled.title',
      descKey: 'services.scheduled.desc',
      features: [
        'Lieferung auf Minute genau buchbar',
        'Vorabanmeldung beim Empfänger',
        'Flexible Zeitfenster wählbar',
        'Wiederkehrende Termine einrichtbar',
        'Bestätigung per E-Mail & SMS',
      ],
    },
    {
      icon: '🏢',
      titleKey: 'services.b2b.title',
      descKey: 'services.b2b.desc',
      features: [
        'Dedizierter Ansprechpartner',
        'Rahmenverträge mit Sonderkonditionen',
        'Feste tägliche Lieferrouten',
        'API-Anbindung an Ihr ERP',
        'Monatliche Sammelrechnung',
      ],
    },
    {
      icon: '📍',
      titleKey: 'services.tracking.title',
      descKey: 'services.tracking.desc',
      features: [
        'GPS-Live-Tracking in Echtzeit',
        'Automatische SMS-Benachrichtigungen',
        'E-Mail-Alerts bei Statusänderung',
        'Zustellnachweis digital abrufbar',
        'Archivierung für 12 Monate',
      ],
    },
  ];

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Unsere Kurierdienste' : 'Our Courier Services',
      description: lang === 'de'
        ? 'Express-Kurier, Same-Day-Lieferung, B2B-Logistik und mehr. Entdecken Sie alle Leistungen von EKS Euro-Kurier-Su.'
        : 'Express courier, same-day delivery, B2B logistics and more. Discover all services from EKS Euro-Kurier-Su.',
      keywords: 'Express Kurier, Same-Day Lieferung, B2B Logistik, Kurierdienst Leistungen',
      canonicalUrl: this.seoService.getPageUrl('services'),
    });
  }
}
