/*
# Create jobs table

1. New Tables
- `jobs`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `title` (text, not null)
  - `company` (text, not null)
  - `description` (text)
  - `match_score` (integer, nullable)
  - `status` (text, default 'pending')
  - `missing_keywords` (text array, nullable)
  - `ai_suggestions` (text array, nullable)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `jobs`.
- Authenticated users can only access their own jobs.
*/

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  description text,
  match_score integer,
  status text NOT NULL DEFAULT 'pending',
  missing_keywords text[],
  ai_suggestions text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_jobs" ON jobs;
CREATE POLICY "select_own_jobs" ON jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
