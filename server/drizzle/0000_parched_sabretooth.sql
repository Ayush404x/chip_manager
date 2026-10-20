CREATE TYPE "public"."action_type" AS ENUM('post_sb', 'post_bb', 'check', 'bet', 'call', 'raise', 'fold', 'all_in', 'win');--> statement-breakpoint
CREATE TYPE "public"."hand_phase" AS ENUM('betting', 'awaiting_payout', 'complete');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('pending', 'seated', 'sitting_out', 'removed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('lobby', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."street" AS ENUM('preflop', 'flop', 'turn', 'river');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"player_id" uuid,
	"type" "action_type" NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"street" "street" NOT NULL,
	"seq" integer NOT NULL,
	"client_action_id" varchar(64),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chip_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"host_player_id" uuid,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hand_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"starting_chips" integer NOT NULL,
	"contributed" integer DEFAULT 0 NOT NULL,
	"committed" integer DEFAULT 0 NOT NULL,
	"folded" boolean DEFAULT false NOT NULL,
	"all_in" boolean DEFAULT false NOT NULL,
	"has_acted" boolean DEFAULT false NOT NULL,
	"raise_locked" boolean DEFAULT false NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"ending_chips" integer
);
--> statement-breakpoint
CREATE TABLE "hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"hand_number" integer NOT NULL,
	"phase" "hand_phase" DEFAULT 'betting' NOT NULL,
	"street" "street" DEFAULT 'preflop' NOT NULL,
	"dealer_seat" integer NOT NULL,
	"sb_seat" integer,
	"bb_seat" integer,
	"current_bet" integer DEFAULT 0 NOT NULL,
	"min_raise" integer DEFAULT 0 NOT NULL,
	"last_raise_size" integer DEFAULT 0 NOT NULL,
	"turn_seat" integer,
	"total_pot" integer DEFAULT 0 NOT NULL,
	"auto_settled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,
	"pot_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"nickname" varchar(24) NOT NULL,
	"nickname_key" varchar(24) NOT NULL,
	"seat" integer,
	"chips" integer DEFAULT 0 NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"is_ready" boolean DEFAULT true NOT NULL,
	"is_spectator" boolean DEFAULT false NOT NULL,
	"status" "player_status" DEFAULT 'seated' NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"session_token" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,
	"pot_index" integer NOT NULL,
	"amount" integer NOT NULL,
	"eligible_player_ids" jsonb NOT NULL,
	"winner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"distribution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(8) NOT NULL,
	"name" varchar(80) NOT NULL,
	"host_player_id" uuid,
	"status" "room_status" DEFAULT 'lobby' NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"starting_chips" integer NOT NULL,
	"max_players" integer NOT NULL,
	"password_hash" text,
	"spectator_mode" boolean DEFAULT false NOT NULL,
	"late_join" boolean DEFAULT true NOT NULL,
	"allow_rebuys" boolean DEFAULT true NOT NULL,
	"require_approval" boolean DEFAULT false NOT NULL,
	"total_chips" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_adjustments" ADD CONSTRAINT "chip_adjustments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_adjustments" ADD CONSTRAINT "chip_adjustments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_adjustments" ADD CONSTRAINT "chip_adjustments_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actions_hand_seq_unique" ON "actions" USING btree ("hand_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_client_id_unique" ON "actions" USING btree ("hand_id","client_action_id");--> statement-breakpoint
CREATE INDEX "actions_hand_idx" ON "actions" USING btree ("hand_id");--> statement-breakpoint
CREATE INDEX "actions_room_idx" ON "actions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "chip_adjustments_room_idx" ON "chip_adjustments" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hand_players_hand_player_unique" ON "hand_players" USING btree ("hand_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hand_players_hand_seat_unique" ON "hand_players" USING btree ("hand_id","seat");--> statement-breakpoint
CREATE INDEX "hand_players_hand_idx" ON "hand_players" USING btree ("hand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hands_room_number_unique" ON "hands" USING btree ("room_id","hand_number");--> statement-breakpoint
CREATE INDEX "hands_room_idx" ON "hands" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "hands_room_phase_idx" ON "hands" USING btree ("room_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_pot_player_unique" ON "payouts" USING btree ("pot_id","player_id");--> statement-breakpoint
CREATE INDEX "payouts_hand_idx" ON "payouts" USING btree ("hand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_room_seat_unique" ON "players" USING btree ("room_id","seat");--> statement-breakpoint
CREATE UNIQUE INDEX "players_room_nickname_unique" ON "players" USING btree ("room_id","nickname_key");--> statement-breakpoint
CREATE UNIQUE INDEX "players_session_token_unique" ON "players" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "players_room_idx" ON "players" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pots_hand_index_unique" ON "pots" USING btree ("hand_id","pot_index");--> statement-breakpoint
CREATE INDEX "pots_hand_idx" ON "pots" USING btree ("hand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms" USING btree ("code");