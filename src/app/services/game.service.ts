import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from './api.config';

export type GameStateResponse = {
  game: any;
  players: any[];
  properties?: any[];
  you: { seat_index: number };
};

@Injectable({ providedIn: 'root' })
export class GameService {
  constructor(private readonly http: HttpClient) {}

  async getState(): Promise<GameStateResponse> {
    return (await this.http
      .get<GameStateResponse>(`${API_BASE_URL}/api/game/state/`)
      .toPromise()) as GameStateResponse;
  }
}
