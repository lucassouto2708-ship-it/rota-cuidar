-- ROTA CUIDAR · PASSO 2: CRIAR O SEU USUÁRIO ADMIN
-- 1) Troque os 3 valores entre aspas: SEU NOME, SEU E-MAIL e SUA SENHA (mínimo 10 caracteres).
-- 2) Clique em RUN.
-- A senha é guardada criptografada (bcrypt); nem quem olha o banco consegue lê-la.
insert into public.usuarios (papel, nome, email, senha_hash)
values (
  'admin',
  'SEU NOME',
  lower(trim('seu-email@exemplo.com')),
  extensions.crypt('SUA-SENHA-FORTE-AQUI', extensions.gen_salt('bf', 11))
);

-- Conferência: deve aparecer 1 linha com papel "admin" e senha_ok = true
select papel, nome, email, senha_hash like '$2%' as senha_ok
  from public.usuarios where papel = 'admin';
