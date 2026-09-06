import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import { ProductivityStore } from './productivity-store';
import { AppData } from './models';
import { SUPABASE_ANON_KEY, SUPABASE_URL, SYNC_TABLE, syncEnabled } from './supabase-config';

export type SyncStatus =
  | 'disabled'
  | 'signed-out'
  | 'link-sent'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

/** Espera antes de enviar: evita um POST por tecla digitada. */
const PUSH_DEBOUNCE_MS = 900;

interface RemoteRow {
  data: AppData;
  updated_at: string;
}

/**
 * Espelha o estado local num registro do Supabase — um por usuário, guardando o
 * JSON inteiro. Quem tem o carimbo de tempo mais novo vence; para um app pessoal
 * isso resolve sem a complexidade de mesclar campo a campo.
 *
 * O localStorage continua sendo a fonte imediata: sem internet ou sem login o
 * app funciona igual, e o que ficou pendente sobe assim que dá.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly store = inject(ProductivityStore);

  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Último carimbo que sabemos estar salvo na nuvem. */
  private lastSyncedAt = '';

  readonly enabled = syncEnabled();
  /** Quem está logado — outras camadas de sincronização se penduram nisto. */
  readonly currentUserId = signal<string | null>(null);
  readonly status = signal<SyncStatus>(this.enabled ? 'signed-out' : 'disabled');
  readonly email = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly lastSyncAt = signal<Date | null>(null);

  constructor() {
    effect(() => {
      const updatedAt = this.store.updatedAt();
      if (!this.userId || updatedAt === this.lastSyncedAt) return;
      untracked(() => this.schedulePush());
    });
  }

  async init(): Promise<void> {
    if (!this.enabled) return;

    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    this.client.auth.onAuthStateChange((_event, session) => {
      // O supabase-js segura um lock enquanto roda este callback; consultar o
      // banco aqui dentro trava. Por isso o trabalho sai da pilha antes.
      setTimeout(() => void this.onSession(session), 0);
    });

    const { data } = await this.client.auth.getSession();
    await this.onSession(data.session);

    window.addEventListener('online', () => void this.refresh());
    window.addEventListener('offline', () => this.status.set('offline'));
  }

  /** O mesmo cliente é reaproveitado pelas notas, para não abrir duas sessões. */
  getClient(): SupabaseClient | null {
    return this.client;
  }

  // ----------------------------------------------------------------- sessão

  async signIn(email: string): Promise<void> {
    if (!this.client) return;
    this.message.set(null);

    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      this.fail(error.message);
      return;
    }
    this.email.set(email.trim());
    this.status.set('link-sent');
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    await this.client.auth.signOut();
    // Os dados continuam no aparelho; sair só interrompe o espelhamento.
  }

  private async onSession(session: Session | null): Promise<void> {
    if (!session) {
      this.userId = null;
      this.currentUserId.set(null);
      this.email.set(null);
      this.lastSyncedAt = '';
      await this.unsubscribe();
      this.status.set('signed-out');
      return;
    }

    this.userId = session.user.id;
    this.currentUserId.set(session.user.id);
    this.email.set(session.user.email ?? null);
    await this.pull();
    this.subscribe();
  }

  // ------------------------------------------------------------ leitura/escrita

  /** Puxa a nuvem e decide quem vence. Também serve de "atualizar agora". */
  async refresh(): Promise<void> {
    if (!this.userId) return;
    await this.pull();
  }

  private async pull(): Promise<void> {
    if (!this.client || !this.userId) return;
    this.status.set('syncing');

    const { data, error } = await this.client
      .from(SYNC_TABLE)
      .select('data, updated_at')
      .eq('user_id', this.userId)
      .maybeSingle<RemoteRow>();

    if (error) {
      this.fail(error.message);
      return;
    }

    if (!data) {
      // Primeiro acesso desta conta: a nuvem começa com o que existe aqui.
      await this.push();
      return;
    }

    const remote = data.data;
    const local = this.store.snapshot();

    if (this.store.isPristine() || remote.updatedAt > local.updatedAt) {
      this.store.applyRemote(remote);
      this.settle(remote.updatedAt);
    } else if (local.updatedAt > remote.updatedAt) {
      await this.push();
    } else {
      this.settle(local.updatedAt);
    }
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DEBOUNCE_MS);
  }

  private async push(): Promise<void> {
    if (!this.client || !this.userId) return;

    if (!navigator.onLine) {
      this.status.set('offline');
      return;
    }

    const snapshot = untracked(() => this.store.snapshot());
    this.status.set('syncing');

    const { error } = await this.client.from(SYNC_TABLE).upsert(
      {
        user_id: this.userId,
        data: snapshot,
        updated_at: snapshot.updatedAt,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      this.fail(error.message);
      return;
    }
    this.settle(snapshot.updatedAt);
  }

  // ------------------------------------------------------------------ realtime

  private subscribe(): void {
    if (!this.client || !this.userId || this.channel) return;

    this.channel = this.client
      .channel('productive-state')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: SYNC_TABLE,
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) => {
          const row = payload.new as Partial<RemoteRow> | null;
          const remote = row?.data;
          if (!remote || remote.updatedAt <= this.store.updatedAt()) return;
          this.store.applyRemote(remote);
          this.settle(remote.updatedAt);
        },
      )
      .subscribe();
  }

  private async unsubscribe(): Promise<void> {
    if (!this.channel) return;
    await this.channel.unsubscribe();
    this.channel = null;
  }

  private settle(updatedAt: string): void {
    this.lastSyncedAt = updatedAt;
    this.lastSyncAt.set(new Date());
    this.message.set(null);
    this.status.set('synced');
  }

  private fail(message: string): void {
    this.message.set(message);
    this.status.set('error');
  }
}
