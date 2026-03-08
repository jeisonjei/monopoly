import { Injectable } from '@angular/core';

import { API_BASE_URL } from './api.config';

export type GameWsEvent =
  | { type: 'state_snapshot'; game: any; players: any[]; properties?: any[] }
  | { type: 'dice_rolled'; seat_index: number; d1: number; d2: number; state_version: number }
  | { type: 'players_updated'; players: any[]; state_version: number }
  | { type: 'properties_updated'; properties: any[]; state_version: number }
  | { type: 'turn_changed'; turn_seat_index: number; state_version: number }
  | { type: 'error'; message: string };

export type WsStatus = 'open' | 'close' | 'error';

@Injectable({ providedIn: 'root' })
export class WsService {
  private socket: WebSocket | null = null;

  connect(token: string, onEvent: (ev: GameWsEvent) => void, onStatus?: (st: WsStatus) => void): void {
    this.disconnect();

    const base = API_BASE_URL || window.location.origin;
    const wsBase = base.replace(/^http/, 'ws');
    const url = `${wsBase}/ws/game/?token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      onStatus?.('open');
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      onStatus?.('close');
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      onStatus?.('error');
    };

    socket.onmessage = (msg) => {
      if (this.socket !== socket) return;
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        // ignore
      }
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  send(data: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(data));
  }
}
