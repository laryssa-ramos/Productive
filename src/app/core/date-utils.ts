/** Data local (não UTC) no formato yyyy-mm-dd. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Converte yyyy-mm-dd para Date local à meia-noite. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Diferença em dias inteiros: positivo quando `iso` está no futuro. */
export function daysUntil(iso: string, from = todayIso()): number {
  const ms = fromIsoDate(iso).getTime() - fromIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** "Hoje", "Amanhã", "Atrasada há 3 dias"… para exibir o prazo. */
export function describeDueDate(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff < 0) return `${Math.abs(diff)} dias atrás`;
  if (diff <= 7) return `Em ${diff} dias`;
  return formatDate(iso);
}
