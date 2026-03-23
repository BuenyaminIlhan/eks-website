import { Routes } from '@angular/router';

export const servicesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./services.component').then((m) => m.ServicesComponent),
    data: { animation: 'services' },
  },
];
