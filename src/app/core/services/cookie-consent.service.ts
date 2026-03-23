import {
  Injectable,
  signal,
  computed,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'customized';

const CONSENT_STORAGE_KEY = 'eks_cookie_consent';
const CONSENT_VERSION = '1.0';

@Injectable({
  providedIn: 'root',
})
export class CookieConsentService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly consentStatus = signal<ConsentStatus>('pending');

  readonly preferences = signal<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  readonly showBanner = computed(
    () => this.consentStatus() === 'pending'
  );

  readonly showCustomizePanel = signal(false);

  readonly analyticsAllowed = computed(
    () => this.preferences().analytics
  );

  readonly marketingAllowed = computed(
    () => this.preferences().marketing
  );

  init(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as {
          version: string;
          status: ConsentStatus;
          preferences: CookiePreferences;
        };

        if (data.version === CONSENT_VERSION) {
          this.consentStatus.set(data.status);
          this.preferences.set({
            ...data.preferences,
            necessary: true, // Always true
          });
        } else {
          // Version changed, reset consent
          this.resetConsent();
        }
      } catch {
        this.resetConsent();
      }
    }
  }

  acceptAll(): void {
    this.preferences.set({
      necessary: true,
      analytics: true,
      marketing: true,
    });
    this.consentStatus.set('accepted');
    this.persistConsent('accepted');
    this.showCustomizePanel.set(false);
  }

  declineAll(): void {
    this.preferences.set({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    this.consentStatus.set('declined');
    this.persistConsent('declined');
    this.showCustomizePanel.set(false);
  }

  saveCustomPreferences(prefs: Partial<CookiePreferences>): void {
    this.preferences.set({
      necessary: true, // Always required
      analytics: prefs.analytics ?? false,
      marketing: prefs.marketing ?? false,
    });
    this.consentStatus.set('customized');
    this.persistConsent('customized');
    this.showCustomizePanel.set(false);
  }

  openCustomizePanel(): void {
    this.showCustomizePanel.set(true);
  }

  closeCustomizePanel(): void {
    this.showCustomizePanel.set(false);
  }

  resetConsent(): void {
    this.consentStatus.set('pending');
    this.preferences.set({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    this.showCustomizePanel.set(false);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
  }

  private persistConsent(status: ConsentStatus): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const data = {
      version: CONSENT_VERSION,
      status,
      preferences: this.preferences(),
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(data));
  }

  getConsentDate(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as { timestamp: string };
        return data.timestamp;
      } catch {
        return null;
      }
    }
    return null;
  }
}
