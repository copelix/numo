-- =====================================================================
-- Numo: base de datos para las cuentas (pegar entero en SQL Editor → Run)
-- Cada persona solo puede leer, escribir y borrar SUS filas.
-- =====================================================================

create table if not exists public.numo_docs (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  doc        text        not null check (doc ~ '^(core|exp-[0-9]{4}-[0-9]{2}|inc-[0-9]{4}-[0-9]{2})$'),
  data       jsonb       not null check (pg_column_size(data) < 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc)
);

-- Seguridad por fila: sin esto, la tabla quedaría abierta.
alter table public.numo_docs enable row level security;

drop policy if exists "numo: ver lo propio" on public.numo_docs;
drop policy if exists "numo: crear lo propio" on public.numo_docs;
drop policy if exists "numo: cambiar lo propio" on public.numo_docs;
drop policy if exists "numo: borrar lo propio" on public.numo_docs;

create policy "numo: ver lo propio" on public.numo_docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "numo: crear lo propio" on public.numo_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "numo: cambiar lo propio" on public.numo_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "numo: borrar lo propio" on public.numo_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Solo usuarios con sesión; los visitantes anónimos no tocan nada.
revoke all on public.numo_docs from anon;
grant select, insert, update, delete on public.numo_docs to authenticated;

-- "Borrar mi cuenta y mis datos": borra la cuenta de quien la llama (y sus filas, en cascada).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- La función interna de "RLS automática" de Supabase la usa solo el sistema: se cierra para la API.
-- (Solo existe si el proyecto se creó con "Enable automatic RLS".)
do $$ begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
