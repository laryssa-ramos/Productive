import { Component, computed, inject, signal } from '@angular/core';
import { ProductivityStore } from '../../core/productivity-store';
import {
  Project,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  ProjectStatus,
} from '../../core/models';

@Component({
  selector: 'app-projects',
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
})
export class ProjectsPage {
  protected readonly store = inject(ProductivityStore);
  protected readonly statusOrder = PROJECT_STATUS_ORDER;
  protected readonly statusLabels = PROJECT_STATUS_LABELS;

  protected readonly draft = signal('');
  protected readonly editingId = signal<string | null>(null);
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
