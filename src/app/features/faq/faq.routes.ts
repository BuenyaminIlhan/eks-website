import { Routes } from '@angular/router';

export const faqRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./faq.component').then((m) => m.FaqComponent),
    data: { animation: 'faq' },
  },
];
