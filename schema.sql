-- =========================================================================
-- LIVE CAMPUS QUIZ DATABASE SCHEMA & RPCS
-- Run this script in the Supabase SQL Editor.
-- Safe to re-run: Does NOT drop tables or delete submissions or existing data.
-- =========================================================================

-- 1. Game State Table (Single row: phase, started_at, duration_seconds, session_id)
CREATE TABLE IF NOT EXISTS public.game_state (
  id INT PRIMARY KEY DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby', 'playing', 'finished')),
  started_at TIMESTAMPTZ NULL,
  duration_seconds INT NOT NULL DEFAULT 360, -- 6-minute (360 seconds) game duration
  session_id INT NOT NULL DEFAULT 1
);

-- Ensure columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_state' AND column_name = 'session_id') THEN
    ALTER TABLE public.game_state ADD COLUMN session_id INT NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_state' AND column_name = 'duration_seconds') THEN
    ALTER TABLE public.game_state ADD COLUMN duration_seconds INT NOT NULL DEFAULT 360;
  END IF;
END $$;

-- Ensure singleton row exists
INSERT INTO public.game_state (id, phase, started_at, duration_seconds, session_id)
VALUES (1, 'lobby', NULL, 360, 1)
ON CONFLICT (id) DO UPDATE
SET duration_seconds = 360;

-- Enable Realtime for game_state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'game_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
  END IF;
END $$;

-- 2. Questions Bank Table with explicit option columns
CREATE TABLE IF NOT EXISTS public.questions (
  id INT PRIMARY KEY,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D'))
);

-- Ensure columns exist in case table was created with another structure
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'option_a') THEN
    ALTER TABLE public.questions ADD COLUMN option_a TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'option_b') THEN
    ALTER TABLE public.questions ADD COLUMN option_b TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'option_c') THEN
    ALTER TABLE public.questions ADD COLUMN option_c TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'option_d') THEN
    ALTER TABLE public.questions ADD COLUMN option_d TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'correct_option') THEN
    ALTER TABLE public.questions ADD COLUMN correct_option TEXT;
  END IF;
END $$;

-- 3. Leaderboard Table
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id SERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  usn TEXT NOT NULL UNIQUE,
  correct_answers INT NOT NULL DEFAULT 0,
  time_taken_seconds NUMERIC(6,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure column type supports decimal seconds (e.g. 142.6s) and unique USN
DO $$
BEGIN
  ALTER TABLE public.leaderboard ALTER COLUMN time_taken_seconds TYPE NUMERIC(6,1);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leaderboard_usn_key' AND conrelid = 'public.leaderboard'::regclass
  ) THEN
    ALTER TABLE public.leaderboard ADD CONSTRAINT leaderboard_usn_key UNIQUE (usn);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =========================================================================
-- RPC FUNCTIONS
-- =========================================================================

-- RPC: get_server_time()
-- Returns PostgreSQL epoch milliseconds directly to ensure host and participants
-- calculate the identical remaining time regardless of client device clock skew.
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
$$;

GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated;

