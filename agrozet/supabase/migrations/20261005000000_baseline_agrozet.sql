-- =====================================================================
-- Migration: baseline_agrozet
-- Projeto:   CRM Agrozet (Pet Shop Agrozet — Segismundo Pereira, Uberlândia)
-- Spec:      docs/superpowers/specs/2026-10-05-agrozet-crm-design.md
-- Plano:     docs/superpowers/plans/2026-10-05-fase1-fundacao-e-bot.md (Task 2)
--
-- PRÉ-REQUISITO: um projeto Postgres do Supabase LIMPO. Nada além disso.
--   Usa apenas o que todo projeto Supabase já tem de fábrica:
--     - o schema `public` e o schema `auth` com a função `auth.jwt()`;
--     - os papéis `anon`, `authenticated`, `service_role`;
--     - `gen_random_uuid()`, que é built-in do Postgres >= 13 (pg_catalog).
--   NÃO depende de `pg_cron`/`pg_net` (Fase 3), nem de buckets de Storage,
--   nem de nenhum usuário pré-existente em `auth.users`.
--
-- ESTA MIGRATION NÃO FOI APLICADA. No momento da escrita não existe projeto
-- Supabase nem credenciais; o script foi validado por leitura, não por
-- execução. Ao criar o projeto, aplicar com `supabase db push` (ou colar no
-- SQL Editor) e conferir o Advisor de segurança.
--
-- ORDEM DO ARQUIVO (dependências sobem, nunca descem):
--   1. extensões
--   2. tabelas
--   3. índices
--   4. is_admin()
--   5. sync_cliente_from_message() + trigger
--   6. RLS e policies
--   7. seed do bot
--
-- DECISÕES DE DESIGN QUE EXPLICAM O QUE NÃO ESTÁ AQUI:
--   * Um único número de WhatsApp e todos os atendentes veem todas as
--     conversas. Logo: sem tabela de instância, sem `phone_id`, sem dono de
--     conversa, e o RLS é trivial DE PROPÓSITO.
--   * O menu do bot é editável por admin numa tela, por isso vive em tabela
--     (`bot_config` + `bot_opcoes`) e não em código.
--   * Sem relatórios, sem cobrança, sem IA, sem Telegram.
--   * Plano free do Supabase (500 MB de banco, 1 GB de Storage): a retenção
--     de mídia/mensagens é parte do design, implementada na Fase 3 sobre o
--     índice `messages(created_at)` criado aqui.
--
-- IDEMPOTÊNCIA: todo objeto usa `IF NOT EXISTS` / `CREATE OR REPLACE` /
-- `DROP POLICY IF EXISTS` antes do `CREATE POLICY`, e o seed usa
-- `ON CONFLICT DO NOTHING`. Reaplicar o script sobre um banco já migrado é
-- no-op; não sobrescreve dados nem texto de bot já editado pelo admin.
-- =====================================================================


-- =====================================================================
-- 1. EXTENSÕES
-- =====================================================================
-- `gen_random_uuid()` é core desde o Postgres 13 e vive em `pg_catalog`, que
-- está sempre no search_path implícito. `pgcrypto` é declarado por garantia
-- (projetos Supabase já o trazem no schema `extensions`); se já estiver
-- instalado, o IF NOT EXISTS é no-op e o schema atual é preservado.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- =====================================================================
-- 2. TABELAS
-- =====================================================================

-- ---------------------------------------------------------------- clientes
-- Uma linha por telefone canônico. `phone` é o `wa_id` que a Meta manda no
-- webhook — NUNCA o número digitado pelo cliente ou pelo atendente. O UNIQUE
-- é a chave canônica do sistema: é por ele que o trigger abaixo faz upsert e
-- é por ele que a UI junta as mensagens numa conversa só.
CREATE TABLE IF NOT EXISTS public.clientes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                text        NOT NULL UNIQUE,
  nome                 text,
  ultimo_servico       text,                 -- botao_id escolhido no menu do bot
  bot_stage            text,                 -- null | awaiting_choice | done
  observacoes          text,
  primeiro_contato_at  timestamptz,
  ultima_interacao_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- pets
-- Cadastro = cliente + pets. Sem histórico de serviços na Fase 1.
-- ON DELETE CASCADE: apagar o cliente apaga os pets dele; um pet órfão não
-- tem significado nenhum neste domínio.
CREATE TABLE IF NOT EXISTS public.pets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  especie     text,
  porte       text,
  raca        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- messages
