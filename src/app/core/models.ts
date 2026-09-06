export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Category {
  id: string;
  name: string;
  /** Cor da categoria (hex). Sempre um dos slots de CATEGORY_COLORS. */
  color: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  categoryId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Data no formato yyyy-mm-dd, ou null quando não há prazo. */
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AppData {
  version: number;
  categories: Category[];
  tasks: Task[];
  /** Momento da última alteração — é o que decide quem vence na sincronização. */
  updatedAt: string;
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Concluída',
};

export const PRIORITY_ORDER: TaskPriority[] = ['high', 'medium', 'low'];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

/**
 * Paleta categórica validada para daltonismo (Delta E CVD >= 8 entre pares
 * adjacentes) nos modos claro e escuro. A ordem dos slots é o mecanismo de
 * segurança — não embaralhe.
 */
export const CATEGORY_COLORS = [
  '#2a78d6', // azul
  '#eb6834', // laranja
  '#1baf7a', // água
  '#eda100', // amarelo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // vermelho
] as const;

export const UNCATEGORIZED_COLOR = '#8a8a85';
