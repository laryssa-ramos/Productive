import { Component, inject, signal, viewChild, ElementRef } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProductivityStore } from './core/productivity-store';
import { NotificationService } from './core/notifications';
import { SyncService } from './core/sync';
import { ThemeService } from './core/theme';
import { ReminderPanel } from './shared/reminder-panel/reminder-panel';
import { SyncPanel } from './shared/sync-panel/sync-panel';
import { toIsoDate } from './core/date-utils';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SyncPanel, ReminderPanel],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(ProductivityStore);
  protected readonly theme = inject(ThemeService);
  protected readonly sync = inject(SyncService);
  // Injetado para o serviço existir desde o início: ele cuida do badge do ícone.
  private readonly notifications = inject(NotificationService);

  protected readonly menuOpen = signal(false);
  protected readonly notice = signal<string | null>(null);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    // Sem configuração do Supabase isto retorna na hora e o app segue só local.
    void this.sync.init();
  }

  protected exportData(): void {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `productive-${toIsoDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.flash('Backup exportado.');
  }

  protected pickFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!confirm('Importar substitui todas as tarefas e categorias atuais. Continuar?')) return;

    try {
      this.store.importJson(await file.text());
      this.flash('Dados importados.');
    } catch {
      this.flash('Não foi possível ler esse arquivo.');
    }
  }

  protected resetAll(): void {
    if (!confirm('Apagar todas as tarefas e voltar às categorias iniciais?')) return;
    this.store.resetAll();
    this.flash('Tudo apagado.');
  }

  private flash(message: string): void {
    this.notice.set(message);
    setTimeout(() => this.notice.set(null), 3000);
  }
}
