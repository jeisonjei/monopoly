import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { BoardEventDialogComponent } from '../components/board-event-dialog.component';
import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';
import {
  boardEventActionButtonLabel,
  boardEventActionLabel,
  boardEventKicker,
  cardSortRank,
  getTileDefinition,
  SpecialCardPayload,
  tileKindLabel,
  TileKind
} from '../services/board-tiles';
import { GameService } from '../services/game.service';
import { WsService, GameWsEvent } from '../services/ws.service';
import { getTilePoint } from '../services/board-coordinates';
import {
  clampTileGeometry,
  cloneGeometryMap,
  createBoardGeometryJson,
  DEFAULT_BOARD_GEOMETRY,
  getTileGeometry,
  normalizeTileIndex,
  TileGeometry,
  TileGeometryMap
} from '../services/board-geometry';

const BOARD_GEOMETRY_STORAGE_KEY = 'monopoly.board-geometry';
const BOARD_GEOMETRY_FILE_NAME = 'board-geometry.json';
const BOARD_GEOMETRY_ARTIFACT_PATH = 'src/app/services/board-geometry.json';
const BOARD_GEOMETRY_MIN_SIZE_PCT = 2;

const PLAYER_CHIP_COLORS = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#ff9500'] as const;

@Component({
  selector: 'app-game-page',
  imports: [CommonModule, RouterLink, BoardEventDialogComponent, MatSnackBarModule],
  templateUrl: './game.page.html',
  styleUrl: './game.page.scss'
})
export class GamePage implements OnDestroy {
  connected = signal(false);
  error = signal<string | null>(null);
  specialCard = signal<SpecialCardVm | null>(null);
  specialCardActionPending = signal(false);
  markerCalibrationMode = signal(false);
  selectedMarkerTileIndex = signal(1);
  geometryDebugLog = signal<string[]>([]);
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
  boardGeometry = signal<TileGeometryMap>(this.loadBoardGeometry());
  boardGeometryFileName = BOARD_GEOMETRY_FILE_NAME;
  boardGeometryArtifactPath = BOARD_GEOMETRY_ARTIFACT_PATH;

