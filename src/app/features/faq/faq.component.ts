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
import { accordionAnimation } from '../../animations/common.animations';

interface FaqItem {
  questionKey: string;
  answerKey: string;
  isOpen: boolean;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AnimateOnScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [accordionAnimation],
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.scss'],
})
export class FaqComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  readonly faqItems = signal<FaqItem[]>([
    { questionKey: 'faq.q1.question', answerKey: 'faq.q1.answer', isOpen: true },
    { questionKey: 'faq.q2.question', answerKey: 'faq.q2.answer', isOpen: false },
    { questionKey: 'faq.q3.question', answerKey: 'faq.q3.answer', isOpen: false },
    { questionKey: 'faq.q4.question', answerKey: 'faq.q4.answer', isOpen: false },
    { questionKey: 'faq.q5.question', answerKey: 'faq.q5.answer', isOpen: false },
    { questionKey: 'faq.q6.question', answerKey: 'faq.q6.answer', isOpen: false },
    { questionKey: 'faq.q7.question', answerKey: 'faq.q7.answer', isOpen: false },
    { questionKey: 'faq.q8.question', answerKey: 'faq.q8.answer', isOpen: false },
    { questionKey: 'faq.q9.question', answerKey: 'faq.q9.answer', isOpen: false },
    { questionKey: 'faq.q10.question', answerKey: 'faq.q10.answer', isOpen: false },
  ]);

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'FAQ – Häufige Fragen' : 'FAQ – Frequently Asked Questions',
      description: lang === 'de'
        ? 'Antworten auf häufig gestellte Fragen zu den Kurierdiensten von EKS Euro-Kurier-Su: Abholung, Tracking, Preise und mehr.'
        : 'Answers to frequently asked questions about EKS Euro-Kurier-Su courier services: collection, tracking, pricing and more.',
      canonicalUrl: this.seoService.getPageUrl('faq'),
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.buildFaqSchema(),
      },
    });
  }

  toggleItem(index: number): void {
    this.faqItems.update((items) =>
      items.map((item, i) => ({
        ...item,
        isOpen: i === index ? !item.isOpen : item.isOpen,
      }))
    );
  }

  private buildFaqSchema(): object[] {
    return this.faqItems().map((item) => ({
      '@type': 'Question',
      name: this.translationService.t(item.questionKey),
      acceptedAnswer: {
        '@type': 'Answer',
        text: this.translationService.t(item.answerKey),
      },
    }));
  }
}
