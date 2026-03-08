import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-reset-password-page',
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
          <mat-card-title>{{ i18n.t('reset_password') }}</mat-card-title>
          <mat-card-subtitle>{{ i18n.t('set_new_password') }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form class="auth-form" [formGroup]="form" (ngSubmit)="onConfirm()">
            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('new_password') }}</mat-label>
              <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
              @if (newPassword.invalid && newPassword.touched) {
                <mat-error>{{ i18n.t('new_password') }} {{ i18n.t('required_field') }}</mat-error>
              }
            </mat-form-field>

            <p class="auth-hint">{{ i18n.t('simple_passwords_allowed') }}</p>

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
                  <span>{{ pending() ? i18n.t('saving') : i18n.t('set_new_password') }}</span>
                </span>
              </button>
            </div>
          </form>

          <div class="auth-links">
            <div class="auth-links-row">
              <a mat-button routerLink="/login">{{ i18n.t('back_to_login') }}</a>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class ResetPasswordPage {
  readonly error = signal<string | null>(null);
  readonly ok = signal<string | null>(null);
  readonly pending = signal(false);
  readonly form = new FormGroup({
    newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private uid = '';
  private token = '';
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  get newPassword(): FormControl<string> {
    return this.form.controls.newPassword;
  }

  constructor(
    route: ActivatedRoute
  ) {
    this.uid = route.snapshot.queryParamMap.get('uid') ?? '';
    this.token = route.snapshot.queryParamMap.get('token') ?? '';
  }

  async onConfirm(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.error.set(null);
    this.ok.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    if (!this.uid || !this.token) {
      this.error.set(this.i18n.t('invalid_link'));
      return;
    }

    this.pending.set(true);
    try {
      const { newPassword } = this.form.getRawValue();
      await this.auth.confirmPasswordReset(this.uid, this.token, newPassword);
      this.ok.set(this.i18n.t('password_updated'));
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('password_reset_failed'));
    } finally {
      this.pending.set(false);
    }
  }
}
