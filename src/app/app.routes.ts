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
    path: 'categorias',
    title: 'Categorias · Productive',
    loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage),
  },
  { path: '**', redirectTo: 'painel' },
];
