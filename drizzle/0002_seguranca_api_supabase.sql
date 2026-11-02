-- Segurança para hospedagem no Supabase.
-- O Supabase expõe o schema "public" por uma API REST (PostgREST) com os papéis "anon" e "authenticated".
-- O Rota Cuidar NÃO usa essa API: o app conecta direto no Postgres como dono das tabelas.
-- 1) RLS ligado e SEM políticas = a API não lê nem grava nada. O dono das tabelas (o app) não é afetado.
-- 2) Retira os privilégios desses papéis, se existirem (em Postgres comum eles não existem e nada acontece).
ALTER TABLE "secretarias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "veiculos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "motoristas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "viagens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reservas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;
END $$;
