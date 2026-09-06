import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductivityStore, TaskDraft } from '../../core/productivity-store';
import { describeDueDate, todayIso } from '../../core/date-utils';
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  Task,
  TaskPriority,
  TaskStatus,
  UNCATEGORIZED_COLOR,
} from '../../core/models';

type CategoryFilter = 'all' | 'none' | string;
type StatusFilter = 'all' | 'open' | TaskStatus;
type SortKey = 'created' | 'due' | 'priority' | 'title';
type ViewMode = 'list' | 'grouped';

interface TaskGroup {
  key: string;
  name: string;
  color: string;
  tasks: Task[];
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'app-tasks',
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  templateUrl: './tasks.html',
  styleUrl: './tasks.scss',
})
export class TasksPage {
  protected readonly store = inject(ProductivityStore);
  private readonly fb = inject(FormBuilder);

  protected readonly statusOrder = STATUS_ORDER;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityOrder = PRIORITY_ORDER;
  protected readonly priorityLabels = PRIORITY_LABELS;

  protected readonly query = signal('');
  protected readonly categoryFilter = signal<CategoryFilter>('all');
  protected readonly statusFilter = signal<StatusFilter>('open');
  protected readonly priorityFilter = signal<'all' | TaskPriority>('all');
  protected readonly sortKey = signal<SortKey>('due');
  protected readonly view = signal<ViewMode>('grouped');

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(140)]],
    categoryId: [''],
    priority: ['medium' as TaskPriority],
    status: ['todo' as TaskStatus],
    dueDate: [''],
    notes: [''],
  });

  protected readonly filtered = computed<Task[]>(() => {
    const query = this.query().trim().toLowerCase();
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const priority = this.priorityFilter();

    const tasks = this.store.tasks().filter((task) => {
      if (query && !`${task.title} ${task.notes}`.toLowerCase().includes(query)) return false;
      if (category === 'none' && task.categoryId !== null) return false;
      if (category !== 'all' && category !== 'none' && task.categoryId !== category) return false;
      if (status === 'open' && task.status === 'done') return false;
      if (status !== 'all' && status !== 'open' && task.status !== status) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      return true;
    });

    return tasks.sort((a, b) => this.compare(a, b));
  });

  protected readonly groups = computed<TaskGroup[]>(() => {
    const tasks = this.filtered();
    const groups: TaskGroup[] = this.store.categories().map((category) => ({
      key: category.id,
      name: category.name,
      color: category.color,
      tasks: tasks.filter((task) => task.categoryId === category.id),
    }));

    const loose = tasks.filter(
      (task) => task.categoryId === null || !this.store.categoryMap().has(task.categoryId),
    );
    if (loose.length > 0) {
      groups.push({ key: 'none', name: 'Sem categoria', color: UNCATEGORIZED_COLOR, tasks: loose });
    }
    return groups.filter((group) => group.tasks.length > 0);
  });

  protected readonly doneCount = computed(
    () => this.store.tasks().filter((task) => task.status === 'done').length,
  );

  protected readonly hasFilters = computed(
    () =>
      this.query().trim() !== '' ||
      this.categoryFilter() !== 'all' ||
      this.statusFilter() !== 'open' ||
      this.priorityFilter() !== 'all',
  );

  // ------------------------------------------------------------------ formulário

  protected openNew(): void {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      categoryId: this.defaultCategoryId(),
      priority: 'medium',
      status: 'todo',
      dueDate: '',
      notes: '',
    });
    this.openPanel();
  }

  protected openEdit(task: Task): void {
    this.editingId.set(task.id);
    this.form.reset({
      title: task.title,
      categoryId: task.categoryId ?? '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ?? '',
      notes: task.notes,
    });
    this.openPanel();
  }

  /** O formulário fica no topo da página; traz a rolagem junto. */
  private openPanel(): void {
    this.formOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const draft: TaskDraft = {
      title: value.title,
      notes: value.notes,
      categoryId: value.categoryId || null,
      priority: value.priority,
      status: value.status,
      dueDate: value.dueDate || null,
    };

    const editingId = this.editingId();
    if (editingId) {
      this.store.updateTask(editingId, draft);
      this.closeForm();
    } else {
      this.store.addTask(draft);
      // Mantém o formulário aberto para cadastrar várias tarefas em sequência.
      this.form.reset({ ...value, title: '', notes: '', dueDate: value.dueDate });
    }
  }

  protected clearFilters(): void {
    this.query.set('');
    this.categoryFilter.set('all');
    this.statusFilter.set('open');
    this.priorityFilter.set('all');
  }

  protected clearCompleted(): void {
    const count = this.doneCount();
    if (count === 0) return;
    if (!confirm(`Remover ${count} tarefa(s) concluída(s)?`)) return;
    this.store.clearCompleted();
  }

  protected removeTask(task: Task): void {
    if (!confirm(`Excluir "${task.title}"?`)) return;
    if (this.editingId() === task.id) this.closeForm();
    this.store.deleteTask(task.id);
  }

  // ---------------------------------------------------------------------- util

  /** O contexto de um ng-template chega como `any`; isto devolve o tipo real. */
  protected asTask(value: unknown): Task {
    return value as Task;
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected dueLabel(task: Task): string {
    return task.dueDate ? describeDueDate(task.dueDate) : '';
  }

  protected isOverdue(task: Task): boolean {
    return task.status !== 'done' && task.dueDate !== null && task.dueDate < todayIso();
  }

  protected categoryName(task: Task): string {
    return this.store.categoryOf(task)?.name ?? 'Sem categoria';
  }

  protected colorOf(task: Task): string {
    return this.store.colorOf(task);
  }

  private defaultCategoryId(): string {
    const current = this.categoryFilter();
    if (current !== 'all' && current !== 'none') return current;
    return this.store.categories()[0]?.id ?? '';
  }

  private compare(a: Task, b: Task): number {
    switch (this.sortKey()) {
      case 'due':
        if (a.dueDate === b.dueDate) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      case 'priority':
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      case 'title':
        return a.title.localeCompare(b.title, 'pt-BR');
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  }
}
