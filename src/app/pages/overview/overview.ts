import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { NotesStore } from '../../core/notes-store';
import { describeDueDate, todayIso } from '../../core/date-utils';
import { PRIORITY_LABELS, Project, Task, TaskPriority } from '../../core/models';
import { NOTE_STATUS_LABELS } from '../../core/note-models';
import { MoveButtons } from '../../shared/move-buttons/move-buttons';

/** Cada fonte que a página sabe listar. */
type Source = 'tasks' | 'pending' | 'ideas' | 'goals' | 'routine' | 'projects' | 'notes';

const SOURCES: { id: Source; label: string; route: string }[] = [
  { id: 'tasks', label: 'Tarefas', route: '/tarefas' },
  { id: 'pending', label: 'Pendências', route: '/sorteio' },
  { id: 'ideas', label: 'Ideias', route: '/ideias' },
  { id: 'goals', label: 'Metas', route: '/metas' },
  { id: 'routine', label: 'Rotina', route: '/rotina' },
  { id: 'projects', label: 'Projetos', route: '/projetos' },
  { id: 'notes', label: 'Escrita', route: '/escrita' },
];

const STORAGE_KEY = 'productive.overview.sources';
const DEFAULT_SOURCES: Source[] = ['tasks', 'pending'];
const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'app-overview',
  imports: [RouterLink, MoveButtons],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class OverviewPage {
  protected readonly store = inject(ProductivityStore);
  protected readonly notes = inject(NotesStore);

  protected readonly sources = SOURCES;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly noteStatusLabels = NOTE_STATUS_LABELS;

  /** A seleção fica salva: a página abre do jeito que você deixou. */
  protected readonly selected = signal<Source[]>(readSelection());

  protected readonly tasks = computed(() =>
    this.store
      .tasks()
      .filter((task) => task.status !== 'done')
      .sort((a, b) => {
        if (a.dueDate !== b.dueDate) {
          if (a.dueDate === null) return 1;
          if (b.dueDate === null) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        }
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      }),
  );

  protected readonly openNotes = computed(() =>
    this.notes.notes().filter((note) => note.status !== 'published'),
  );

  /** Quantos itens cada fonte tem agora — usado nas etiquetas de seleção. */
  protected readonly counts = computed<Record<Source, number>>(() => ({
    tasks: this.tasks().length,
    pending: this.store.openPending().length,
    ideas: this.store.openIdeas().length,
    goals: this.store.goalsToday().length,
    routine: this.store.routineSummary().total,
    projects: this.store.activeProjects().length,
    notes: this.openNotes().length,
  }));

  protected readonly total = computed(() =>
    this.selected().reduce((sum, source) => sum + this.counts()[source], 0),
  );

  protected isOn(source: Source): boolean {
    return this.selected().includes(source);
  }

  protected toggle(source: Source): void {
    this.selected.update((current) => {
      const next = current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source];
      writeSelection(next);
      return next;
    });
  }

  protected selectAll(): void {
    const all = SOURCES.map((source) => source.id);
    this.selected.set(all);
    writeSelection(all);
  }

  protected clearAll(): void {
    this.selected.set([]);
    writeSelection([]);
  }

  // -------------------------------------------------------------------- ordem

  /**
   * Reordenação nas listas cuja ordem é manual. Tarefas ficam de fora aqui de
   * propósito: nesta página elas aparecem por prazo, e mover à mão não teria
   * efeito visível — a reordenação delas mora na página Tarefas, em "Ordem
   * manual".
   */
  protected movePending(id: string, direction: -1 | 1): void {
    this.store.movePending(id, direction, this.store.openPending().map((item) => item.id));
  }

  protected moveIdea(id: string, direction: -1 | 1): void {
    this.store.moveIdea(id, direction, this.store.openIdeas().map((item) => item.id));
  }

  protected moveProject(id: string, direction: -1 | 1): void {
    this.store.moveProject(id, direction, this.store.activeProjects().map((item) => item.id));
  }

  protected moveGoal(id: string, direction: -1 | 1): void {
    this.store.moveGoal(id, direction, this.store.activeGoals().map((item) => item.id));
  }

  // ---------------------------------------------------------------------- util

  protected doneItems(project: Project): number {
    return project.items.filter((item) => item.done).length;
  }

  protected dueLabel(task: Task): string {
    return task.dueDate ? describeDueDate(task.dueDate) : '';
  }

  protected isOverdue(task: Task): boolean {
    return task.dueDate !== null && task.dueDate < todayIso();
  }

  protected categoryName(task: Task): string {
    return this.store.categoryOf(task)?.name ?? 'Sem categoria';
  }

  protected colorOf(task: Task): string {
    return this.store.colorOf(task);
  }

  protected today = todayIso();
}

function readSelection(): Source[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SOURCES];
    const parsed = JSON.parse(raw) as Source[];
    return Array.isArray(parsed) ? parsed : [...DEFAULT_SOURCES];
  } catch {
    return [...DEFAULT_SOURCES];
  }
}

function writeSelection(sources: Source[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // Sem persistência: a seleção vale só nesta sessão.
  }
}
