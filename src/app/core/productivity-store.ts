import { computed, effect, Injectable, signal } from '@angular/core';
import {
  AppData,
  Category,
  CATEGORY_COLORS,
  DailyDraw,
  EVERY_DAY,
  Goal,
  GoalLog,
  Idea,
  PendingItem,
  Project,
  ProjectStatus,
  RoutineBlock,
  RoutineItem,
  STATUS_ORDER,
  Task,
  TaskPriority,
  TaskStatus,
  UNCATEGORIZED_COLOR,
} from './models';
import { addDays, daysUntil, fromIsoDate, todayIso } from './date-utils';

const STORAGE_KEY = 'productive.data.v1';
const DATA_VERSION = 6;
/** Dias de descanso antes de uma pendência poder ser sorteada de novo. */
const RECENT_DRAW_DAYS = 3;
/** Carimbo de uma instalação que ainda não foi tocada. */
const EPOCH = new Date(0).toISOString();

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

export interface GoalDraft {
  name: string;
  categoryId: string | null;
  target: number;
  unit: string;
  days: number[];
}

/** Uma meta com o progresso de um dia específico já resolvido. */
export interface GoalToday {
  goal: Goal;
  value: number;
  /** 0–100, limitado a 100 mesmo quando passa do alvo. */
  percent: number;
  done: boolean;
  streak: number;
  color: string;
  categoryName: string;
}

export interface GoalDay {
  date: string;
  scheduled: boolean;
  value: number;
  done: boolean;
  /** 0–100 do alvo do dia. */
  percent: number;
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
  private readonly _goals = signal<Goal[]>([]);
  private readonly _goalLogs = signal<GoalLog[]>([]);
  private readonly _pending = signal<PendingItem[]>([]);
  private readonly _draw = signal<DailyDraw | null>(null);
  private readonly _projects = signal<Project[]>([]);
  private readonly _routines = signal<RoutineBlock[]>([]);
  private readonly _ideas = signal<Idea[]>([]);
  private readonly _updatedAt = signal(EPOCH);

  readonly categories = this._categories.asReadonly();
  readonly tasks = this._tasks.asReadonly();
  readonly goals = this._goals.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly projects = this._projects.asReadonly();
  readonly routines = this._routines.asReadonly();
  readonly ideas = this._ideas.asReadonly();
  readonly updatedAt = this._updatedAt.asReadonly();

  readonly categoryMap = computed(
    () => new Map(this._categories().map((category) => [category.id, category])),
  );

