-- migracao-003: campos da raspagem para venda de site + CRM (Uberlândia).
--
-- Rode no SQL Editor do Supabase ANTES de importar leads/uberlandia/leads.json.
-- Idempotente: pode rodar duas vezes.

alter table leads add column if not exists email      text default '';
alter table leads add column if not exists nicho      text default '';  -- segmento de prospecção
alter table leads add column if not exists gancho     text default '';  -- por que ligar, numa frase
alter table leads add column if not exists prioridade smallint;         -- 1 = ligar primeiro
