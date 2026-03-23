import { Routes } from '@angular/router';

export const imprintRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./imprint.component').then((m) => m.ImprintComponent),
    data: { animation: 'imprint' },
  },
];
