import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiService {
  /** Modo foco: a casca do app some para sobrar tela para escrever. */
  readonly focusMode = signal(false);
}
