CREATE TYPE "public"."embarque" AS ENUM('presente', 'faltou');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('admin', 'gestor', 'paciente');--> statement-breakpoint
CREATE TYPE "public"."sentido" AS ENUM('ida', 'volta');--> statement-breakpoint
CREATE TYPE "public"."status_reserva" AS ENUM('solicitada', 'confirmada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."status_viagem" AS ENUM('aberta', 'fechada', 'em_andamento', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_assento" AS ENUM('comum', 'preferencial', 'cadeirante', 'equipe', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."tipo_passageiro" AS ENUM('paciente', 'acompanhante');--> statement-breakpoint
CREATE TYPE "public"."tipo_veiculo" AS ENUM('carro', 'van', 'micro_onibus', 'onibus', 'ambulancia', 'outro');--> statement-breakpoint
CREATE TABLE "assentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"rotulo" text NOT NULL,
	"linha" integer NOT NULL,
	"coluna" integer NOT NULL,
	"tipo" "tipo_assento" DEFAULT 'comum' NOT NULL,
	CONSTRAINT "assentos_veiculo_rotulo_uk" UNIQUE("veiculo_id","rotulo"),
	CONSTRAINT "assentos_veiculo_posicao_uk" UNIQUE("veiculo_id","linha","coluna"),
	CONSTRAINT "assentos_veiculo_id_uk" UNIQUE("veiculo_id","id"),
	CONSTRAINT "assentos_posicao_valida" CHECK ("assentos"."linha" >= 0 and "assentos"."coluna" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"secretaria_id" uuid,
	"usuario_id" uuid,
	"acao" text NOT NULL,
	"entidade" text,
	"entidade_id" text,
	"dados" jsonb,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motoristas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secretaria_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"cnh" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motoristas_secretaria_id_uk" UNIQUE("secretaria_id","id")
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secretaria_id" uuid NOT NULL,
	"viagem_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"assento_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"tipo_passageiro" "tipo_passageiro" DEFAULT 'paciente' NOT NULL,
	"acompanhante_de" uuid,
	"nome_acompanhante" text,
	"documento_acompanhante" text,
	"ponto_embarque" text,
	"local_destino" text,
	"horario_compromisso" time,
	"status" "status_reserva" DEFAULT 'confirmada' NOT NULL,
	"embarque" "embarque",
	"embarque_marcado_por" uuid,
	"embarque_em" timestamp with time zone,
	"criado_por" uuid NOT NULL,
	"cancelado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_acompanhante_coerente" CHECK (("reservas"."tipo_passageiro" = 'paciente' and "reservas"."acompanhante_de" is null and "reservas"."nome_acompanhante" is null)
       or ("reservas"."tipo_passageiro" = 'acompanhante' and "reservas"."acompanhante_de" is not null and "reservas"."nome_acompanhante" is not null))
);
--> statement-breakpoint
CREATE TABLE "secretarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"municipio" text NOT NULL,
	"uf" char(2) NOT NULL,
	"slug" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secretarias_slug_formato" CHECK ("secretarias"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "secretarias_uf_formato" CHECK ("secretarias"."uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secretaria_id" uuid,
	"papel" "papel" NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"cpf" char(11),
	"cns" text,
	"telefone" text,
	"data_nascimento" date,
	"senha_hash" text NOT NULL,
	"trocar_senha" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_secretaria_id_uk" UNIQUE("secretaria_id","id"),
	CONSTRAINT "usuarios_papel_secretaria" CHECK (("usuarios"."papel" = 'admin' and "usuarios"."secretaria_id" is null) or ("usuarios"."papel" <> 'admin' and "usuarios"."secretaria_id" is not null)),
	CONSTRAINT "usuarios_equipe_tem_email" CHECK ("usuarios"."papel" = 'paciente' or "usuarios"."email" is not null),
	CONSTRAINT "usuarios_paciente_tem_cpf" CHECK ("usuarios"."papel" <> 'paciente' or "usuarios"."cpf" is not null),
	CONSTRAINT "usuarios_cpf_formato" CHECK ("usuarios"."cpf" is null or "usuarios"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "usuarios_email_minusculo" CHECK ("usuarios"."email" is null or "usuarios"."email" = lower("usuarios"."email"))
);
--> statement-breakpoint
CREATE TABLE "veiculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secretaria_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_veiculo" NOT NULL,
	"placa" text,
	"acessivel" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veiculos_secretaria_id_uk" UNIQUE("secretaria_id","id")
);
--> statement-breakpoint
CREATE TABLE "viagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secretaria_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"motorista_id" uuid,
	"data" date NOT NULL,
	"saida" time NOT NULL,
	"sentido" "sentido" NOT NULL,
	"cidade_origem" text NOT NULL,
	"cidade_destino" text NOT NULL,
	"viagem_par_id" uuid,
	"status" "status_viagem" DEFAULT 'aberta' NOT NULL,
	"reservas_ate" timestamp with time zone,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viagens_secretaria_id_uk" UNIQUE("secretaria_id","id"),
	CONSTRAINT "viagens_id_veiculo_uk" UNIQUE("id","veiculo_id"),
	CONSTRAINT "viagens_par_diferente" CHECK ("viagens"."viagem_par_id" is null or "viagens"."viagem_par_id" <> "viagens"."id")
);
--> statement-breakpoint
ALTER TABLE "assentos" ADD CONSTRAINT "assentos_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motoristas" ADD CONSTRAINT "motoristas_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_acompanhante_de_reservas_id_fk" FOREIGN KEY ("acompanhante_de") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_embarque_marcado_por_usuarios_id_fk" FOREIGN KEY ("embarque_marcado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_viagem_mesma_secretaria_fk" FOREIGN KEY ("secretaria_id","viagem_id") REFERENCES "public"."viagens"("secretaria_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_viagem_veiculo_fk" FOREIGN KEY ("viagem_id","veiculo_id") REFERENCES "public"."viagens"("id","veiculo_id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_assento_do_veiculo_fk" FOREIGN KEY ("veiculo_id","assento_id") REFERENCES "public"."assentos"("veiculo_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_paciente_mesma_secretaria_fk" FOREIGN KEY ("secretaria_id","paciente_id") REFERENCES "public"."usuarios"("secretaria_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagens" ADD CONSTRAINT "viagens_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagens" ADD CONSTRAINT "viagens_viagem_par_id_viagens_id_fk" FOREIGN KEY ("viagem_par_id") REFERENCES "public"."viagens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagens" ADD CONSTRAINT "viagens_veiculo_mesma_secretaria_fk" FOREIGN KEY ("secretaria_id","veiculo_id") REFERENCES "public"."veiculos"("secretaria_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagens" ADD CONSTRAINT "viagens_motorista_mesma_secretaria_fk" FOREIGN KEY ("secretaria_id","motorista_id") REFERENCES "public"."motoristas"("secretaria_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_secretaria_data_idx" ON "auditoria" USING btree ("secretaria_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_assento_ativo_uk" ON "reservas" USING btree ("viagem_id","assento_id") WHERE "reservas"."status" <> 'cancelada';--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_paciente_ativo_uk" ON "reservas" USING btree ("viagem_id","paciente_id") WHERE "reservas"."status" <> 'cancelada' and "reservas"."tipo_passageiro" = 'paciente';--> statement-breakpoint
CREATE INDEX "reservas_paciente_idx" ON "reservas" USING btree ("paciente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secretarias_slug_uk" ON "secretarias" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uk" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_secretaria_cpf_uk" ON "usuarios" USING btree ("secretaria_id","cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "veiculos_secretaria_placa_uk" ON "veiculos" USING btree ("secretaria_id","placa");--> statement-breakpoint
CREATE INDEX "viagens_secretaria_data_idx" ON "viagens" USING btree ("secretaria_id","data");--> statement-breakpoint
CREATE INDEX "viagens_veiculo_data_idx" ON "viagens" USING btree ("veiculo_id","data");