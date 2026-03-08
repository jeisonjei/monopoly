import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { API_BASE_URL } from './api.config';
import { I18nService } from './i18n.service';

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
      await this.http
        .post(`${API_BASE_URL}/api/accounts/register/`, { username, email, password })
        .toPromise();
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('register_failed')));
    }
  }

  async login(username: string, password: string): Promise<void> {
    let tokens: TokenPair;
    try {
      tokens = (await this.http
        .post<TokenPair>(`${API_BASE_URL}/api/accounts/token/`, { username, password })
        .toPromise()) as TokenPair;
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
      await this.http
        .post(`${API_BASE_URL}/api/accounts/password-reset/request/`, { email })
        .toPromise();
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('password_reset_request_failed')));
    }
  }

  async confirmPasswordReset(uid: string, token: string, newPassword: string): Promise<void> {
    try {
      await this.http
        .post(`${API_BASE_URL}/api/accounts/password-reset/confirm/`, {
          uid,
          token,
          new_password: newPassword
        })
        .toPromise();
    } catch (error: unknown) {
      throw new Error(this.extractApiErrorMessage(error, this.i18n.t('password_reset_failed')));
    }
  }

  private extractApiErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    const payload = error.error as ApiErrorPayload | string | null;
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return payload.detail;
      }

      const fieldMessages = Object.entries(payload)
        .flatMap(([field, value]) => {
          if (field === 'detail') {
            return [];
          }

          if (Array.isArray(value)) {
            return value
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((message) => `${field}: ${message}`);
          }

          if (typeof value === 'string' && value.trim()) {
            return [`${field}: ${value}`];
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
}
