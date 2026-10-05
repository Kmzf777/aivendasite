-- =====================================================================
-- Rollback de: 20261005000000_baseline_agrozet.sql
--
-- DESTRUTIVO. Apaga TODAS as conversas, clientes, pets, fila de disparos e o
-- menu do bot. Só faz sentido em ambiente de desenvolvimento, para recomeçar
-- do zero. Em produção não existe caminho de volta deste script: a migration
-- é o baseline, logo derrubá-la é derrubar o banco inteiro.
--
-- ORDEM: inversa das dependências.
--   1. trigger (depende de `messages` e da função)
--   2. função do trigger
--   3. is_admin()  (referenciada pelas policies, que caem com as tabelas)
--   4. tabelas: `pets` e `scheduled_disparos` ANTES de `clientes` (FK),
--      `messages` depois do trigger, e as sem dependência por último.
--
-- `IF EXISTS` em tudo: o script roda limpo mesmo sobre um banco em que a
-- migration nunca foi aplicada, ou em que só parte dela foi.
--
-- A extensão `pgcrypto` NÃO é removida de propósito: é compartilhada com o
-- restante do projeto Supabase e dropá-la quebraria outros objetos.
-- As policies e os índices não têm DROP próprio — caem junto com as tabelas.
-- =====================================================================

-- 1. triggers — TODOS antes das funções que eles chamam, senão o
-- DROP FUNCTION falha por dependência (sem CASCADE).
DROP TRIGGER IF EXISTS messages_sync_cliente ON public.messages;
DROP TRIGGER IF EXISTS clientes_set_updated_at ON public.clientes;
DROP TRIGGER IF EXISTS pets_set_updated_at ON public.pets;
DROP TRIGGER IF EXISTS bot_config_set_updated_at ON public.bot_config;
DROP TRIGGER IF EXISTS bot_opcoes_set_updated_at ON public.bot_opcoes;

-- 2. funções dos triggers
DROP FUNCTION IF EXISTS public.sync_cliente_from_message();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- 3. helper de autorização
DROP FUNCTION IF EXISTS public.is_admin();

-- 4. tabelas — dependentes primeiro
DROP TABLE IF EXISTS public.pets;                -- FK -> clientes
DROP TABLE IF EXISTS public.scheduled_disparos;  -- FK -> clientes
DROP TABLE IF EXISTS public.messages;            -- trigger já removido acima
DROP TABLE IF EXISTS public.clientes;            -- alvo das FKs acima
DROP TABLE IF EXISTS public.bot_opcoes;
DROP TABLE IF EXISTS public.bot_config;
DROP TABLE IF EXISTS public.blocked_numbers;
DROP TABLE IF EXISTS public.operational_errors;
