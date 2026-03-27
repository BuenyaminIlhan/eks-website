import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  AfterViewInit,
  PLATFORM_ID,
  signal,
  ElementRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { TranslationService } from '../../core/services/translation.service';
import { SpamProtectionService, RECAPTCHA_SITE_KEY } from '../../core/services/spam-protection.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { fadeInUp } from '../../animations/common.animations';
import { RouteCalculatorComponent } from './route-calculator/route-calculator.component';


type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AnimateOnScrollDirective, RouteCalculatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInUp],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent implements OnInit, AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elRef = inject(ElementRef);
  readonly spamProtection = inject(SpamProtectionService);

  readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly formStatus = signal<FormStatus>('idle');
  readonly recaptchaError = signal(false);
  readonly recaptchaSiteKey = RECAPTCHA_SITE_KEY;

  readonly contactForm = this.fb.nonNullable.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    email:   ['', [Validators.required, Validators.email]],
    company: [''],
    phone:   [''],
    message: ['', [Validators.required, Validators.minLength(20)]],
    consent: [false, [Validators.requiredTrue]],
    website: [''], // Honeypot
  });

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Kontakt – Angebot anfragen' : 'Contact – Request a Quote',
      description: lang === 'de'
        ? 'Kontaktieren Sie EKS Euro-Kurier-Su für ein unverbindliches Angebot. Wir antworten innerhalb von 24 Stunden.'
        : 'Contact EKS Euro-Kurier-Su for a non-binding quote. We respond within 24 hours.',
      canonicalUrl: this.seoService.getPageUrl('contact'),
      hreflangPath: 'contact',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://www.euro-kurier-su.de/home' },
              { '@type': 'ListItem', position: 2, name: 'Kontakt', item: 'https://www.euro-kurier-su.de/contact' },
            ],
          },
          {
            '@type': 'ContactPage',
            name: lang === 'de' ? 'Kontakt – Angebot anfragen' : 'Contact – Request a Quote',
            url: 'https://www.euro-kurier-su.de/contact',
            description: lang === 'de'
              ? 'Kontaktieren Sie EKS Euro-Kurier-Su für ein unverbindliches Angebot. Wir antworten innerhalb von 24 Stunden.'
              : 'Contact EKS Euro-Kurier-Su for a non-binding quote. We respond within 24 hours.',
          },
        ],
      },
    });
    this.spamProtection.initCooldownIfActive();
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.spamProtection.renderRecaptcha('recaptcha-container');
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.contactForm.get(fieldName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  isFieldValid(fieldName: string): boolean {
    const control = this.contactForm.get(fieldName);
    return !!(control && control.valid && (control.dirty || control.touched));
  }

  getFieldError(fieldName: string): string {
    const control: AbstractControl | null = this.contactForm.get(fieldName);
    if (!control || !control.errors || (!control.dirty && !control.touched)) return '';

    const lang = this.translationService.currentLang();
    const errors = control.errors;

    if (errors['required'] || errors['requiredTrue']) {
      if (fieldName === 'name')    return this.translationService.t('contact.form.errors.nameRequired');
      if (fieldName === 'email')   return this.translationService.t('contact.form.errors.emailRequired');
      if (fieldName === 'message') return this.translationService.t('contact.form.errors.messageRequired');
      if (fieldName === 'consent') return this.translationService.t('contact.form.errors.consentRequired');
    }
    if (errors['minlength']) {
      if (fieldName === 'name')    return this.translationService.t('contact.form.errors.nameMinLength');
      if (fieldName === 'message') return this.translationService.t('contact.form.errors.messageMinLength');
    }
    if (errors['email']) return this.translationService.t('contact.form.errors.emailInvalid');

    return lang === 'de' ? 'Ungültige Eingabe' : 'Invalid input';
  }

  /** Fokus auf das erste ungültige Feld setzen – wichtig für Screen-Reader */
  private focusFirstInvalidField(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Kurze Verzögerung damit das @if im Template das Element rendern kann
    setTimeout(() => {
      const invalid = (this.elRef.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '[aria-invalid="true"], .ng-invalid:not(form)'
      );
      invalid?.focus();
    }, 50);
  }

  onSubmit(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.focusFirstInvalidField();
      return;
    }

    if (this.spamProtection.isRateLimited()) return;

    // Honeypot
    if (this.spamProtection.isHoneypotFilled(this.contactForm.value.website ?? '')) {
      this.formStatus.set('success');
      return;
    }

    // reCAPTCHA
    const recaptchaToken = this.spamProtection.getRecaptchaToken();
    if (!recaptchaToken) {
      this.recaptchaError.set(true);
      return;
    }
    this.recaptchaError.set(false);
    this.formStatus.set('submitting');
    this.spamProtection.recordSubmission();

    const { name, email, company, phone, message } = this.contactForm.value;

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, company, phone, message }),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      this.formStatus.set('success');
      this.contactForm.reset();
      this.spamProtection.resetRecaptcha();
    }).catch((err) => {
      console.error('Contact form error:', err);
      this.formStatus.set('error');
      this.spamProtection.resetRecaptcha();
    });
  }

  resetForm(): void {
    this.formStatus.set('idle');
    this.recaptchaError.set(false);
    this.contactForm.reset();
    // reCAPTCHA-Container wird durch @if neu erzeugt – nach DOM-Update neu rendern
    setTimeout(() => this.spamProtection.renderRecaptcha('recaptcha-container'));
  }

  get isSubmitting(): boolean { return this.formStatus() === 'submitting'; }
  get isSuccess(): boolean    { return this.formStatus() === 'success'; }
  get isError(): boolean      { return this.formStatus() === 'error'; }
}
