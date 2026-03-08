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
          <button type="button" (click)="closed.emit()">{{ i18n.t('close') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .board-event-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 30;
      }
      .board-event-dialog {
        width: min(420px, calc(100vw - 32px));
        background: #fff;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
        display: grid;
        gap: 12px;
      }
      .board-event-dialog h2 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
      }
      .board-event-dialog p {
        margin: 0;
        color: #334155;
      }
      .board-event-kicker {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #2563eb;
      }
      .board-event-action {
        font-size: 13px;
        color: #475569;
        background: #f8fafc;
        border-radius: 12px;
        padding: 10px 12px;
      }
      .board-event-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .board-event-actions button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
        background: #e2e8f0;
        color: #0f172a;
      }
      .board-event-actions button:first-child {
        background: #2563eb;
        color: #fff;
      }
      .board-event-actions button:disabled {
        opacity: 0.6;
        cursor: wait;
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
