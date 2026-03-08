import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <h2>Register</h2>

      <label>
        Username
        <input [(ngModel)]="username" />
      </label>

      <label>
        Email
        <input [(ngModel)]="email" />
      </label>

      <label>
        Password
        <input type="password" [(ngModel)]="password" />
      </label>

      <button (click)="onRegister()">Create account</button>

      <p class="error" *ngIf="error()">{{ error() }}</p>
      <p class="ok" *ngIf="ok()">{{ ok() }}</p>

      <p><a routerLink="/login">Back to login</a></p>
    </div>
  `
})
export class RegisterPage {
  username = '';
  email = '';
  password = '';
  error = signal<string | null>(null);
  ok = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async onRegister(): Promise<void> {
    this.error.set(null);
    this.ok.set(null);

    try {
      await this.auth.register(this.username, this.email, this.password);
      this.ok.set('Account created. You can login now.');
      await this.router.navigateByUrl('/login');
    } catch {
      this.error.set('Registration failed');
    }
  }
}
