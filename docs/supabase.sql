-- Productive — estrutura da sincronização.
-- Cole no SQL Editor do Supabase e execute uma única vez.

-- Um registro por usuário, guardando o estado inteiro do app em JSON.
create table if not exists public.productive_state (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Sem RLS qualquer pessoa com a chave pública leria a tabela toda.
alter table public.productive_state enable row level security;

drop policy if exists "productive_state_select_own" on public.productive_state;
create policy "productive_state_select_own"
  on public.productive_state for select
  using (auth.uid() = user_id);

drop policy if exists "productive_state_insert_own" on public.productive_state;
create policy "productive_state_insert_own"
  on public.productive_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "productive_state_update_own" on public.productive_state;
create policy "productive_state_update_own"
  on public.productive_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "productive_state_delete_own" on public.productive_state;
create policy "productive_state_delete_own"
  on public.productive_state for delete
  using (auth.uid() = user_id);

-- Opcional: faz a outra aba/aparelho receber a mudança na hora, sem recarregar.
-- Se der erro dizendo que a tabela já está na publicação, pode ignorar.
alter publication supabase_realtime add table public.productive_state;
