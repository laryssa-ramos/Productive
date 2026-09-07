import { Component, computed, inject, signal } from '@angular/core';
import { ProductivityStore } from '../../core/productivity-store';
import {
  Project,
  ProjectItem,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  ProjectStatus,
} from '../../core/models';
import { MoveButtons } from '../../shared/move-buttons/move-buttons';

@Component({
  selector: 'app-projects',
  imports: [MoveButtons],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
})
export class ProjectsPage {
  protected readonly store = inject(ProductivityStore);
  protected readonly statusOrder = PROJECT_STATUS_ORDER;
  protected readonly statusLabels = PROJECT_STATUS_LABELS;

  protected readonly draft = signal('');
  protected readonly editingId = signal<string | null>(null);
  /** Projetos com a lista de subtópicos aberta. */
  protected readonly expanded = signal<string[]>([]);
  /** Texto do campo "adicionar subtópico", por projeto. */
  protected readonly itemDrafts = signal<Record<string, string>>({});
  protected readonly editingItemId = signal<string | null>(null);
  protected readonly editItemText = signal('');
  protected readonly editName = signal('');
  protected readonly editNote = signal('');

  /** Uma seção por situação, na ordem em que importam. */
  protected readonly groups = computed(() =>
    PROJECT_STATUS_ORDER.map((status) => ({
      status,
      label: PROJECT_STATUS_LABELS[status],
      projects: this.store.projects().filter((project) => project.status === status),
    })).filter((group) => group.projects.length > 0),
  );

  /** Move dentro do próprio grupo de situação, não da lista inteira. */
  protected move(project: Project, direction: -1 | 1): void {
    const group = this.store
      .projects()
      .filter((item) => item.status === project.status)
      .map((item) => item.id);
    this.store.moveProject(project.id, direction, group);
  }

  // ------------------------------------------------------------- subtópicos

  protected isExpanded(projectId: string): boolean {
    return this.expanded().includes(projectId);
  }

  protected toggleExpanded(projectId: string): void {
    this.expanded.update((open) =>
      open.includes(projectId)
        ? open.filter((id) => id !== projectId)
        : [...open, projectId],
    );
  }

  protected doneCount(project: Project): number {
    return project.items.filter((item) => item.done).length;
  }

  protected itemDraft(projectId: string): string {
    return this.itemDrafts()[projectId] ?? '';
  }

  protected onItemDraft(projectId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.itemDrafts.update((drafts) => ({ ...drafts, [projectId]: value }));
  }

  protected addItem(projectId: string, event: Event): void {
    event.preventDefault();
    const text = this.itemDraft(projectId);
    if (!text.trim()) return;

    this.store.addProjectItem(projectId, text);
    this.itemDrafts.update((drafts) => ({ ...drafts, [projectId]: '' }));
  }

  protected startEditItem(item: ProjectItem): void {
    this.editingItemId.set(item.id);
    this.editItemText.set(item.text);
  }

  protected onEditItem(event: Event): void {
    this.editItemText.set((event.target as HTMLInputElement).value);
  }

  protected saveEditItem(projectId: string): void {
    const itemId = this.editingItemId();
    if (itemId) this.store.updateProjectItem(projectId, itemId, this.editItemText());
    this.editingItemId.set(null);
  }

  protected cancelEditItem(): void {
    this.editingItemId.set(null);
  }

  protected removeItem(projectId: string, item: ProjectItem): void {
    if (!confirm(`Remover "${item.text}" do projeto?`)) return;
    this.store.deleteProjectItem(projectId, item.id);
  }

  // ------------------------------------------------------------------ projeto

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected add(event: Event): void {
    event.preventDefault();
    if (!this.store.addProject(this.draft())) return;
    this.draft.set('');
  }

  protected startEdit(project: Project): void {
    this.editingId.set(project.id);
    this.editName.set(project.name);
    this.editNote.set(project.note);
  }

  protected onEditName(event: Event): void {
    this.editName.set((event.target as HTMLInputElement).value);
  }

  protected onEditNote(event: Event): void {
    this.editNote.set((event.target as HTMLInputElement).value);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (id) this.store.updateProject(id, this.editName(), this.editNote());
    this.editingId.set(null);
  }

  protected setStatus(project: Project, status: ProjectStatus): void {
    this.store.setProjectStatus(project.id, status);
  }

  protected remove(project: Project): void {
    if (!confirm(`Excluir "${project.name}"?`)) return;
    if (this.editingId() === project.id) this.editingId.set(null);
    this.store.deleteProject(project.id);
  }
}
