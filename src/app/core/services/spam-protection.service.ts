import { Injectable, PLATFORM_ID, NgZone, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare const grecaptcha: {
  getResponse(widgetId?: number): string;
  reset(widgetId?: number): void;
  render(container: string | HTMLElement, params: Record<string, string>): number;
  ready(callback: () => void): void;
};

const RATE_LIMIT_KEY = 'eks_last_submission';
const COOLDOWN_SECONDS = 60;

// ↓ Ersetzen nach Google-Registrierung: https://www.google.com/recaptcha/admin
// reCAPTCHA v2 ("Ich bin kein Roboter") auswählen, Domain eintragen
export const RECAPTCHA_SITE_KEY = '6Ld9L5UsAAAAANm6imNgjcoMdG-Z3MAdf_TSzxpR';

@Injectable({ providedIn: 'root' })
export class SpamProtectionService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  readonly secondsLeft = signal(0);

  getRemainingCooldown(): number {
    if (!isPlatformBrowser(this.platformId)) return 0;
    const last = localStorage.getItem(RATE_LIMIT_KEY);
    if (!last) return 0;
    const elapsed = Math.floor((Date.now() - parseInt(last, 10)) / 1000);
    return Math.max(0, COOLDOWN_SECONDS - elapsed);
  }

  isRateLimited(): boolean {
    return this.getRemainingCooldown() > 0;
  }

  recordSubmission(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(RATE_LIMIT_KEY, Date.now().toString());
    this.startCooldownTimer();
  }

  initCooldownIfActive(): void {
    if (this.isRateLimited()) {
      this.startCooldownTimer();
    }
  }

  private startCooldownTimer(): void {
    this.zone.run(() => this.secondsLeft.set(this.getRemainingCooldown()));
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);

    // Außerhalb der Zone → kein globales Change Detection jede Sekunde
    this.zone.runOutsideAngular(() => {
      this.cooldownTimer = setInterval(() => {
        const remaining = this.getRemainingCooldown();
        this.zone.run(() => this.secondsLeft.set(remaining));
        if (remaining <= 0) {
          clearInterval(this.cooldownTimer!);
          this.cooldownTimer = null;
        }
      }, 1000);
    });
  }

  isHoneypotFilled(value: string): boolean {
    return value.trim().length > 0;
  }

  getRecaptchaToken(): string {
    if (!isPlatformBrowser(this.platformId)) return '';
    try {
      return grecaptcha.getResponse();
    } catch {
      return '';
    }
  }

  resetRecaptcha(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      grecaptcha.reset();
    } catch { /* Widget noch nicht gerendert */ }
  }

  renderRecaptcha(containerId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const tryRender = () => {
      const container = document.getElementById(containerId);
      if (!container || container.childElementCount > 0) return;

      try {
        grecaptcha.render(container, { sitekey: RECAPTCHA_SITE_KEY });
      } catch { /* Script noch nicht vollständig geladen */ }
    };

    // Script nur einmal laden (lazy – nicht global in index.html)
    if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // grecaptcha.ready() wartet bis die API vollständig initialisiert ist
    const waitAndRender = () => {
      if (typeof grecaptcha !== 'undefined' && typeof grecaptcha.ready === 'function') {
        grecaptcha.ready(() => tryRender());
      } else {
        setTimeout(waitAndRender, 100);
      }
    };
    waitAndRender();
  }
}
