CREATE TYPE "audit_action" AS ENUM('delete_post', 'delete_comment', 'ban_user', 'warn_user', 'assign_role', 'revoke_role', 'hide_content');--> statement-breakpoint
CREATE TYPE "comment_type" AS ENUM('text', 'sticker');--> statement-breakpoint
CREATE TYPE "media_type" AS ENUM('image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "notification_type" AS ENUM('like', 'comment', 'reply', 'follow', 'mention', 'system', 'moderation');--> statement-breakpoint
CREATE TYPE "post_status" AS ENUM('editing', 'draft', 'pending', 'published', 'unpublished', 'archived', 'rejected');--> statement-breakpoint
CREATE TYPE "post_type" AS ENUM('collab', 'solo');--> statement-breakpoint
CREATE TYPE "profile_role" AS ENUM('co_owner', 'vip_moderator', 'moderator');--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "resolution" AS ENUM('SD', 'HD', 'FHD', 'QHD', 'UHD');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('active', 'canceled', 'past_due', 'unpaid');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar PRIMARY KEY,
	"actor_id" varchar NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"name" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"comment_id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"post_id" varchar NOT NULL,
	"comment" text NOT NULL,
	"comment_type" "comment_type" DEFAULT 'text'::"comment_type" NOT NULL,
	"media_id" varchar,
	"comment_likes" integer DEFAULT 0 NOT NULL,
	"comment_reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "comment_sticker_requires_media" CHECK (("comment_type" <> 'sticker' OR "media_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "comment_reply" (
	"comment_reply_id" varchar PRIMARY KEY,
	"parent_comment_id" varchar NOT NULL,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"comment" text NOT NULL,
	"comment_type" "comment_type" DEFAULT 'text'::"comment_type" NOT NULL,
	"media_id" varchar,
	"comment_likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "reply_sticker_requires_media" CHECK (("comment_type" <> 'sticker' OR "media_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"follow_id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"follower_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "follow_unique" UNIQUE("follower_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"media_id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"media_type" "media_type" NOT NULL,
	"media_url" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"aspect_ratio" numeric,
	"resolution" "resolution",
	"duration" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "visual_media_requires_dimensions" CHECK (("media_type" = 'audio' OR ("width" IS NOT NULL AND "height" IS NOT NULL))),
	CONSTRAINT "audio_no_dimensions" CHECK (("media_type" <> 'audio' OR ("width" IS NULL AND "height" IS NULL))),
	CONSTRAINT "temporal_media_requires_duration" CHECK (("media_type" = 'image' OR "duration" IS NOT NULL)),
	CONSTRAINT "image_no_duration" CHECK (("media_type" <> 'image' OR "duration" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"actor_id" varchar,
	"type" "notification_type" NOT NULL,
	"entity_id" varchar,
	"message" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post" (
	"post_id" varchar PRIMARY KEY,
	"content" text,
	"author_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"post_category" text NOT NULL,
	"post_status" "post_status" DEFAULT 'draft'::"post_status" NOT NULL,
	"post_type" "post_type" DEFAULT 'solo'::"post_type" NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_like" (
	"id" varchar PRIMARY KEY,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "post_like_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_to_category" (
	"post_id" varchar,
	"category_name" text,
	CONSTRAINT "post_to_category_pkey" PRIMARY KEY("post_id","category_name")
);
--> statement-breakpoint
CREATE TABLE "post_to_media" (
	"post_id" varchar,
	"media_id" varchar,
	CONSTRAINT "post_to_media_pkey" PRIMARY KEY("post_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "post_to_user" (
	"post_id" varchar,
	"user_id" varchar,
	CONSTRAINT "post_to_user_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"profile_id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"bio" text,
	"website" text,
	"location" text,
	"image" varchar,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profile_member" (
	"id" varchar PRIMARY KEY,
	"profile_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "profile_role" DEFAULT 'moderator'::"profile_role" NOT NULL,
	"assigned_at" timestamp DEFAULT now(),
	"assigned_by" varchar,
	CONSTRAINT "profile_member_unique" UNIQUE("profile_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" varchar PRIMARY KEY,
	"reporter_id" varchar NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'pending'::"report_status" NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	"reviewed_by" varchar
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" varchar PRIMARY KEY,
	"user_id" varchar NOT NULL,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"status" "subscription_status" DEFAULT 'active'::"subscription_status" NOT NULL,
	"plan_id" varchar,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user" (
	"user_id" varchar PRIMARY KEY,
	"name" text NOT NULL,
	"nickname" text CONSTRAINT "name is already taken" UNIQUE,
	"email" text NOT NULL UNIQUE,
	"auth_provider_id" text NOT NULL,
	"auth_provider" text DEFAULT 'email' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "comment_user_index" ON "comment" ("user_id");--> statement-breakpoint
CREATE INDEX "comment_post_created_at_index" ON "comment" ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_reply_user_index" ON "comment_reply" ("user_id");--> statement-breakpoint
CREATE INDEX "comment_reply_parent_created_at_index" ON "comment_reply" ("parent_comment_id","created_at");--> statement-breakpoint
CREATE INDEX "follow_index" ON "follow" ("follower_id","user_id");--> statement-breakpoint
CREATE INDEX "media_user_index" ON "media" ("user_id");--> statement-breakpoint
CREATE INDEX "media_type_index" ON "media" ("media_type");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" ("user_id","read");--> statement-breakpoint
CREATE INDEX "post_author_index" ON "post" ("author_id","post_status");--> statement-breakpoint
CREATE INDEX "post_status_index" ON "post" ("post_status");--> statement-breakpoint
CREATE INDEX "post_category_index" ON "post" ("post_category");--> statement-breakpoint
CREATE INDEX "post_published_at_index" ON "post" ("published_at");--> statement-breakpoint
CREATE INDEX "post_published_at_post_id_index" ON "post" ("published_at","post_id");--> statement-breakpoint
CREATE INDEX "post_feed_rank_index" ON "post" ("is_published","likes","published_at");--> statement-breakpoint
CREATE INDEX "post_like_user_index" ON "post_like" ("user_id");--> statement-breakpoint
CREATE INDEX "profile_member_profile_idx" ON "profile_member" ("profile_id");--> statement-breakpoint
CREATE INDEX "profile_member_user_idx" ON "profile_member" ("user_id");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" ("status");--> statement-breakpoint
CREATE INDEX "user_email_index" ON "user" ("email");--> statement-breakpoint
CREATE INDEX "user_nickname_index" ON "user" ("nickname");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_media_id_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("media_id");--> statement-breakpoint
ALTER TABLE "comment_reply" ADD CONSTRAINT "comment_reply_parent_comment_id_comment_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comment"("comment_id");--> statement-breakpoint
ALTER TABLE "comment_reply" ADD CONSTRAINT "comment_reply_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "comment_reply" ADD CONSTRAINT "comment_reply_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "comment_reply" ADD CONSTRAINT "comment_reply_media_id_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("media_id");--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_user_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_user_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_post_category_categories_name_fkey" FOREIGN KEY ("post_category") REFERENCES "categories"("name");--> statement-breakpoint
ALTER TABLE "post_like" ADD CONSTRAINT "post_like_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "post_like" ADD CONSTRAINT "post_like_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "post_to_category" ADD CONSTRAINT "post_to_category_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "post_to_category" ADD CONSTRAINT "post_to_category_category_name_categories_name_fkey" FOREIGN KEY ("category_name") REFERENCES "categories"("name");--> statement-breakpoint
ALTER TABLE "post_to_media" ADD CONSTRAINT "post_to_media_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "post_to_media" ADD CONSTRAINT "post_to_media_media_id_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("media_id");--> statement-breakpoint
ALTER TABLE "post_to_user" ADD CONSTRAINT "post_to_user_post_id_post_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("post_id");--> statement-breakpoint
ALTER TABLE "post_to_user" ADD CONSTRAINT "post_to_user_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_image_media_media_id_fkey" FOREIGN KEY ("image") REFERENCES "media"("media_id");--> statement-breakpoint
ALTER TABLE "profile_member" ADD CONSTRAINT "profile_member_profile_id_profile_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("profile_id");--> statement-breakpoint
ALTER TABLE "profile_member" ADD CONSTRAINT "profile_member_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "profile_member" ADD CONSTRAINT "profile_member_assigned_by_user_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_user_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reviewed_by_user_user_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("user_id");--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id");