-- `message_id` é o id da mensagem na Meta e carrega o UNIQUE que serve de
-- GATE DE IDEMPOTÊNCIA do webhook: o código faz upsert com `ignoreDuplicates`
-- e trata "0 linhas inseridas" como reentrega da Meta, encerrando sem nenhum
-- efeito de bot. Sem este UNIQUE a Meta reentrega o mesmo evento e o bot
-- responde duas vezes ao mesmo cliente. Não remover, não trocar por índice
-- parcial, não torná-lo anulável.
CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       text        NOT NULL UNIQUE,
  phone            text        NOT NULL,
  direction        text        NOT NULL,
  content          text,
  message_type     text        NOT NULL,   -- text|image|audio|document|interactive|template
  media_path       text,                   -- path no bucket; zerado pela retenção (90d)
  media_mime       text,
  delivery_status  text,                   -- sent|delivered|read|failed
  campaign_id      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_direction_check CHECK (direction IN ('inbound', 'outbound'))
);

-- ---------------------------------------------------------------- bot_config
-- Singleton garantido pelo BANCO, não por convenção: `id int PRIMARY KEY
-- CHECK (id = 1)` torna impossível existir uma segunda linha de configuração,
-- então nenhuma leitura precisa decidir "qual config vale".
CREATE TABLE IF NOT EXISTS public.bot_config (
  id          int         PRIMARY KEY,
  ativo       boolean     NOT NULL DEFAULT true,
  saudacao    text        NOT NULL,
  rodape      text,
  fecho       text        NOT NULL,   -- enviado depois da escolha
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_config_singleton_check CHECK (id = 1)
);

-- ---------------------------------------------------------------- bot_opcoes
-- Os limites da Meta viram CONSTRAINT, não só validação de formulário:
-- a linha pode entrar por SQL na mão, por uma versão anterior da tela ou por
-- um script, e passar por fora do Zod. Estourar o limite na Meta não devolve
-- erro amigável — devolve mensagem NÃO ENTREGUE, e o cliente fica sem
-- resposta nenhuma, sem ninguém perceber.
--   titulo   <= 20   chars: limite de título de reply button / item de lista
--   resposta <= 1024 chars: limite do corpo de mensagem
-- `botao_id` é slug estável: é ele que vai para `clientes.ultimo_servico`,
-- por isso tem UNIQUE e não deve ser renomeado depois de usado.
CREATE TABLE IF NOT EXISTS public.bot_opcoes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem       int         NOT NULL,
  botao_id    text        NOT NULL UNIQUE,
  titulo      text        NOT NULL,
  resposta    text        NOT NULL,
  ativo       boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_opcoes_titulo_len_check   CHECK (char_length(titulo)   <= 20),
  CONSTRAINT bot_opcoes_resposta_len_check CHECK (char_length(resposta) <= 1024)
);

-- ------------------------------------------------------- scheduled_disparos
-- Fila de disparos de template. O `cliente_id` é FK SEM cascade e anulável de
-- propósito: a linha é um registro de envio e `phone` é autossuficiente para
-- enviar, então apagar um cliente não deve apagar nem invalidar o histórico
-- de fila. Enfileirar SÓ pela rota `/api/schedule-disparo` (as regras de
-- janela e de blocklist vivem lá; o banco não reclama de INSERT na mão).
CREATE TABLE IF NOT EXISTS public.scheduled_disparos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          text        NOT NULL,
  cliente_id     uuid        REFERENCES public.clientes (id),
  template_name  text        NOT NULL,
  template_lang  text        NOT NULL,
  components     jsonb,
  scheduled_for  timestamptz NOT NULL,
  status         text        NOT NULL DEFAULT 'pending',
  campaign_id    text,
  message_id     text,
  error          text,
  attempts       int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  CONSTRAINT scheduled_disparos_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled'))
);