-- RPC: get_questions()
-- Returns 20 questions with option_a, option_b, option_c, option_d.
-- STRICTLY OMITS correct_option to protect answer key from player devices.
CREATE OR REPLACE FUNCTION public.get_questions()
RETURNS TABLE (
  id INT,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
#variable_conflict use_column
DECLARE
  v_phase TEXT;
BEGIN
  SELECT gs.phase INTO v_phase
  FROM public.game_state gs
  WHERE gs.id = 1;

  IF v_phase <> 'playing' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d
  FROM public.questions q
  ORDER BY q.id ASC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_questions() TO anon, authenticated;

-- RPC: start_game(p_usn TEXT)
-- admin USN: lobby -> playing, stamps started_at with server UTC timestamp and sets 360s duration
CREATE OR REPLACE FUNCTION public.start_game(p_usn TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_usn NOT IN ('NN25CSE212', 'NN25CSE232') THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin credentials.';
  END IF;

  UPDATE public.game_state
  SET
    phase = 'playing',
    started_at = timezone('utc'::text, now()),
    duration_seconds = 360
  WHERE id = 1;

  RETURN TRUE;
END;
$$;

-- RPC: finish_game()
-- returns true once game duration is over, else false
CREATE OR REPLACE FUNCTION public.finish_game()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_duration INT;
  v_phase TEXT;
  v_elapsed_seconds DOUBLE PRECISION;
BEGIN
  SELECT gs.phase, gs.started_at, gs.duration_seconds
  INTO v_phase, v_started_at, v_duration
  FROM public.game_state gs
  WHERE gs.id = 1;

  IF v_phase = 'finished' THEN
    RETURN TRUE;
  END IF;

  IF v_started_at IS NULL THEN
    RETURN FALSE;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (timezone('utc'::text, now()) - v_started_at));

  IF v_elapsed_seconds >= v_duration THEN
    UPDATE public.game_state
    SET
      phase = 'finished'
    WHERE id = 1;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

-- RPC: reset_game(p_usn TEXT)
-- admin USN -> back to lobby, advances session_id, resets started_at, ensures duration_seconds is 360
CREATE OR REPLACE FUNCTION public.reset_game(p_usn TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF UPPER(p_usn) NOT IN ('NN25CSE212', 'NN25CSE232') THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin credentials.';
  END IF;

  UPDATE public.game_state
  SET
    phase = 'lobby',
    started_at = NULL,
    duration_seconds = 360,
    session_id = COALESCE(session_id, 1) + 1
  WHERE id = 1;
END;
$$;

-- RPC: submit_score(p_name TEXT, p_usn TEXT, p_answers JSONB)
-- Validates answers server-side against public.questions.correct_option.
-- Calculates authoritative server-side elapsed time (capped at game deadline).
-- Saves validated result to public.leaderboard for the active session.
CREATE OR REPLACE FUNCTION public.submit_score(
  p_name TEXT,
  p_usn TEXT,
  p_answers JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_duration INT;
  v_session_id INT;
  v_phase TEXT;
  v_grace_seconds INT := 30; -- Submission grace period for network transit
  v_elapsed_seconds DOUBLE PRECISION;
  v_score INT := 0;
  v_time_taken INT := 0;
  v_item JSONB;
  v_q INT;
  v_ans TEXT;
  v_correct TEXT;
BEGIN
  -- Prevent admin USNs from polluting the leaderboard
  IF UPPER(p_usn) IN ('NN25CSE212', 'NN25CSE232') THEN
    RETURN json_build_object('status', 'admin_ignored');
  END IF;

  SELECT phase, started_at, duration_seconds, session_id
  INTO v_phase, v_started_at, v_duration, v_session_id
  FROM public.game_state 
  WHERE id = 1;

  IF v_phase = 'lobby' THEN
    RAISE EXCEPTION 'game not started';
  END IF;

  -- Deadline check: reject if past duration + submission grace period
  IF v_started_at IS NOT NULL THEN
    v_elapsed_seconds := EXTRACT(EPOCH FROM (timezone('utc'::text, now()) - v_started_at));
    IF v_elapsed_seconds > (v_duration + v_grace_seconds) THEN
      RAISE EXCEPTION 'submission window closed';
    END IF;
    -- Actual elapsed time from official start to submission, capped at duration
    v_time_taken := LEAST(v_duration, GREATEST(0, FLOOR(v_elapsed_seconds)::INT));
  END IF;

  -- Compute score from correct answers matching public.questions.correct_option
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_q := (v_item->>'q')::INT;
    v_ans := v_item->>'a';

    SELECT correct_option INTO v_correct
    FROM public.questions
    WHERE id = v_q;

    IF v_correct IS NOT NULL AND v_ans IS NOT NULL AND UPPER(v_correct) = UPPER(v_ans) THEN
      v_score := v_score + 1;
    END IF;
  END LOOP;

  -- Save validated result to the leaderboard table for current session
  -- Prevent duplicate submissions from increasing score or creating duplicate records
  INSERT INTO public.leaderboard (player_name, usn, correct_answers, time_taken_seconds, session_id)
  VALUES (LEFT(TRIM(p_name), 60), UPPER(TRIM(p_usn)), v_score, v_time_taken, COALESCE(v_session_id, 1))
  ON CONFLICT (session_id, usn) DO NOTHING;

  RETURN json_build_object('score', v_score, 'time', v_time_taken);
END;
$$;

-- RPC: get_top_players()
-- top 3, only when phase = finished for the current session.
-- Ranks players by correct_answers DESC, then time_taken_seconds ASC, then created_at ASC.
CREATE OR REPLACE FUNCTION public.get_top_players()
RETURNS TABLE (
  player_name TEXT,
  usn TEXT,
  correct_answers INT,
  time_taken_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_session_id INT;
BEGIN
  SELECT phase, session_id INTO v_phase, v_session_id FROM public.game_state WHERE id = 1;

  IF v_phase <> 'finished' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.player_name,
    l.usn,
    l.correct_answers,
    l.time_taken_seconds::INT
  FROM public.leaderboard l
  WHERE l.session_id = COALESCE(v_session_id, 1)
  ORDER BY l.correct_answers DESC, l.time_taken_seconds ASC, l.created_at ASC
  LIMIT 3;
END;
$$;

-- RPC: get_all_results()
-- Returns all participants, only when phase = finished for the current session.
-- Ranks players by correct_answers DESC, then time_taken_seconds ASC, then created_at ASC.
CREATE OR REPLACE FUNCTION public.get_all_results()
RETURNS TABLE (
  player_name TEXT,
  usn TEXT,
  correct_answers INT,
  time_taken_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_session_id INT;
BEGIN
  SELECT phase, session_id INTO v_phase, v_session_id FROM public.game_state WHERE id = 1;

  IF v_phase <> 'finished' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.player_name,
    l.usn,
    l.correct_answers,
    l.time_taken_seconds::INT
  FROM public.leaderboard l
  WHERE l.session_id = COALESCE(v_session_id, 1)
  ORDER BY l.correct_answers DESC, l.time_taken_seconds ASC, l.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_players() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_results() TO anon, authenticated;

-- =========================================================================
-- EXACT 20 TECH EVENT QUESTIONS AND OPTIONS
-- Upsert (INSERT ... ON CONFLICT (id) DO UPDATE ...)
-- This updates existing records or inserts missing ones. It NEVER deletes data.
-- =========================================================================
INSERT INTO public.questions (id, question_text, option_a, option_b, option_c, option_d, correct_option)
VALUES
  (
    1,
    'Which platform is the industry standard for professional networking, finding internships, and connecting with recruiters?',
    'Instagram',
    'GitHub',
    'LinkedIn',
    'StackOverflow',
    'C'
  ),
  (
    2,
    'When applying for jobs or internships online, what does "ATS" stand for?',
    'Automated Testing System',
    'Applicant Tracking System',
    'Application Tech Software',
    'Advanced Tracking Solution',
    'B'
  ),
  (
    3,
    'What is the primary purpose of participating in a college Hackathon?',
    'To illegally hack a company''s website',
    'To build a software or hardware project from scratch in a short time frame',
    'To take a standardized coding exam',
    'To fix broken computers',
    'B'
  ),
  (
    4,
    'Which of these is the most effective way to prove your coding skills to an employer?',
    'Listing "C/C++" in the skills section of a resume',
    'Showing a live, working project hosted on GitHub or a portfolio website',
    'Saying you got an A+ in class',
    'Writing a long cover letter',
    'B'
  ),
  (
    5,
    'Which tech role is primarily focused on making sure an application looks beautiful, is accessible, and provides a great user experience?',
    'Database Administrator',
    'UI/UX Designer',
    'Cloud Engineer',
    'DevOps',
    'B'
  ),
  (
    6,
    'What does "Open Source" mean when referring to projects on platforms like GitHub?',
    'The project is confidential',
    'The source code is publicly available for anyone to view, use, and contribute to',
    'It can only be used by students',
    'The code is written in Python',
    'B'
  ),
  (
    7,
    'In a tech interview, what is a "behavioral interview" designed to test?',
    'Your ability to write algorithms',
    'Your soft skills, teamwork, and how you handle challenges',
    'Your typing speed',
    'Your knowledge of hardware',
    'B'
  ),
  (
    8,
    'When answering behavioral interview questions, recruiters look for the "STAR" method. What does STAR stand for?',
    'Situation, Task, Action, Result',
    'Speed, Testing, Accuracy, Reliability',
    'System, Time, Analysis, Review',
    'Software, Technology, Application, Routing',
    'A'
  ),
  (
    9,
    'Why might a beautiful, multi-column resume created in Canva get instantly rejected by a company''s ATS portal?',
    'It looks too unprofessional',
    'The parsing software reads left-to-right and jumbles the columns of text together',
    'Canva files are too large to upload',
    'ATS only accepts text written in black ink',
    'B'
  ),
  (
    10,
    'What is the primary difference between a Data Engineer and a Data Scientist?',
    'Engineers visualize data; Scientists collect it',
    'Engineers build the pipelines to collect and clean data; Scientists analyze it and build models',
    'Engineers work on hardware; Scientists work on software',
    'There is no difference',
    'B'
  ),
  (
    11,
    'In the tech and startup industry, what does the term "Unicorn" refer to?',
    'A developer who knows both design and backend perfectly',
    'A privately held startup company valued at over $1 billion',
    'A software bug that is impossible to reproduce',
    'An open-source project with over 1 million stars',
    'B'
  ),
  (
    12,
    'When contributing to open-source projects to build your portfolio, what is the standard process to propose your code changes to the original project?',
    'Send a Pull Request (PR)',
    'Commit directly to the main branch',
    'Raise a Git Ticket',
    'Fork the master server',
    'A'
  ),
  (
    13,
    'If a tech startup describes itself as a "B2B SaaS" company, what does this mean?',
    'Back-to-Back Server Architecture Systems',
    'Business-to-Business Software as a Service',
    'Basic-to-Broad Systems as a Service',
    'Business-to-Buyer Sales and Support',
    'B'
  ),
  (
    14,
    'When receiving a high-paying tech job offer, what does "Equity" or "ESOPs" refer to?',
    'Equal pay guarantees across the team',
    'Company stock options giving you partial ownership',
    'The end-of-year cash bonus',
    'The health insurance package',
    'B'
  ),
  (
    15,
    'Which software development methodology emphasizes building products in short, 1-to-2 week iterative cycles called "sprints"?',
    'Waterfall',
    'Agile',
    'Monolithic',
    'Six Sigma',
    'B'
  ),
  (
    16,
    'Which entry-level role is often the best stepping stone for someone interested in Cloud Architecture?',
    'Cloud Support Associate or Junior SysAdmin',
    '3D Animator',
    'Social Media Manager',
    'Hardware Sales Rep',
    'A'
  ),
  (
    17,
    'What is "Cold Emailing" in a job search?',
    'Sending emails during winter',
    'Sending a professional message to a recruiter or professional you haven''t met before to ask for advice or opportunities',
    'Sending spam emails',
    'Replying to a job offer',
    'B'
  ),
  (
    18,
    'Why is taking on a leadership role in a student club valuable for your career?',
    'It guarantees a job at Google',
    'It replaces the need for a degree',
    'It builds leadership skills, teamwork, and a network of peers',
    'It gives extra credits',
    'C'
  ),
  (
    19,
    'Which of the following best describes the role of a "Product Manager"?',
    'They write the backend code',
    'They act as the bridge between business, design, and engineering to decide WHAT to build',
    'They fix bugs',
    'They design marketing posters',
    'B'
  ),
  (
    20,
    'In the context of early career growth, what is a "Mentor"?',
    'Your college principal',
    'An experienced professional who provides guidance, advice, and support for your career development',
    'A recruiter who interviews you',
    'A student in your own class',
    'B'
  )
ON CONFLICT (id) DO UPDATE
SET question_text = EXCLUDED.question_text,
    option_a = EXCLUDED.option_a,
    option_b = EXCLUDED.option_b,
    option_c = EXCLUDED.option_c,
    option_d = EXCLUDED.option_d,
    correct_option = EXCLUDED.correct_option;
