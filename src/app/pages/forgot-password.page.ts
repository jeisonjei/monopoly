import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <h2>Forgot password</h2>

      <label>
        Email
        <input [(ngModel)]="email" />
      </label>

      <button (click)="onRequest()">Send reset email</button>

      <p class="error" *ngIf="error()">{{ error() }}</p>
      <p class="ok" *ngIf="ok()">{{ ok() }}</p>

      <p><a routerLink="/login">Back to login</a></p>
      <p>Dev: open MailHog at http://localhost:8025</p>
    </div>
  `
})
export class ForgotPasswordPage {
  email = '';
  error = signal<string | null>(null);
  ok = signal<string | null>(null);

  constructor(private readonly auth: AuthService) {}

  async onRequest(): Promise<void> {
    this.error.set(null);
    this.ok.set(null);

    try {
      await this.auth.requestPasswordReset(this.email);
      this.ok.set('If this email exists, a reset link has been sent.');
    } catch {
      this.error.set('Request failed');
    }
  }
}
