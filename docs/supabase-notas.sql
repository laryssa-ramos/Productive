-- Productive — tabela das notas de escrita.
-- Rode no SQL Editor do Supabase depois do docs/supabase.sql.
--
-- Ao contrário do resto do app, que vive num único JSON, cada nota é uma linha.
-- Assim salvar um rascunho não reenvia tarefas e metas junto, e um conflito
-- atinge no máximo uma nota.

create table if not exists public.productive_notes (
  id          uuid        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text        not null default '',
  body        text        not null default '',
  category_id text,
  status      text        not null default 'idea',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Lápide: apagar a linha impediria a exclusão de chegar ao outro aparelho.
  deleted_at  timestamptz
);

create index if not exists productive_notes_user_updated
  on public.productive_notes (user_id, updated_at desc);

alter table public.productive_notes enable row level security;

drop policy if exists "productive_notes_select_own" on public.productive_notes;
create policy "productive_notes_select_own"
  on public.productive_notes for select
  using (auth.uid() = user_id);

drop policy if exists "productive_notes_insert_own" on public.productive_notes;
create policy "productive_notes_insert_own"
  on public.productive_notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "productive_notes_update_own" on public.productive_notes;
create policy "productive_notes_update_own"
  on public.productive_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "productive_notes_delete_own" on public.productive_notes;
create policy "productive_notes_delete_own"
  on public.productive_notes for delete
  using (auth.uid() = user_id);

-- Opcional: faz a nota editada no celular aparecer no computador sem recarregar.
alter publication supabase_realtime add table public.productive_notes;
