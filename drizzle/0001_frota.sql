ALTER TABLE "assentos" DROP CONSTRAINT "assentos_veiculo_rotulo_uk";--> statement-breakpoint
ALTER TABLE "assentos" DROP CONSTRAINT "assentos_veiculo_posicao_uk";--> statement-breakpoint
ALTER TABLE "assentos" DROP CONSTRAINT "assentos_posicao_valida";--> statement-breakpoint
ALTER TABLE "assentos" ADD COLUMN "ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "layout_linhas" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "veiculos" ADD COLUMN "layout_colunas" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assentos_veiculo_rotulo_uk" ON "assentos" USING btree ("veiculo_id","rotulo") WHERE "assentos"."ativo";--> statement-breakpoint
CREATE UNIQUE INDEX "assentos_veiculo_posicao_uk" ON "assentos" USING btree ("veiculo_id","linha","coluna") WHERE "assentos"."ativo";--> statement-breakpoint
CREATE UNIQUE INDEX "motoristas_secretaria_cnh_uk" ON "motoristas" USING btree ("secretaria_id","cnh");--> statement-breakpoint
ALTER TABLE "assentos" ADD CONSTRAINT "assentos_posicao_valida" CHECK ("assentos"."linha" >= 0 and "assentos"."coluna" >= 0 and not ("assentos"."linha" = 0 and "assentos"."coluna" = 0));--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_layout_tamanho" CHECK ("veiculos"."layout_linhas" between 1 and 20 and "veiculos"."layout_colunas" between 2 and 6);