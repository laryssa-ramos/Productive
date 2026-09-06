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
- **Metas diárias** (`/metas`): o que se repete, em vez de se concluir de vez.
  Cada meta escolhe em que dias da semana vale e se é só marcar como feita ou tem
  um alvo numérico ("2 L", "30 min"). A tela mostra o que vale hoje, a sequência
  atual, o recorde e um histórico dos últimos 14 dias. Arquivar preserva o
  histórico; excluir apaga junto.
- **Sorteio** (`/sorteio`): o lugar para despejar pendências soltas — só o texto,
  sem categoria, prazo ou prioridade. O app escolhe uma por dia e mostra no painel,
  para você fazer em vez de decidir. "Agora não" tira aquela da roda só de hoje;
  "Virar tarefa" promove a pendência à lista de tarefas quando ela cresce.
- **Escrita** (`/escrita`): um canto para ideias de pauta, rascunhos de post e
  trechos soltos. Editor Markdown com barra de formatação e prévia, busca, situação
  (ideia → rascunho → pronto → publicado), contagem de palavras, tempo de leitura,
  modo foco (esconde toda a casca do app), download em `.md` e um botão para a
  ideia virar tarefa. Excluir manda para a lixeira, de onde dá para restaurar.
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
2. No **SQL Editor**, cole e rode o conteúdo de [`docs/supabase.sql`](docs/supabase.sql)
   e depois o de [`docs/supabase-notas.sql`](docs/supabase-notas.sql). Eles criam as
   tabelas e as regras que impedem uma conta de ler os dados da outra.
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

## Lembretes e notificações

No rodapé do menu há um **lembrete diário**: você escolhe o horário, autoriza as
notificações e o app avisa o que falta no dia — a pendência da vez, as metas não
cumpridas e as tarefas vencendo. Se não houver nada a dizer, ele não interrompe.

O ícone do app instalado também mostra um **número** com o que falta do dia, nas
plataformas que suportam a Badging API.

