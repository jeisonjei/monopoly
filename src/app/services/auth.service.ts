import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { API_BASE_URL } from './api.config';
import { I18nService } from './i18n.service';

const AUTH_REQUEST_TIMEOUT_MS = 5000;

type TokenPair = {
  access: string;
  refresh: string;
};

type ApiErrorPayload = {
  detail?: string;
  [key: string]: unknown;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly accessToken = signal<string | null>(localStorage.getItem('access_token'));
  readonly refreshToken = signal<string | null>(localStorage.getItem('refresh_token'));
  readonly username = signal<string | null>(localStorage.getItem('username'));
  private readonly i18n = inject(I18nService);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  isAuthenticated(): boolean {
    return !!this.accessToken();
  }

  async logout(): Promise<void> {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('username');
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.username.set(null);
    await this.router.navigateByUrl('/login');
  }

  async register(username: string, email: string, password: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http
          .post(`${API_BASE_URL}/api/accounts/register/`, { username, email, password })
          .pipe(timeout(AUTH_REQUEST_TIMEOUT_MS))
      );
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('register_failed')));
    }
  }

  async login(username: string, password: string): Promise<void> {
    let tokens: TokenPair;
    try {
      tokens = await firstValueFrom(
        this.http
          .post<TokenPair>(`${API_BASE_URL}/api/accounts/token/`, { username, password })
          .pipe(timeout(AUTH_REQUEST_TIMEOUT_MS))
      );
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('login_failed')));
    }

    localStorage.setItem('access_token', tokens.access);
    localStorage.setItem('refresh_token', tokens.refresh);
    localStorage.setItem('username', username);
    this.accessToken.set(tokens.access);
    this.refreshToken.set(tokens.refresh);
    this.username.set(username);
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http
          .post(`${API_BASE_URL}/api/accounts/password-reset/request/`, { email })
          .pipe(timeout(AUTH_REQUEST_TIMEOUT_MS))
      );
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('password_reset_request_failed')));
    }
  }

  async confirmPasswordReset(uid: string, token: string, newPassword: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http
          .post(`${API_BASE_URL}/api/accounts/password-reset/confirm/`, {
            uid,
            token,
            new_password: newPassword
          })
          .pipe(timeout(AUTH_REQUEST_TIMEOUT_MS))
      );
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('password_reset_failed')));
    }
  }

  private extractApiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof TimeoutError) {
      return this.i18n.t('request_timed_out');
    }

    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    const payload = error.error as ApiErrorPayload | string | null;
    if (typeof payload === 'string' && payload.trim()) {
      return this.translateApiMessage(payload.trim()) ?? payload;
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return this.translateApiMessage(payload.detail.trim()) ?? payload.detail;
      }

      const fieldMessages = Object.entries(payload)
        .flatMap(([field, value]) => {
          if (field === 'detail') {
            return [];
          }

          if (Array.isArray(value)) {
            return value
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((message) => this.formatFieldError(field, message));
          }

          if (typeof value === 'string' && value.trim()) {
            return [this.formatFieldError(field, value)];
          }

          return [];
        })
        .filter((message) => message.trim().length > 0);

      if (fieldMessages.length) {
        return fieldMessages.join(' ');
      }
    }

    return fallback;
  }

  private formatFieldError(field: string, message: string): string {
    const normalizedMessage = message.trim();
    const translatedMessage = this.translateApiMessage(normalizedMessage) ?? normalizedMessage;
    return `${this.translateFieldName(field)}: ${translatedMessage}`;
  }

  private translateFieldName(field: string): string {
    const normalizedField = field.trim().toLowerCase();
    if (normalizedField === 'username') return this.i18n.t('username_field');
    if (normalizedField === 'email') return this.i18n.t('email_field');
    if (normalizedField === 'password' || normalizedField === 'new_password') return this.i18n.t('password_field');
    return field;
  }

  private translateApiMessage(message: string): string | null {
    const normalizedMessage = message.trim().toLowerCase();

    if (
      normalizedMessage === 'no active account found with the given credentials' ||
      normalizedMessage === 'invalid credentials' ||
      normalizedMessage === 'invalid username or password.'
    ) {
      return this.i18n.t('invalid_credentials');
    }

    if (
      normalizedMessage === 'a user with that username already exists.' ||
      normalizedMessage === 'user with this username already exists.'
    ) {
      return this.i18n.t('username_already_exists');
    }

    if (
      normalizedMessage === 'a user with that email already exists.' ||
      normalizedMessage === 'user with this email already exists.'
    ) {
      return this.i18n.t('email_already_exists');
    }

    if (normalizedMessage === 'this field is required.') {
      return this.i18n.t('required_field');
    }

    if (normalizedMessage === 'enter a valid email address.') {
      return this.i18n.t('invalid_email_address');
    }

    return null;
  }
}
