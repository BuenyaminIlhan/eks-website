import { Routes } from '@angular/router';

export const contactRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./contact.component').then((m) => m.ContactComponent),
    data: { animation: 'contact' },
  },
];
