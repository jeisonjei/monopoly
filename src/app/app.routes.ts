import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'game'
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password.page').then((m) => m.ForgotPasswordPage)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password.page').then((m) => m.ResetPasswordPage)
  },
  {
    path: 'game',
    loadComponent: () => import('./pages/game.page').then((m) => m.GamePage)
  }
];
