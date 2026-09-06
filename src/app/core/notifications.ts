import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ProductivityStore } from './productivity-store';
import { todayIso } from './date-utils';

const ENABLED_KEY = 'productive.reminder.enabled';
const TIME_KEY = 'productive.reminder.time';
const LAST_KEY = 'productive.reminder.last';

/** De quanto em quanto tempo conferimos se deu a hora. */
const TICK_MS = 60_000;
/**
 * Só avisa dentro desta janela depois do horário. Sem isso, abrir o app às 22h
 * com lembrete marcado para as 9h dispararia um aviso atrasado e inútil.
 */
const WINDOW_MINUTES = 120;

interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly store = inject(ProductivityStore);

  readonly supported = typeof Notification !== 'undefined';
  readonly permission = signal<NotificationPermission>(
    this.supported ? Notification.permission : 'denied',
  );
  readonly enabled = signal(read(ENABLED_KEY) === 'true');
  readonly time = signal(read(TIME_KEY) ?? '09:00');

  /** O que ainda falta hoje — vira o texto do aviso e o número no ícone. */
  readonly pendingToday = computed(() => {
    const goals = this.store.goalSummary();
    const today = todayIso();
    const tasks = this.store
      .tasks()
      .filter(
        (task) => task.status !== 'done' && task.dueDate !== null && task.dueDate <= today,
      ).length;
    const draw = this.store.drawnToday();

    return {
      goals: goals.scheduled - goals.done,
      tasks,
      draw,
      total: goals.scheduled - goals.done + tasks + (draw ? 1 : 0),
    };
  });

  readonly active = computed(() => this.enabled() && this.permission() === 'granted');

  constructor() {
    effect(() => this.updateBadge(this.pendingToday().total));

    if (!this.supported) return;

    setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.tick();
    });
  }

  /** Precisa vir de um clique: o navegador ignora pedidos automáticos. */
  async enable(): Promise<void> {
    if (!this.supported) return;

    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    this.permission.set(permission);
    if (permission !== 'granted') return;

    this.enabled.set(true);
    write(ENABLED_KEY, 'true');
    // Se o horário de hoje já passou, o primeiro aviso fica para amanhã.
    if (this.minutesSinceTarget() >= 0) write(LAST_KEY, todayIso());
  }

  disable(): void {
    this.enabled.set(false);
    write(ENABLED_KEY, 'false');
  }

  setTime(value: string): void {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    this.time.set(value);
    write(TIME_KEY, value);
  }

  /** Dispara o aviso agora, para você conferir como ele chega. */
  async preview(): Promise<void> {
    await this.show('Productive', this.buildBody() ?? 'Nada pendente por aqui. Bom dia.');
  }

  // ------------------------------------------------------------------ interno

  private tick(): void {
    if (!this.active()) return;
    if (read(LAST_KEY) === todayIso()) return;

    const elapsed = this.minutesSinceTarget();
    if (elapsed < 0 || elapsed > WINDOW_MINUTES) return;

    const body = this.buildBody();
    if (!body) return; // Nada a dizer: melhor não interromper.

    write(LAST_KEY, todayIso());
    void this.show('Seu dia no Productive', body);
  }

  /** Minutos desde o horário marcado hoje. Negativo quando ainda não deu a hora. */
  private minutesSinceTarget(): number {
    const [hours, minutes] = this.time().split(':').map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() - (hours * 60 + minutes);
  }

  private buildBody(): string | null {
    const { goals, tasks, draw } = this.pendingToday();
    const parts: string[] = [];

    if (draw) parts.push(`Sua vez: ${draw.text}`);
    if (goals > 0) parts.push(`${goals} meta${goals > 1 ? 's' : ''} para cumprir`);
    if (tasks > 0) parts.push(`${tasks} tarefa${tasks > 1 ? 's' : ''} vencendo`);

    return parts.length > 0 ? parts.join(' · ') : null;
  }

  private async show(title: string, body: string): Promise<void> {
    if (this.permission() !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/icon-96x96.png',
      tag: 'productive-daily',
      // Lido pelo service worker do Angular para abrir o app no clique.
      data: {
        onActionClick: {
          default: { operation: 'navigateLastFocusedOrOpen', url: '/painel' },
        },
      },
    };

    // Pelo service worker é mais confiável no celular; sem ele, cai no direto.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  }

  private updateBadge(count: number): void {
    const nav = navigator as Navigator & BadgeNavigator;
    try {
      if (count > 0) void nav.setAppBadge?.(count);
      else void nav.clearAppBadge?.();
    } catch {
      // Plataforma sem badge: não é motivo para quebrar nada.
    }
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem persistência: a preferência vale só nesta sessão.
  }
}
