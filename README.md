# Productive

App de organização de tarefas feito em Angular 20, sem back-end e sem banco de dados.

## Como rodar

```bash
npm install     # só na primeira vez
npm start       # http://localhost:4200
```

Build de produção: `npm run build` (sai em `dist/productive/browser`, pode ser
publicado em qualquer hospedagem estática — GitHub Pages, Netlify, Vercel).

## O que dá para fazer

- **Painel** (`/painel`): visão geral com tarefas em aberto, concluídas, atrasadas,
  taxa de conclusão, atividade dos últimos 14 dias, progresso por categoria e uma
  lista do que está mais urgente.
- **Tarefas** (`/tarefas`): criar, editar, concluir e excluir. Busca por texto,
  filtros por categoria/situação/prioridade, ordenação e dois modos de exibição
  (agrupado por categoria ou lista corrida).
- **Categorias** (`/categorias`): criar as suas próprias categorias com nome e cor.
  Excluir uma categoria não apaga as tarefas — elas ficam como "Sem categoria".

## Onde os dados ficam

Tudo é salvo no **localStorage do navegador**, na chave `productive.data.v1`.
Não existe servidor: o app funciona offline e os dados não saem da sua máquina.

Consequências práticas:

- Cada navegador/perfil tem os seus próprios dados — não sincroniza entre
  dispositivos.
- Limpar os dados de navegação do site apaga tudo.
- Por isso existem os botões **Exportar** e **Importar** no rodapé do menu: o
  export baixa um `.json` com tudo, e o import restaura esse arquivo (substituindo
  o conteúdo atual). Use como backup ou para levar os dados para outro navegador.

## Estrutura

```
src/app/
  core/
    models.ts               tipos, rótulos e a paleta de cores das categorias
    date-utils.ts           datas em yyyy-mm-dd, sempre no fuso local
    productivity-store.ts   estado da aplicação (signals) + persistência
    theme.ts                tema claro/escuro/automático
  pages/
    dashboard/              painel
    tasks/                  lista e formulário de tarefas
    categories/             CRUD de categorias
  app.*                     casca: menu lateral, backup, rotas
```

O `ProductivityStore` é a fonte única de verdade: expõe signals para leitura,
`computed` para as estatísticas do painel e espelha tudo no localStorage a cada
mudança. As páginas não guardam estado próprio além de filtros e formulários.

As cores das categorias vêm de uma paleta categórica validada para daltonismo —
por isso a escolha é feita entre oito opções fixas, e não num seletor livre.
