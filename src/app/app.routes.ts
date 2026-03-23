import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadChildren: () =>
          import('./features/home/home.routes').then((m) => m.homeRoutes),
        data: { animation: 'home' },
      },
      {
        path: 'services',
        loadChildren: () =>
          import('./features/services/services.routes').then(
            (m) => m.servicesRoutes
          ),
        data: { animation: 'services' },
      },
      {
        path: 'about',
        loadChildren: () =>
          import('./features/about/about.routes').then((m) => m.aboutRoutes),
        data: { animation: 'about' },
      },
      {
        path: 'contact',
        loadChildren: () =>
          import('./features/contact/contact.routes').then(
            (m) => m.contactRoutes
          ),
        data: { animation: 'contact' },
      },
      {
        path: 'faq',
        loadChildren: () =>
          import('./features/faq/faq.routes').then((m) => m.faqRoutes),
        data: { animation: 'faq' },
      },
      {
        path: 'imprint',
        loadChildren: () =>
          import('./legal/imprint/imprint.routes').then(
            (m) => m.imprintRoutes
          ),
        data: { animation: 'imprint' },
      },
      {
        path: 'privacy',
        loadChildren: () =>
          import('./legal/privacy/privacy.routes').then(
            (m) => m.privacyRoutes
          ),
        data: { animation: 'privacy' },
      },
      {
        path: '**',
        redirectTo: 'home',
      },
    ],
  },
];
