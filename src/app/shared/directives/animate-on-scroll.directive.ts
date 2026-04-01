import {
  Directive,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appAnimateOnScroll]',
  standalone: true,
})
export class AnimateOnScrollDirective implements OnInit, OnDestroy {
  @Input('appAnimateOnScroll') animationClass = 'aos-visible';
  @Input() animationDelay = 0;
  @Input() animationThreshold = 0.15;
  @Input() animationOnce = true;

  private readonly el = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer = inject(Renderer2);
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      // On SSR, make elements visible immediately (no animation)
      this.renderer.addClass(this.el.nativeElement, 'aos-visible');
      return;
    }

    // Initially hide element
    this.renderer.addClass(this.el.nativeElement, 'aos-hidden');

    if ('IntersectionObserver' in window) {
      this.setupIntersectionObserver();
    } else {
      // Fallback for browsers without IntersectionObserver
      this.makeVisible();
    }
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private setupIntersectionObserver(): void {
    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: this.animationThreshold,
    };

    this.observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (this.animationDelay > 0) {
              setTimeout(() => this.makeVisible(), this.animationDelay);
            } else {
              this.makeVisible();
            }

            if (this.animationOnce && this.observer) {
              this.observer.unobserve(this.el.nativeElement);
            }
          } else if (!this.animationOnce) {
            this.makeHidden();
          }
        });
      },
      options
    );

    this.observer.observe(this.el.nativeElement);
  }

  private makeVisible(): void {
    this.renderer.removeClass(this.el.nativeElement, 'aos-hidden');
    const cls = this.animationClass || 'aos-visible';
    this.renderer.addClass(this.el.nativeElement, cls);
  }

  private makeHidden(): void {
    const cls = this.animationClass || 'aos-visible';
    this.renderer.removeClass(this.el.nativeElement, cls);
    this.renderer.addClass(this.el.nativeElement, 'aos-hidden');
  }
}
