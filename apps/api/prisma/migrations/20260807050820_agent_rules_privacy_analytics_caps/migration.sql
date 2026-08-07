-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "customer_email_index" TEXT,
ADD COLUMN     "customer_phone_index" TEXT,
ADD COLUMN     "visitor_id" TEXT;

-- AlterTable
ALTER TABLE "holds" ADD COLUMN     "customer_email_index" TEXT,
ADD COLUMN     "customer_phone_index" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "agent_persona" TEXT,
ADD COLUMN     "agent_tone" TEXT,
ADD COLUMN     "allow_holds" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allow_quotes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "daily_message_cap" INTEGER,
ADD COLUMN     "escalation_contact" TEXT,
ADD COLUMN     "escalation_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "guardrails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "max_hold_hours" INTEGER NOT NULL DEFAULT 72,
ADD COLUMN     "monthly_token_budget" INTEGER,
ADD COLUMN     "retention_days" INTEGER NOT NULL DEFAULT 365;

-- Ordering is opt-in for showrooms created from here on, but a showroom that has
-- been taking orders all along must not silently stop the moment this deploys.
-- Grandfathered explicitly rather than by choosing a permissive default.
UPDATE "tenants" SET "allow_orders" = true;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "actor_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_call_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_call_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organisation_id_created_at_idx" ON "audit_logs"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_call_events_tenant_id_created_at_idx" ON "tool_call_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_call_events_tenant_id_tool_created_at_idx" ON "tool_call_events"("tenant_id", "tool", "created_at");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_visitor_id_idx" ON "conversations"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "conversations_customer_phone_index_idx" ON "conversations"("customer_phone_index");

-- CreateIndex
CREATE INDEX "conversations_customer_email_index_idx" ON "conversations"("customer_email_index");

-- CreateIndex
CREATE INDEX "holds_customer_phone_index_idx" ON "holds"("customer_phone_index");

-- CreateIndex
CREATE INDEX "holds_customer_email_index_idx" ON "holds"("customer_email_index");

-- AddForeignKey
ALTER TABLE "tool_call_events" ADD CONSTRAINT "tool_call_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call_events" ADD CONSTRAINT "tool_call_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
