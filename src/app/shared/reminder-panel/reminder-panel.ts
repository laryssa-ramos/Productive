import { Component, inject, signal } from '@angular/core';
import { NotificationService } from '../../core/notifications';

@Component({
  selector: 'app-reminder-panel',
  templateUrl: './reminder-panel.html',
  styleUrl: './reminder-panel.scss',
})
export class ReminderPanel {
  protected readonly notifications = inject(NotificationService);
  protected readonly busy = signal(false);

  protected async enable(): Promise<void> {
    this.busy.set(true);
    await this.notifications.enable();
    this.busy.set(false);
  }

  protected onTime(event: Event): void {
    this.notifications.setTime((event.target as HTMLInputElement).value);
  }
}
