import { Component, inject, signal } from '@angular/core';
import { SyncService } from '../../core/sync';
import { ThemeService } from '../../core/theme';

/**
 * Porteiro do app. Não guarda senha nenhuma no código — quem valida é o
 * Supabase, o mesmo login que já sincroniza seus aparelhos.
 */
@Component({
  selector: 'app-login-screen',
  templateUrl: './login-screen.html',
  styleUrl: './login-screen.scss',
})
export class LoginScreen {
  protected readonly sync = inject(SyncService);
  protected readonly theme = inject(ThemeService);

  protected readonly email = signal('');
  protected readonly sending = signal(false);

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

  protected useAnotherEmail(): void {
    this.sync.status.set('signed-out');
  }
}
