import {
  trigger,
  transition,
  style,
  animate,
  state,
  keyframes,
  query,
  stagger,
} from '@angular/animations';

// Fade in from bottom
export const fadeInUp = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(24px)' }),
    animate(
      '500ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 1, transform: 'translateY(0)' })
    ),
  ]),
  transition(':leave', [
    animate(
      '300ms ease-in',
      style({ opacity: 0, transform: 'translateY(-12px)' })
    ),
  ]),
]);

// Fade in
export const fadeIn = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('400ms ease-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('250ms ease-in', style({ opacity: 0 })),
  ]),
]);

// Slide in from left
export const slideInLeft = trigger('slideInLeft', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-32px)' }),
    animate(
      '500ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 1, transform: 'translateX(0)' })
    ),
  ]),
]);

// Slide in from right
export const slideInRight = trigger('slideInRight', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(32px)' }),
    animate(
      '500ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 1, transform: 'translateX(0)' })
    ),
  ]),
]);

// Stagger list items
export const staggerList = trigger('staggerList', [
  transition('* => *', [
    query(
      ':enter',
      [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        stagger('80ms', [
          animate(
            '400ms ease-out',
            style({ opacity: 1, transform: 'translateY(0)' })
          ),
        ]),
      ],
      { optional: true }
    ),
  ]),
]);

// Scale in
export const scaleIn = trigger('scaleIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.9)' }),
    animate(
      '350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      style({ opacity: 1, transform: 'scale(1)' })
    ),
  ]),
  transition(':leave', [
    animate(
      '250ms ease-in',
      style({ opacity: 0, transform: 'scale(0.95)' })
    ),
  ]),
]);

// Accordion expand/collapse
export const accordionAnimation = trigger('accordionBody', [
  state(
    'collapsed',
    style({
      height: '0',
      overflow: 'hidden',
      opacity: 0,
      paddingTop: '0',
      paddingBottom: '0',
    })
  ),
  state(
    'expanded',
    style({
      height: '*',
      overflow: 'hidden',
      opacity: 1,
    })
  ),
  transition('collapsed <=> expanded', [
    animate('300ms cubic-bezier(0.4, 0, 0.2, 1)'),
  ]),
]);

// Cookie banner slide up
export const slideUp = trigger('slideUp', [
  transition(':enter', [
    style({ transform: 'translateY(100%)', opacity: 0 }),
    animate(
      '400ms 500ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ transform: 'translateY(0)', opacity: 1 })
    ),
  ]),
  transition(':leave', [
    animate(
      '300ms ease-in',
      style({ transform: 'translateY(100%)', opacity: 0 })
    ),
  ]),
]);

// Pulse animation
export const pulse = trigger('pulse', [
  transition('* => pulse', [
    animate(
      '600ms ease',
      keyframes([
        style({ transform: 'scale(1)', offset: 0 }),
        style({ transform: 'scale(1.05)', offset: 0.5 }),
        style({ transform: 'scale(1)', offset: 1 }),
      ])
    ),
  ]),
]);

// Header scroll state
export const headerScroll = trigger('headerScroll', [
  state(
    'top',
    style({
      backgroundColor: 'transparent',
      boxShadow: 'none',
    })
  ),
  state(
    'scrolled',
    style({
      backgroundColor: '#0F1F2E',
      boxShadow: '0 2px 20px rgba(15, 31, 46, 0.3)',
    })
  ),
  transition('top <=> scrolled', [animate('300ms ease')]),
]);

// Mobile menu
export const mobileMenu = trigger('mobileMenu', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(-8px)' }),
    animate(
      '300ms ease-out',
      style({ opacity: 1, transform: 'translateY(0)' })
    ),
  ]),
  transition(':leave', [
    animate(
      '200ms ease-in',
      style({ opacity: 0, transform: 'translateY(-8px)' })
    ),
  ]),
]);

// Counter animation helper (used with JS)
export const counterUp = trigger('counterUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(12px)' }),
    animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);