  constructor() {
    const stored = this.read();
    if (stored) {
      this._categories.set(stored.categories);
      this._tasks.set(stored.tasks);
      this._goals.set(stored.goals ?? []);
      this._goalLogs.set(stored.goalLogs ?? []);
      this._pending.set(stored.pending ?? []);
      this._draw.set(stored.draw ?? null);
      this._projects.set(stored.projects ?? []);
      this._routines.set(stored.routines ?? []);
      this._ideas.set(stored.ideas ?? []);
      this._updatedAt.set(stored.updatedAt ?? new Date().toISOString());
    } else {
      this._categories.set(seedCategories());
    }

    effect(() => {
      const data = this.snapshot();
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

  /**
   * Instalação nova, sem nenhuma alteração do usuário. Nesse caso a nuvem sempre
   * vence — senão as categorias de exemplo apagariam os dados reais.
   */
  isPristine(): boolean {
    return this._updatedAt() === EPOCH;
  }

  /** Cópia serializável do estado — usada na persistência e na sincronização. */
  snapshot(): AppData {
    return {
      version: DATA_VERSION,
      categories: this._categories(),
      tasks: this._tasks(),
      goals: this._goals(),
      goalLogs: this._goalLogs(),
      pending: this._pending(),
      draw: this._draw(),
      projects: this._projects(),
      routines: this._routines(),
      ideas: this._ideas(),
      updatedAt: this._updatedAt(),
    };
  }

  /**
   * Adota um estado vindo de fora (nuvem) sem carimbar hora nova: o carimbo é o
   * do próprio dado remoto, senão as duas pontas ficariam se ultrapassando.
   */
  applyRemote(data: AppData): void {
    this._categories.set(data.categories);
    this._tasks.set(data.tasks);
    // Um aparelho ainda na versão 1 manda os dados sem metas.
    this._goals.set(data.goals ?? []);
    this._goalLogs.set(data.goalLogs ?? []);
    this._pending.set(data.pending ?? []);
    this._draw.set(data.draw ?? null);
    this._projects.set(data.projects ?? []);
    this._routines.set(data.routines ?? []);
    this._ideas.set(data.ideas ?? []);
    this._updatedAt.set(data.updatedAt);
  }

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
    this.touch();
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
    this.touch();
  }

  setStatus(id: string, status: TaskStatus): void {
    this._tasks.update((tasks) =>
      tasks.map((task) =>
        task.id === id ? { ...task, status, completedAt: completionStamp(task, status) } : task,
      ),
    );
    this.touch();
  }

  toggleDone(id: string): void {
    const task = this._tasks().find((item) => item.id === id);
    if (!task) return;
    this.setStatus(id, task.status === 'done' ? 'todo' : 'done');
  }

  deleteTask(id: string): void {
    this._tasks.update((tasks) => tasks.filter((task) => task.id !== id));
    this.touch();
  }

  clearCompleted(): number {
    const removed = this._tasks().filter((task) => task.status === 'done').length;
    this._tasks.update((tasks) => tasks.filter((task) => task.status !== 'done'));
    this.touch();
    return removed;
  }

  // ---------------------------------------------------------------- metas

  private readonly logIndex = computed(() => {
    const index = new Map<string, number>();
    for (const log of this._goalLogs()) index.set(logKey(log.goalId, log.date), log.value);
    return index;
  });

  readonly activeGoals = computed(() => this._goals().filter((goal) => goal.archivedAt === null));
  readonly archivedGoals = computed(() => this._goals().filter((goal) => goal.archivedAt !== null));

  /** Quanto já foi registrado de uma meta num dia. */
  progressOf(goalId: string, date: string): number {
    return this.logIndex().get(logKey(goalId, date)) ?? 0;
  }

  isScheduled(goal: Goal, date: string): boolean {
    return goal.days.includes(fromIsoDate(date).getDay());
  }

  isMet(goal: Goal, date: string): boolean {
    return this.progressOf(goal.id, date) >= goal.target;
  }

  /** Metas que valem hoje, com progresso e sequência já resolvidos. */
  readonly goalsToday = computed<GoalToday[]>(() => {
    const today = todayIso();
    return this.activeGoals()
      .filter((goal) => this.isScheduled(goal, today))
      .map((goal) => {
        const value = this.progressOf(goal.id, today);
        const category = goal.categoryId ? this.categoryMap().get(goal.categoryId) : undefined;
        return {
          goal,
          value,
          percent: Math.min(100, Math.round((value / goal.target) * 100)),
          done: value >= goal.target,
          streak: this.streakOf(goal),
          color: category?.color ?? UNCATEGORIZED_COLOR,
          categoryName: category?.name ?? 'Sem categoria',
        };
      });
  });

  readonly goalSummary = computed(() => {
    const rows = this.goalsToday();
    const done = rows.filter((row) => row.done).length;
    return {
      scheduled: rows.length,
      done,
      open: rows.length - done,
      percent: rows.length === 0 ? 0 : Math.round((done / rows.length) * 100),
    };
  });

  /**
   * Sequência atual em dias válidos da meta. Um dia em que ela não vale não conta
   * nem quebra. O dia de hoje ainda em aberto também não quebra — só para de somar.
   */
  streakOf(goal: Goal): number {
    const today = todayIso();
    let cursor = this.isScheduled(goal, today) && !this.isMet(goal, today) ? addDays(today, -1) : today;
    const floor = goal.createdAt.slice(0, 10);
    let streak = 0;

    while (cursor >= floor) {
      if (this.isScheduled(goal, cursor)) {
        if (!this.isMet(goal, cursor)) break;
        streak++;
      }
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  /** Maior sequência já alcançada, para dar régua ao número atual. */
  bestStreakOf(goal: Goal): number {
    const today = todayIso();
    let cursor = goal.createdAt.slice(0, 10);
    let best = 0;
    let running = 0;

    while (cursor <= today) {
      if (this.isScheduled(goal, cursor)) {
        if (this.isMet(goal, cursor)) {
          running++;
          best = Math.max(best, running);
        } else if (cursor !== today) {
          // O dia de hoje ainda pode ser cumprido; não zera a contagem.
          running = 0;
        }
      }
      cursor = addDays(cursor, 1);
    }
    return best;
  }

  /** Os últimos `days` dias de uma meta, do mais antigo para o mais recente. */
  historyOf(goal: Goal, days = 14): GoalDay[] {
    const start = addDays(todayIso(), -(days - 1));
    const history: GoalDay[] = [];

    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const value = this.progressOf(goal.id, date);
      history.push({
        date,
        scheduled: this.isScheduled(goal, date),
        value,
        done: value >= goal.target,
        percent: Math.min(100, Math.round((value / goal.target) * 100)),
      });
    }
    return history;
  }

  /** Define o progresso de um dia. Zero apaga o registro em vez de guardar 0. */
  setProgress(goalId: string, date: string, value: number): void {
    const goal = this._goals().find((item) => item.id === goalId);
    if (!goal) return;

    const clamped = Math.max(0, Math.min(goal.target, value));
    this._goalLogs.update((logs) => {
      const rest = logs.filter((log) => !(log.goalId === goalId && log.date === date));
      return clamped === 0 ? rest : [...rest, { goalId, date, value: clamped }];
    });
    this.touch();
  }

  bumpGoal(goalId: string, date: string, delta: number): void {
    this.setProgress(goalId, date, this.progressOf(goalId, date) + delta);
  }

  toggleGoal(goalId: string, date: string): void {
    const goal = this._goals().find((item) => item.id === goalId);
    if (!goal) return;
    this.setProgress(goalId, date, this.isMet(goal, date) ? 0 : goal.target);
  }

  addGoal(draft: GoalDraft): Goal {
    const goal: Goal = {
      id: newId(),
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      target: Math.max(1, Math.round(draft.target)),
      unit: draft.unit.trim(),
      days: draft.days.length > 0 ? [...draft.days].sort() : [...EVERY_DAY],
      createdAt: new Date().toISOString(),
      archivedAt: null,
    };
    this._goals.update((goals) => [...goals, goal]);
    this.touch();
    return goal;
  }

  updateGoal(id: string, draft: GoalDraft): void {
    this._goals.update((goals) =>
      goals.map((goal) =>
        goal.id === id
          ? {
              ...goal,
              name: draft.name.trim(),
              categoryId: draft.categoryId,
              target: Math.max(1, Math.round(draft.target)),
              unit: draft.unit.trim(),
              days: draft.days.length > 0 ? [...draft.days].sort() : [...EVERY_DAY],
            }
          : goal,
      ),
    );
    this.touch();
  }

  archiveGoal(id: string): void {
    this._goals.update((goals) =>
      goals.map((goal) =>
        goal.id === id ? { ...goal, archivedAt: new Date().toISOString() } : goal,
      ),
    );
    this.touch();
  }

  restoreGoal(id: string): void {
    this._goals.update((goals) =>
      goals.map((goal) => (goal.id === id ? { ...goal, archivedAt: null } : goal)),
    );
    this.touch();
  }

  /** Exclui de vez, junto com todo o histórico registrado. */
  deleteGoal(id: string): void {
    this._goals.update((goals) => goals.filter((goal) => goal.id !== id));
    this._goalLogs.update((logs) => logs.filter((log) => log.goalId !== id));
    this.touch();
  }

  // ----------------------------------------------------------------- rotina

  /** Os blocos com o estado de hoje já resolvido. */
  readonly routineToday = computed(() => {
    const today = todayIso();
    return this._routines().map((block) => {
      const items = block.items.map((item) => ({
        ...item,
        done: item.checkedOn === today,
      }));
      const done = items.filter((item) => item.done).length;
      return {
        block,
        items,
        done,
        total: items.length,
        percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
      };
    });
  });

  readonly routineSummary = computed(() => {
    const blocks = this.routineToday();
    return {
      blocks: blocks.length,
      done: blocks.reduce((sum, block) => sum + block.done, 0),
      total: blocks.reduce((sum, block) => sum + block.total, 0),
    };
  });

  addRoutineBlock(name: string): RoutineBlock | null {
    const clean = name.trim();
    if (!clean) return null;

    const block: RoutineBlock = {
      id: newId(),
      name: clean,
      items: [],
      createdAt: new Date().toISOString(),
    };
    this._routines.update((blocks) => [...blocks, block]);
    this.touch();
    return block;
  }

  renameRoutineBlock(id: string, name: string): void {
    const clean = name.trim();
    if (!clean) return;
    this._routines.update((blocks) =>
      blocks.map((block) => (block.id === id ? { ...block, name: clean } : block)),
    );
    this.touch();
  }

  deleteRoutineBlock(id: string): void {
    this._routines.update((blocks) => blocks.filter((block) => block.id !== id));
    this.touch();
  }

  addRoutineItem(blockId: string, text: string): void {
    const clean = text.trim();
    if (!clean) return;

    const item: RoutineItem = { id: newId(), text: clean, checkedOn: null };
    this.mapBlock(blockId, (block) => ({ ...block, items: [...block.items, item] }));
  }

  updateRoutineItem(blockId: string, itemId: string, text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.mapBlock(blockId, (block) => ({
      ...block,
      items: block.items.map((item) => (item.id === itemId ? { ...item, text: clean } : item)),
    }));
  }

  /** Marca ou desmarca no dia de hoje. */
  toggleRoutineItem(blockId: string, itemId: string): void {
    const today = todayIso();
    this.mapBlock(blockId, (block) => ({
      ...block,
      items: block.items.map((item) =>
        item.id === itemId
          ? { ...item, checkedOn: item.checkedOn === today ? null : today }
          : item,
      ),
    }));
  }

  deleteRoutineItem(blockId: string, itemId: string): void {
    this.mapBlock(blockId, (block) => ({
      ...block,
      items: block.items.filter((item) => item.id !== itemId),
    }));
  }

  /** Desmarca o bloco inteiro, para quem quiser refazer no mesmo dia. */
  clearRoutineBlock(blockId: string): void {
    this.mapBlock(blockId, (block) => ({
      ...block,
      items: block.items.map((item) => ({ ...item, checkedOn: null })),
    }));
  }

  private mapBlock(id: string, fn: (block: RoutineBlock) => RoutineBlock): void {
    this._routines.update((blocks) => blocks.map((block) => (block.id === id ? fn(block) : block)));
    this.touch();
  }

  // ------------------------------------------------------------------ ideias

  readonly openIdeas = computed(() =>
    this._ideas()
      .filter((idea) => idea.archivedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly archivedIdeas = computed(() =>
    this._ideas().filter((idea) => idea.archivedAt !== null),
  );

  readonly ideaSummary = computed(() => ({
    open: this.openIdeas().length,
    archived: this.archivedIdeas().length,
  }));

  addIdea(text: string): Idea | null {
    const clean = text.trim();
    if (!clean) return null;

    const idea: Idea = {
      id: newId(),
      text: clean,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    };
    this._ideas.update((ideas) => [idea, ...ideas]);
    this.touch();
    return idea;
  }

  updateIdea(id: string, text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this._ideas.update((ideas) =>
      ideas.map((idea) => (idea.id === id ? { ...idea, text: clean } : idea)),
    );
    this.touch();
  }

  archiveIdea(id: string): void {
    this._ideas.update((ideas) =>
      ideas.map((idea) =>
        idea.id === id ? { ...idea, archivedAt: new Date().toISOString() } : idea,
      ),
    );
    this.touch();
  }

  restoreIdea(id: string): void {
    this._ideas.update((ideas) =>
      ideas.map((idea) => (idea.id === id ? { ...idea, archivedAt: null } : idea)),
    );
    this.touch();
  }

  deleteIdea(id: string): void {
    this._ideas.update((ideas) => ideas.filter((idea) => idea.id !== id));
    this.touch();
  }

  /** A ideia vira tarefa e sai daqui: o registro passa a ser a tarefa. */
  promoteIdeaToTask(id: string): Task | null {
    const idea = this._ideas().find((item) => item.id === id);
    if (!idea) return null;

    const task = this.addTask({
      title: idea.text,
      notes: 'Veio das ideias.',
      categoryId: null,
      status: 'todo',
      priority: 'medium',
      dueDate: null,
    });
    this.deleteIdea(id);
    return task;
  }

  /** Idem, para quando a ideia é grande o bastante para virar frente de trabalho. */
  promoteIdeaToProject(id: string): Project | null {
    const idea = this._ideas().find((item) => item.id === id);
    if (!idea) return null;

    const project = this.addProject(idea.text);
    this.deleteIdea(id);
    return project;
  }

  // ---------------------------------------------------------------- projetos

  readonly activeProjects = computed(() =>
    this._projects().filter((project) => project.status === 'active'),
  );

  readonly projectSummary = computed(() => {
    const projects = this._projects();
    return {
      active: projects.filter((project) => project.status === 'active').length,
      paused: projects.filter((project) => project.status === 'paused').length,
      done: projects.filter((project) => project.status === 'done').length,
    };
  });

  addProject(name: string, note = ''): Project | null {
    const clean = name.trim();
    if (!clean) return null;

    const project: Project = {
      id: newId(),
      name: clean,
      note: note.trim(),
      status: 'active',
      // A cor sai da paleta em rodízio: uma decisão a menos na hora de criar.
      color: CATEGORY_COLORS[this._projects().length % CATEGORY_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    this._projects.update((projects) => [...projects, project]);
    this.touch();
    return project;
  }

  updateProject(id: string, name: string, note: string): void {
    const clean = name.trim();
    if (!clean) return;
    this._projects.update((projects) =>
      projects.map((project) =>
        project.id === id ? { ...project, name: clean, note: note.trim() } : project,
      ),
    );
    this.touch();
  }

  setProjectStatus(id: string, status: ProjectStatus): void {
    this._projects.update((projects) =>
      projects.map((project) => (project.id === id ? { ...project, status } : project)),
    );
    this.touch();
  }

  deleteProject(id: string): void {
    this._projects.update((projects) => projects.filter((project) => project.id !== id));
    this.touch();
  }

  // -------------------------------------------------------------- pendências

  readonly openPending = computed(() => this._pending().filter((item) => item.doneAt === null));
  readonly donePending = computed(() => this._pending().filter((item) => item.doneAt !== null));

  /** Abertas que ainda podem sair hoje — descontando as adiadas nesta data. */
  readonly eligibleToday = computed(() => {
    const today = todayIso();
    return this.openPending().filter((item) => !item.skippedDates.includes(today));
  });

  /** A pendência da vez. Null quando o sorteio de hoje não vale mais. */
  readonly drawnToday = computed<PendingItem | null>(() => {
    const draw = this._draw();
    if (!draw || draw.date !== todayIso()) return null;
    const item = this._pending().find((candidate) => candidate.id === draw.itemId);
    return item && item.doneAt === null ? item : null;
  });

  readonly pendingSummary = computed(() => ({
    open: this.openPending().length,
    done: this.donePending().length,
    available: this.eligibleToday().length,
  }));

  /** Sorteia se ainda não há uma escolhida para hoje. Idempotente. */
  ensureDraw(): void {
    if (this.drawnToday()) return;
    const pick = this.pick();
    if (pick) this.commitDraw(pick);
  }

  /** "Agora não": tira a atual da roda de hoje e puxa outra. */
  spin(): void {
    const current = this.drawnToday();
    if (current) this.skipToday(current.id);

    const pick = this.pick();
    if (pick) {
      this.commitDraw(pick);
    } else {
      this._draw.set(null);
      this.touch();
    }
  }

  addPending(text: string): PendingItem | null {
    const clean = text.trim();
    if (!clean) return null;

    const item: PendingItem = {
      id: newId(),
      text: clean,
      createdAt: new Date().toISOString(),
      doneAt: null,
      lastDrawnAt: null,
      skippedDates: [],
    };
    this._pending.update((list) => [item, ...list]);
    this.touch();
    return item;
  }

  updatePending(id: string, text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this._pending.update((list) =>
      list.map((item) => (item.id === id ? { ...item, text: clean } : item)),
    );
    this.touch();
  }

  completePending(id: string): void {
    this._pending.update((list) =>
      list.map((item) => (item.id === id ? { ...item, doneAt: new Date().toISOString() } : item)),
    );
    this.touch();
  }

  reopenPending(id: string): void {
    this._pending.update((list) =>
      list.map((item) => (item.id === id ? { ...item, doneAt: null } : item)),
    );
    this.touch();
  }

  deletePending(id: string): void {
    this._pending.update((list) => list.filter((item) => item.id !== id));
    if (this._draw()?.itemId === id) this._draw.set(null);
    this.touch();
  }

  /**
   * Move a pendência para a lista de tarefas. Ela sai daqui: a tarefa criada
   * passa a ser o registro dela, para não existir a mesma coisa em dois lugares.
   */
  promotePending(id: string): Task | null {
    const item = this._pending().find((candidate) => candidate.id === id);
    if (!item) return null;

    const task = this.addTask({
      title: item.text,
      notes: '',
      categoryId: null,
      status: 'todo',
      priority: 'medium',
      dueDate: null,
    });
    this.deletePending(id);
    return task;
  }

  private skipToday(id: string): void {
    const today = todayIso();
    this._pending.update((list) =>
      list.map((item) =>
        item.id === id && !item.skippedDates.includes(today)
          ? { ...item, skippedDates: [...item.skippedDates, today] }
          : item,
      ),
    );
  }

  private commitDraw(item: PendingItem): void {
    const now = new Date().toISOString();
    this._draw.set({ date: todayIso(), itemId: item.id });
    this._pending.update((list) =>
      list.map((candidate) =>
        candidate.id === item.id ? { ...candidate, lastDrawnAt: now } : candidate,
      ),
    );
    this.touch();
  }

  private pick(): PendingItem | null {
    const pool = this.eligibleToday();
    if (pool.length === 0) return null;

    // Afasta as sorteadas há pouco — mas só enquanto sobrar alternativa.
    const rested = pool.filter(
      (item) =>
        item.lastDrawnAt === null ||
        daysUntil(item.lastDrawnAt.slice(0, 10)) <= -RECENT_DRAW_DAYS,
    );
    const candidates = rested.length > 0 ? rested : pool;

    // Quanto mais tempo parada, mais peso: o que está encalhado aparece mais.
    const weights = candidates.map(
      (item) => 1 + Math.max(0, -daysUntil(item.createdAt.slice(0, 10))),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
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
    this.touch();
    return category;
  }

  updateCategory(id: string, name: string, color: string): void {
    this._categories.update((categories) =>
      categories.map((category) =>
        category.id === id ? { ...category, name: name.trim(), color } : category,
      ),
    );
    this.touch();
  }

  /** Remove a categoria; as tarefas dela ficam "Sem categoria". */
  deleteCategory(id: string): void {
    this._categories.update((categories) => categories.filter((category) => category.id !== id));
    this._tasks.update((tasks) =>
      tasks.map((task) => (task.categoryId === id ? { ...task, categoryId: null } : task)),
    );
    this.touch();
  }

  countByCategory(id: string): number {
    return this._tasks().filter((task) => task.categoryId === id).length;
  }

  // ---------------------------------------------------------------- backup

  exportJson(): string {
    return JSON.stringify(this.snapshot(), null, 2);
  }

  /** Substitui todo o conteúdo. Lança erro se o arquivo não tiver o formato esperado. */
  importJson(raw: string): void {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.tasks)) {
      throw new Error('Arquivo fora do formato esperado.');
    }
    this._categories.set(parsed.categories);
    this._tasks.set(parsed.tasks);
    this._goals.set(parsed.goals ?? []);
    this._goalLogs.set(parsed.goalLogs ?? []);
    this._pending.set(parsed.pending ?? []);
    this._draw.set(parsed.draw ?? null);
    this._projects.set(parsed.projects ?? []);
    this._routines.set(parsed.routines ?? []);
    this._ideas.set(parsed.ideas ?? []);
    this.touch();
  }

  resetAll(): void {
    this._categories.set(seedCategories());
    this._tasks.set([]);
    this._goals.set([]);
    this._goalLogs.set([]);
    this._pending.set([]);
    this._draw.set(null);
    this._projects.set([]);
    this._routines.set([]);
    this._ideas.set([]);
    this.touch();
  }

  private touch(): void {
    this._updatedAt.set(new Date().toISOString());
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

function logKey(goalId: string, date: string): string {
  return `${goalId}|${date}`;
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
