import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { API_BASE_URL } from './api.config';

type TokenPair = {
  access: string;
  refresh: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly accessToken = signal<string | null>(localStorage.getItem('access_token'));
  readonly refreshToken = signal<string | null>(localStorage.getItem('refresh_token'));
  readonly username = signal<string | null>(localStorage.getItem('username'));

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
    await this.http
      .post(`${API_BASE_URL}/api/accounts/register/`, { username, email, password })
      .toPromise();
  }

  async login(username: string, password: string): Promise<void> {
    const tokens = (await this.http
      .post<TokenPair>(`${API_BASE_URL}/api/accounts/token/`, { username, password })
      .toPromise()) as TokenPair;

    localStorage.setItem('access_token', tokens.access);
    localStorage.setItem('refresh_token', tokens.refresh);
    localStorage.setItem('username', username);
    this.accessToken.set(tokens.access);
    this.refreshToken.set(tokens.refresh);
    this.username.set(username);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.http
      .post(`${API_BASE_URL}/api/accounts/password-reset/request/`, { email })
      .toPromise();
  }

  async confirmPasswordReset(uid: string, token: string, newPassword: string): Promise<void> {
    await this.http
      .post(`${API_BASE_URL}/api/accounts/password-reset/confirm/`, {
        uid,
        token,
        new_password: newPassword
      })
      .toPromise();
  }
}
