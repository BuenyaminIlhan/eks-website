import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CookieConsentService, CookiePreferences } from '../../../core/services/cookie-consent.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { RouterLink } from '@angular/router';
import { slideUp, scaleIn } from '../../../animations/common.animations';

@Component({
  selector: 'app-cookie-consent-banner',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [slideUp, scaleIn],
  templateUrl: './cookie-consent-banner.component.html',
  styleUrls: ['./cookie-consent-banner.component.scss'],
})
export class CookieConsentBannerComponent {
  readonly consentService = inject(CookieConsentService);

  readonly analyticsEnabled = signal(false);
  readonly marketingEnabled = signal(false);

  readonly showBanner = computed(() => this.consentService.showBanner());
  readonly showCustomize = computed(() => this.consentService.showCustomizePanel());

  acceptAll(): void {
    this.consentService.acceptAll();
  }

  declineAll(): void {
    this.consentService.declineAll();
  }

  openCustomize(): void {
    this.analyticsEnabled.set(this.consentService.preferences().analytics);
    this.marketingEnabled.set(this.consentService.preferences().marketing);
    this.consentService.openCustomizePanel();
  }

  saveCustom(): void {
    const prefs: Partial<CookiePreferences> = {
      analytics: this.analyticsEnabled(),
      marketing: this.marketingEnabled(),
    };
    this.consentService.saveCustomPreferences(prefs);
  }

  backToBanner(): void {
    this.consentService.closeCustomizePanel();
  }

  toggleAnalytics(): void {
    this.analyticsEnabled.update((v) => !v);
  }

  toggleMarketing(): void {
    this.marketingEnabled.update((v) => !v);
  }
}
