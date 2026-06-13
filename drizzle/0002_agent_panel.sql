-- Add title and model columns to chat_conversations for the detached AI agent panel
ALTER TABLE "chat_conversations" ADD COLUMN "title" text;
ALTER TABLE "chat_conversations" ADD COLUMN "model_id" text DEFAULT 'claude-sonnet-4-6';
