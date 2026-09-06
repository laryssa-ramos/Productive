import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { marked } from 'marked';
import { NotesStore } from '../../core/notes-store';
import { NotesSync } from '../../core/notes-sync';
import { ProductivityStore } from '../../core/productivity-store';
import { UiService } from '../../core/ui';
import {
  countWords,
  Note,
  NOTE_STATUS_LABELS,
  NOTE_STATUS_ORDER,
  NoteStatus,
  readingMinutes,
} from '../../core/note-models';

type Format = 'bold' | 'italic' | 'heading' | 'list' | 'quote' | 'code' | 'link';
type StatusFilter = 'all' | NoteStatus;

@Component({
  selector: 'app-writing',
  templateUrl: './writing.html',
  styleUrl: './writing.scss',
})
export class WritingPage implements OnDestroy {
  protected readonly notes = inject(NotesStore);
  protected readonly notesSync = inject(NotesSync);
  protected readonly store = inject(ProductivityStore);
  protected readonly ui = inject(UiService);

  protected readonly statusOrder = NOTE_STATUS_ORDER;
  protected readonly statusLabels = NOTE_STATUS_LABELS;

  protected readonly selectedId = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly preview = signal(false);
  protected readonly showTrash = signal(false);

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    return this.notes.notes().filter((note) => {
      if (status !== 'all' && note.status !== status) return false;
      if (!query) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(query);
    });
  });

  protected readonly selected = computed<Note | null>(() => {
    const id = this.selectedId();
    const fromId = id ? (this.notes.notes().find((note) => note.id === id) ?? null) : null;
    // Sem seleção explícita, abre a mais recente — a tela nunca nasce vazia.
    return fromId ?? this.visible()[0] ?? null;
  });

  protected readonly rendered = computed(() => {
    const note = this.selected();
    // O Angular sanitiza o HTML no [innerHTML], então nada de script passa.
    return note ? (marked.parse(note.body) as string) : '';
  });

  protected readonly stats = computed(() => {
    const note = this.selected();
    const words = note ? countWords(note.body) : 0;
    return { words, minutes: readingMinutes(words) };
  });

  /** Sair da escrita sempre devolve o menu — senão o app ficaria sem navegação. */
  ngOnDestroy(): void {
    this.ui.focusMode.set(false);
  }

  // ------------------------------------------------------------------- edição

  protected select(note: Note): void {
    this.selectedId.set(note.id);
    this.preview.set(false);
  }

  protected create(): void {
    const note = this.notes.create();
    this.selectedId.set(note.id);
    this.preview.set(false);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onTitle(event: Event): void {
    const note = this.selected();
    if (note) this.notes.update(note.id, { title: (event.target as HTMLInputElement).value });
  }

  protected onBody(event: Event): void {
    const note = this.selected();
    if (note) this.notes.update(note.id, { body: (event.target as HTMLTextAreaElement).value });
  }

  protected onStatus(event: Event): void {
    const note = this.selected();
    if (note) {
      this.notes.update(note.id, {
        status: (event.target as HTMLSelectElement).value as NoteStatus,
      });
    }
  }

  protected onCategory(event: Event): void {
    const note = this.selected();
    if (note) {
      this.notes.update(note.id, { categoryId: (event.target as HTMLSelectElement).value || null });
    }
  }

  protected remove(note: Note): void {
    if (!confirm(`Mover "${note.title || 'Sem título'}" para a lixeira?`)) return;
    this.notes.remove(note.id);
    this.selectedId.set(null);
  }

  protected async purge(note: Note): Promise<void> {
    if (!confirm('Excluir de vez? Isso não dá para desfazer.')) return;
    await this.notesSync.deleteRemote(note.id);
    this.notes.purge(note.id);
  }

  protected download(note: Note): void {
    const name = slug(note.title) || 'nota';
    const blob = new Blob([`# ${note.title}\n\n${note.body}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Cria uma tarefa a partir da nota, para a ideia virar compromisso. */
  protected toTask(note: Note): void {
    this.store.addTask({
      title: note.title || 'Escrever rascunho',
      notes: 'Veio da área de escrita.',
      categoryId: note.categoryId,
      status: 'todo',
      priority: 'medium',
      dueDate: null,
    });
    this.notes.update(note.id, { status: 'draft' });
  }

  // -------------------------------------------------------------- formatação

  protected format(kind: Format): void {
    const note = this.selected();
    const area = this.editor()?.nativeElement;
    if (!note || !area) return;

    const { selectionStart: start, selectionEnd: end, value } = area;
    const picked = value.slice(start, end);
    const { text, caret } = applyFormat(kind, picked);

    this.notes.update(note.id, { body: value.slice(0, start) + text + value.slice(end) });

    // O valor só chega ao textarea no próximo ciclo; o cursor vai junto.
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(start + caret, start + caret + picked.length);
    });
  }

  // ---------------------------------------------------------------------- util

  protected categoryName(note: Note): string {
    if (!note.categoryId) return 'Sem categoria';
    return this.store.categoryMap().get(note.categoryId)?.name ?? 'Sem categoria';
  }

  protected categoryColor(note: Note): string {
    if (!note.categoryId) return '#8a8a85';
    return this.store.categoryMap().get(note.categoryId)?.color ?? '#8a8a85';
  }

  protected excerpt(note: Note): string {
    const clean = note.body
      .replace(/[#*`>\[\]()_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 90);
  }

  protected when(note: Note): string {
    return new Date(note.updatedAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  }
}

/** Devolve o texto formatado e onde o cursor deve cair depois. */
function applyFormat(kind: Format, picked: string): { text: string; caret: number } {
  switch (kind) {
    case 'bold':
      return { text: `**${picked}**`, caret: 2 };
    case 'italic':
      return { text: `*${picked}*`, caret: 1 };
    case 'code':
      return { text: '`' + picked + '`', caret: 1 };
    case 'link':
      return { text: `[${picked}](url)`, caret: 1 };
    case 'heading':
      return { text: `## ${picked}`, caret: 3 };
    case 'quote':
      return { text: `> ${picked}`, caret: 2 };
    case 'list':
      return {
        text: picked ? picked.split('\n').map((line) => `- ${line}`).join('\n') : '- ',
        caret: 2,
      };
  }
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
