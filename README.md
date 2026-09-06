# Productive

App de organização de tarefas feito em Angular 20. Funciona offline, guardando
tudo no próprio navegador, e opcionalmente sincroniza celular e computador por
uma conta no Supabase — sem back-end próprio para manter.

## Como rodar

```bash
npm install     # só na primeira vez
npm start       # http://localhost:4200
```

Build de produção: `npm run build` (sai em `dist/productive/browser`, pode ser
publicado em qualquer hospedagem estática — GitHub Pages, Netlify, Vercel).
O `vercel.json` na raiz garante que recarregar a página em `/tarefas` funcione,
em vez de dar 404.

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

O app é **offline-first**: tudo é gravado no localStorage do navegador (chave
`productive.data.v1`) e nada depende de rede para funcionar.

Se a sincronização estiver configurada (veja abaixo), esse conteúdo também é
espelhado numa conta sua no Supabase, e aí celular e computador enxergam a mesma
lista. Sem a configuração, o app funciona exatamente como antes: só local, sem
login e sem nuvem.

Em qualquer um dos casos, os botões **Exportar** e **Importar** no rodapé do menu
baixam e restauram um `.json` com tudo — é o backup manual, útil antes de limpar
os dados do navegador.

## Sincronizar celular e computador (opcional)

A sincronização usa o Supabase direto do navegador — não há back-end para manter.
São cinco passos, uma vez só:

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).
2. No **SQL Editor**, cole e rode o conteúdo de [`docs/supabase.sql`](docs/supabase.sql).
   Ele cria a tabela e as regras que impedem uma conta de ler os dados da outra.
3. Em **Authentication › URL Configuration**, ponha o endereço da Vercel em
   *Site URL* e adicione `http://localhost:4200/**` em *Redirect URLs* (para
   conseguir entrar também em desenvolvimento).
4. Em **Project Settings › API**, copie a *Project URL* e a chave *anon public*
   para `src/app/core/supabase-config.ts`.
5. Faça commit e push. A Vercel publica sozinha.

Depois disso aparece no menu lateral um campo de e-mail: você recebe um link,
abre o link no aparelho, e pronto — repita no celular com o mesmo e-mail e os
dois passam a mostrar a mesma coisa.

### A chave "anon" pode ir para o Git?

Pode. Ela é pública por definição: qualquer app de front-end a entrega ao
navegador de quem abre o site. Quem protege os dados é a Row Level Security do
passo 2 — cada linha só é legível pelo dono. A chave que **não** pode vazar é a
`service_role`, e essa o app não usa em lugar nenhum.

### Como o app resolve conflitos

Cada alteração carimba a hora no campo `updatedAt`, e o app guarda o estado
inteiro num único registro por usuário. Ao entrar, compara o carimbo local com o
da nuvem e o mais recente vence; depois disso, toda mudança sobe automaticamente
(com uma pausa de ~1s para não gerar uma escrita por tecla).

Isso significa que editar **a mesma tarefa nos dois aparelhos ao mesmo tempo**, um
deles offline, faz o último a sincronizar sobrescrever o outro. Para uso pessoal é
um trade-off consciente: mesclar campo a campo exigiria bem mais máquina do que o
problema pede.

## Instalar no celular

O app é uma PWA. Abra o endereço no celular e use "Adicionar à tela de início"
(Android: menu do Chrome; iPhone: botão compartilhar no Safari). Ele passa a
abrir em tela cheia, com ícone próprio, e continua funcionando sem internet.

O service worker só liga no build de produção — em `npm start` ele fica
desativado de propósito, para não servir arquivo velho enquanto você desenvolve.

## Estrutura

```
src/app/
  core/
    models.ts               tipos, rótulos e a paleta de cores das categorias
    date-utils.ts           datas em yyyy-mm-dd, sempre no fuso local
    productivity-store.ts   estado da aplicação (signals) + persistência local
    sync.ts                 espelhamento com o Supabase (opcional)
    supabase-config.ts      credenciais do projeto Supabase
    theme.ts                tema claro/escuro/automático
  pages/
    dashboard/              painel
    tasks/                  lista e formulário de tarefas
    categories/             CRUD de categorias
  shared/
    sync-panel/             login por e-mail e estado da sincronização
  app.*                     casca: menu lateral, backup, rotas
docs/supabase.sql           tabela e políticas de acesso do banco
```

O `ProductivityStore` é a fonte única de verdade: expõe signals para leitura,
`computed` para as estatísticas do painel e espelha tudo no localStorage a cada
mudança. As páginas não guardam estado próprio além de filtros e formulários.

As cores das categorias vêm de uma paleta categórica validada para daltonismo —
por isso a escolha é feita entre oito opções fixas, e não num seletor livre.
