import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { Idea } from '../../core/models';

@Component({
  selector: 'app-ideas',
  imports: [RouterLink],
  templateUrl: './ideas.html',
  styleUrl: './ideas.scss',
})
export class IdeasPage {
  protected readonly store = inject(ProductivityStore);

  protected readonly draft = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editText = signal('');
  protected readonly showArchived = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected add(event: Event): void {
    event.preventDefault();
    if (!this.store.addIdea(this.draft())) return;
    this.draft.set('');
  }

  protected startEdit(idea: Idea): void {
    this.editingId.set(idea.id);
    this.editText.set(idea.text);
  }

  protected onEdit(event: Event): void {
    this.editText.set((event.target as HTMLInputElement).value);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (id) this.store.updateIdea(id, this.editText());
    this.editingId.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected toTask(idea: Idea): void {
    this.store.promoteIdeaToTask(idea.id);
    this.flash(`"${idea.text}" virou tarefa.`, '/tarefas');
  }

  protected toProject(idea: Idea): void {
    this.store.promoteIdeaToProject(idea.id);
    this.flash(`"${idea.text}" virou projeto.`, '/projetos');
  }

  protected remove(idea: Idea): void {
    if (!confirm(`Excluir "${idea.text}"?`)) return;
    if (this.editingId() === idea.id) this.editingId.set(null);
    this.store.deleteIdea(idea.id);
  }

  protected readonly noticeLink = signal<string | null>(null);

  private flash(message: string, link: string): void {
    this.notice.set(message);
    this.noticeLink.set(link);
    setTimeout(() => this.notice.set(null), 4000);
  }
}
