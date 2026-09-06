import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { describeDueDate, fromIsoDate, todayIso } from '../../core/date-utils';
import { PRIORITY_LABELS, STATUS_LABELS, Task } from '../../core/models';

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

  protected readonly focus = computed(() => [
    ...this.store.overdue(),
    ...this.store.upcoming(),
  ].slice(0, 6));

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
