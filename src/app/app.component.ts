import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { TranslationService } from './core/services/translation.service';
import { CookieConsentService } from './core/services/cookie-consent.service';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { CookieConsentBannerComponent } from './shared/components/cookie-consent-banner/cookie-consent-banner.component';
import { pageTransition } from './animations/page.animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    CookieConsentBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [pageTransition],
  template: `
    <a class="skip-link" href="#main-content">
      Zum Hauptinhalt springen / Skip to main content
    </a>

    <app-header />

    <main id="main-content" [@pageTransition]="getRouteState(outlet)">
      <router-outlet #outlet="outlet" />
    </main>

    <app-footer />

    <app-cookie-consent-banner />
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    main {
      flex: 1;
      margin-top: var(--header-height);
    }
  `],
})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translationService = inject(TranslationService);
  private readonly cookieConsentService = inject(CookieConsentService);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.translationService.initFromStorage();
      this.cookieConsentService.init();
    }
  }

  getRouteState(outlet: RouterOutlet): string {
    return outlet?.activatedRouteData?.['animation'] || 'default';
  }
}
