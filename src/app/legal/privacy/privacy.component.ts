import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface PrivacySection {
  id: string;
  titleKey: string;
  textKey: string;
}

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.scss'],
})
export class PrivacyComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  readonly sections: PrivacySection[] = [
    { id: 'intro',       titleKey: 'privacy.intro.title',      textKey: 'privacy.intro.text' },
    { id: 'data-types',  titleKey: 'privacy.dataTypes.title',  textKey: 'privacy.dataTypes.text' },
    { id: 'purposes',    titleKey: 'privacy.purposes.title',   textKey: 'privacy.purposes.text' },
    { id: 'retention',   titleKey: 'privacy.retention.title',  textKey: 'privacy.retention.text' },
    { id: 'cookies',     titleKey: 'privacy.cookies.title',    textKey: 'privacy.cookies.necessary' },
    { id: 'third-party', titleKey: 'privacy.thirdParty.title', textKey: 'privacy.thirdParty.text' },
    { id: 'rights',      titleKey: 'privacy.rights.title',     textKey: 'privacy.rights.text' },
    { id: 'complaint',   titleKey: 'privacy.complaint.title',  textKey: 'privacy.complaint.text' },
    { id: 'security',    titleKey: 'privacy.security.title',   textKey: 'privacy.security.text' },
    { id: 'changes',     titleKey: 'privacy.changes.title',    textKey: 'privacy.changes.text' },
  ];

  readonly activeSection = signal<string>('intro');

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Datenschutzerklärung' : 'Privacy Policy',
      description: lang === 'de'
        ? 'Datenschutzerklärung der Euro-Kurier-Su GmbH gemäß DSGVO. Informationen zur Datenverarbeitung, Ihren Rechten und Cookies.'
        : 'Privacy policy of Euro-Kurier-Su GmbH pursuant to GDPR. Information on data processing, your rights and cookies.',
      noIndex: true,
      canonicalUrl: this.seoService.getPageUrl('privacy'),
    });
  }

  setActiveSection(id: string): void {
    this.activeSection.set(id);
  }

  scrollToSection(id: string): void {
    this.setActiveSection(id);
    const el = document.getElementById('privacy-' + id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  formatText(text: string): string[] {
    return text.split('\n\n').filter((p) => p.trim().length > 0);
  }
}
