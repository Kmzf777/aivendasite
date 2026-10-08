-- ===================================================================
-- Copiloto — schema do CRM
-- Cole inteiro no SQL Editor do Supabase e rode uma vez.
-- ===================================================================

-- ---------- perfis ----------
-- Espelha auth.users. Existe porque auth.users não é consultável pelo
-- cliente, e a lista de leads precisa mostrar o NOME de quem atribuiu.
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text not null default '',
  -- Admin abre o Cold call. Muda só pelo banco: ver o trigger adiante.
  admin      boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- Todo usuário novo ganha um perfil sozinho. Sem isso o primeiro acesso
-- quebraria em toda tela que mostra nome de vendedor.
create or replace function criar_perfil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function criar_perfil();

-- ---------- leads ----------
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text default '',
  telefone    text default '',
  endereco    text default '',
  nota        numeric,
  avaliacoes  integer,
  instagram   text default '',
  seguidores  integer,          -- do Instagram. Argumento de venda: 2 mil
                                -- seguidores e zero site e a conversa inteira.
  site        text default '',
  fechado     boolean not null default false,

  origem      text not null default 'manual' check (origem in ('raspado','manual')),

  -- A dobradiça. 'qualificado' quer dizer: temos o contato de quem decide.
  situacao    text not null default 'novo'
              check (situacao in ('novo','meu','qualificado','nao_qualificado')),

  -- Só faz sentido quando situacao = 'qualificado'.
  etapa       text check (etapa in ('novo_contato','conversando','proposta','fechou','perdeu')),

  vendedor_id uuid references perfis(id) on delete set null,
  atribuido_em timestamptz,
  motivo_desqualificacao text,

  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Importar duas vezes nao pode duplicar. Verificado nos 117 raspados:
-- nome sozinho e unico, telefone NAO (3 repetidos), e o par e unico.
create unique index if not exists leads_chave_natural_idx on leads (nome, coalesce(telefone, ''));

create index if not exists leads_situacao_idx  on leads (situacao);
create index if not exists leads_vendedor_idx  on leads (vendedor_id);
-- O poço é ordenado por nota: o vendedor ataca os melhores primeiro.
create index if not exists leads_nota_idx      on leads (nota desc nulls last);

-- Duas regras que não podem depender de o cliente lembrar delas.
create or replace function leads_coerencia()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();

  -- Lead sem dono não pode estar em nenhum estado de trabalho.
  if new.vendedor_id is null and new.situacao <> 'novo' then
    new.situacao := 'novo';
  end if;

  -- Etapa só existe para qualificado; ao qualificar, entra no kanban.
  if new.situacao <> 'qualificado' then
    new.etapa := null;
  elsif new.etapa is null then
    new.etapa := 'novo_contato';
  end if;

  return new;
end;
$$;

drop trigger if exists ao_salvar_lead on leads;
create trigger ao_salvar_lead
  before insert or update on leads
  for each row execute function leads_coerencia();

-- ---------- contatos ----------
-- O ativo que o cold call PRODUZ: o número de quem decide.
create table if not exists contatos (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  nome       text not null default '',
  cargo      text not null default '',
  telefone   text not null default '',
  e_decisor  boolean not null default true,
  criado_em  timestamptz not null default now()
);
create index if not exists contatos_lead_idx on contatos (lead_id);

-- ---------- eventos ----------
create table if not exists eventos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  vendedor_id uuid references perfis(id) on delete set null,
  tipo        text not null,
  nota        text not null default '',   -- anotacao. NAO confundir com
                                          -- leads.nota, que e a do Google.
  criado_em   timestamptz not null default now()
);
create index if not exists eventos_lead_idx on eventos (lead_id, criado_em desc);

-- ===================================================================
-- A dobradiça, garantida pelo banco
-- ===================================================================
-- "Qualificado" significa UMA coisa: temos o contato de quem decide.
-- Sem isto, nada impedia marcar qualificado sem nenhum contato - e a
-- regra central do produto dependeria de toda tela lembrar dela.
-- Agora depende do banco, que não esquece.
--
-- Ordem obrigatória ao qualificar: grava o contato ANTES de mudar a
-- situação. É a ordem natural de quem acabou de desligar o telefone.
create or replace function exigir_contato_para_qualificar()
returns trigger language plpgsql as $fn$
begin
  if new.situacao = 'qualificado'
     and not exists (select 1 from contatos c where c.lead_id = new.id) then
    raise exception
      'Para qualificar é preciso gravar antes o contato de quem decide (nome e telefone do dono ou gerente).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists ao_qualificar_lead on leads;
create constraint trigger ao_qualificar_lead
  after insert or update of situacao on leads
  deferrable initially deferred
  for each row execute function exigir_contato_para_qualificar();

-- ===================================================================
-- RLS
-- ===================================================================
alter table perfis   enable row level security;
alter table leads    enable row level security;
alter table contatos enable row level security;
alter table eventos  enable row level security;

-- perfis: todos leem (a lista mostra o nome de quem atribuiu), cada um edita o seu.
drop policy if exists perfis_leitura on perfis;
create policy perfis_leitura on perfis for select to authenticated using (true);

drop policy if exists perfis_edicao on perfis;
create policy perfis_edicao on perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Sem isto, a política perfis_edicao (cada um edita a própria linha, que é
-- o que permite trocar o próprio nome) deixaria qualquer vendedor rodar
-- `update perfis set admin = true where id = auth.uid()`. RLS é por linha,
-- não por coluna. A condição `auth.uid() is not null` barra sessão de
-- usuário e libera service_role e SQL Editor, que não têm uid.
create or replace function proteger_admin()
returns trigger language plpgsql as $adm$
begin
  if new.admin is distinct from old.admin and auth.uid() is not null then
    raise exception 'Quem é admin só muda pelo banco, não pela aplicação.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$adm$;

drop trigger if exists ao_mexer_em_admin on perfis;
create trigger ao_mexer_em_admin
  before update on perfis
  for each row execute function proteger_admin();

-- leads: todos leem o poço inteiro. Sem isso a atribuição não avisa ninguém.
drop policy if exists leads_leitura on leads;
create policy leads_leitura on leads for select to authenticated using (true);

-- Criar lead à mão: qualquer um.
drop policy if exists leads_criacao on leads;
create policy leads_criacao on leads for insert to authenticated with check (true);

-- Escrever: só o dono, ou qualquer um se o lead está livre (é assim que se pega).
-- O `with check` impede pegar um lead já colocando o nome de outro.
drop policy if exists leads_escrita on leads;
create policy leads_escrita on leads for update to authenticated
  using (vendedor_id is null or vendedor_id = auth.uid())
  with check (vendedor_id is null or vendedor_id = auth.uid());

-- contatos e eventos: leitura para todos, escrita só do dono do lead.
drop policy if exists contatos_leitura on contatos;
create policy contatos_leitura on contatos for select to authenticated using (true);

drop policy if exists contatos_escrita on contatos;
create policy contatos_escrita on contatos for all to authenticated
  using (exists (select 1 from leads l where l.id = lead_id and l.vendedor_id = auth.uid()))
  with check (exists (select 1 from leads l where l.id = lead_id and l.vendedor_id = auth.uid()));

drop policy if exists eventos_leitura on eventos;
create policy eventos_leitura on eventos for select to authenticated using (true);

drop policy if exists eventos_escrita on eventos;
create policy eventos_escrita on eventos for insert to authenticated
  with check (
    vendedor_id = auth.uid()
    and exists (
      select 1 from leads l
      where l.id = lead_id
        and (l.vendedor_id = auth.uid() or l.vendedor_id is null)
    )
  );