  private readonly boardSurface = viewChild<ElementRef<HTMLDivElement>>('boardSurface');
  private readonly snackBar = inject(MatSnackBar);
  private activeGeometryInteraction: GeometryInteractionState | null = null;
  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    this.updateGeometryInteraction(event);
  };
  private readonly onWindowPointerUp = (): void => {
    this.stopGeometryInteraction();
  };
  private audioContext: AudioContext | null = null;

  constructor(
    public readonly auth: AuthService,
    public readonly i18n: I18nService,
    private readonly game: GameService,
    private readonly ws: WsService
  ) {
    if (this.auth.isAuthenticated()) {
      void this.refreshState();
    }
  }

  ngOnDestroy(): void {
    this.stopGeometryInteraction();
  }

  async refreshState(): Promise<void> {
    this.error.set(null);
    if (!this.auth.isAuthenticated()) {
      this.error.set(this.i18n.t('login_first'));
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
      if (this.wsStatus() === 'disconnected') {
        this.connect();
      }
    } catch {
      this.error.set(this.i18n.t('failed_to_load_game_state'));
    }
  }

  connect(): void {
    if (this.wsStatus() === 'connecting' || this.wsStatus() === 'connected') {
      return;
    }

    this.ensureAudioContext();
    this.error.set(null);
    const token = this.auth.accessToken();
    if (!token) {
      this.error.set(this.i18n.t('login_first'));
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
        if (st === 'error') this.error.set(this.i18n.t('websocket_error'));
        if (st === 'close') this.error.set(this.i18n.t('websocket_closed'));
      }
    );
  }

  roll(): void {
    this.ensureAudioContext();
    this.ws.send({ type: 'roll_dice' });
  }

  rotateBoard(): void {
    this.boardRotation.update((value) => (value + 90) % 360);
  }

  claimFirstTurn(): void {
    this.ensureAudioContext();
    this.ws.send({ type: 'claim_first_turn' });
  }

  resetGame(): void {
    this.ensureAudioContext();
    this.ws.send({ type: 'reset_game' });
  }

  buy(): void {
    this.ensureAudioContext();
    this.ws.send({ type: 'buy_property' });
  }

  toggleMarkerCalibration(): void {
    const next = !this.markerCalibrationMode();
    this.markerCalibrationMode.set(next);
    if (next) {
      this.boardRotation.set(0);
      this.ensureSelectedTile();
      this.pushGeometryLog('Calibration mode enabled');
      return;
    }

    this.stopGeometryInteraction();
    this.pushGeometryLog('Calibration mode disabled');
  }

  selectMarkerTile(tileIndex: number | string): void {
    const normalized = normalizeTileIndex(typeof tileIndex === 'string' ? Number(tileIndex) : tileIndex);
    this.selectedMarkerTileIndex.set(normalized);
    this.pushGeometryLog(`Selected tile ${normalized} (${this.tileName(normalized)})`);
  }

  editableTileIndices(): number[] {
    return Array.from({ length: 40 }, (_, tileIndex) => tileIndex);
  }

  tileGeometry(tileIndex: number): TileGeometry {
    return getTileGeometry(tileIndex, this.boardGeometry());
  }

  selectedTileGeometry(): TileGeometry {
    return this.tileGeometry(this.selectedMarkerTileIndex());
  }

  resetSelectedTileGeometry(): void {
    const tileIndex = this.selectedMarkerTileIndex();
    this.updateTileGeometry(tileIndex, getTileGeometry(tileIndex, DEFAULT_BOARD_GEOMETRY));
    this.pushGeometryLog(`Reset tile ${tileIndex} geometry`);
  }

  resetAllTileGeometry(): void {
    this.boardGeometry.set(cloneGeometryMap(DEFAULT_BOARD_GEOMETRY));
    this.persistBoardGeometry(this.boardGeometry());
    this.pushGeometryLog('Reset all tile geometry to defaults');
  }

  logBoardGeometrySnapshot(): void {
    const snapshot = createBoardGeometryJson(this.boardGeometry());
    console.log(snapshot);
    this.pushGeometryLog('Logged board geometry JSON snapshot to console');
  }

  downloadBoardGeometrySnapshot(): void {
    const snapshot = createBoardGeometryJson(this.boardGeometry());
    this.downloadTextFile(this.boardGeometryFileName, snapshot, 'application/json');
    this.pushGeometryLog(`Downloaded ${this.boardGeometryFileName} for ${this.boardGeometryArtifactPath}`);
  }

  finishCalibration(): void {
    this.persistBoardGeometry(this.boardGeometry());
    this.downloadBoardGeometrySnapshot();
    this.markerCalibrationMode.set(false);
    this.stopGeometryInteraction();
    this.pushGeometryLog(`Calibration finished; replace ${this.boardGeometryArtifactPath} with the downloaded JSON artifact`);
  }

  tileName(tileIndex: number): string {
    return getTileDefinition(tileIndex).name;
  }

  startGeometryInteraction(event: PointerEvent, tileIndex: number, mode: GeometryInteractionMode): void {
    if (!this.markerCalibrationMode()) {
      return;
    }

    const boardElement = this.boardSurface()?.nativeElement;
    if (!boardElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.selectMarkerTile(tileIndex);

    const geometry = this.tileGeometry(tileIndex);
    this.activeGeometryInteraction = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startGeometry: { ...geometry },
      tileIndex
    };

    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp, { once: true });
  }

  endTurn(): void {
    this.ensureAudioContext();
    this.ws.send({ type: 'end_turn' });
  }

  private onEvent(ev: GameWsEvent): void {
    if (ev.type === 'dice_rolled') {
      this.dice1.set(ev.d1);
      this.dice2.set(ev.d2);
      this.hasGameStarted.set(true);
      const playerName = this.playerNameForSeat(ev.seat_index);
      this.recordActivity({ type: 'dice_rolled', playerName, d1: ev.d1, d2: ev.d2 });
    }

    if (ev.type === 'turn_changed') {
      this.turnSeat.set(ev.turn_seat_index);
      const playerName = this.playerNameForSeat(ev.turn_seat_index);
      if (this.yourSeat() !== null && ev.turn_seat_index === this.yourSeat()) {
        this.playTurnSound();
      }
      this.recordActivity({ type: 'turn_changed', playerName, hasStarted: this.hasGameStarted() });
    }

    if (ev.type === 'state_snapshot') {
      this.turnSeat.set(ev.game.turn_seat_index ?? 0);
      this.hasGameStarted.set(!!ev.game.last_roll_at);
      this.players.set(ev.players ?? []);
      this.properties.set(ev.properties ?? []);
      this.recordActivity({ type: 'connected' });
    }

    if (ev.type === 'players_updated') {
      const nextPlayers = ev.players ?? [];
      if (this.isResetState(nextPlayers)) {
        this.dice1.set(null);
        this.dice2.set(null);
        this.hasGameStarted.set(false);
        this.recordActivity({ type: 'game_reset' });
      }
      const yourSeat = this.yourSeat();
      const nextYou = yourSeat === null ? null : nextPlayers.find((player) => player.seat_index === yourSeat) ?? null;
      if (this.specialCardActionPending() && nextYou && !nextYou.pending_event_kind) {
        this.specialCardActionPending.set(false);
        this.specialCard.set(null);
      }
      const currentSpecialCard = this.specialCard();
      if (currentSpecialCard) {
        const owner = nextPlayers.find((player) => player.seat_index === currentSpecialCard.ownerSeatIndex) ?? null;
        if (!owner?.pending_event_kind) {
          this.specialCardActionPending.set(false);
          this.specialCard.set(null);
        }
      }
      this.recordActivities(this.capturePlayerChanges(this.players(), ev.players ?? []));
      this.players.set(nextPlayers);
    }

    if (ev.type === 'properties_updated') {
      this.recordActivities(this.capturePropertyChanges(this.properties(), ev.properties ?? []));
      this.properties.set(ev.properties ?? []);
    }

    if (ev.type === 'special_card_drawn') {
      this.specialCard.set({
        action: ev.action,
        actionButtonLabel: ev.actionButtonLabel,
        cardId: ev.cardId,
        cardKind: ev.cardKind,
        instruction: ev.instruction,
        ownerSeatIndex: ev.owner_seat_index ?? null,
        readonly: ev.owner_seat_index !== undefined && ev.owner_seat_index !== this.yourSeat(),
        tileIndex: ev.tileIndex,
        title: ev.title,
      });
      this.specialCardActionPending.set(false);
      this.recordActivity({ type: 'special_card', title: ev.title, instruction: ev.instruction });
    }

    if (ev.type === 'error') {
      this.specialCardActionPending.set(false);
      this.error.set(ev.message);
    }
  }

  tilePoint(tileIndex: number): { leftPct: number; topPct: number } {
    return getTilePoint(tileIndex ?? 0, this.boardGeometry());
  }

  playerTokenPoint(tileIndex: number): { leftPct: number; topPct: number } {
    return this.tilePoint(tileIndex);
  }

  boardTransform(): string {
    if (this.markerCalibrationMode()) {
      return 'rotate(0deg)';
    }

    return `rotate(${this.boardRotation()}deg)`;
  }

  closeSpecialCard(): void {
    if (this.specialCard()?.readonly) {
      return;
    }

    const me = this.yourPlayer();
    if (me?.pending_event_kind) {
      return;
    }

    this.specialCard.set(null);
    this.specialCardActionPending.set(false);
  }

  seatColor(seatIndex: number): string {
    return PLAYER_CHIP_COLORS[((seatIndex ?? 0) % PLAYER_CHIP_COLORS.length + PLAYER_CHIP_COLORS.length) % PLAYER_CHIP_COLORS.length];
  }

  playerChipLabel(player: { username?: string | null; seat_index?: number | null }): string {
    const normalized = (player.username ?? '')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(Boolean);

    if (normalized.length >= 2) {
      return `${normalized[0][0] ?? ''}${normalized[1][0] ?? ''}`.toUpperCase();
    }

    if (normalized.length === 1) {
      return normalized[0].slice(0, 2).toUpperCase();
    }

    return `S${player.seat_index ?? 0}`.slice(0, 2).toUpperCase();
  }

  playerChipTitle(player: { username?: string | null; seat_index: number; position_index: number }): string {
    const displayName = player.username?.trim() || `${this.i18n.t('seat')} ${player.seat_index}`;
    return `${displayName} (${this.i18n.t('seat')} ${player.seat_index}, ${this.i18n.t('tile')} ${player.position_index})`;
  }

  currentPlayerColor(): string {
    const seat = this.yourSeat();
    return this.seatColor(seat ?? 0);
  }

  topStatusBackground(): string {
    const color = this.currentPlayerColor();
    return `linear-gradient(180deg, rgba(255,255,255,0.985), color-mix(in srgb, ${color} 5%, rgba(241, 236, 228, 0.96)))`;
  }

  topStatusBorderColor(): string {
    const color = this.currentPlayerColor();
    return `color-mix(in srgb, ${color} 16%, rgba(94, 115, 140, 0.28))`;
  }

  statusConnectionPillBackground(): string {
    if (this.wsStatus() === 'connected') {
      return 'rgba(191, 231, 201, 0.86)';
    }

    if (this.wsStatus() === 'disconnected') {
      return 'rgba(248, 212, 208, 0.88)';
    }

    return 'rgba(255,255,255,0.62)';
  }

  statusConnectionPillColor(): string {
    if (this.wsStatus() === 'connected') {
      return '#166344';
    }

    if (this.wsStatus() === 'disconnected') {
      return '#8a2f28';
    }

    return '#5f5448';
  }

  topStatusActivity(): string[] {
    return this.actionLog().slice(0, 3);
  }

  topActivityTransform(index: number): string {
    const scale = 1 - index * 0.08;
    const translateY = index * 2;
    const rotateX = index * 16;
    return `perspective(220px) rotateX(${rotateX}deg) translateY(${translateY}px) scale(${scale})`;
  }

  topActivityOpacity(index: number): number {
    return Math.max(0.38, 1 - index * 0.22);
  }

  currentTileName(tileIndex: number | null | undefined): string {
    if (tileIndex === null || tileIndex === undefined) {
      return `${this.i18n.t('tile')} —`;
    }

    return getTileDefinition(tileIndex).name;
  }

  tokenShadow(color: string, own = false): string {
    const ring = own ? 'rgba(255, 214, 10, 0.42)' : 'rgba(255, 255, 255, 0.24)';
    const glow = own ? `color-mix(in srgb, ${color} 72%, #ffd60a)` : color;
    return [
      `0 0 0 ${own ? 4 : 3}px ${ring}`,
      `0 0 18px color-mix(in srgb, ${glow} 54%, white)`,
      `0 0 ${own ? 36 : 28}px color-mix(in srgb, ${glow} 28%, transparent)`,
      '0 10px 20px rgba(0,0,0,0.34)',
      'inset 0 1px 0 rgba(255,255,255,0.45)'
    ].join(', ');
  }

  tokenFilter(color: string, own = false): string {
    const glow = own ? `color-mix(in srgb, ${color} 72%, #ffd60a)` : color;
    return `drop-shadow(0 0 ${own ? 12 : 10}px color-mix(in srgb, ${glow} 42%, white))`;
  }

  specialCardActionLabel(card: SpecialCardPayload): string {
    return boardEventActionLabel(card);
  }

  specialCardActionButtonLabel(card: SpecialCardPayload): string {
    const label = boardEventActionButtonLabel(card)?.trim();
    if (!label) {
      return this.i18n.t('take_action');
    }

    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel === 'take an action') {
      return this.i18n.t('take_action');
    }

    if (normalizedLabel === 'cancel') {
      return this.i18n.t('cancel');
    }

    if (normalizedLabel === 'pay tax') {
      return this.i18n.t('pay_tax');
    }

    return label;
  }

  specialCardKicker(card: SpecialCardPayload): string {
    return boardEventKicker(card.cardKind);
  }

  takeSpecialCardAction(): void {
    const card = this.specialCard();
    if (!card || card.readonly || this.specialCardActionPending()) {
      return;
    }

    this.ensureAudioContext();
    this.specialCardActionPending.set(true);
    this.ws.send({ type: 'resolve_board_event', tileIndex: card.tileIndex });
  }

  isSpecialOwnedCard(kind: TileKind): boolean {
    return kind === 'railroad' || kind === 'utility' || kind === 'special_property';
  }

  yourPlayer(): any | null {
    const seat = this.yourSeat();
    if (seat === null) return null;
    return this.players().find((p) => p.seat_index === seat) ?? null;
  }

  turnPlayerName(): string | null {
    const seat = this.turnSeat();
    return this.visiblePlayers().find((p) => p.seat_index === seat)?.username ?? this.players().find((p) => p.seat_index === seat)?.username ?? null;
  }

  isOwnSeat(seat: number | null | undefined): boolean {
    const yourSeat = this.yourSeat();
    return seat !== null && seat !== undefined && yourSeat !== null && seat === yourSeat;
  }

  isYourTurn(): boolean {
    const yourSeat = this.yourSeat();
    return yourSeat !== null && this.turnSeat() === yourSeat;
  }

  turnStatusText(): string {
    return this.isYourTurn() ? this.i18n.t('your_turn') : this.i18n.t('other_users_turn');
  }

  turnStatusOwnerLabel(): string {
    const seat = this.turnSeat();
    const playerName = this.turnPlayerName();
    if (seat === null || seat === undefined) {
      return this.i18n.t('waiting_for_players');
    }

    return playerName ? `${playerName} (${this.i18n.t('seat')} ${seat})` : `${this.i18n.t('seat')} ${seat}`;
  }

  turnStatusOwnerTitle(): string {
    return this.isYourTurn() ? 'It is currently your turn' : `It is currently ${this.turnStatusOwnerLabel()}'s turn`;
  }

  statusConnectionLabel(): string {
    return this.wsStatus() === 'connected'
      ? this.i18n.t('connection_connected')
      : this.wsStatus() === 'connecting'
        ? this.i18n.t('connection_connecting')
        : this.i18n.t('connection_disconnected');
  }

  statusDiceLabel(): string {
    return `${this.dice1() ?? '-'}:${this.dice2() ?? '-'}`;
  }

  statusTileLabel(tileIndex: number | null | undefined): string {
    return this.currentTileName(tileIndex);
  }

  private playerNameForSeat(seat: number): string {
    const player = this.players().find((p) => p.seat_index === seat);
    return player?.username ? `${player.username} (${this.i18n.t('seat')} ${seat})` : `${this.i18n.t('seat')} ${seat}`;
  }

  private recordActivity(event: ActivityEvent): void {
    this.recordActivities([event]);
  }

  private recordActivities(events: ActivityEvent[]): void {
    if (!events.length) {
      return;
    }

    const messages = events.map((event) => this.activityMessage(event)).filter(Boolean);
    if (!messages.length) {
      return;
    }

    this.actionLog.set([...messages.reverse(), ...this.actionLog()].slice(0, 8));
    this.showSnackbars(events);
  }

  private showSnackbars(events: ActivityEvent[]): void {
    for (const event of events) {
      const snackbar = this.snackbarForEvent(event);
      if (!snackbar) {
        continue;
      }

      this.snackBar.open(snackbar.message, undefined, {
        duration: 2400,
        panelClass: ['game-snackbar'],
        horizontalPosition: 'end',
        verticalPosition: 'bottom'
      });
    }
  }

  private snackbarForEvent(event: ActivityEvent): { message: string } | null {
    if (event.type === 'player_received' && this.isOwnSeat(event.seatIndex)) {
      return { message: `+${event.amount}` };
    }

    if (event.type === 'player_paid' && this.isOwnSeat(event.seatIndex)) {
      return { message: `-${event.amount}` };
    }

    if (event.type === 'property_bought' && this.isOwnSeat(event.ownerSeat)) {
      return { message: `${this.i18n.t('bought_prefix')} ${event.tileName}` };
    }

    return null;
  }

  private activityMessage(event: ActivityEvent): string {
    if (event.type === 'connected') {
      return this.i18n.t('connected_to_game_room');
    }

    if (event.type === 'game_reset') {
      return 'Game reset';
    }

    if (event.type === 'dice_rolled') {
      return `${event.playerName} rolled ${event.d1} + ${event.d2} = ${event.d1 + event.d2}`;
    }

    if (event.type === 'turn_changed') {
      return event.hasStarted ? `Turn changed to ${event.playerName}` : `${event.playerName} will go first`;
    }

    if (event.type === 'special_card') {
      return `${event.title}: ${event.instruction}`;
    }

    if (event.type === 'player_joined') {
      return `${event.playerName} ${this.i18n.t('joined_game_suffix')}`;
    }

    if (event.type === 'player_moved') {
      return `${event.playerName} ${this.i18n.t('moved_to_prefix')} ${event.tileName}`;
    }

    if (event.type === 'player_received') {
      return `${event.playerName} ${this.i18n.t('received_prefix')} ${event.amount}`;
    }

    if (event.type === 'player_paid') {
      return `${event.playerName} ${this.i18n.t('paid_prefix')} ${event.amount}`;
    }

    if (event.type === 'rent_paid') {
      return `${event.payerName} ${this.i18n.t('paid_prefix')} ${event.amount} ${event.tileName} (${event.ownerName})`;
    }

    if (event.type === 'property_bought') {
      return `${this.playerNameForSeat(event.ownerSeat)} ${this.i18n.t('bought_prefix')} ${event.tileName}`;
    }

    return '';
  }

  private capturePlayerChanges(previousPlayers: any[], nextPlayers: any[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];
    const previousBySeat = new Map(previousPlayers.map((player) => [player.seat_index, player]));
    const nextBySeat = new Map(nextPlayers.map((player) => [player.seat_index, player]));
    const moneyDeltas = new Map<number, number>();

    for (const nextPlayer of nextPlayers) {
      const previousPlayer = previousBySeat.get(nextPlayer.seat_index);
      if (!previousPlayer) {
        events.push({
          type: 'player_joined',
          playerName: this.playerNameForState(nextPlayer),
          seatIndex: nextPlayer.seat_index
        });
        continue;
      }

      if (previousPlayer.position_index !== nextPlayer.position_index) {
        const tile = getTileDefinition(nextPlayer.position_index);
        events.push({
          type: 'player_moved',
          playerName: this.playerNameForState(nextPlayer),
          seatIndex: nextPlayer.seat_index,
          tileIndex: nextPlayer.position_index,
          tileName: tile.name
        });
      }

      const moneyDelta = (nextPlayer.money ?? 0) - (previousPlayer.money ?? 0);
      if (moneyDelta !== 0) {
        moneyDeltas.set(nextPlayer.seat_index, moneyDelta);
        if (this.isOwnSeat(nextPlayer.seat_index)) {
          this.playMoneySound(moneyDelta > 0 ? 'gain' : 'loss');
        }
      }
    }

    for (const nextPlayer of nextPlayers) {
      const previousPlayer = previousBySeat.get(nextPlayer.seat_index);
      if (!previousPlayer || previousPlayer.position_index === nextPlayer.position_index) {
        continue;
      }

      const landedTileIndex = nextPlayer.position_index;
      const landedProperty = this.properties().find((property) => property.tile_index === landedTileIndex) ?? null;
      const ownerSeat = landedProperty?.owner_seat_index;
      const payerDelta = moneyDeltas.get(nextPlayer.seat_index) ?? 0;
      if (
        ownerSeat === null ||
        ownerSeat === undefined ||
        ownerSeat === nextPlayer.seat_index ||
        payerDelta >= 0
      ) {
        continue;
      }

      const ownerDelta = moneyDeltas.get(ownerSeat) ?? 0;
      const transferAmount = Math.min(Math.abs(payerDelta), Math.max(0, ownerDelta));
      if (transferAmount <= 0) {
        continue;
      }

      events.push({
        type: 'rent_paid',
        amount: transferAmount,
        ownerName: this.playerNameForState(nextBySeat.get(ownerSeat) ?? previousBySeat.get(ownerSeat) ?? { seat_index: ownerSeat }),
        ownerSeat,
        payerName: this.playerNameForState(nextPlayer),
        payerSeat: nextPlayer.seat_index,
        tileIndex: landedTileIndex,
        tileName: getTileDefinition(landedTileIndex).name
      });
      moneyDeltas.delete(nextPlayer.seat_index);
      moneyDeltas.set(ownerSeat, ownerDelta - transferAmount);
    }

    for (const nextPlayer of nextPlayers) {
      const moneyDelta = moneyDeltas.get(nextPlayer.seat_index) ?? 0;
      if (moneyDelta > 0) {
        events.push({
          type: 'player_received',
          amount: moneyDelta,
          playerName: this.playerNameForState(nextPlayer),
          seatIndex: nextPlayer.seat_index
        });
      } else if (moneyDelta < 0) {
        events.push({
          type: 'player_paid',
          amount: Math.abs(moneyDelta),
          playerName: this.playerNameForState(nextPlayer),
          seatIndex: nextPlayer.seat_index
        });
      }
    }

    return events;
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    return this.audioContext;
  }

  private playMoneySound(kind: 'gain' | 'loss'): void {
    const context = this.ensureAudioContext();
    if (!context) {
      return;
    }

    const now = context.currentTime + 0.01;
    const notes = kind === 'gain' ? [523.25, 659.25] : [349.23, 293.66];
    notes.forEach((frequency, index) => {
      this.scheduleTone(context, now + index * 0.08, frequency, 0.12, kind === 'gain' ? 'sine' : 'triangle', 0.035);
    });
  }

  private playTurnSound(): void {
    const context = this.ensureAudioContext();
    if (!context) {
      return;
    }

    const now = context.currentTime + 0.01;
    [392, 523.25, 659.25].forEach((frequency, index) => {
      this.scheduleTone(context, now + index * 0.07, frequency, 0.13, 'sine', 0.04);
    });
  }

  private scheduleTone(
    context: AudioContext,
    startTime: number,
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  private capturePropertyChanges(previousProperties: any[], nextProperties: any[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];
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
        const tile = getTileDefinition(nextProperty.tile_index);
        events.push({
          type: 'property_bought',
          ownerSeat: nextProperty.owner_seat_index,
          tileIndex: nextProperty.tile_index,
          tileName: tile.name
        });
      }
    }

    return events;
  }

  private playerNameForState(player: { username?: string | null; seat_index: number }): string {
    return player.username ? `${player.username} (${this.i18n.t('seat')} ${player.seat_index})` : `${this.i18n.t('seat')} ${player.seat_index}`;
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

  ownedPropertyMarkers(): PropertyOwnerMarkerVm[] {
    return this.properties()
      .filter((property) => property.owner_seat_index !== null && property.owner_seat_index !== undefined)
      .map((property) => {
        const ownerSeat = property.owner_seat_index as number;
        const tile = getTileDefinition(property.tile_index);
        const position = this.ownerPropertyMarkerPoint(property.tile_index);
        return {
          tileIndex: property.tile_index,
          ownerSeat,
          leftPct: position.leftPct,
          topPct: position.topPct,
          color: this.seatColor(ownerSeat),
          title: `${this.playerNameForSeat(ownerSeat)} ${this.i18n.t('owns_suffix')} ${tile.name}`
        };
      });
  }

  visiblePlayers(): any[] {
    return [...this.players()].sort((a, b) => a.seat_index - b.seat_index);
  }

  opponentCardGroups(): OpponentCardGroupVm[] {
    const groups = new Map<number, PropertyCardVm[]>();

    for (const card of this.opponentCards()) {
      const current = groups.get(card.ownerSeat) ?? [];
      current.push(card);
      groups.set(card.ownerSeat, current);
    }

    const opponents = this.visiblePlayers()
      .filter((player) => this.yourSeat() === null || player.seat_index !== this.yourSeat())
      .sort((a, b) => a.seat_index - b.seat_index);

    return opponents.map((player) => {
      const cards = (groups.get(player.seat_index) ?? []).sort(
        (a, b) => cardSortRank(a.kind) - cardSortRank(b.kind) || a.tileIndex - b.tileIndex
      );
      return {
        ownerSeat: player.seat_index,
        title: `${player.username ?? `${this.i18n.t('seat')} ${player.seat_index}`} ${this.i18n.t('cards_suffix')}`,
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
        const tile = getTileDefinition(property.tile_index);
        const bandColor = this.isSpecialOwnedCard(tile.kind) ? null : this.propertyBandColor(property.tile_index, ownerSeat);
        return {
          frameColor: this.propertyFrameColor(property.tile_index, tile.kind),
          headerLabel: this.propertyHeaderLabel(tile.kind),
          tileIndex: property.tile_index,
          title: tile.name,
          kind: tile.kind,
          kindLabel: tileKindLabel(tile.kind),
          ownerSeat,
          ownerName: owner?.username ? `${owner.username} (${this.i18n.t('seat')} ${ownerSeat})` : `${this.i18n.t('seat')} ${ownerSeat}`,
          price: property.purchase_price,
          rent: property.base_rent,
          bandColor,
          rentLabel: this.propertyRentLabel(tile.kind),
        };
      })
      .sort((a, b) => cardSortRank(a.kind) - cardSortRank(b.kind) || a.tileIndex - b.tileIndex);
  }

  private buildCardSlots(cards: PropertyCardVm[], minimumSlots = 15): Array<PropertyCardVm | null> {
    const slotCount = Math.max(minimumSlots, cards.length);
    return Array.from({ length: slotCount }, (_, index) => cards[index] ?? null);
  }

  private ownerPropertyMarkerPoint(tileIndex: number): { leftPct: number; topPct: number } {
    const geometry = this.tileGeometry(tileIndex);
    const centerLeftPct = geometry.leftPct + geometry.widthPct / 2;
    const centerTopPct = geometry.topPct + geometry.heightPct / 2;
    const fromBoardCenterX = centerLeftPct - 50;
    const fromBoardCenterY = centerTopPct - 50;
    const outerPaddingPct = Math.max(0.9, Math.min(Math.min(geometry.widthPct, geometry.heightPct) * 0.18, 1.5));

    if (Math.abs(fromBoardCenterX) > Math.abs(fromBoardCenterY)) {
      return {
        leftPct: fromBoardCenterX >= 0 ? geometry.leftPct + geometry.widthPct - outerPaddingPct : geometry.leftPct + outerPaddingPct,
        topPct: centerTopPct
      };
    }

    return {
      leftPct: centerLeftPct,
      topPct: fromBoardCenterY >= 0 ? geometry.topPct + geometry.heightPct - outerPaddingPct : geometry.topPct + outerPaddingPct
    };
  }

  private ensureSelectedTile(): void {
    const tileIndex = this.selectedMarkerTileIndex();
    if (!this.editableTileIndices().includes(tileIndex)) {
      this.selectedMarkerTileIndex.set(0);
    }
  }

  private updateGeometryInteraction(event: PointerEvent): void {
    if (!this.activeGeometryInteraction) {
      return;
    }

    const boardElement = this.boardSurface()?.nativeElement;
    if (!boardElement) {
      return;
    }

    const rect = boardElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const deltaXPct = ((event.clientX - this.activeGeometryInteraction.startClientX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - this.activeGeometryInteraction.startClientY) / rect.height) * 100;
    const nextGeometry = this.applyGeometryDelta(this.activeGeometryInteraction.startGeometry, deltaXPct, deltaYPct, this.activeGeometryInteraction.mode);
    this.updateTileGeometry(this.activeGeometryInteraction.tileIndex, nextGeometry);
  }

  private stopGeometryInteraction(): void {
    this.activeGeometryInteraction = null;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
  }

  private applyGeometryDelta(geometry: TileGeometry, deltaXPct: number, deltaYPct: number, mode: GeometryInteractionMode): TileGeometry {
    if (mode === 'move') {
      return clampTileGeometry({
        leftPct: geometry.leftPct + deltaXPct,
        topPct: geometry.topPct + deltaYPct,
        widthPct: geometry.widthPct,
        heightPct: geometry.heightPct
      });
    }

    if (mode === 'resize-se') {
      return this.resizeGeometry(geometry, 0, 0, deltaXPct, deltaYPct);
    }

    if (mode === 'resize-sw') {
      return this.resizeGeometry(geometry, deltaXPct, 0, -deltaXPct, deltaYPct);
    }

    if (mode === 'resize-ne') {
      return this.resizeGeometry(geometry, 0, deltaYPct, deltaXPct, -deltaYPct);
    }

    return this.resizeGeometry(geometry, deltaXPct, deltaYPct, -deltaXPct, -deltaYPct);
  }

  private resizeGeometry(geometry: TileGeometry, deltaLeftPct: number, deltaTopPct: number, deltaWidthPct: number, deltaHeightPct: number): TileGeometry {
    const next = clampTileGeometry({
      leftPct: geometry.leftPct + deltaLeftPct,
      topPct: geometry.topPct + deltaTopPct,
      widthPct: geometry.widthPct + deltaWidthPct,
      heightPct: geometry.heightPct + deltaHeightPct
    });

    return {
      leftPct: next.leftPct,
      topPct: next.topPct,
      widthPct: Math.max(BOARD_GEOMETRY_MIN_SIZE_PCT, next.widthPct),
      heightPct: Math.max(BOARD_GEOMETRY_MIN_SIZE_PCT, next.heightPct)
    };
  }

  private updateTileGeometry(tileIndex: number, geometry: TileGeometry): void {
    const normalized = normalizeTileIndex(tileIndex);
    const nextGeometry = clampTileGeometry(geometry);
    this.boardGeometry.update((current) => {
      const next = { ...current, [normalized]: nextGeometry };
      this.persistBoardGeometry(next);
      return next;
    });
  }

  private loadBoardGeometry(): TileGeometryMap {
    if (typeof localStorage === 'undefined') {
      return cloneGeometryMap(DEFAULT_BOARD_GEOMETRY);
    }

    try {
      const raw = localStorage.getItem(BOARD_GEOMETRY_STORAGE_KEY);
      if (!raw) {
        return cloneGeometryMap(DEFAULT_BOARD_GEOMETRY);
      }

      const parsed = JSON.parse(raw) as Record<string, TileGeometry>;
      const next = cloneGeometryMap(DEFAULT_BOARD_GEOMETRY);
      for (const [key, geometry] of Object.entries(parsed)) {
        next[normalizeTileIndex(Number(key))] = clampTileGeometry(geometry);
      }
      return next;
    } catch {
      return cloneGeometryMap(DEFAULT_BOARD_GEOMETRY);
    }
  }

  private persistBoardGeometry(geometryMap: TileGeometryMap): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(BOARD_GEOMETRY_STORAGE_KEY, createBoardGeometryJson(geometryMap));
  }

  private pushGeometryLog(message: string): void {
    const next = [`${new Date().toLocaleTimeString()}: ${message}`, ...this.geometryDebugLog()];
    this.geometryDebugLog.set(next.slice(0, 10));
  }

  private downloadTextFile(fileName: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
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

    return rows * 124 + Math.max(0, rows - 1) * rowGap + verticalPadding + headingAndGap;
  }

  private propertyBandColor(tileIndex: number, ownerSeat: number): string {
    const normalizedTileIndex = ((tileIndex ?? ownerSeat ?? 0) % 40 + 40) % 40;

    if ([1, 3].includes(normalizedTileIndex)) return '#8b4a24';
    if ([6, 8, 9].includes(normalizedTileIndex)) return '#d9edf8';
    if ([11, 13, 14].includes(normalizedTileIndex)) return '#c93a8c';
    if ([16, 18, 19].includes(normalizedTileIndex)) return '#f39a2b';
    if ([21, 23, 24].includes(normalizedTileIndex)) return '#ea4335';
    if ([26, 27, 29].includes(normalizedTileIndex)) return '#f0d54a';
    if ([31, 32, 34].includes(normalizedTileIndex)) return '#31a24c';
    if ([37, 39].includes(normalizedTileIndex)) return '#2d73da';
    return 'rgba(0,0,0,0.08)';
  }

  private propertyHeaderLabel(kind: TileKind): string {
    if (kind === 'railroad') return 'Железная дорога';
    if (kind === 'utility') return 'Коммунальное предприятие';
    if (kind === 'special_property') return 'Особый актив';
    return 'Собственность';
  }

  private propertyRentLabel(kind: TileKind): string {
    if (kind === 'railroad' || kind === 'utility' || kind === 'special_property') {
      return 'Рента';
    }

    return 'Базовая рента';
  }

  private propertyFrameColor(tileIndex: number, kind: TileKind): string {
    if (kind === 'railroad' || kind === 'utility' || kind === 'special_property') {
      return '#2c241b';
    }

    return this.propertyBandColor(tileIndex, tileIndex);
  }
}

