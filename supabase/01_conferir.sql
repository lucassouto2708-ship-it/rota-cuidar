-- ROTA CUIDAR · CONFERÊNCIA DO PASSO 1
-- Cole no SQL Editor e clique em RUN. Todas as linhas devem mostrar "OK".
select '1. Tabelas criadas (9)' as item,
       case when count(*) = 9 then 'OK' else 'FALTANDO: ' || count(*) || ' de 9' end as resultado
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('secretarias','usuarios','sessoes','veiculos','assentos','motoristas','viagens','reservas','auditoria')
union all
select '2. Proteção RLS ligada nas 9 tabelas',
       case when count(*) = 9 then 'OK' else 'ERRO: ' || count(*) || ' de 9' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and c.relname in ('secretarias','usuarios','sessoes','veiculos','assentos','motoristas','viagens','reservas','auditoria')
union all
select '3. API pública (anon) sem acesso a usuarios',
       case when has_table_privilege('anon', 'public.usuarios', 'select') then 'ERRO: anon ainda lê usuarios' else 'OK' end
union all
select '4. Controle de versões registrado (3)',
       case when count(*) = 3 then 'OK' else 'ERRO: ' || count(*) || ' de 3' end
  from drizzle.__drizzle_migrations;
