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

/**
 * Meta diária: diferente de uma tarefa, ela não é concluída de vez — volta nos
 * dias em que vale e o que importa é a constância.
 */
export interface Goal {
  id: string;
  name: string;
  categoryId: string | null;
  /** Alvo do dia. 1 = meta simples, só marcar como feita. */
  target: number;
  /** Unidade mostrada ao lado do número ("L", "min", "páginas"). */
  unit: string;
  /** Dias da semana em que a meta vale: 0 = domingo … 6 = sábado. */
  days: number[];
  createdAt: string;
  /** Arquivar em vez de excluir preserva o histórico já registrado. */
  archivedAt: string | null;
}

/** Quanto foi feito de uma meta num dia. Só existe registro para dias tocados. */
export interface GoalLog {
  goalId: string;
  /** yyyy-mm-dd */
  date: string;
  value: number;
}

/**
 * Pendência solta: qualquer coisa que precisa ser feita mas não merece — nem
 * comporta — categoria, prazo ou prioridade. Existe para ser despejada sem
 * pensar, e é daqui que sai o sorteio do dia.
 */
export interface PendingItem {
  id: string;
  text: string;
  createdAt: string;
  doneAt: string | null;
  /** Última vez que foi sorteada — usado para não repetir a mesma seguidamente. */
  lastDrawnAt: string | null;
  /** Dias (yyyy-mm-dd) em que você disse "agora não". */
  skippedDates: string[];
}

/** A pendência escolhida para um dia. Fica gravada para não trocar a cada reload. */
export interface DailyDraw {
  date: string;
  itemId: string;
}

/**
 * Projeto: uma frente de trabalho em aberto. Sem prazo, sem tarefas penduradas —
 * existe só para você (e o painel) lembrarem no que você está metida agora.
 */
export type ProjectStatus = 'active' | 'paused' | 'done';

/** Subtópico de um projeto: uma parte dele. Marcado fica marcado — não zera. */
export interface ProjectItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** Uma linha opcional dizendo o que é. */
  note: string;
  status: ProjectStatus;
  color: string;
  items: ProjectItem[];
  createdAt: string;
}

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['active', 'paused', 'done'];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Em andamento',
  paused: 'Pausado',
  done: 'Concluído',
};

/**
 * Rotina em blocos: um nome ("Manhã", "Antes de gravar") e uma lista de coisas
 * dentro. Sem horário — a ordem é a sua, não a do relógio.
 */
export interface RoutineItem {
  id: string;
  text: string;
  /**
   * Dia (yyyy-mm-dd) em que o item foi marcado. Guardar a data em vez de um
   * booleano faz a rotina se limpar sozinha na virada do dia.
   */
  checkedOn: string | null;
}

export interface RoutineBlock {
  id: string;
  name: string;
  items: RoutineItem[];
  createdAt: string;
}

/**
 * Ideia solta: qualquer coisa que passou pela cabeça e vale guardar. Diferente
 * de uma pendência, ninguém precisa fazer — ela fica até virar algo ou ser
 * arquivada. O "Repertório" da Escrita é o primo dela, restrito a pauta.
 */
export interface Idea {
  id: string;
  text: string;
  createdAt: string;
  /** Guardada: sai da lista principal sem perder o registro. */
  archivedAt: string | null;
}

export interface AppData {
  version: number;
  categories: Category[];
  tasks: Task[];
  goals: Goal[];
  goalLogs: GoalLog[];
  pending: PendingItem[];
  draw: DailyDraw | null;
  projects: Project[];
  routines: RoutineBlock[];
  ideas: Idea[];
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

/** Índice = getDay() do JavaScript: 0 é domingo. */
export const WEEKDAYS = [
  { value: 0, short: 'D', label: 'domingo' },
  { value: 1, short: 'S', label: 'segunda' },
  { value: 2, short: 'T', label: 'terça' },
  { value: 3, short: 'Q', label: 'quarta' },
  { value: 4, short: 'Q', label: 'quinta' },
  { value: 5, short: 'S', label: 'sexta' },
  { value: 6, short: 'S', label: 'sábado' },
] as const;

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
