/**
 * Notas vivem fora do JSON principal do app: cada uma é uma linha própria, no
 * localStorage e no Supabase. Texto longo não cabe no mesmo pacote de tarefas e
 * metas — sincronizar tudo a cada tecla seria lento, e um conflito custaria a
 * escrita inteira em vez de uma nota só.
 */
export type NoteStatus = 'idea' | 'draft' | 'ready' | 'published';

export interface Note {
  id: string;
  title: string;
  /** Corpo em Markdown. */
  body: string;
  categoryId: string | null;
  status: NoteStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * Lápide: apagar de vez impediria a exclusão de chegar no outro aparelho —
   * ele simplesmente reenviaria a nota de volta.
   */
  deletedAt: string | null;
}

export const NOTE_STATUS_ORDER: NoteStatus[] = ['idea', 'draft', 'ready', 'published'];

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  idea: 'Ideia',
  draft: 'Rascunho',
  ready: 'Pronto',
  published: 'Publicado',
};

/** Média de leitura em português, usada para estimar o tempo. */
const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const clean = text.trim();
  return clean === '' ? 0 : clean.split(/\s+/).length;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
