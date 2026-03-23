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

interface StatItem {
  valueKey: string;
  labelKey: string;
}

interface ValueItem {
  icon: string;
  titleKey: string;
  descKey: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective, SectionTitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
})
export class AboutComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  readonly stats: StatItem[] = [
    { valueKey: 'about.stats.years.value', labelKey: 'about.stats.years.label' },
    { valueKey: 'about.stats.deliveries.value', labelKey: 'about.stats.deliveries.label' },
    { valueKey: 'about.stats.cities.value', labelKey: 'about.stats.cities.label' },
    { valueKey: 'about.stats.clients.value', labelKey: 'about.stats.clients.label' },
  ];

  readonly values: ValueItem[] = [
    { icon: '🎯', titleKey: 'about.values.reliability.title', descKey: 'about.values.reliability.desc' },
    { icon: '🔍', titleKey: 'about.values.transparency.title', descKey: 'about.values.transparency.desc' },
    { icon: '⭐', titleKey: 'about.values.quality.title', descKey: 'about.values.quality.desc' },
    { icon: '🤝', titleKey: 'about.values.partnership.title', descKey: 'about.values.partnership.desc' },
  ];

  readonly timeline = [
    { year: '2008', event: 'Gründung der Euro-Kurier-Su durch Osman Ilhan in Sankt Augustin mit 3 Fahrzeugen.' },
    { year: '2012', event: 'Expansion in die Region Bonn/Rhein-Sieg, Flottenaufstockung auf 12 Fahrzeuge.' },
    { year: '2018', event: 'Einführung des digitalen Live-Tracking-Systems für alle Kunden.' },
    { year: '2020', event: 'Übernahme der Geschäftsführung durch Didem Ilhan.' },
    { year: '2021', event: 'Start des grenzüberschreitenden EU-Services.' },
    { year: '2024', event: 'Mehr als 500.000 erfolgreiche Lieferungen und 800+ Stammkunden.' },
  ];

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Über uns – Euro-Kurier-Su GmbH' : 'About Us – Euro-Kurier-Su GmbH',
      description: lang === 'de'
        ? 'Erfahren Sie mehr über EKS Euro-Kurier-Su: unsere Geschichte, Werte und das Familienunternehmen Ilhan aus Sankt Augustin.'
        : 'Learn more about EKS Euro-Kurier-Su: our history, values and the Ilhan family business from Sankt Augustin.',
      canonicalUrl: this.seoService.getPageUrl('about'),
    });
  }
}
