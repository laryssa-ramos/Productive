import { computed, effect, Injectable, signal } from '@angular/core';
import {
  AppData,
  Category,
  CATEGORY_COLORS,
  STATUS_ORDER,
  Task,
  TaskPriority,
  TaskStatus,
  UNCATEGORIZED_COLOR,
} from './models';
import { addDays, daysUntil, todayIso } from './date-utils';

const STORAGE_KEY = 'productive.data.v1';
const DATA_VERSION = 1;

export interface TaskDraft {
  title: string;
  notes: string;
  categoryId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

export interface CategoryStat {
  category: Category | null;
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** 0–100 */
  percent: number;
  color: string;
  name: string;
}

export interface ActivityDay {
  date: string;
  created: number;
  completed: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Fonte única de verdade do app. Tudo vive em signals e é espelhado no
 * localStorage a cada mudança — por isso não há back-end nem banco.
 */
@Injectable({ providedIn: 'root' })
export class ProductivityStore {
  private readonly _categories = signal<Category[]>([]);
  private readonly _tasks = signal<Task[]>([]);

  readonly categories = this._categories.asReadonly();
  readonly tasks = this._tasks.asReadonly();

  readonly categoryMap = computed(
    () => new Map(this._categories().map((category) => [category.id, category])),
  );

  constructor() {
    const stored = this.read();
    if (stored) {
      this._categories.set(stored.categories);
      this._tasks.set(stored.tasks);
    } else {
      this._categories.set(seedCategories());
    }

    effect(() => {
      const data: AppData = {
        version: DATA_VERSION,
        categories: this._categories(),
        tasks: this._tasks(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Cota estourada ou storage bloqueado: o app segue funcionando em memória.
      }
    });
  }

  // ---------------------------------------------------------------- consultas

  readonly summary = computed(() => {
    const tasks = this._tasks();
    const today = todayIso();
    const done = tasks.filter((task) => task.status === 'done');
    const open = tasks.filter((task) => task.status !== 'done');
    return {
      total: tasks.length,
      done: done.length,
      doing: tasks.filter((task) => task.status === 'doing').length,
      todo: tasks.filter((task) => task.status === 'todo').length,
      open: open.length,
      overdue: open.filter((task) => task.dueDate !== null && task.dueDate < today).length,
      dueToday: open.filter((task) => task.dueDate === today).length,
      completedToday: done.filter((task) => task.completedAt?.slice(0, 10) === today).length,
      percentDone: tasks.length === 0 ? 0 : Math.round((done.length / tasks.length) * 100),
    };
  });

  readonly statusCounts = computed(() => {
    const tasks = this._tasks();
    return STATUS_ORDER.map((status) => ({
      status,
      count: tasks.filter((task) => task.status === status).length,
    }));
  });

  /** Uma linha por categoria (mais "Sem categoria" quando houver), maior primeiro. */
  readonly categoryStats = computed<CategoryStat[]>(() => {
    const today = todayIso();
    const tasks = this._tasks();
    const rows: CategoryStat[] = this._categories().map((category) =>
      buildStat(
        category,
        category.name,
        category.color,
        tasks.filter((task) => task.categoryId === category.id),
        today,
      ),
    );

    const loose = tasks.filter(
      (task) => task.categoryId === null || !this.categoryMap().has(task.categoryId),
    );
    if (loose.length > 0) {
      rows.push(buildStat(null, 'Sem categoria', UNCATEGORIZED_COLOR, loose, today));
    }
    return rows.sort((a, b) => b.total - a.total);
  });

  /** Últimos 14 dias de criadas x concluídas. */
  readonly activity = computed<ActivityDay[]>(() => {
    const tasks = this._tasks();
    const start = addDays(todayIso(), -13);
    const days: ActivityDay[] = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(start, i);
      days.push({
        date,
        created: tasks.filter((task) => task.createdAt.slice(0, 10) === date).length,
        completed: tasks.filter((task) => task.completedAt?.slice(0, 10) === date).length,
      });
    }
    return days;
  });

  /** Tarefas abertas com prazo, das mais urgentes para as menos. */
  readonly agenda = computed(() =>
    this._tasks()
      .filter((task) => task.status !== 'done' && task.dueDate !== null)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
  );

  readonly overdue = computed(() => {
    const today = todayIso();
    return this.agenda().filter((task) => task.dueDate! < today);
  });

  readonly upcoming = computed(() =>
    this.agenda().filter((task) => daysUntil(task.dueDate!) >= 0 && daysUntil(task.dueDate!) <= 7),
  );

  categoryOf(task: Task): Category | null {
    return task.categoryId === null ? null : (this.categoryMap().get(task.categoryId) ?? null);
  }

