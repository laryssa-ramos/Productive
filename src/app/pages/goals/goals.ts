import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GoalDraft, ProductivityStore } from '../../core/productivity-store';
import { todayIso } from '../../core/date-utils';
import { EVERY_DAY, Goal, WEEKDAYS } from '../../core/models';

@Component({
  selector: 'app-goals',
  imports: [ReactiveFormsModule],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
})
export class GoalsPage {
  protected readonly store = inject(ProductivityStore);
  private readonly fb = inject(FormBuilder);

  protected readonly weekdays = WEEKDAYS;
  protected readonly today = todayIso();
  protected readonly todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly days = signal<number[]>([...EVERY_DAY]);
  protected readonly showArchived = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    categoryId: [''],
    hasTarget: [false],
    target: [1, [Validators.min(1)]],
    unit: [''],
  });

  /** Cada meta ativa com o histórico recente já resolvido. */
  protected readonly rows = computed(() =>
    this.store.activeGoals().map((goal) => ({
      goal,
      history: this.store.historyOf(goal),
      streak: this.store.streakOf(goal),
      best: this.store.bestStreakOf(goal),
      color: this.colorOf(goal),
      categoryName: this.categoryName(goal),
      daysLabel: this.daysLabel(goal),
    })),
  );

  // ------------------------------------------------------------------ registro

  protected toggle(goal: Goal): void {
    this.store.toggleGoal(goal.id, this.today);
  }

  protected bump(goal: Goal, delta: number): void {
    this.store.bumpGoal(goal.id, this.today, delta);
  }

  // ---------------------------------------------------------------- formulário

  protected openNew(): void {
    this.editingId.set(null);
    this.days.set([...EVERY_DAY]);
    this.form.reset({
      name: '',
      categoryId: this.store.categories()[0]?.id ?? '',
      hasTarget: false,
      target: 1,
      unit: '',
    });
    this.formOpen.set(true);
  }

  protected openEdit(goal: Goal): void {
    this.editingId.set(goal.id);
    this.days.set([...goal.days]);
    this.form.reset({
      name: goal.name,
      categoryId: goal.categoryId ?? '',
      hasTarget: goal.target > 1,
      target: goal.target,
      unit: goal.unit,
    });
    this.formOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  protected toggleDay(day: number): void {
    this.days.update((days) =>
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort(),
    );
  }

  protected selectEveryDay(): void {
    this.days.set([...EVERY_DAY]);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const draft: GoalDraft = {
      name: value.name,
      categoryId: value.categoryId || null,
      target: value.hasTarget ? value.target : 1,
      unit: value.hasTarget ? value.unit : '',
      days: this.days(),
    };

    const editingId = this.editingId();
    if (editingId) {
      this.store.updateGoal(editingId, draft);
    } else {
      this.store.addGoal(draft);
    }
    this.closeForm();
  }

  protected archive(goal: Goal): void {
    if (!confirm(`Arquivar "${goal.name}"? O histórico é preservado.`)) return;
    if (this.editingId() === goal.id) this.closeForm();
    this.store.archiveGoal(goal.id);
  }

  protected remove(goal: Goal): void {
    if (!confirm(`Excluir "${goal.name}" e todo o histórico dela? Não dá para desfazer.`)) return;
    this.store.deleteGoal(goal.id);
  }

  // ---------------------------------------------------------------------- util

  protected colorOf(goal: Goal): string {
    return goal.categoryId
      ? (this.store.categoryMap().get(goal.categoryId)?.color ?? '#8a8a85')
      : '#8a8a85';
  }

  protected categoryName(goal: Goal): string {
    return goal.categoryId
      ? (this.store.categoryMap().get(goal.categoryId)?.name ?? 'Sem categoria')
      : 'Sem categoria';
  }

  protected daysLabel(goal: Goal): string {
    if (goal.days.length === 7) return 'todos os dias';
    if (goal.days.length === 5 && goal.days.every((day) => day >= 1 && day <= 5)) {
      return 'dias úteis';
    }
    if (goal.days.length === 2 && goal.days.includes(0) && goal.days.includes(6)) {
      return 'fins de semana';
    }
    return goal.days.map((day) => WEEKDAYS[day].label.slice(0, 3)).join(', ');
  }

  protected dayTitle(date: string, value: number, target: number, scheduled: boolean): string {
    const label = new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
    if (!scheduled) return `${label}: não vale neste dia`;
    return target === 1
      ? `${label}: ${value >= 1 ? 'cumprida' : 'não cumprida'}`
      : `${label}: ${value} de ${target}`;
  }
}
