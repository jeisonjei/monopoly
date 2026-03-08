import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <h2>Login</h2>

      <label>
        Username
        <input [(ngModel)]="username" />
      </label>

      <label>
        Password
        <input type="password" [(ngModel)]="password" />
      </label>

      <button (click)="onLogin()">Login</button>

      <p class="error" *ngIf="error()">{{ error() }}</p>

      <p>
        <a routerLink="/register">Register</a>
        |
        <a routerLink="/forgot-password">Forgot password</a>
      </p>
    </div>
  `
})
export class LoginPage {
  username = '';
  password = '';
  error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async onLogin(): Promise<void> {
    this.error.set(null);
    try {
      await this.auth.login(this.username, this.password);
      await this.router.navigateByUrl('/game');
    } catch {
      this.error.set('Login failed');
    }
  }
}
