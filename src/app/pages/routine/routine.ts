import { Component, inject, signal } from '@angular/core';
import { ProductivityStore } from '../../core/productivity-store';
import { RoutineBlock } from '../../core/models';

@Component({
  selector: 'app-routine',
  templateUrl: './routine.html',
  styleUrl: './routine.scss',
})
export class RoutinePage {
  protected readonly store = inject(ProductivityStore);

  protected readonly newBlock = signal('');
  /** Texto do campo "adicionar item", por bloco. */
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameText = signal('');
  /** Item aberto para edição no lugar, e o texto em andamento. */
  protected readonly editingItemId = signal<string | null>(null);
  protected readonly editItemText = signal('');

  protected readonly today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  // ------------------------------------------------------------------- blocos

  protected onNewBlock(event: Event): void {
    this.newBlock.set((event.target as HTMLInputElement).value);
  }

  protected addBlock(event: Event): void {
    event.preventDefault();
    if (!this.store.addRoutineBlock(this.newBlock())) return;
    this.newBlock.set('');
  }

  protected startRename(block: RoutineBlock): void {
    this.renamingId.set(block.id);
    this.renameText.set(block.name);
  }

  protected onRename(event: Event): void {
    this.renameText.set((event.target as HTMLInputElement).value);
  }

  protected saveRename(): void {
    const id = this.renamingId();
    if (id) this.store.renameRoutineBlock(id, this.renameText());
    this.renamingId.set(null);
  }

  protected removeBlock(block: RoutineBlock): void {
    if (!confirm(`Excluir o bloco "${block.name}" e tudo dentro dele?`)) return;
    this.store.deleteRoutineBlock(block.id);
  }

  // -------------------------------------------------------------------- itens

  protected draftFor(blockId: string): string {
    return this.drafts()[blockId] ?? '';
  }

  protected onDraft(blockId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((drafts) => ({ ...drafts, [blockId]: value }));
  }

  protected addItem(blockId: string, event: Event): void {
    event.preventDefault();
    const text = this.draftFor(blockId);
    if (!text.trim()) return;

    this.store.addRoutineItem(blockId, text);
    this.drafts.update((drafts) => ({ ...drafts, [blockId]: '' }));
  }

  protected startEditItem(itemId: string, text: string): void {
    this.editingItemId.set(itemId);
    this.editItemText.set(text);
  }

  protected onEditItem(event: Event): void {
    this.editItemText.set((event.target as HTMLInputElement).value);
  }

  protected saveEditItem(blockId: string): void {
    const itemId = this.editingItemId();
    if (itemId) this.store.updateRoutineItem(blockId, itemId, this.editItemText());
    this.editingItemId.set(null);
  }

  /** Esc desiste da edição sem gravar. */
  protected cancelEditItem(): void {
    this.editingItemId.set(null);
  }

  protected removeItem(blockId: string, itemId: string, text: string): void {
    if (!confirm(`Remover "${text}" do bloco?`)) return;
    this.store.deleteRoutineItem(blockId, itemId);
  }
}
