import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'painel',
    title: 'Painel · Productive',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'tarefas',
    title: 'Tarefas · Productive',
    loadComponent: () => import('./pages/tasks/tasks').then((m) => m.TasksPage),
  },
  {
    path: 'escrita',
    title: 'Escrita · Productive',
    loadComponent: () => import('./pages/writing/writing').then((m) => m.WritingPage),
  },
  {
    path: 'sorteio',
    title: 'Sorteio · Productive',
    loadComponent: () => import('./pages/draw/draw').then((m) => m.DrawPage),
  },
  {
    path: 'metas',
    title: 'Metas diárias · Productive',
    loadComponent: () => import('./pages/goals/goals').then((m) => m.GoalsPage),
  },
  {
    path: 'categorias',
    title: 'Categorias · Productive',
    loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage),
  },
  { path: '**', redirectTo: 'painel' },
];
