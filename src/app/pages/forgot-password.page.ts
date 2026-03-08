import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-forgot-password-page',
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
          <mat-card-title>{{ i18n.t('forgot_password') }}</mat-card-title>
          <mat-card-subtitle>{{ i18n.t('request_reset_link') }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form class="auth-form" [formGroup]="form" (ngSubmit)="onRequest()">
            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('email') }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
              @if (email.hasError('required') && email.touched) {
                <mat-error>{{ i18n.t('email') }} {{ i18n.t('required_field') }}</mat-error>
              }
              @if (email.hasError('email') && email.touched) {
                <mat-error>{{ i18n.t('invalid_email_address') }}</mat-error>
              }
            </mat-form-field>

            @if (error()) {
              <p class="auth-message auth-message-error">{{ error() }}</p>
            }

            @if (ok()) {
              <p class="auth-message auth-message-ok">{{ ok() }}</p>
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
                  <span>{{ pending() ? i18n.t('sending') : i18n.t('send_reset_email') }}</span>
                </span>
              </button>
            </div>
          </form>

          <div class="auth-links">
            <div class="auth-links-row">
              <a mat-button routerLink="/login">{{ i18n.t('back_to_login') }}</a>
            </div>
            <p class="auth-hint">{{ i18n.t('dev_mailhog') }}</p>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class ForgotPasswordPage {
  readonly error = signal<string | null>(null);
  readonly ok = signal<string | null>(null);
  readonly pending = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  get email(): FormControl<string> {
    return this.form.controls.email;
  }

  async onRequest(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.error.set(null);
    this.ok.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.pending.set(true);
    try {
      const { email } = this.form.getRawValue();
      await this.auth.requestPasswordReset(email.trim());
      this.ok.set(this.i18n.t('if_email_exists'));
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('password_reset_request_failed'));
    } finally {
      this.pending.set(false);
    }
  }
}
