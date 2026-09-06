import { Injectable, signal } from '@angular/core';

/**
 * Reconhecimento de fala do próprio navegador (Web Speech API). Não custa nada e
 * não passa por servidor nosso — mas não existe em todo navegador, daí a
 * detecção de recurso em vez de assumir que está lá.
 */

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}

interface SpeechEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}

interface SpeechErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Permissão de microfone negada. Libere nas configurações do site.',
  'service-not-allowed': 'O navegador bloqueou o reconhecimento de fala.',
  'no-speech': 'Não ouvi nada. Tente de novo mais perto do microfone.',
  network: 'O reconhecimento de fala precisa de internet.',
  'audio-capture': 'Nenhum microfone encontrado.',
};

@Injectable({ providedIn: 'root' })
export class DictationService {
  readonly supported = getConstructor() !== null;

  readonly listening = signal(false);
  /** O que está sendo dito agora, ainda não confirmado pelo reconhecedor. */
  readonly interim = signal('');
  readonly error = signal<string | null>(null);

  private recognition: SpeechRecognitionLike | null = null;
  /** Ligado enquanto o usuário quer ditar — usado para religar sozinho. */
  private wanted = false;

  start(onFinal: (text: string) => void): void {
    const Ctor = getConstructor();
    if (!Ctor || this.listening()) return;

    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) onFinal(text.trim());
        else pending += text;
      }
      this.interim.set(pending.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" é rotina numa pausa longa; não vale interromper por isso.
      if (event.error === 'no-speech') return;
      this.error.set(MESSAGES[event.error] ?? 'Não foi possível ouvir agora.');
      this.wanted = false;
    };

    recognition.onend = () => {
      this.interim.set('');
      // O navegador encerra sozinho em pausas: religa enquanto ela quiser ditar.
      if (this.wanted) {
        try {
          recognition.start();
          return;
        } catch {
          // Já reiniciado ou bloqueado: cai para o estado parado.
        }
      }
      this.listening.set(false);
    };

    this.recognition = recognition;
    this.wanted = true;
    this.error.set(null);

    try {
      recognition.start();
      this.listening.set(true);
    } catch {
      this.error.set('Não foi possível iniciar o microfone.');
      this.wanted = false;
    }
  }

  stop(): void {
    this.wanted = false;
    this.recognition?.stop();
    this.listening.set(false);
    this.interim.set('');
  }
}