-- --------------------------------------------------------- blocked_numbers
-- Opt-out. Reconsultada NO ENVIO, não só no enfileiramento: horas separam os
-- dois momentos e o cliente pode pedir para sair nesse intervalo.
CREATE TABLE IF NOT EXISTS public.blocked_numbers (
  phone       text        PRIMARY KEY,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------ operational_errors
-- Destino de todo erro NÃO-FATAL: um webhook que devolve 500 faz a Meta
-- reentregar em loop, então o erro é registrado aqui e a resposta é 200.
-- `origem` no formato 'modulo.funcao' (ex.: 'webhook.armazenarMidia').
-- Escrita só por `service_role` (que ignora RLS) — ver seção 6.
CREATE TABLE IF NOT EXISTS public.operational_errors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  origem      text        NOT NULL,
  mensagem    text        NOT NULL,
  contexto    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
-- 3. ÍNDICES
-- =====================================================================
-- Timeline de uma conversa: filtra por telefone, ordena do mais novo.
CREATE INDEX IF NOT EXISTS messages_phone_created_at_idx
  ON public.messages (phone, created_at DESC);

-- Job de retenção (Fase 3) varre `messages` POR DATA, sem filtro de telefone:
-- mídia com mais de 90 dias e linhas com mais de 2 anos. Sem este índice a
-- varredura é seq scan na maior tabela do banco.
CREATE INDEX IF NOT EXISTS messages_created_at_idx
  ON public.messages (created_at);

-- `claim_scheduled_disparos` pega o lote por (status, scheduled_for).
CREATE INDEX IF NOT EXISTS scheduled_disparos_status_scheduled_for_idx
  ON public.scheduled_disparos (status, scheduled_for);

-- Lista de conversas: pendentes primeiro, depois ultima_interacao_at desc.
CREATE INDEX IF NOT EXISTS clientes_ultima_interacao_at_idx
  ON public.clientes (ultima_interacao_at DESC);

-- Pets de um cliente na tela de cadastro.
CREATE INDEX IF NOT EXISTS pets_cliente_id_idx
  ON public.pets (cliente_id);


-- =====================================================================
-- 4. is_admin()
-- =====================================================================
-- `admin` = papel `admin` no `user_metadata` do JWT do Supabase Auth.
-- Encapsulado numa função para que as policies não repitam a expressão e para
-- que a origem do papel possa mudar num único lugar.
--
-- `SET search_path = ''` NÃO É OPCIONAL: função SECURITY DEFINER sem
-- search_path fixado é vetor de escalonamento de privilégio (um chamador
-- aponta o search_path para um schema que ele controla e sequestra a
-- resolução de nome), e o linter do Supabase sinaliza isso (advisor 0011).
-- Com o search_path vazio, TODA referência precisa ser qualificada — daí
-- `auth.jwt()`. Operadores e tipos de `pg_catalog` seguem resolvendo porque
-- `pg_catalog` está sempre no search_path implícito.
--
-- Usuário NUNCA é criado por INSERT em `auth.users`: Dashboard ->
-- Authentication -> Users -> Add user, e o papel vai no User Metadata como
-- {"role": "admin"}.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin';
$$;


-- =====================================================================
-- 5. sync_cliente_from_message() + trigger
-- =====================================================================
-- `messages` é o DONO ÚNICO do cadastro base de cliente. Toda mensagem
-- inbound cria o cliente se não existir e empurra `ultima_interacao_at`.
--
-- O WEBHOOK NÃO FAZ UPSERT EM `clientes`. Um segundo escritor foi exatamente
-- a causa do clobber no sistema de referência.
--
-- O TRIGGER DELIBERADAMENTE NÃO ESCREVE `nome`. O nome de exibição do
-- WhatsApp chega no payload do webhook, não na linha de `messages` — então
-- aqui ele simplesmente não está disponível. E isso é bom: no sistema de
-- referência um segundo escritor do nome causou um bug em que cada mensagem
-- nova revertia, para o nome de exibição do WhatsApp, um nome que o atendente
-- havia corrigido à mão. Aqui o nome entra SÓ pela tela de clientes (Fase 2);
-- na Fase 1 a conversa é identificada pelo telefone. Não adicionar `nome` a
-- este INSERT, e não adicionar um segundo escritor em outro lugar.
--
-- `GREATEST` ignora NULL no Postgres, então o primeiro inbound de um cliente
-- que existia sem interação registrada preenche corretamente em vez de zerar.
-- `primeiro_contato_at` NÃO é tocado no DO UPDATE: é o primeiro contato.
--
-- NOTA DE SINTAXE: dentro de `ON CONFLICT ... DO UPDATE` a linha existente é
-- referenciada pelo ALIAS da tabela-alvo, que é o nome simples da relação
-- (`clientes`) — não a forma qualificada por schema. O alias não passa pelo
-- search_path, portanto `clientes.ultima_interacao_at` é correto mesmo com
-- `SET search_path = ''`.
CREATE OR REPLACE FUNCTION public.sync_cliente_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.clientes (phone, primeiro_contato_at, ultima_interacao_at)
  VALUES (NEW.phone, COALESCE(NEW.created_at, now()), COALESCE(NEW.created_at, now()))
  ON CONFLICT (phone) DO UPDATE
    SET ultima_interacao_at = GREATEST(
          clientes.ultima_interacao_at,
          COALESCE(NEW.created_at, now())
        ),
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_sync_cliente ON public.messages;
CREATE TRIGGER messages_sync_cliente
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_from_message();


-- ---------------------------------------------------------------------
-- set_updated_at(): mantém `updated_at` honesto sem depender de disciplina
-- ---------------------------------------------------------------------
-- As colunas `updated_at` têm DEFAULT now(), que só cobre o INSERT. Sem este
-- trigger, cada UPDATE teria de setar `updated_at` à mão no TypeScript — em
-- quatro telas e três rotas escritas por agentes diferentes. Uma omissão não
-- dá erro: a coluna simplesmente congela na data de criação e passa a mentir.
-- Resolver no banco custa 10 linhas e não tem como alguém esquecer.
--
-- `messages` NÃO entra: é append-only (só `delivery_status` muda, via webhook)
-- e não tem `updated_at`.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_set_updated_at ON public.clientes;
CREATE TRIGGER clientes_set_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pets_set_updated_at ON public.pets;
CREATE TRIGGER pets_set_updated_at
  BEFORE UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS bot_config_set_updated_at ON public.bot_config;
CREATE TRIGGER bot_config_set_updated_at
  BEFORE UPDATE ON public.bot_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS bot_opcoes_set_updated_at ON public.bot_opcoes;
CREATE TRIGGER bot_opcoes_set_updated_at
  BEFORE UPDATE ON public.bot_opcoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================================
-- 6. RLS E POLICIES
-- =====================================================================
-- Um número só e todos os atendentes veem todas as conversas (decisão 2 do
-- spec), então não existe isolamento por linha a fazer: autenticado lê tudo e
-- escreve na operação. O único recorte é ADMIN para a configuração do bot e
-- para o log de erros.
--
-- O WEBHOOK E OS CRONS ESCREVEM COM `service_role`, QUE IGNORA RLS. Não
-- existe — e não deve existir — policy para eles.

ALTER TABLE public.clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_opcoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_disparos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_numbers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_errors  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- clientes
DROP POLICY IF EXISTS clientes_select_authenticated ON public.clientes;
CREATE POLICY clientes_select_authenticated ON public.clientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS clientes_insert_authenticated ON public.clientes;
CREATE POLICY clientes_insert_authenticated ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS clientes_update_authenticated ON public.clientes;
CREATE POLICY clientes_update_authenticated ON public.clientes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS clientes_delete_authenticated ON public.clientes;
CREATE POLICY clientes_delete_authenticated ON public.clientes
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------- pets
DROP POLICY IF EXISTS pets_select_authenticated ON public.pets;
CREATE POLICY pets_select_authenticated ON public.pets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pets_insert_authenticated ON public.pets;
CREATE POLICY pets_insert_authenticated ON public.pets
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS pets_update_authenticated ON public.pets;
CREATE POLICY pets_update_authenticated ON public.pets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pets_delete_authenticated ON public.pets;
CREATE POLICY pets_delete_authenticated ON public.pets
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------- messages
DROP POLICY IF EXISTS messages_select_authenticated ON public.messages;
CREATE POLICY messages_select_authenticated ON public.messages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS messages_insert_authenticated ON public.messages;
CREATE POLICY messages_insert_authenticated ON public.messages
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS messages_update_authenticated ON public.messages;
CREATE POLICY messages_update_authenticated ON public.messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS messages_delete_authenticated ON public.messages;
CREATE POLICY messages_delete_authenticated ON public.messages
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------- bot_config
-- Leitura para qualquer atendente (o bot e a UI precisam do texto);
-- escrita só para admin — é a configuração que fala com o cliente final.
DROP POLICY IF EXISTS bot_config_select_authenticated ON public.bot_config;
CREATE POLICY bot_config_select_authenticated ON public.bot_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bot_config_insert_admin ON public.bot_config;
CREATE POLICY bot_config_insert_admin ON public.bot_config
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bot_config_update_admin ON public.bot_config;
CREATE POLICY bot_config_update_admin ON public.bot_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bot_config_delete_admin ON public.bot_config;
CREATE POLICY bot_config_delete_admin ON public.bot_config
  FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------- bot_opcoes
DROP POLICY IF EXISTS bot_opcoes_select_authenticated ON public.bot_opcoes;
CREATE POLICY bot_opcoes_select_authenticated ON public.bot_opcoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bot_opcoes_insert_admin ON public.bot_opcoes;
CREATE POLICY bot_opcoes_insert_admin ON public.bot_opcoes
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bot_opcoes_update_admin ON public.bot_opcoes;
CREATE POLICY bot_opcoes_update_admin ON public.bot_opcoes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bot_opcoes_delete_admin ON public.bot_opcoes;
CREATE POLICY bot_opcoes_delete_admin ON public.bot_opcoes
  FOR DELETE TO authenticated USING (public.is_admin());

-- ------------------------------------------------------- scheduled_disparos
DROP POLICY IF EXISTS scheduled_disparos_select_authenticated ON public.scheduled_disparos;
CREATE POLICY scheduled_disparos_select_authenticated ON public.scheduled_disparos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scheduled_disparos_insert_authenticated ON public.scheduled_disparos;
CREATE POLICY scheduled_disparos_insert_authenticated ON public.scheduled_disparos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS scheduled_disparos_update_authenticated ON public.scheduled_disparos;
CREATE POLICY scheduled_disparos_update_authenticated ON public.scheduled_disparos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS scheduled_disparos_delete_authenticated ON public.scheduled_disparos;
CREATE POLICY scheduled_disparos_delete_authenticated ON public.scheduled_disparos
  FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------- blocked_numbers
DROP POLICY IF EXISTS blocked_numbers_select_authenticated ON public.blocked_numbers;
CREATE POLICY blocked_numbers_select_authenticated ON public.blocked_numbers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS blocked_numbers_insert_authenticated ON public.blocked_numbers;
CREATE POLICY blocked_numbers_insert_authenticated ON public.blocked_numbers
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS blocked_numbers_update_authenticated ON public.blocked_numbers;
CREATE POLICY blocked_numbers_update_authenticated ON public.blocked_numbers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS blocked_numbers_delete_authenticated ON public.blocked_numbers;
CREATE POLICY blocked_numbers_delete_authenticated ON public.blocked_numbers
  FOR DELETE TO authenticated USING (true);

-- ------------------------------------------------------ operational_errors
-- SELECT só admin. NENHUMA policy de INSERT/UPDATE/DELETE, de propósito:
-- com RLS habilitado e sem policy, nenhum papel sujeito a RLS escreve aqui.
-- Quem escreve é `service_role` (via `logOperationalError`), que ignora RLS.
-- Se um INSERT de `authenticated` começar a falhar aqui, a correção é usar o
-- cliente admin no servidor — NÃO adicionar policy.
DROP POLICY IF EXISTS operational_errors_select_admin ON public.operational_errors;
CREATE POLICY operational_errors_select_admin ON public.operational_errors
  FOR SELECT TO authenticated USING (public.is_admin());


-- =====================================================================
-- 7. SEED DO MENU DO AGROZET
-- =====================================================================
-- `ON CONFLICT DO NOTHING` nos dois INSERTs: reaplicar a migration não
-- sobrescreve texto que o admin já ajustou pela tela `/bot`.
--
-- Cada `titulo` cabe no CHECK de 20 chars que a seção 2 criou — conferido:
--   'Banho e Tosa'        = 12
--   'Rações e Produtos'   = 17
--   'Falar com atendente' = 19
-- Três opções ativas, portanto `montarMenu` escolhe `interactive` tipo
-- `button` (reply buttons), cujo máximo na Meta é exatamente 3. A quarta
-- opção ativa faz o menu virar `list` automaticamente.

INSERT INTO public.bot_config (id, ativo, saudacao, rodape, fecho) VALUES (
  1, true,
  'Olá! Bem-vindo ao Pet Shop Agrozet. Em que podemos ajudar hoje?',
  'Pet Shop Agrozet - Segismundo Pereira, Uberlândia',
  'Perfeito! Em instantes um de nossos atendentes vai te responder por aqui.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bot_opcoes (ordem, botao_id, titulo, resposta, ativo) VALUES
  (1, 'banho_tosa', 'Banho e Tosa',
   'Trabalhamos com banho, tosa higiênica e tosa na máquina, para todos os portes. Atendemos de segunda a sábado, com hora marcada.', true),
  (2, 'racoes', 'Rações e Produtos',
   'Temos rações das principais marcas, petiscos, brinquedos, coleiras e acessórios. Também fazemos entrega no bairro.', true),
  (3, 'atendente', 'Falar com atendente',
   'Claro! Já estou te encaminhando.', true)
ON CONFLICT (botao_id) DO NOTHING;
