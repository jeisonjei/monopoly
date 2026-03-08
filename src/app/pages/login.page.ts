import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="auth-shell">
      <mat-card class="auth-card" appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ i18n.t('login') }}</mat-card-title>
          <mat-card-subtitle>{{ i18n.t('access_game') }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form class="auth-form" [formGroup]="form" (ngSubmit)="onLogin()">
            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('username') }}</mat-label>
              <input matInput formControlName="username" autocomplete="username" />
              @if (username.invalid && username.touched) {
                <mat-error>{{ i18n.t('username') }} {{ i18n.t('required_field') }}</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('password') }}</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="current-password" />
              @if (password.invalid && password.touched) {
                <mat-error>{{ i18n.t('password') }} {{ i18n.t('required_field') }}</mat-error>
              }
            </mat-form-field>

            @if (error()) {
              <p class="auth-message auth-message-error">{{ error() }}</p>
            }

            <div class="auth-actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                class="auth-submit"
                [disabled]="pending() || form.invalid"
              >
                <span class="auth-submit-content">
                  @if (pending()) {
                    <mat-progress-spinner class="auth-spinner" mode="indeterminate" diameter="18"></mat-progress-spinner>
                  }
                  <span>{{ pending() ? i18n.t('signing_in') : i18n.t('login') }}</span>
                </span>
              </button>
            </div>
          </form>

          <div class="auth-links">
            <div class="auth-links-row">
              <a mat-button routerLink="/register">{{ i18n.t('create_account') }}</a>
              <a mat-button routerLink="/forgot-password">{{ i18n.t('forgot_password') }}</a>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class LoginPage {
  readonly error = signal<string | null>(null);
  readonly pending = signal(false);
  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  get username(): FormControl<string> {
    return this.form.controls.username;
  }

  get password(): FormControl<string> {
    return this.form.controls.password;
  }

  async onLogin(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.pending.set(true);
    try {
      const { username, password } = this.form.getRawValue();
      await this.auth.login(username.trim(), password);
      await this.router.navigateByUrl('/game');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('login_failed'));
    } finally {
      this.pending.set(false);
    }
  }
}
