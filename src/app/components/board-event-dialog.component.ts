import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-board-event-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="board-event-backdrop" *ngIf="open()" (click)="closed.emit()">
      <div
        class="board-event-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <div class="board-event-kicker" *ngIf="kicker()">{{ kicker() }}</div>
        <h2>{{ title() }}</h2>
        <p>{{ instruction() }}</p>
        <div class="board-event-action" *ngIf="actionLabel()">{{ actionLabel() }}</div>
        <div class="board-event-actions">
          <button type="button" (click)="actionTaken.emit()" [disabled]="actionPending()">
            {{ actionPending() ? i18n.t('applying') : actionButtonLabel() }}
          </button>
          <button type="button" (click)="closed.emit()">{{ i18n.t('cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .board-event-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(31, 27, 36, 0.28);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 30;
      }

      .board-event-dialog {
        width: min(440px, calc(100vw - 32px));
        border: 1px solid rgba(108, 124, 145, 0.42);
        border-radius: 16px;
        padding: 22px;
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(243, 239, 233, 0.96));
        box-shadow: 0 18px 42px rgba(36, 44, 55, 0.18), inset 0 0 0 1px rgba(255,255,255,0.45);
        display: grid;
        gap: 14px;
      }

      .board-event-dialog h2 {
        margin: 0;
        font-size: 25px;
        line-height: 1.2;
        color: #1f1b24;
      }

      .board-event-dialog p {
        margin: 0;
        color: #4d5a6a;
        line-height: 1.5;
      }

      .board-event-kicker {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #4b2da1;
      }

      .board-event-action {
        font-size: 13px;
        color: #4d5a6a;
        background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(247, 242, 230, 0.9));
        border: 1px solid rgba(94, 115, 140, 0.22);
        border-radius: 12px;
        padding: 10px 12px;
      }

      .board-event-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
      }

      .board-event-actions button {
        border: 1px solid rgba(94, 115, 140, 0.3);
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241, 236, 228, 0.96));
        color: #1f1b24;
        box-shadow: 0 4px 10px rgba(36, 44, 55, 0.08);
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }

      .board-event-actions button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(36, 44, 55, 0.12);
        border-color: rgba(76, 94, 116, 0.42);
      }

      .board-event-actions button:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
      }

      .board-event-actions button:first-child {
        border-color: rgba(75, 45, 161, 0.32);
        background: linear-gradient(180deg, rgba(90, 54, 180, 0.16), rgba(90, 54, 180, 0.08));
        color: #4b2da1;
      }

      .board-event-actions button:disabled {
        opacity: 0.6;
        cursor: wait;
        transform: none;
        box-shadow: 0 4px 10px rgba(36, 44, 55, 0.08);
      }
    `
  ]
})
export class BoardEventDialogComponent {
  protected readonly i18n = inject(I18nService);
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly kicker = input<string>('');
  readonly instruction = input.required<string>();
  readonly actionLabel = input<string>('');
  readonly actionButtonLabel = input('');
  readonly actionPending = input(false);

  readonly closed = output<void>();
  readonly actionTaken = output<void>();
}
