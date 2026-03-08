import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { GameService } from '../services/game.service';
import { WsService, GameWsEvent } from '../services/ws.service';
import { getTilePoint } from '../services/board-coordinates';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="game">
      <header class="top">
        <div>
          <strong>Monopoly</strong>
          <span class="muted">(single room)</span>
        </div>
        <nav>
          <a routerLink="/login" *ngIf="!auth.isAuthenticated()">Login</a>
          <span class="muted" *ngIf="auth.isAuthenticated() && auth.username()">{{ auth.username() }}</span>
          <button *ngIf="auth.isAuthenticated()" (click)="auth.logout()">Logout</button>
        </nav>
      </header>

      <div class="layout">
        <section class="board-area">
          <div class="cards-panel cards-panel-left">
            <div class="cards-heading">Your cards</div>
            <div class="cards-grid">
              <div class="property-card placeholder" *ngFor="let card of myCardSlots()" [class.owned]="!!card">
                <ng-container *ngIf="card; else emptyMyCard">
                  <div class="property-card-band" [style.background]="card.bandColor"></div>
                  <div class="property-card-title">{{ card.title }}</div>
                  <div class="property-card-meta">Seat {{ card.ownerSeat }}</div>
                  <div class="property-card-meta">$ {{ card.price ?? '-' }} | Rent {{ card.rent ?? '-' }}</div>
                </ng-container>
                <ng-template #emptyMyCard>
                  <div class="property-card-empty">Available slot</div>
                </ng-template>
              </div>
            </div>
          </div>

          <section class="board">
            <div class="board-wrap">
              <div class="board-stage">
                <div class="board-rotator" [style.transform]="boardTransform()">
                  <img class="board-img" src="/assets/board/board.jpg" alt="Board" />

                  <div
                    class="token"
                    *ngFor="let p of players()"
                    [style.left.%]="tilePoint(p.position_index).leftPct"
                    [style.top.%]="tilePoint(p.position_index).topPct"
                    [style.background]="seatColor(p.seat_index)"
                    [title]="'Seat ' + p.seat_index + ' (tile ' + p.position_index + ')'"
                  >
                    {{ p.seat_index }}
                  </div>
                </div>

                <button class="rotate-board-btn" type="button" (click)="rotateBoard()" aria-label="Rotate board">
                  ↻
                </button>
              </div>
            </div>
          </section>

          <div
            class="opponents-column"
            [class.opponents-column-single]="opponentCount() <= 1"
            [class.opponents-column-double]="opponentCount() === 2"
            [class.opponents-column-scrollable]="opponentCount() >= 3"
          >
            <div
              class="cards-panel cards-panel-right"
              *ngFor="let group of opponentCardGroups()"
              [style.--opponent-panel-min-height]="opponentPanelMinHeight(group) + 'px'"
            >
              <div class="cards-heading">{{ group.title }}</div>
              <div class="cards-grid cards-grid-dense" [style.grid-template-columns]="opponentGridTemplateColumns(group)">
                <div class="property-card placeholder" *ngFor="let card of group.slots" [class.owned]="!!card">
                  <ng-container *ngIf="card; else emptyOpponentCard">
                    <div class="property-card-band" [style.background]="card.bandColor"></div>
                    <div class="property-card-title">{{ card.title }}</div>
                    <div class="property-card-meta">{{ card.ownerName }}</div>
                    <div class="property-card-meta">$ {{ card.price ?? '-' }} | Rent {{ card.rent ?? '-' }}</div>
                  </ng-container>
                  <ng-template #emptyOpponentCard>
                    <div class="property-card-empty">Available slot</div>
                  </ng-template>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside class="side">
          <h3>Dice</h3>
          <div class="dice">{{ dice1() ?? '-' }} : {{ dice2() ?? '-' }}</div>

          <h3>Connection</h3>
          <div>{{ wsStatus() }}</div>

          <h3>Turn</h3>
          <div>Seat: {{ turnSeat() }}<span class="muted" *ngIf="turnPlayerName()">{{ turnPlayerName() }}</span></div>

          <h3>You</h3>
          <div *ngIf="yourSeat() !== null; else noSeat">Seat: {{ yourSeat() }}<span class="muted" *ngIf="auth.username()">{{ auth.username() }}</span></div>
          <ng-template #noSeat>
            <div class="muted">Not joined</div>
          </ng-template>

          <div *ngIf="yourPlayer() as me">
            <div>Money: {{ me.money }}</div>
            <div class="muted">Tile: {{ me.position_index }}</div>
          </div>

          <div *ngIf="pendingTileInfo() as info">
            <h3>Tile</h3>
            <div>Index: {{ info.tile_index }}</div>
            <div *ngIf="info.owner_seat_index !== null; else unowned">Owner seat: {{ info.owner_seat_index }}</div>
            <ng-template #unowned>
              <div class="muted">Unowned</div>
            </ng-template>
            <div class="muted">Price: {{ info.purchase_price }} | Rent: {{ info.base_rent }}</div>
          </div>

          <h3>Players</h3>
          <div class="players" *ngIf="players().length; else noPlayers">
            <div class="player" *ngFor="let p of players()">
              <span>Seat {{ p.seat_index }}<span class="muted">{{ p.username }}</span></span>
              <span class="muted">$ {{ p.money }}</span>
            </div>
          </div>
          <ng-template #noPlayers>
            <div class="muted">No players yet</div>
          </ng-template>

          <h3>Activity</h3>
          <div class="players" *ngIf="actionLog().length; else noActivity">
            <div class="muted" *ngFor="let item of actionLog()">{{ item }}</div>
          </div>
          <ng-template #noActivity>
            <div class="muted">No actions yet</div>
          </ng-template>

          <div class="actions" *ngIf="auth.isAuthenticated()">
            <button (click)="refreshState()">Refresh state</button>
            <button (click)="connect()" [disabled]="connected() || wsStatus() === 'connecting'">Connect</button>
            <button (click)="resetGame()" [disabled]="!connected()">New game</button>
            <button (click)="claimFirstTurn()" [disabled]="!canClaimFirstTurn()">My turn is first</button>
            <button (click)="roll()" [disabled]="!connected()">Roll</button>
            <button (click)="buy()" [disabled]="!canBuy()">Buy</button>
            <button (click)="endTurn()" [disabled]="!connected()">End turn</button>
          </div>

          <p class="error" *ngIf="error()">{{ error() }}</p>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        --property-card-height: 74px;
        --opponents-area-gap: 8px;
        --opponents-area-max-height: 95vh;
        --opponents-default-height: min(calc(100vw - 384px), calc(100vh - 104px), var(--opponents-area-max-height));
        --opponent-panel-chrome-height: 52px;
        --opponent-panel-min-height: 0px;
      }
      .game { padding: 16px; min-height: 100vh; box-sizing: border-box; }
      .top { display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px; }
      .muted { color: #666; margin-left: 8px; }
      .layout {
        display:grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 16px;
        align-items: start;
      }
      .board-area {
        display:grid;
        grid-template-columns: minmax(140px, 1fr) minmax(0, auto) minmax(140px, 1fr);
        gap: 16px;
        align-items: start;
      }
      .opponents-column {
        height: var(--opponents-default-height);
        max-height: var(--opponents-area-max-height);
        min-height: 320px;
        display:grid;
        grid-auto-rows: minmax(var(--opponent-panel-min-height, 0px), auto);
        gap: var(--opponents-area-gap);
        align-items: stretch;
        align-content: start;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-gutter: stable;
      }
      .opponents-column-single {
        grid-template-rows: minmax(0, 1fr);
      }
      .opponents-column-double {
        grid-template-rows: repeat(2, minmax(calc((var(--opponents-default-height) - var(--opponents-area-gap)) / 2), auto));
      }
      .opponents-column-scrollable {
        height: auto;
        min-height: 320px;
      }
      .board {
        display:flex;
        align-items: flex-start;
        justify-content: center;
      }
      .cards-panel {
        height: var(--opponents-default-height);
        max-height: var(--opponents-area-max-height);
        min-height: 320px;
        border: 2px solid #e54848;
        border-radius: 8px;
        padding: 12px;
        box-sizing: border-box;
        display:flex;
        flex-direction: column;
        gap: 12px;
        background: rgba(255,255,255,0.7);
      }
      .cards-panel-left {
        overflow: hidden;
      }
      .cards-panel-right {
        height: 100%;
        max-height: 100%;
        min-height: max(0px, var(--opponent-panel-min-height, 0px));
        overflow: hidden;
        flex: 0 0 auto;
      }
      .cards-heading {
        font-weight: 700;
        font-size: 14px;
        flex: 0 0 auto;
      }
      .cards-grid {
        flex: 1;
        display:grid;
        grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
        grid-auto-rows: var(--property-card-height);
        gap: 8px;
        align-content: start;
        align-items: start;
        overflow: hidden;
      }
      .cards-grid-dense {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-rows: var(--property-card-height);
        gap: 6px;
      }
      .property-card {
        min-width: 0;
        min-height: 0;
        height: var(--property-card-height);
        border: 1px solid rgba(214, 27, 27, 0.5);
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(245,245,245,0.88));
        display:flex;
        flex-direction: column;
        justify-content: flex-start;
        overflow: hidden;
        box-sizing: border-box;
      }
      .property-card.placeholder {
        border-style: solid;
      }
      .property-card.owned {
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      }
      .property-card-band {
        height: 10px;
        width: 100%;
      }
      .property-card-title {
        font-size: 8px;
        font-weight: 700;
        padding: 3px 4px 1px;
        line-height: 1.1;
        color: #222;
        word-break: break-word;
      }
      .property-card-meta {
        font-size: 7px;
        color: #555;
        padding: 0 4px 2px;
        line-height: 1.1;
        word-break: break-word;
      }
      .property-card-empty {
        flex: 1;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        font-size: 9px;
        color: rgba(0,0,0,0.35);
        padding: 6px;
      }
      .board-wrap {
        background:#111;
        border-radius: 8px;
        padding: 8px;
        width: var(--opponents-default-height);
        height: var(--opponents-default-height);
        max-width: 100%;
        max-height: var(--opponents-area-max-height);
        box-sizing: border-box;
      }
      .board-stage { position: relative; }
      .board-rotator {
        position: relative;
        width: 100%;
        transform-origin: center center;
        transition: transform 220ms ease;
      }
      .board-img { width:100%; aspect-ratio: 1 / 1; height:auto; display:block; border-radius: 6px; object-fit: contain; }
      .token {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 2px solid rgba(255,255,255,0.85);
        color: rgba(0,0,0,0.85);
        font-weight: 700;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        user-select: none;
      }
      .rotate-board-btn {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 96px;
        height: 96px;
        border: none;
        border-radius: 999px;
        background: rgba(255,255,255,0.18);
        color: rgba(255,255,255,0.92);
        font-size: 56px;
        line-height: 1;
        display:flex;
        align-items:center;
        justify-content:center;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease, background 160ms ease, transform 160ms ease;
        backdrop-filter: blur(3px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.28);
      }
      .board-stage:hover .rotate-board-btn {
        opacity: 1;
        pointer-events: auto;
      }
      .rotate-board-btn:hover {
        background: rgba(255,255,255,0.28);
        transform: translate(-50%, -50%) scale(1.04);
      }
      .side { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
      .dice { font-size: 32px; margin: 8px 0 12px; }
      .actions { display:flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      .players { display:flex; flex-direction: column; gap: 6px; }
      .player { display:flex; justify-content: space-between; gap: 8px; }
      .error { color: #b00020; }
      @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; }
        .board-area {
          grid-template-columns: 1fr;
        }
        .opponents-column {
          height: auto;
          max-height: var(--opponents-area-max-height);
          min-height: 0;
          grid-template-rows: none;
        }
        .cards-panel {
          height: auto;
          max-height: none;
          min-height: 160px;
        }
        .cards-panel-right {
          height: auto;
          max-height: none;
          min-height: 160px;
        }
        .cards-grid {
          grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
        }
        .cards-grid-dense {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .board-wrap {
          width: min(calc(100vw - 32px), calc(100vh - 220px));
          height: min(calc(100vw - 32px), calc(100vh - 220px));
          max-height: none;
        }
      }
    `
  ]
})
export class GamePage {
  connected = signal(false);
  error = signal<string | null>(null);
  wsStatus = signal<'disconnected' | 'connecting' | 'connected'>('disconnected');

  dice1 = signal<number | null>(null);
  dice2 = signal<number | null>(null);
  hasGameStarted = signal(false);
  boardRotation = signal(0);
  turnSeat = signal<number>(0);
  yourSeat = signal<number | null>(null);
  players = signal<any[]>([]);
  properties = signal<any[]>([]);
  actionLog = signal<string[]>([]);

  constructor(
    public readonly auth: AuthService,
    private readonly game: GameService,
    private readonly ws: WsService
  ) {
    if (this.auth.isAuthenticated()) {
      void this.refreshState();
    }
  }

  async refreshState(): Promise<void> {
    this.error.set(null);
    if (!this.auth.isAuthenticated()) {
      this.error.set('Login first');
      return;
    }

    try {
      const state = await this.game.getState();
      this.turnSeat.set(state.game.turn_seat_index ?? 0);
      this.hasGameStarted.set(!!state.game.last_roll_at);
      this.yourSeat.set(state.you?.seat_index ?? null);
      this.players.set(state.players ?? []);
      this.properties.set(state.properties ?? []);
      this.actionLog.set([]);
    } catch {
      this.error.set('Failed to load game state');
    }
  }

  connect(): void {
    this.error.set(null);
    const token = this.auth.accessToken();
    if (!token) {
      this.error.set('Login first');
      return;
    }

    this.connected.set(false);
    this.wsStatus.set('connecting');
    this.ws.connect(
      token,
      (ev: GameWsEvent) => this.onEvent(ev),
      (st) => {
        if (st === 'open') {
          this.connected.set(true);
          this.wsStatus.set('connected');
          return;
        }

        this.connected.set(false);
        this.wsStatus.set('disconnected');
        if (st === 'error') this.error.set('WebSocket error');
        if (st === 'close') this.error.set('WebSocket closed');
      }
    );
  }

  roll(): void {
    this.ws.send({ type: 'roll_dice' });
  }

  rotateBoard(): void {
    this.boardRotation.update((value) => (value + 90) % 360);
  }

  claimFirstTurn(): void {
    this.ws.send({ type: 'claim_first_turn' });
  }

  resetGame(): void {
    this.ws.send({ type: 'reset_game' });
  }

  buy(): void {
    this.ws.send({ type: 'buy_property' });
  }

  endTurn(): void {
    this.ws.send({ type: 'end_turn' });
  }

  private onEvent(ev: GameWsEvent): void {
    if (ev.type === 'dice_rolled') {
      this.dice1.set(ev.d1);
      this.dice2.set(ev.d2);
      this.hasGameStarted.set(true);
      const playerName = this.playerNameForSeat(ev.seat_index);
      this.pushAction(`${playerName} rolled ${ev.d1} + ${ev.d2} = ${ev.d1 + ev.d2}`);
    }

    if (ev.type === 'turn_changed') {
      this.turnSeat.set(ev.turn_seat_index);
      const playerName = this.playerNameForSeat(ev.turn_seat_index);
      this.pushAction(this.hasGameStarted() ? `Turn changed to ${playerName}` : `${playerName} will go first`);
    }

    if (ev.type === 'state_snapshot') {
      this.turnSeat.set(ev.game.turn_seat_index ?? 0);
      this.hasGameStarted.set(!!ev.game.last_roll_at);
      this.players.set(ev.players ?? []);
      this.properties.set(ev.properties ?? []);
      this.pushAction('Connected to game room');
    }

    if (ev.type === 'players_updated') {
      const nextPlayers = ev.players ?? [];
      if (this.isResetState(nextPlayers)) {
        this.dice1.set(null);
        this.dice2.set(null);
        this.hasGameStarted.set(false);
        this.pushAction('Game reset');
      }
      this.capturePlayerChanges(this.players(), ev.players ?? []);
      this.players.set(nextPlayers);
    }

    if (ev.type === 'properties_updated') {
      this.capturePropertyChanges(this.properties(), ev.properties ?? []);
      this.properties.set(ev.properties ?? []);
    }

    if (ev.type === 'error') {
      this.error.set(ev.message);
    }
  }

  tilePoint(tileIndex: number): { leftPct: number; topPct: number } {
    return getTilePoint(tileIndex ?? 0);
  }

  boardTransform(): string {
    return `rotate(${this.boardRotation()}deg)`;
  }

  seatColor(seatIndex: number): string {
    const colors = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#ff9500'];
    return colors[((seatIndex ?? 0) % colors.length + colors.length) % colors.length];
  }

  yourPlayer(): any | null {
    const seat = this.yourSeat();
    if (seat === null) return null;
    return this.players().find((p) => p.seat_index === seat) ?? null;
  }

  turnPlayerName(): string | null {
    const seat = this.turnSeat();
    return this.players().find((p) => p.seat_index === seat)?.username ?? null;
  }

  private playerNameForSeat(seat: number): string {
    const player = this.players().find((p) => p.seat_index === seat);
    return player?.username ? `${player.username} (Seat ${seat})` : `Seat ${seat}`;
  }

  private pushAction(message: string): void {
    const next = [message, ...this.actionLog()];
    this.actionLog.set(next.slice(0, 8));
  }

  private capturePlayerChanges(previousPlayers: any[], nextPlayers: any[]): void {
    for (const nextPlayer of nextPlayers) {
      const previousPlayer = previousPlayers.find((p) => p.seat_index === nextPlayer.seat_index);
      if (!previousPlayer) {
        this.pushAction(`${this.playerNameForSeat(nextPlayer.seat_index)} joined the game`);
        continue;
      }

      if (previousPlayer.position_index !== nextPlayer.position_index) {
        this.pushAction(
          `${nextPlayer.username ?? `Seat ${nextPlayer.seat_index}`} moved to tile ${nextPlayer.position_index}`
        );
      }

      const moneyDelta = (nextPlayer.money ?? 0) - (previousPlayer.money ?? 0);
      if (moneyDelta >= 20) {
        this.pushAction(`${nextPlayer.username ?? `Seat ${nextPlayer.seat_index}`} received $${moneyDelta}`);
      } else if (moneyDelta <= -20) {
        this.pushAction(`${nextPlayer.username ?? `Seat ${nextPlayer.seat_index}`} paid $${Math.abs(moneyDelta)}`);
      }
    }
  }

  private capturePropertyChanges(previousProperties: any[], nextProperties: any[]): void {
    for (const nextProperty of nextProperties) {
      const previousProperty = previousProperties.find((p) => p.tile_index === nextProperty.tile_index);
      if (!previousProperty) {
        continue;
      }

      if (
        (previousProperty.owner_seat_index === null || previousProperty.owner_seat_index === undefined) &&
        nextProperty.owner_seat_index !== null &&
        nextProperty.owner_seat_index !== undefined
      ) {
        this.pushAction(
          `${this.playerNameForSeat(nextProperty.owner_seat_index)} bought tile ${nextProperty.tile_index}`
        );
      }
    }
  }

  private isResetState(players: any[]): boolean {
    if (!players.length) return false;
    return players.every(
      (player) =>
        player.money === 1500 &&
        player.position_index === 0 &&
        (player.pending_buy_tile_index === null || player.pending_buy_tile_index === undefined)
    );
  }

  canBuy(): boolean {
    if (!this.connected()) return false;
    const seat = this.yourSeat();
    if (seat === null) return false;
    if (this.turnSeat() !== seat) return false;

    const me = this.yourPlayer();
    if (!me) return false;
    const tile = me.pending_buy_tile_index;
    if (tile === null || tile === undefined) return false;
    const prop = this.properties().find((p) => p.tile_index === tile) ?? null;
    if (!prop) return true;
    return prop.owner_seat_index === null || prop.owner_seat_index === undefined;
  }

  canClaimFirstTurn(): boolean {
    if (!this.connected()) return false;
    if (this.hasGameStarted()) return false;
    return this.yourSeat() !== null;
  }

  pendingTileInfo(): any | null {
    const me = this.yourPlayer();
    if (!me) return null;
    const tile = me.pending_buy_tile_index;
    if (tile === null || tile === undefined) return null;
    return (
      this.properties().find((p) => p.tile_index === tile) ?? {
        tile_index: tile,
        owner_seat_index: null,
        purchase_price: null,
        base_rent: null,
      }
    );
  }

  myCardSlots(): Array<PropertyCardVm | null> {
    return this.buildCardSlots(this.myCards());
  }

  opponentCardGroups(): OpponentCardGroupVm[] {
    const groups = new Map<number, PropertyCardVm[]>();

    for (const card of this.opponentCards()) {
      const current = groups.get(card.ownerSeat) ?? [];
      current.push(card);
      groups.set(card.ownerSeat, current);
    }

    const opponents = this.players()
      .filter((player) => this.yourSeat() === null || player.seat_index !== this.yourSeat())
      .sort((a, b) => a.seat_index - b.seat_index);

    return opponents.map((player) => {
      const cards = (groups.get(player.seat_index) ?? []).sort((a, b) => a.tileIndex - b.tileIndex);
      return {
        ownerSeat: player.seat_index,
        title: `${player.username ?? `Seat ${player.seat_index}`} cards`,
        slots: this.buildCardSlots(cards, 6),
      };
    });
  }

  opponentCount(): number {
    return this.opponentCardGroups().length;
  }

  opponentGridTemplateColumns(group: OpponentCardGroupVm): string {
    return `repeat(${this.opponentColumnCount(group)}, minmax(0, 1fr))`;
  }

  private myCards(): PropertyCardVm[] {
    const yourSeat = this.yourSeat();
    if (yourSeat === null) return [];
    return this.propertyCards().filter((card) => card.ownerSeat === yourSeat);
  }

  private opponentCards(): PropertyCardVm[] {
    const yourSeat = this.yourSeat();
    return this.propertyCards().filter((card) => yourSeat === null || card.ownerSeat !== yourSeat);
  }

  private propertyCards(): PropertyCardVm[] {
    return this.properties()
      .filter((property) => property.owner_seat_index !== null && property.owner_seat_index !== undefined)
      .map((property) => {
        const ownerSeat = property.owner_seat_index;
        const owner = this.players().find((player) => player.seat_index === ownerSeat);
        return {
          tileIndex: property.tile_index,
          title: `Tile ${property.tile_index}`,
          ownerSeat,
          ownerName: owner?.username ? `${owner.username} (Seat ${ownerSeat})` : `Seat ${ownerSeat}`,
          price: property.purchase_price,
          rent: property.base_rent,
          bandColor: this.propertyBandColor(property.tile_index, ownerSeat),
        };
      })
      .sort((a, b) => a.tileIndex - b.tileIndex);
  }

  private buildCardSlots(cards: PropertyCardVm[], minimumSlots = 15): Array<PropertyCardVm | null> {
    const slotCount = Math.max(minimumSlots, cards.length);
    return Array.from({ length: slotCount }, (_, index) => cards[index] ?? null);
  }

  private opponentColumnCount(group: OpponentCardGroupVm): number {
    const slotCount = group.slots.length;
    const opponents = this.opponentCount();

    if (opponents >= 3) {
      return Math.min(2, Math.max(1, slotCount));
    }

    if (opponents === 2) {
      return Math.min(3, Math.max(2, Math.ceil(slotCount / 2)));
    }

    return Math.min(3, Math.max(2, Math.ceil(slotCount / 2)));
  }

  opponentPanelMinHeight(group: OpponentCardGroupVm): number {
    const columns = this.opponentColumnCount(group);
    const rows = Math.max(1, Math.ceil(group.slots.length / columns));
    const rowGap = 6;
    const verticalPadding = 24;
    const headingAndGap = 28;

    return rows * 74 + Math.max(0, rows - 1) * rowGap + verticalPadding + headingAndGap;
  }

  private propertyBandColor(tileIndex: number, ownerSeat: number): string {
    const palette = ['#8b4513', '#87ceeb', '#ff4f81', '#ff8c00', '#ff3b30', '#ffd60a', '#34c759', '#007aff'];
    return palette[((tileIndex ?? ownerSeat ?? 0) % palette.length + palette.length) % palette.length];
  }
}

type PropertyCardVm = {
  tileIndex: number;
  title: string;
  ownerSeat: number;
  ownerName: string;
  price: number | null;
  rent: number | null;
  bandColor: string;
};

type OpponentCardGroupVm = {
  ownerSeat: number;
  title: string;
  slots: Array<PropertyCardVm | null>;
};