type PropertyCardVm = {
  frameColor: string;
  headerLabel: string;
  kind: TileKind;
  kindLabel: string | null;
  tileIndex: number;
  title: string;
  ownerSeat: number;
  ownerName: string;
  price: number | null;
  rent: number | null;
  bandColor: string | null;
  rentLabel: string;
};

type OpponentCardGroupVm = {
  ownerSeat: number;
  slots: Array<PropertyCardVm | null>;
  title: string;
};

type SpecialCardVm = SpecialCardPayload & {
  ownerSeatIndex: number | null;
  readonly: boolean;
};

type ActivityEvent =
  | { type: 'connected' }
  | { type: 'game_reset' }
  | { type: 'dice_rolled'; playerName: string; d1: number; d2: number }
  | { type: 'turn_changed'; playerName: string; hasStarted: boolean }
  | { type: 'special_card'; title: string; instruction: string }
  | { type: 'player_joined'; playerName: string; seatIndex: number }
  | { type: 'player_moved'; playerName: string; seatIndex: number; tileIndex: number; tileName: string }
  | { type: 'player_received'; playerName: string; seatIndex: number; amount: number }
  | { type: 'player_paid'; playerName: string; seatIndex: number; amount: number }
  | { type: 'rent_paid'; payerName: string; payerSeat: number; ownerName: string; ownerSeat: number; amount: number; tileIndex: number; tileName: string }
  | { type: 'property_bought'; ownerSeat: number; tileIndex: number; tileName: string };

type GeometryInteractionMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';

type GeometryInteractionState = {
  mode: GeometryInteractionMode;
  startClientX: number;
  startClientY: number;
  startGeometry: TileGeometry;
  tileIndex: number;
};

type PropertyOwnerMarkerVm = {
  tileIndex: number;
  ownerSeat: number;
  leftPct: number;
  topPct: number;
  color: string;
  title: string;
};
