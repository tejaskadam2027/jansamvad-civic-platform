/*
# Create chat conversations and messages tables for the AI assistant

1. New Tables
- `chat_conversations`: one per user per conversation thread.
- `chat_messages`: individual messages in a conversation.
2. Security
- Enable RLS on both tables.
- Grant SELECT, INSERT, DELETE to authenticated (no UPDATE needed).
- Owner-scoped policies: users can only read/insert/delete their own conversations and the messages within them.
3. Indexes
- Index on chat_conversations.user_id.
- Index on chat_messages.conversation_id.
4. Realtime
- Not enabled (chat is request/response, no need for cross-tab live updates).
*/

CREATE TABLE IF NOT EXISTS chat_conversations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON chat_conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON chat_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON chat_conversations TO service_role;
GRANT SELECT, INSERT, DELETE ON chat_messages TO service_role;

DROP POLICY IF EXISTS "select_own_conversations" ON chat_conversations;
CREATE POLICY "select_own_conversations"
ON chat_conversations FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_conversations" ON chat_conversations;
CREATE POLICY "insert_own_conversations"
ON chat_conversations FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_conversations" ON chat_conversations;
CREATE POLICY "delete_own_conversations"
ON chat_conversations FOR DELETE
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_messages" ON chat_messages;
CREATE POLICY "select_own_messages"
ON chat_messages FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
CREATE POLICY "insert_own_messages"
ON chat_messages FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS "delete_own_messages" ON chat_messages;
CREATE POLICY "delete_own_messages"
ON chat_messages FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages (conversation_id);
