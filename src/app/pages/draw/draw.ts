import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { PendingItem } from '../../core/models';

@Component({
  selector: 'app-draw',
  imports: [RouterLink],
  templateUrl: './draw.html',
  styleUrl: './draw.scss',
})
export class DrawPage {
  protected readonly store = inject(ProductivityStore);

  protected readonly capture = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editText = signal('');
  protected readonly showDone = signal(false);
  /** Liga a animação por um instante a cada giro. */
  protected readonly spinning = signal(false);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    this.store.ensureDraw();
  }

  // ------------------------------------------------------------------ captura

  protected onCapture(event: Event): void {
    this.capture.set((event.target as HTMLInputElement).value);
  }

  protected submitCapture(event: Event): void {
    event.preventDefault();
    const added = this.store.addPending(this.capture());
    if (!added) return;

    this.capture.set('');
    // A primeira pendência já vira a da vez, para a tela não nascer vazia.
    this.store.ensureDraw();
  }

  // ------------------------------------------------------------------ sorteio

  protected spin(): void {
    this.spinning.set(true);
    this.store.spin();
    setTimeout(() => this.spinning.set(false), 420);
  }

  protected complete(item: PendingItem): void {
    this.store.completePending(item.id);
    this.store.ensureDraw();
  }

  protected promote(item: PendingItem): void {
    this.store.promotePending(item.id);
    this.store.ensureDraw();
    this.flash(`"${item.text}" agora é uma tarefa.`);
  }

  // ------------------------------------------------------------------- edição

  protected startEdit(item: PendingItem): void {
    this.editingId.set(item.id);
    this.editText.set(item.text);
  }

  protected onEditText(event: Event): void {
    this.editText.set((event.target as HTMLInputElement).value);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (id) this.store.updatePending(id, this.editText());
    this.editingId.set(null);
  }

  protected remove(item: PendingItem): void {
    if (!confirm(`Excluir "${item.text}"?`)) return;
    this.store.deletePending(item.id);
    this.store.ensureDraw();
  }

  private flash(message: string): void {
    this.notice.set(message);
    setTimeout(() => this.notice.set(null), 3000);
  }
}
