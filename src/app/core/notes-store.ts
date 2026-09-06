import { computed, effect, Injectable, signal } from '@angular/core';
import { Note, NoteStatus } from './note-models';

const STORAGE_KEY = 'productive.notes.v1';

export interface NotePatch {
  title?: string;
  body?: string;
  categoryId?: string | null;
  status?: NoteStatus;
}

@Injectable({ providedIn: 'root' })
export class NotesStore {
  private readonly _notes = signal<Note[]>([]);

  /** Inclui lápides — só a sincronização usa esta lista. */
  readonly raw = this._notes.asReadonly();

  /** O que a interface mostra: sem excluídas, mais recente primeiro. */
  readonly notes = computed(() =>
    this._notes()
      .filter((note) => note.deletedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  readonly trashed = computed(() =>
    this._notes()
      .filter((note) => note.deletedAt !== null)
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
  );

  constructor() {
    this._notes.set(this.read());

    effect(() => {
      const notes = this._notes();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      } catch {
        // Cota estourada: segue em memória nesta sessão.
      }
    });
  }

  byId(id: string): Note | undefined {
    return this._notes().find((note) => note.id === id);
  }

  create(): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      categoryId: null,
      status: 'idea',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this._notes.update((notes) => [note, ...notes]);
    return note;
  }

  update(id: string, patch: NotePatch): void {
    this._notes.update((notes) =>
      notes.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note,
      ),
    );
  }

  /** Exclusão suave: a lápide é o que leva a remoção ao outro aparelho. */
  remove(id: string): void {
    const now = new Date().toISOString();
    this._notes.update((notes) =>
      notes.map((note) =>
        note.id === id ? { ...note, deletedAt: now, updatedAt: now } : note,
      ),
    );
  }

  restore(id: string): void {
    this._notes.update((notes) =>
      notes.map((note) =>
        note.id === id ? { ...note, deletedAt: null, updatedAt: new Date().toISOString() } : note,
      ),
    );
  }

  /** Some do aparelho. A sincronização apaga a linha remota junto. */
  purge(id: string): void {
    this._notes.update((notes) => notes.filter((note) => note.id !== id));
  }

  /** Adota uma nota vinda da nuvem, se for mais nova que a local. */
  upsertFromRemote(incoming: Note): boolean {
    const current = this.byId(incoming.id);
    if (current && current.updatedAt >= incoming.updatedAt) return false;

    this._notes.update((notes) =>
      current
        ? notes.map((note) => (note.id === incoming.id ? incoming : note))
        : [incoming, ...notes],
    );
    return true;
  }

  private read(): Note[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Note[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
