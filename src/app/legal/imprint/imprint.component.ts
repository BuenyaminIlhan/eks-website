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

@Component({
  selector: 'app-imprint',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './imprint.component.html',
  styleUrls: ['./imprint.component.scss'],
})
export class ImprintComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Impressum' : 'Legal Notice',
      description: lang === 'de'
        ? 'Pflichtangaben gemäß § 5 TMG für Euro-Kurier-Su, Sankt Augustin.'
        : 'Mandatory information pursuant to § 5 TMG for Euro-Kurier-Su, Sankt Augustin.',
      noIndex: true,
      canonicalUrl: this.seoService.getPageUrl('imprint'),
    });
  }
}
