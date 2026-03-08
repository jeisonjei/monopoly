import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <h2>Reset password</h2>

      <label>
        New password
        <input type="password" [(ngModel)]="newPassword" />
      </label>

      <button (click)="onConfirm()">Set new password</button>

      <p class="error" *ngIf="error()">{{ error() }}</p>
      <p class="ok" *ngIf="ok()">{{ ok() }}</p>

      <p><a routerLink="/login">Back to login</a></p>
    </div>
  `
})
export class ResetPasswordPage {
  newPassword = '';
  error = signal<string | null>(null);
  ok = signal<string | null>(null);

  private uid = '';
  private token = '';

  constructor(
    private readonly auth: AuthService,
    route: ActivatedRoute
  ) {
    this.uid = route.snapshot.queryParamMap.get('uid') ?? '';
    this.token = route.snapshot.queryParamMap.get('token') ?? '';
  }

  async onConfirm(): Promise<void> {
    this.error.set(null);
    this.ok.set(null);

    if (!this.uid || !this.token) {
      this.error.set('Invalid link');
      return;
    }

    try {
      await this.auth.confirmPasswordReset(this.uid, this.token, this.newPassword);
      this.ok.set('Password updated. You can login now.');
    } catch {
      this.error.set('Reset failed');
    }
  }
}
