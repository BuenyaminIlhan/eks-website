import { Injectable, inject, PLATFORM_ID, DestroyRef } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslationService } from './translation.service';

export interface SeoConfig {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  jsonLd?: object;
  /** Pfad für hreflang-Links (z. B. 'home', 'services'). Setzt DE + EN + x-default. */
  hreflangPath?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly router = inject(Router);
  private readonly translationService = inject(TranslationService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly destroyRef = inject(DestroyRef);
  private readonly siteName = 'EKS - Euro-Kurier-Su';
  private readonly siteUrl = 'https://www.euro-kurier-su.de';
  private readonly defaultOgImage = `${this.siteUrl}/assets/images/og-image.jpg`;

  init(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        // Auto-scroll to top on navigation
        if (isPlatformBrowser(this.platformId)) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      });
  }

  updateSeo(config: SeoConfig): void {
    const fullTitle = config.title
      ? `${config.title} | ${this.siteName}`
      : this.siteName;

    // Set page title
    this.titleService.setTitle(fullTitle);

    // Meta description
    this.metaService.updateTag({
      name: 'description',
      content: config.description,
    });

    // Keywords
    if (config.keywords) {
      this.metaService.updateTag({
        name: 'keywords',
        content: config.keywords,
      });
    }

    // Robots
    if (config.noIndex) {
      this.metaService.updateTag({
        name: 'robots',
        content: 'noindex, nofollow',
      });
    } else {
      this.metaService.updateTag({
        name: 'robots',
        content: 'index, follow',
      });
    }

    // Open Graph
    this.metaService.updateTag({
      property: 'og:title',
      content: config.ogTitle || fullTitle,
    });
    this.metaService.updateTag({
      property: 'og:description',
      content: config.ogDescription || config.description,
    });
    this.metaService.updateTag({
      property: 'og:image',
      content: config.ogImage || this.defaultOgImage,
    });
    this.metaService.updateTag({
      property: 'og:type',
      content: config.ogType || 'website',
    });
    this.metaService.updateTag({
      property: 'og:site_name',
      content: this.siteName,
    });
    this.metaService.updateTag({
      property: 'og:locale',
      content: this.translationService.currentLang() === 'de' ? 'de_DE' : 'en_GB',
    });

    if (config.canonicalUrl) {
      this.metaService.updateTag({
        property: 'og:url',
        content: config.canonicalUrl,
      });
      this.updateCanonical(config.canonicalUrl);
    }

    if (config.hreflangPath && isPlatformBrowser(this.platformId)) {
      this.updateHreflang(config.hreflangPath);
    }

    // Twitter Card
    this.metaService.updateTag({
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    this.metaService.updateTag({
      name: 'twitter:title',
      content: config.ogTitle || fullTitle,
    });
    this.metaService.updateTag({
      name: 'twitter:description',
      content: config.ogDescription || config.description,
    });
    this.metaService.updateTag({
      name: 'twitter:image',
      content: config.ogImage || this.defaultOgImage,
    });

    // JSON-LD
    if (config.jsonLd && isPlatformBrowser(this.platformId)) {
      this.updateJsonLd(config.jsonLd);
    }
  }

  private updateHreflang(path: string): void {
    const langs: Array<'de' | 'en'> = ['de', 'en'];
    langs.forEach((lang) => {
      const id = `hreflang-${lang}`;
      let link = document.querySelector<HTMLLinkElement>(`link[id="${id}"]`);
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', lang);
        document.head.appendChild(link);
      }
      link.setAttribute('href', `${this.siteUrl}/${path}`);
    });

    let xDefault = document.querySelector<HTMLLinkElement>('link[hreflang="x-default"]');
    if (!xDefault) {
      xDefault = document.createElement('link');
      xDefault.setAttribute('rel', 'alternate');
      xDefault.setAttribute('hreflang', 'x-default');
      document.head.appendChild(xDefault);
    }
    xDefault.setAttribute('href', `${this.siteUrl}/${path}`);
  }

  private updateCanonical(url: string): void {
    if (isPlatformBrowser(this.platformId)) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', url);
    }
  }

  private updateJsonLd(data: object): void {
    const existingScript = document.querySelector(
      'script[type="application/ld+json"][data-dynamic]'
    );
    if (existingScript) {
      existingScript.textContent = JSON.stringify(data);
    } else {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-dynamic', 'true');
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    }
  }

  getPageUrl(path: string): string {
    return `${this.siteUrl}/${path}`;
  }
}
