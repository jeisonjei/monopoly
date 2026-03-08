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
  selector: 'app-register-page',
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
          <mat-card-title>{{ i18n.t('create_account') }}</mat-card-title>
          <mat-card-subtitle>{{ i18n.t('join_game_fast') }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form class="auth-form" [formGroup]="form" (ngSubmit)="onRegister()">
            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('username') }}</mat-label>
              <input matInput formControlName="username" autocomplete="username" />
              @if (username.invalid && username.touched) {
                <mat-error>{{ i18n.t('username') }} {{ i18n.t('required_field') }}</mat-error>
              }
            </mat-form-field>

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

            <mat-form-field appearance="outline" class="auth-full-width">
              <mat-label>{{ i18n.t('password') }}</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="new-password" />
              @if (password.invalid && password.touched) {
                <mat-error>{{ i18n.t('password') }} {{ i18n.t('required_field') }}</mat-error>
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
                  <span>{{ pending() ? i18n.t('create_account_in_progress') : i18n.t('create_account') }}</span>
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
export class RegisterPage {
  readonly error = signal<string | null>(null);
  readonly ok = signal<string | null>(null);
  readonly pending = signal(false);
  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  get username(): FormControl<string> {
    return this.form.controls.username;
  }

  get email(): FormControl<string> {
    return this.form.controls.email;
  }

  get password(): FormControl<string> {
    return this.form.controls.password;
  }

  async onRegister(): Promise<void> {
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
      const { username, email, password } = this.form.getRawValue();
      await this.auth.register(username.trim(), email.trim(), password);
      this.ok.set(this.i18n.t('account_created'));
      await this.router.navigateByUrl('/login');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('register_failed'));
    } finally {
      this.pending.set(false);
    }
  }
}
