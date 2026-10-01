-- ===================================================================
-- Migração 002 — quem é admin
-- Cole no SQL Editor do Supabase e rode uma vez.
-- ===================================================================
-- Admin é quem pode abrir o Cold call. O resto da equipe trabalha a
-- lista e o funil normalmente.

alter table perfis
  add column if not exists admin boolean not null default false;

-- -------------------------------------------------------------------
-- O buraco que isto fecha
-- -------------------------------------------------------------------
-- A política `perfis_edicao` deixa cada usuário editar a PRÓPRIA linha
-- — é o que permite trocar o próprio nome. Sem a trava abaixo, qualquer
-- vendedor faria `update perfis set admin = true where id = auth.uid()`
-- e viraria admin sozinho. RLS é por linha, não por coluna, então não
-- dá para resolver só com política.
--
-- A condição é `auth.uid() is not null`: sessão de usuário tem uid e é
-- barrada; a service_role e o SQL Editor não têm, e passam. Ou seja,
-- promover alguém é ato de quem tem acesso ao banco, não à aplicação.
create or replace function proteger_admin()
returns trigger language plpgsql as $fn$
begin
  if new.admin is distinct from old.admin and auth.uid() is not null then
    raise exception
      'Quem é admin só muda pelo banco, não pela aplicação.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$fn$;

drop trigger if exists ao_mexer_em_admin on perfis;
create trigger ao_mexer_em_admin
  before update on perfis
  for each row execute function proteger_admin();

-- -------------------------------------------------------------------
-- O primeiro admin
-- -------------------------------------------------------------------
update perfis set admin = true
where email = 'rafaelcafecanastra@gmail.com';

-- Confere: deve listar uma linha com admin = true.
select email, nome, admin from perfis order by admin desc, email;
