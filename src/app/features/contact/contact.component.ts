import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { fadeInUp } from '../../animations/common.animations';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AnimateOnScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInUp],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly seoService = inject(SeoService);
  private readonly translationService = inject(TranslationService);

  readonly formStatus = signal<FormStatus>('idle');

  readonly contactForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    company: [''],
    phone: [''],
    message: ['', [Validators.required, Validators.minLength(20)]],
    consent: [false, [Validators.requiredTrue]],
  });

  ngOnInit(): void {
    const lang = this.translationService.currentLang();
    this.seoService.updateSeo({
      title: lang === 'de' ? 'Kontakt – Angebot anfragen' : 'Contact – Request a Quote',
      description: lang === 'de'
        ? 'Kontaktieren Sie EKS Euro-Kurier-Su für ein unverbindliches Angebot. Wir antworten innerhalb von 24 Stunden.'
        : 'Contact EKS Euro-Kurier-Su for a non-binding quote. We respond within 24 hours.',
      canonicalUrl: this.seoService.getPageUrl('contact'),
    });
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
      if (fieldName === 'name') return this.translationService.t('contact.form.errors.nameRequired');
      if (fieldName === 'email') return this.translationService.t('contact.form.errors.emailRequired');
      if (fieldName === 'message') return this.translationService.t('contact.form.errors.messageRequired');
      if (fieldName === 'consent') return this.translationService.t('contact.form.errors.consentRequired');
    }
    if (errors['minlength']) {
      if (fieldName === 'name') return this.translationService.t('contact.form.errors.nameMinLength');
      if (fieldName === 'message') return this.translationService.t('contact.form.errors.messageMinLength');
    }
    if (errors['email']) {
      return this.translationService.t('contact.form.errors.emailInvalid');
    }
    return lang === 'de' ? 'Ungültige Eingabe' : 'Invalid input';
  }

  onSubmit(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    this.formStatus.set('submitting');

    // Simulate form submission (replace with real HTTP call in production)
    setTimeout(() => {
      // In production, call an API endpoint here:
      // this.http.post('/api/contact', this.contactForm.value).subscribe(...)
      const success = Math.random() > 0.1; // 90% success rate for demo
      if (success) {
        this.formStatus.set('success');
        this.contactForm.reset();
      } else {
        this.formStatus.set('error');
      }
    }, 1500);
  }

  resetForm(): void {
    this.formStatus.set('idle');
    this.contactForm.reset();
  }

  get isSubmitting(): boolean {
    return this.formStatus() === 'submitting';
  }

  get isSuccess(): boolean {
    return this.formStatus() === 'success';
  }

  get isError(): boolean {
    return this.formStatus() === 'error';
  }
}