  colorOf(task: Task): string {
    return this.categoryOf(task)?.color ?? UNCATEGORIZED_COLOR;
  }

  // ---------------------------------------------------------------- tarefas

  addTask(draft: TaskDraft): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      categoryId: draft.categoryId,
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      createdAt: now,
      completedAt: draft.status === 'done' ? now : null,
    };
    this._tasks.update((tasks) => [task, ...tasks]);
    return task;
  }

  updateTask(id: string, draft: TaskDraft): void {
    this._tasks.update((tasks) =>
      tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              title: draft.title.trim(),
              notes: draft.notes.trim(),
              categoryId: draft.categoryId,
              status: draft.status,
              priority: draft.priority,
              dueDate: draft.dueDate || null,
              completedAt: completionStamp(task, draft.status),
            }
          : task,
      ),
    );
  }

  setStatus(id: string, status: TaskStatus): void {
    this._tasks.update((tasks) =>
      tasks.map((task) =>
        task.id === id ? { ...task, status, completedAt: completionStamp(task, status) } : task,
      ),
    );
  }

  toggleDone(id: string): void {
    const task = this._tasks().find((item) => item.id === id);
    if (!task) return;
    this.setStatus(id, task.status === 'done' ? 'todo' : 'done');
  }

  deleteTask(id: string): void {
    this._tasks.update((tasks) => tasks.filter((task) => task.id !== id));
  }

  clearCompleted(): number {
    const removed = this._tasks().filter((task) => task.status === 'done').length;
    this._tasks.update((tasks) => tasks.filter((task) => task.status !== 'done'));
    return removed;
  }

  // ---------------------------------------------------------------- categorias

  /** Primeira cor da paleta ainda não usada (volta a ciclar se todas estiverem). */
  suggestColor(): string {
    const used = new Set(this._categories().map((category) => category.color));
    return CATEGORY_COLORS.find((color) => !used.has(color)) ?? CATEGORY_COLORS[0];
  }

  addCategory(name: string, color: string): Category {
    const category: Category = {
      id: newId(),
      name: name.trim(),
      color,
      createdAt: new Date().toISOString(),
    };
    this._categories.update((categories) => [...categories, category]);
    return category;
  }

  updateCategory(id: string, name: string, color: string): void {
    this._categories.update((categories) =>
      categories.map((category) =>
        category.id === id ? { ...category, name: name.trim(), color } : category,
      ),
    );
  }

  /** Remove a categoria; as tarefas dela ficam "Sem categoria". */
  deleteCategory(id: string): void {
    this._categories.update((categories) => categories.filter((category) => category.id !== id));
    this._tasks.update((tasks) =>
      tasks.map((task) => (task.categoryId === id ? { ...task, categoryId: null } : task)),
    );
  }

  countByCategory(id: string): number {
    return this._tasks().filter((task) => task.categoryId === id).length;
  }

  // ---------------------------------------------------------------- backup

  exportJson(): string {
    return JSON.stringify(
      { version: DATA_VERSION, categories: this._categories(), tasks: this._tasks() },
      null,
      2,
    );
  }

  /** Substitui todo o conteúdo. Lança erro se o arquivo não tiver o formato esperado. */
  importJson(raw: string): void {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.tasks)) {
      throw new Error('Arquivo fora do formato esperado.');
    }
    this._categories.set(parsed.categories);
    this._tasks.set(parsed.tasks);
  }

  resetAll(): void {
    this._categories.set(seedCategories());
    this._tasks.set([]);
  }

  private read(): AppData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppData;
      if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.tasks)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

function completionStamp(task: Task, status: TaskStatus): string | null {
  if (status !== 'done') return null;
  return task.completedAt ?? new Date().toISOString();
}

function buildStat(
  category: Category | null,
  name: string,
  color: string,
  tasks: Task[],
  today: string,
): CategoryStat {
  const done = tasks.filter((task) => task.status === 'done').length;
  return {
    category,
    name,
    color,
    total: tasks.length,
    done,
    open: tasks.length - done,
    overdue: tasks.filter(
      (task) => task.status !== 'done' && task.dueDate !== null && task.dueDate < today,
    ).length,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

function seedCategories(): Category[] {
  const now = new Date().toISOString();
  return [
    { id: newId(), name: 'Trabalho', color: CATEGORY_COLORS[0], createdAt: now },
    { id: newId(), name: 'Estudos', color: CATEGORY_COLORS[1], createdAt: now },
    { id: newId(), name: 'Pessoal', color: CATEGORY_COLORS[2], createdAt: now },
  ];
}
