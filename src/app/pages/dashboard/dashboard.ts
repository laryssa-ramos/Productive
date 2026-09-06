import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { describeDueDate, fromIsoDate, todayIso } from '../../core/date-utils';
import { PRIORITY_LABELS, STATUS_LABELS, Task, TaskPriority } from '../../core/models';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  protected readonly store = inject(ProductivityStore);
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  constructor() {
    // Abrir o painel já basta para existir uma pendência escolhida para hoje.
    this.store.ensureDraw();
  }

  protected readonly today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  /** Escala compartilhada pelas duas séries — um único eixo, nunca dois. */
  private readonly activityMax = computed(() =>
    Math.max(1, ...this.store.activity().flatMap((day) => [day.created, day.completed])),
  );

  protected readonly activityBars = computed(() =>
    this.store.activity().map((day) => {
      const date = fromIsoDate(day.date);
      return {
        ...day,
        isToday: day.date === todayIso(),
        dayLabel: `${date.getDate()}`,
        fullLabel: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        createdHeight: (day.created / this.activityMax()) * 100,
        completedHeight: (day.completed / this.activityMax()) * 100,
      };
    }),
  );

  protected readonly activityTotals = computed(() =>
    this.store.activity().reduce(
      (acc, day) => ({ created: acc.created + day.created, completed: acc.completed + day.completed }),
      { created: 0, completed: 0 },
    ),
  );

  /** Segmentos da barra empilhada de status, já em porcentagem. */
  protected readonly statusSegments = computed(() => {
    const total = this.store.summary().total;
    return this.store.statusCounts().map((row, index) => ({
      ...row,
      label: STATUS_LABELS[row.status],
      color: `var(--ord-${index + 1})`,
      percent: total === 0 ? 0 : (row.count / total) * 100,
    }));
  });

  /** Metas de hoje só com o que o painel precisa mostrar. */
  protected readonly goalsToday = computed(() =>
    this.store.goalsToday().map((row) => ({
      id: row.goal.id,
      name: row.goal.name,
      done: row.done,
      streak: row.streak,
      color: row.color,
      percent: row.percent,
      label: row.goal.target === 1 ? '' : `${row.value}/${row.goal.target} ${row.goal.unit}`.trim(),
    })),
  );

  /**
   * O que fazer agora: primeiro o que tem prazo apertado, depois o que já está
   * em andamento e o resto por prioridade — para a lista não ficar vazia só
   * porque nada tem data marcada.
   */
  protected readonly focus = computed(() => {
    const dated = [...this.store.overdue(), ...this.store.upcoming()];
    const seen = new Set(dated.map((task) => task.id));

    const rest = this.store
      .tasks()
      .filter((task) => task.status !== 'done' && !seen.has(task.id))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'doing' ? -1 : 1;
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      });

    return [...dated, ...rest].slice(0, 8);
  });

  protected dueLabel(task: Task): string {
    return task.dueDate ? describeDueDate(task.dueDate) : '';
  }

  protected isOverdue(task: Task): boolean {
    return task.dueDate !== null && task.dueDate < todayIso();
  }

  protected colorOf(task: Task): string {
    return this.store.colorOf(task);
  }

  protected categoryName(task: Task): string {
    return this.store.categoryOf(task)?.name ?? 'Sem categoria';
  }
}
