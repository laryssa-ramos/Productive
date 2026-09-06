import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductivityStore } from '../../core/productivity-store';
import { Category, CATEGORY_COLORS } from '../../core/models';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class CategoriesPage {
  protected readonly store = inject(ProductivityStore);
  private readonly fb = inject(FormBuilder);

  protected readonly palette = CATEGORY_COLORS;
  protected readonly editingId = signal<string | null>(null);
  protected readonly color = signal<string>(this.store.suggestColor());
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
  });

  protected readonly rows = computed(() =>
    this.store.categoryStats().filter((row) => row.category !== null),
  );

  protected pickColor(color: string): void {
    this.color.set(color);
  }

  protected edit(category: Category): void {
    this.editingId.set(category.id);
    this.color.set(category.color);
    this.form.setValue({ name: category.name });
    this.error.set(null);
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.form.reset({ name: '' });
    this.color.set(this.store.suggestColor());
    this.error.set(null);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const name = this.form.getRawValue().name.trim();
    const editingId = this.editingId();
    const duplicated = this.store
      .categories()
      .some((category) => category.id !== editingId && category.name.toLowerCase() === name.toLowerCase());

    if (duplicated) {
      this.error.set('Já existe uma categoria com esse nome.');
      return;
    }

    if (editingId) {
      this.store.updateCategory(editingId, name, this.color());
    } else {
      this.store.addCategory(name, this.color());
    }
    this.cancel();
  }

  protected remove(category: Category): void {
    const count = this.store.countByCategory(category.id);
    const message =
      count === 0
        ? `Excluir a categoria "${category.name}"?`
        : `Excluir "${category.name}"? ${count} tarefa(s) ficarão sem categoria.`;
    if (!confirm(message)) return;
    if (this.editingId() === category.id) this.cancel();
    this.store.deleteCategory(category.id);
  }
}
