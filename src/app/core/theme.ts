import { effect, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'productive.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(readStoredMode());

  constructor() {
    effect(() => {
      const mode = this.mode();
      const root = document.documentElement;
      if (mode === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', mode);
      }
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Sem persistência de tema: o app segue no modo escolhido nesta sessão.
      }
    });
  }

  /** Alterna entre claro e escuro; a partir de "system" segue o oposto do atual. */
  toggle(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = this.mode() === 'system' ? (prefersDark ? 'dark' : 'light') : this.mode();
    this.mode.set(current === 'dark' ? 'light' : 'dark');
  }
}

/** Sem preferência salva, o app nasce escuro — é o visual escolhido para ele. */
function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'dark';
  } catch {
    return 'dark';
  }
}
