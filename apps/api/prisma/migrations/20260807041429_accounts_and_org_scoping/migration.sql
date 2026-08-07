-- Accounts, organisations and org-scoping.
--
-- Written by hand from Prisma's generated SQL. The two new foreign keys are
-- required in the schema but the tables already hold live rows, so this runs in
-- three ordered steps inside one transaction: add the columns nullable, adopt
-- the existing rows into a seed organisation, then tighten to NOT NULL. If the
-- backfill were ever incomplete the final step aborts and the whole migration
-- rolls back, rather than leaving half-migrated data behind.

/*
  Warnings:

  - Added the required column `tenant_id` to the `chat_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organisation_id` to the `tenants` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('platform_admin');

-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('owner', 'admin', 'member');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "organisation_id" UUID;

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "platform_role" "platform_role",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'member',
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_organisation_id_idx" ON "memberships"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organisation_id_key" ON "memberships"("user_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organisation_id_accepted_at_idx" ON "invitations"("organisation_id", "accepted_at");

-- CreateIndex
CREATE INDEX "chat_messages_tenant_id_created_at_idx" ON "chat_messages"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tenants_organisation_id_idx" ON "tenants"("organisation_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 2 of 3: adopt existing data.
-- The live showroom predates organisations; give it one rather than orphan it.
-- ---------------------------------------------------------------------------

INSERT INTO "organisations" ("id", "name", "slug", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Default Organisation', 'default', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "organisations" WHERE "slug" = 'default');

UPDATE "tenants"
SET "organisation_id" = (SELECT "id" FROM "organisations" WHERE "slug" = 'default')
WHERE "organisation_id" IS NULL;

-- chat_messages is only transitively tenant-scoped today; derive it once.
UPDATE "chat_messages" m
SET "tenant_id" = c."tenant_id"
FROM "conversations" c
WHERE c."id" = m."conversation_id" AND m."tenant_id" IS NULL;

-- ---------------------------------------------------------------------------
-- Step 3 of 3: tighten. Aborts the transaction if anything was missed.
-- ---------------------------------------------------------------------------

ALTER TABLE "tenants"       ALTER COLUMN "organisation_id" SET NOT NULL;
ALTER TABLE "chat_messages" ALTER COLUMN "tenant_id"       SET NOT NULL;
