import {
  Injectable,
  signal,
  computed,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import deTranslations from '../../../assets/i18n/de.json';
import enTranslations from '../../../assets/i18n/en.json';

export type SupportedLanguage = 'de' | 'en';

type TranslationRecord = Record<string, unknown>;

const LANG_STORAGE_KEY = 'eks_language';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly translations: Record<SupportedLanguage, TranslationRecord> = {
    de: deTranslations as TranslationRecord,
    en: enTranslations as TranslationRecord,
  };

  readonly currentLang = signal<SupportedLanguage>('de');

  readonly isGerman = computed(() => this.currentLang() === 'de');
  readonly isEnglish = computed(() => this.currentLang() === 'en');

  initFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(LANG_STORAGE_KEY) as SupportedLanguage | null;
      if (stored && (stored === 'de' || stored === 'en')) {
        this.currentLang.set(stored);
      } else {
        // Try browser language detection
        const browserLang = navigator.language?.substring(0, 2) as SupportedLanguage;
        if (browserLang === 'de' || browserLang === 'en') {
          this.currentLang.set(browserLang);
        }
      }
    }
  }

  setLanguage(lang: SupportedLanguage): void {
    this.currentLang.set(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      // Update html lang attribute
      document.documentElement.lang = lang;
    }
  }

  toggleLanguage(): void {
    this.setLanguage(this.currentLang() === 'de' ? 'en' : 'de');
  }

  translate(key: string, params?: Record<string, string>): string {
    const lang = this.currentLang();
    const translation = this.getNestedValue(this.translations[lang], key);

    if (translation === undefined || translation === null) {
      // Fallback to German
      const fallback = this.getNestedValue(this.translations['de'], key);
      if (fallback === undefined || fallback === null) {
        return key; // Return key if no translation found
      }
      return this.interpolate(String(fallback), params);
    }

    return this.interpolate(String(translation), params);
  }

  t(key: string, params?: Record<string, string>): string {
    return this.translate(key, params);
  }

  private getNestedValue(
    obj: TranslationRecord,
    key: string
  ): unknown {
    const keys = key.split('.');
    let current: unknown = obj;

    for (const k of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as TranslationRecord)[k];
    }

    return current;
  }

  private interpolate(
    text: string,
    params?: Record<string, string>
  ): string {
    if (!params) return text;

    return Object.entries(params).reduce((acc, [key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      return acc.replace(regex, value);
    }, text);
  }
}
