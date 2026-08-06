-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "cache_creation_input_tokens" INTEGER,
ADD COLUMN     "cache_read_input_tokens" INTEGER,
ADD COLUMN     "model" TEXT;
