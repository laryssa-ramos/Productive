import { Component, input, output } from '@angular/core';

/**
 * Par de setas para reordenar à mão. Botões em vez de arrastar: funciona no
 * toque e no teclado, e não exige biblioteca de drag-and-drop.
 */
@Component({
  selector: 'app-move-buttons',
  template: `
    <span class="move">
      <button
        type="button"
        (click)="up.emit()"
        [disabled]="first()"
        [attr.aria-label]="'Mover ' + label() + ' para cima'"
        title="Mover para cima"
      >
        ↑
      </button>
      <button
        type="button"
        (click)="down.emit()"
        [disabled]="last()"
        [attr.aria-label]="'Mover ' + label() + ' para baixo'"
        title="Mover para baixo"
      >
        ↓
      </button>
    </span>
  `,
  styles: `
    .move {
      display: inline-flex;
      gap: 1px;
      flex: none;
    }

    button {
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 5px;
      background: transparent;
      color: var(--text-3);
      font-size: 11px;
      line-height: 1;
      cursor: pointer;

      &:hover:not(:disabled) {
        border-color: var(--border);
        background: var(--surface);
        color: var(--text);
      }

      &:disabled {
        opacity: 0.25;
        cursor: default;
      }
    }
  `,
})
export class MoveButtons {
  readonly label = input('item');
  readonly first = input(false);
  readonly last = input(false);

  readonly up = output<void>();
  readonly down = output<void>();
}