**A limitação, sem rodeios:** isso só funciona com o app aberto (inclusive em
segundo plano, com a aba viva). Com o app fechado, o navegador não dispara nada.
A API que permitiria agendar uma notificação local sem servidor
([Notification Triggers](https://developer.chrome.com/docs/web-platform/notification-triggers))
foi abandonada pelo Google, então não existe meio-termo.

Para avisar com o app fechado seria preciso Web Push: chaves VAPID, uma tabela de
inscrições, uma Edge Function no Supabase que envia e um `pg_cron` disparando no
horário. Duas ressalvas antes de encarar isso: no iPhone só funciona com o app
instalado na tela de início, e um projeto Supabase no plano free pausa após uma
semana de inatividade — o cron para justamente depois dos dias em que o lembrete
seria mais útil.

Implementação em `src/app/core/notifications.ts`: um tique de um minuto confere se
deu a hora, com janela de tolerância de 2 horas (abrir o app às 22h não dispara um
lembrete marcado para as 9h) e uma trava por dia para não repetir. A notificação
sai pelo service worker quando ele existe, que é o caminho confiável no celular, e
o clique abre o painel.

## Instalar no celular

O app é uma PWA. Abra o endereço no celular e use "Adicionar à tela de início"
(Android: menu do Chrome; iPhone: botão compartilhar no Safari). Ele passa a
abrir em tela cheia, com ícone próprio, e continua funcionando sem internet.

O service worker só liga no build de produção — em `npm start` ele fica
desativado de propósito, para não servir arquivo velho enquanto você desenvolve.

## Cores

O app é vermelho e nasce no tema escuro (o seletor de tema continua no menu).
Os tokens ficam em `src/styles.scss`, com os valores de cada modo definidos em
`:root`, no `@media (prefers-color-scheme: dark)` e no `[data-theme="dark"]`.

Duas regras que não são óbvias e que quebram se alguém mexer sem saber:

- **Alerta não se distingue por matiz, e sim por forma.** Com uma marca vermelha,
  nenhuma cor de alerta é distinguível do vermelho por quem tem daltonismo no modo
  claro — testei em OKLab com simulação de protanopia e deuteranopia, e os pares
  vermelho/laranja dão ΔE 2.0, quando o mínimo aceitável é 8. Por isso "atrasada" e
  "prioridade alta" são **etiquetas preenchidas**, enquanto o vermelho da marca fica
  em botões e na navegação. Trocar essas etiquetas por texto vermelho apaga o aviso.
- **`--accent` é preenchimento, `--accent-text` é texto.** No escuro são valores
  diferentes: o vermelho que funciona atrás de texto branco num botão não tem
  contraste suficiente quando vira texto sobre o fundo escuro.

As cores das categorias **não** mudam com o tema: elas são identidade dos seus dados
e continuam vindo da paleta de oito matizes validada em `models.ts`.

## Estrutura

```
src/app/
  core/
    models.ts               tipos, rótulos e a paleta de cores das categorias
    date-utils.ts           datas em yyyy-mm-dd, sempre no fuso local
    productivity-store.ts   estado da aplicação (signals) + persistência local
    notifications.ts        lembrete diário e badge no ícone
    note-models.ts          tipos das notas de escrita
    notes-store.ts          notas: estado e persistência local
    notes-sync.ts           notas: sincronização linha a linha
    sync.ts                 espelhamento com o Supabase (opcional)
    ui.ts                   estado de interface (modo foco)
    supabase-config.ts      credenciais do projeto Supabase
    theme.ts                tema claro/escuro/automático
  pages/
    dashboard/              painel
    tasks/                  lista e formulário de tarefas
    goals/                  metas diárias, sequências e histórico
    draw/                   pendências soltas e o sorteio do dia
    writing/                editor de notas em Markdown
    categories/             CRUD de categorias
  shared/
    reminder-panel/         lembrete diário no rodapé do menu
    sync-panel/             login por e-mail e estado da sincronização
  app.*                     casca: menu lateral, backup, rotas
docs/supabase.sql           tabela e políticas do estado principal
docs/supabase-notas.sql     tabela e políticas das notas
```

O `ProductivityStore` é a fonte única de verdade: expõe signals para leitura,
`computed` para as estatísticas do painel e espelha tudo no localStorage a cada
mudança. As páginas não guardam estado próprio além de filtros e formulários.

As metas guardam só o que foi registrado: existe uma linha em `goalLogs` por
dia tocado, e a ausência de linha significa zero. Sequência e recorde são
calculados na hora a partir desse histórico, contando apenas os dias em que a
meta vale — um domingo não quebra a sequência de uma meta de dias úteis, e o dia
de hoje ainda em aberto também não.

**As notas são a exceção do modelo acima.** Todo o resto do app vive num único
JSON — uma chave no localStorage, uma linha no Supabase. Isso é ótimo para dados
pequenos e péssimo para texto longo, por dois motivos: cada gravação empurraria o
app inteiro para a nuvem a cada tecla, e um conflito custaria toda a escrita, não
só a nota editada. Por isso as notas moram em `productive.notes.v1` no
localStorage e na tabela `productive_notes`, com **uma linha por nota** e
sincronização individual — o conflito, quando acontece, atinge uma nota só.

Excluir uma nota não apaga a linha: grava `deletedAt`. Sem essa lápide, a exclusão
feita no celular nunca chegaria ao computador — ele apenas reenviaria a nota de
volta na sincronização seguinte. Esvaziar a lixeira é o que apaga de vez.

O sorteio não é aleatório puro. Ele evita repetir uma pendência sorteada nos
últimos 3 dias (desde que haja alternativa) e dá mais peso ao que está parado há
mais tempo, para o que está encalhado aparecer mais. A escolha do dia fica
gravada em `draw`, então recarregar a página não troca a sugestão — só o botão
"agora não" troca, e a recusa vale apenas para aquele dia.

O formato salvo está na versão 3. Dados gravados nas versões anteriores continuam
sendo lidos: os campos que faltam entram vazios, tanto no localStorage quanto no
que chega da nuvem.

As cores das categorias vêm de uma paleta categórica validada para daltonismo —
por isso a escolha é feita entre oito opções fixas, e não num seletor livre.
