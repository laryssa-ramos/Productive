import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { NotesStore } from './notes-store';
import { Note } from './note-models';
import { SyncService } from './sync';

const NOTES_TABLE = 'productive_notes';
const SYNCED_KEY = 'productive.notes.synced';
const PUSH_DEBOUNCE_MS = 1200;

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Sincroniza notas uma a uma, ao contrário do resto do app que viaja num JSON
 * só. Assim salvar um rascunho não reenvia tarefas e metas junto, e um conflito
 * atinge no máximo a nota em questão.
 */
@Injectable({ providedIn: 'root' })
export class NotesSync {
  private readonly store = inject(NotesStore);
  private readonly sync = inject(SyncService);

  private channel: RealtimeChannel | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** id -> updatedAt que sabemos estar salvo na nuvem. */
  private synced = readSynced();

  readonly saving = signal(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly problem = signal<string | null>(null);

  constructor() {
    effect(() => {
      const userId = this.sync.currentUserId();
      untracked(() => {
        if (userId) void this.start(userId);
        else void this.stop();
      });
    });

    effect(() => {
      // Basta tocar na lista: qualquer edição muda a referência das notas.
      this.store.raw();
      if (!this.sync.currentUserId()) return;
      untracked(() => this.schedulePush());
    });
  }

  private async start(userId: string): Promise<void> {
    await this.pull(userId);
    this.subscribe(userId);
    this.schedulePush();
  }

  private async stop(): Promise<void> {
    if (!this.channel) return;
    await this.channel.unsubscribe();
    this.channel = null;
  }

  private async pull(userId: string): Promise<void> {
    const client = this.sync.getClient();
    if (!client) return;

    const { data, error } = await client
      .from(NOTES_TABLE)
      .select('*')
      .eq('user_id', userId)
      .returns<NoteRow[]>();

    if (error) {
      this.problem.set(error.message);
      return;
    }

    for (const row of data ?? []) {
      const note = fromRow(row);
      this.store.upsertFromRemote(note);
      // O que veio de lá já está lá: não precisa voltar.
      if (this.store.byId(note.id)?.updatedAt === note.updatedAt) {
        this.synced[note.id] = note.updatedAt;
      }
    }
    writeSynced(this.synced);
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DEBOUNCE_MS);
  }

  private async push(): Promise<void> {
    const client = this.sync.getClient();
    const userId = this.sync.currentUserId();
    if (!client || !userId || !navigator.onLine) return;

    const dirty = untracked(() =>
      this.store.raw().filter((note) => this.synced[note.id] !== note.updatedAt),
    );
    if (dirty.length === 0) return;

    this.saving.set(true);
    const { error } = await client
      .from(NOTES_TABLE)
      .upsert(dirty.map((note) => toRow(note, userId)), { onConflict: 'id' });
    this.saving.set(false);

    if (error) {
      this.problem.set(error.message);
      return;
    }

    for (const note of dirty) this.synced[note.id] = note.updatedAt;
    writeSynced(this.synced);
    this.problem.set(null);
    this.lastSavedAt.set(new Date());
  }

  /** Apaga a linha remota de vez. Usado só ao esvaziar a lixeira. */
  async deleteRemote(id: string): Promise<void> {
    const client = this.sync.getClient();
    const userId = this.sync.currentUserId();
    if (!client || !userId) return;

    await client.from(NOTES_TABLE).delete().eq('id', id).eq('user_id', userId);
    delete this.synced[id];
    writeSynced(this.synced);
  }

  private subscribe(userId: string): void {
    const client = this.sync.getClient();
    if (!client || this.channel) return;

    this.channel = client
      .channel('productive-notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: NOTES_TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NoteRow | null;
          if (!row?.id) return;
          const note = fromRow(row);
          if (this.store.upsertFromRemote(note)) {
            this.synced[note.id] = note.updatedAt;
            writeSynced(this.synced);
          }
        },
      )
      .subscribe();
  }
}

function toRow(note: Note, userId: string): NoteRow {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    body: note.body,
    category_id: note.categoryId,
    status: note.status,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
  };
}

function fromRow(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title ?? '',
    body: row.body ?? '',
    categoryId: row.category_id,
    status: (row.status as Note['status']) ?? 'idea',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readSynced(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSynced(map: Record<string, string>): void {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify(map));
  } catch {
    // Sem persistência do marcador: no máximo reenviamos notas já salvas.
  }
}
