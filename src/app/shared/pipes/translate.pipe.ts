import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 't',
  standalone: true,
  pure: false, // Impure: muss auf Sprachwechsel reagieren
})
export class TranslatePipe implements PipeTransform {
  private readonly translationService = inject(TranslationService);

  // Memoization: verhindert wiederholte Übersetzungsarbeit pro CD-Zyklus
  private lastLang = '';
  private readonly cache = new Map<string, string>();

  transform(key: string, params?: Record<string, string>): string {
    const lang = this.translationService.currentLang();

    // Cache bei Sprachwechsel leeren
    if (lang !== this.lastLang) {
      this.cache.clear();
      this.lastLang = lang;
    }

    const cacheKey = params ? `${key}:${JSON.stringify(params)}` : key;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = this.translationService.translate(key, params);
    this.cache.set(cacheKey, result);
    return result;
  }
}
