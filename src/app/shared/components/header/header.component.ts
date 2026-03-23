import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  PLATFORM_ID,
  OnInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { headerScroll, mobileMenu } from '../../../animations/common.animations';

interface NavLink {
  key: string;
  path: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [headerScroll, mobileMenu],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  readonly translationService = inject(TranslationService);

  readonly isScrolled = signal(false);
  readonly isMobileMenuOpen = signal(false);

  readonly navLinks: NavLink[] = [
    { key: 'nav.home', path: '/home' },
    { key: 'nav.services', path: '/services' },
    { key: 'nav.about', path: '/about' },
    { key: 'nav.contact', path: '/contact' },
    { key: 'nav.faq', path: '/faq' },
  ];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.checkScroll();
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('menu-open');
    }
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.checkScroll();
    }
  }

  @HostListener('window:resize', [])
  onResize(): void {
    if (isPlatformBrowser(this.platformId) && window.innerWidth >= 1024) {
      this.closeMobileMenu();
    }
  }

  @HostListener('window:keydown.escape', [])
  onEscape(): void {
    if (this.isMobileMenuOpen()) {
      this.closeMobileMenu();
    }
  }

  private checkScroll(): void {
    this.isScrolled.set(window.scrollY > 20);
  }

  toggleMobileMenu(): void {
    const newState = !this.isMobileMenuOpen();
    this.isMobileMenuOpen.set(newState);
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.toggle('menu-open', newState);
    }
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('menu-open');
    }
  }

  toggleLanguage(): void {
    this.translationService.toggleLanguage();
  }

  get currentLang(): string {
    return this.translationService.currentLang();
  }

  get alternateLang(): string {
    return this.currentLang === 'de' ? 'EN' : 'DE';
  }
}
