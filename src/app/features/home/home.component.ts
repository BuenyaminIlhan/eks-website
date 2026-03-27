import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  AfterViewInit,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { SectionTitleComponent } from '../../shared/components/section-title/section-title.component';
import { fadeInUp, staggerList, counterUp } from '../../animations/common.animations';

interface ServiceCard {
  icon: string;
  titleKey: string;
  descKey: string;
}

interface StatItem {
  value: string;
  labelKey: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective, SectionTitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInUp, staggerList, counterUp],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly heroVisible = signal(false);

  readonly serviceCards: ServiceCard[] = [
    { icon: '⚡', titleKey: 'services.express.title', descKey: 'services.express.desc' },
    { icon: '🌅', titleKey: 'services.sameDay.title', descKey: 'services.sameDay.desc' },
    { icon: '🌍', titleKey: 'services.crossBorder.title', descKey: 'services.crossBorder.desc' },
    { icon: '📅', titleKey: 'services.scheduled.title', descKey: 'services.scheduled.desc' },
    { icon: '🏢', titleKey: 'services.b2b.title', descKey: 'services.b2b.desc' },
    { icon: '📍', titleKey: 'services.tracking.title', descKey: 'services.tracking.desc' },
  ];

  readonly stats: StatItem[] = [
    { value: '12+', labelKey: 'about.stats.years.label' },
    { value: '500K+', labelKey: 'about.stats.deliveries.label' },
    { value: '150+', labelKey: 'about.stats.cities.label' },
    { value: '800+', labelKey: 'about.stats.clients.label' },
  ];

  readonly featureItems = [
    { icon: '🛡️', titleKey: 'services.features.insured.title', descKey: 'services.features.insured.desc' },
    { icon: '📡', titleKey: 'services.features.realtime.title', descKey: 'services.features.realtime.desc' },
    { icon: '💬', titleKey: 'services.features.support.title', descKey: 'services.features.support.desc' },
    { icon: '🌿', titleKey: 'services.features.green.title', descKey: 'services.features.green.desc' },
  ];

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de'
        ? 'Kurierdienst Berlin – Express & Same-Day'
        : 'Courier Service Berlin – Express & Same-Day',
      description: lang === 'de'
        ? 'EKS Euro-Kurier-Su – Ihr zuverlässiger Express-Kurierdienst in Berlin und Europa. Same-Day, B2B-Logistik und grenzüberschreitende Lieferungen.'
        : 'EKS Euro-Kurier-Su – Your reliable express courier service in Berlin and Europe. Same-day, B2B logistics and cross-border deliveries.',
      keywords: 'Kurierdienst Berlin, Express Lieferung, Same-Day Kurier, B2B Logistik, Grenzüberschreitend',
      canonicalUrl: this.seoService.getPageUrl('home'),
      hreflangPath: 'home',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://www.euro-kurier-su.de/home' },
            ],
          },
          {
            '@type': 'WebPage',
            name: 'EKS Euro-Kurier-Su – Startseite',
            url: this.seoService.getPageUrl('home'),
            description: 'Zuverlässige Kurierdienste in Deutschland und Europa.',
          },
        ],
      },
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.heroVisible.set(true), 100);
    }
  }
}
