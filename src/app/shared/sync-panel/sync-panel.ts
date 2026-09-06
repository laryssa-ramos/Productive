import { Component, computed, inject, signal } from '@angular/core';
import { SyncService } from '../../core/sync';

@Component({
  selector: 'app-sync-panel',
  templateUrl: './sync-panel.html',
  styleUrl: './sync-panel.scss',
})
export class SyncPanel {
  protected readonly sync = inject(SyncService);
  protected readonly email = signal('');
  protected readonly sending = signal(false);

  protected readonly statusLabel = computed(() => {
    switch (this.sync.status()) {
      case 'syncing':
        return 'sincronizando…';
      case 'synced':
        return this.lastSyncLabel();
      case 'offline':
        return 'sem conexão — salvo aqui';
      case 'error':
        return 'erro ao sincronizar';
      default:
        return '';
    }
  });

  protected onEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const address = this.email().trim();
    if (!address) return;

    this.sending.set(true);
    await this.sync.signIn(address);
    this.sending.set(false);
  }

  protected reset(): void {
    this.sync.status.set('signed-out');
  }

  private lastSyncLabel(): string {
    const at = this.sync.lastSyncAt();
    if (!at) return 'sincronizado';
    return `sincronizado ${at.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
}
