import {
  Component,
  ChangeDetectionStrategy,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cookieConsentService = inject(CookieConsentService);

  readonly currentYear = signal(new Date().getFullYear());

  readonly quickLinks = [
    { key: 'nav.home', path: '/home' },
    { key: 'nav.services', path: '/services' },
    { key: 'nav.about', path: '/about' },
    { key: 'nav.contact', path: '/contact' },
    { key: 'nav.faq', path: '/faq' },
  ];

  readonly serviceLinks = [
    { key: 'services.express.title', path: '/services' },
    { key: 'services.sameDay.title', path: '/services' },
    { key: 'services.crossBorder.title', path: '/services' },
    { key: 'services.b2b.title', path: '/services' },
    { key: 'services.tracking.title', path: '/services' },
  ];

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  openCookieSettings(): void {
    this.cookieConsentService.resetConsent();
  }
}
