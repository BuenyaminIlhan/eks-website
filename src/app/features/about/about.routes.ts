import { Routes } from '@angular/router';

export const aboutRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./about.component').then((m) => m.AboutComponent),
    data: { animation: 'about' },
  },
];
