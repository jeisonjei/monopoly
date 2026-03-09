import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-trade-offer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="trade-offer-backdrop" *ngIf="open()" (click)="canClose() && closed.emit()">
      <div
        class="trade-offer-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <div class="trade-offer-kicker" *ngIf="kicker()">{{ kicker() }}</div>
        <h2>{{ title() }}</h2>
        <p>{{ instruction() }}</p>
        <div class="trade-offer-summary" *ngIf="summary()">{{ summary() }}</div>

        <label class="trade-offer-label" *ngIf="mode() === 'propose'" [attr.for]="amountInputId">{{ amountLabel() }}</label>
        <input
          *ngIf="mode() === 'propose'"
          class="trade-offer-input"
          [id]="amountInputId"
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          [formControl]="amountControl"
          [attr.aria-invalid]="amountControl.invalid"
        />
        <div class="trade-offer-error" *ngIf="mode() === 'propose' && amountErrorMessage()">{{ amountErrorMessage() }}</div>

        <div class="trade-offer-actions">
          <button type="button" (click)="submitPrimary()" [disabled]="primaryDisabled()">
            {{ actionPending() ? i18n.t('applying') : primaryActionLabel() }}
          </button>
          <button type="button" *ngIf="secondaryActionLabel()" (click)="submitSecondary()" [disabled]="actionPending()">
            {{ secondaryActionLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .trade-offer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(31, 27, 36, 0.28);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 31;
      }

      .trade-offer-dialog {
        width: min(460px, calc(100vw - 32px));
        border: 1px solid rgba(108, 124, 145, 0.42);
        border-radius: 16px;
        padding: 22px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243, 239, 233, 0.98));
        box-shadow: 0 18px 42px rgba(36, 44, 55, 0.18), inset 0 0 0 1px rgba(255,255,255,0.45);
        display: grid;
        gap: 14px;
      }

      .trade-offer-kicker {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #4b2da1;
      }

      .trade-offer-dialog h2 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
        color: #1f1b24;
      }

      .trade-offer-dialog p {
        margin: 0;
        color: #4d5a6a;
        line-height: 1.5;
      }

      .trade-offer-summary {
        font-size: 13px;
        color: #4d5a6a;
        background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(247, 242, 230, 0.9));
        border: 1px solid rgba(94, 115, 140, 0.22);
        border-radius: 12px;
        padding: 10px 12px;
      }

      .trade-offer-label {
        font-size: 13px;
        font-weight: 700;
        color: #3a4655;
      }

      .trade-offer-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(108, 124, 145, 0.42);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 16px;
        font-weight: 700;
        color: #1f1b24;
        background: rgba(255,255,255,0.96);
      }

      .trade-offer-input:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
      }

      .trade-offer-error {
        font-size: 12px;
        color: #b45309;
      }

      .trade-offer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .trade-offer-actions button {
        border: 1px solid rgba(94, 115, 140, 0.3);
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241, 236, 228, 0.96));
        color: #1f1b24;
        box-shadow: 0 4px 10px rgba(36, 44, 55, 0.08);
      }

      .trade-offer-actions button:first-child {
        border-color: rgba(75, 45, 161, 0.32);
        background: linear-gradient(180deg, rgba(90, 54, 180, 0.16), rgba(90, 54, 180, 0.08));
        color: #4b2da1;
      }

      .trade-offer-actions button:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
      }

      .trade-offer-actions button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
    `
  ]
})
export class TradeOfferDialogComponent {
  protected readonly i18n = inject(I18nService);

  readonly open = input(false);
  readonly mode = input<'propose' | 'review'>('propose');
  readonly title = input.required<string>();
  readonly kicker = input<string>('');
  readonly instruction = input.required<string>();
  readonly summary = input<string>('');
  readonly amountLabel = input<string>('');
  readonly initialAmount = input<number | null>(null);
  readonly primaryActionLabel = input.required<string>();
  readonly secondaryActionLabel = input<string>('');
  readonly actionPending = input(false);

  readonly closed = output<void>();
  readonly proposed = output<number>();
  readonly accepted = output<void>();
  readonly rejected = output<void>();

  readonly amountControl = new FormControl<number | null>(null, {
    nonNullable: false,
    validators: [Validators.required, Validators.min(1)]
  });

  readonly primaryDisabled = computed(() => {
    if (this.actionPending()) {
      return true;
    }
    if (this.mode() !== 'propose') {
      return false;
    }
    return this.amountControl.invalid;
  });

  readonly amountErrorMessage = computed(() => {
    if (this.mode() !== 'propose' || !this.amountControl.touched) {
      return '';
    }
    if (this.amountControl.hasError('required')) {
      return this.i18n.t('required_field');
    }
    if (this.amountControl.hasError('min')) {
      return this.i18n.t('trade_offer_amount_positive');
    }
    return '';
  });

  readonly amountInputId = `trade-offer-amount-${Math.random().toString(36).slice(2, 8)}`;

  constructor() {
    effect(() => {
      const amount = this.initialAmount();
      if (this.mode() !== 'propose') {
        return;
      }
      this.amountControl.setValue(amount, { emitEvent: false });
      this.amountControl.markAsPristine();
      this.amountControl.markAsUntouched();
    });
  }

  canClose(): boolean {
    return !this.actionPending();
  }

  submitPrimary(): void {
    if (this.mode() === 'review') {
      this.accepted.emit();
      return;
    }

    this.amountControl.markAsTouched();
    if (this.amountControl.invalid) {
      return;
    }

    this.proposed.emit(Number(this.amountControl.value ?? 0));
  }

  submitSecondary(): void {
    if (this.mode() === 'review') {
      this.rejected.emit();
      return;
    }
    this.closed.emit();
  }
}
