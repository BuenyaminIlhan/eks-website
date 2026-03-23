import { Routes } from '@angular/router';

export const privacyRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./privacy.component').then((m) => m.PrivacyComponent),
    data: { animation: 'privacy' },
  },
];
