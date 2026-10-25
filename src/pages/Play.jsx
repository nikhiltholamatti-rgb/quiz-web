import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useGameState } from '../hooks/useGameState';
import { usePresence } from '../hooks/usePresence';
import { useServerClock } from '../hooks/useServerClock';
import { prepareShuffledOptions, fisherYatesShuffle } from '../lib/shuffle';
import { formatTimeMMSS, calculateRemainingSeconds } from '../lib/time';
import { Corners } from '../components/Corners';
import { Toast } from '../components/Toast';

export default function Play() {
  const navigate = useNavigate();
  const gameState = useGameState();
  const { offset } = useServerClock();

  // Local persistent registration
  const [savedUser, setSavedUser] = useState(() => {
    try {
      const data = localStorage.getItem('quiz_user');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  });

  const [alreadyPlayed, setAlreadyPlayed] = useState(() => {
    try {
      return localStorage.getItem('submitted') === 'true';
    } catch {
      return false;
    }
  });

  // Step 1 Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Step 2 Quiz state
  const [questions, setQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem('quiz_shuffled_questions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentIdx, setCurrentIdx] = useState(() => {
    try {
      const savedIdx = localStorage.getItem('quiz_current_idx');
      return savedIdx ? parseInt(savedIdx, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [answers, setAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem('quiz_answers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isAnswerLocking, setIsAnswerLocking] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(360);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [loadQuestionsError, setLoadQuestionsError] = useState(null);
  const [retryQuestionsCount, setRetryQuestionsCount] = useState(0);

  // Anti-cheat state & refs
  const [showToast, setShowToast] = useState(false);
  const isSwitchHandledRef = useRef(false);
  const pendingTabSwitchToastRef = useRef(false);
  const blurTimeoutRef = useRef(null);
  const submitLockRef = useRef(false);

  // Presence hook tracking this player in lobby
  usePresence({
    isHost: false,
    trackData: savedUser
      ? {
          usn: savedUser.email || savedUser.usn,
          name: savedUser.name,
          email: savedUser.email || savedUser.usn,
        }
      : null,
  });

  // Next-session & Reset Detection:
  // When admin resets the session to 'lobby', if the user was from an older session or had already submitted,
  // automatically clear their local storage and state so /play returns to the clean registration form in real-time.
  useEffect(() => {
    if (gameState.phase === 'lobby') {
      const isOldSession = savedUser && (!savedUser.sessionId || savedUser.sessionId !== gameState.session_id);
      if (isOldSession || alreadyPlayed) {
        try {
          localStorage.removeItem('quiz_user');
          localStorage.removeItem('submitted');
          localStorage.removeItem('quiz_answers');
          localStorage.removeItem('quiz_shuffled_questions');
          localStorage.removeItem('quiz_current_idx');
        } catch {}
        setSavedUser(null);
        setAlreadyPlayed(false);
        setQuizFinished(false);
        setAnswers({});
        setQuestions([]);
        setCurrentIdx(0);
        setSelectedSlot(null);
        setIsAnswerLocking(false);
        setIsSubmittingScore(false);
        submitLockRef.current = false;
      }
    }
  }, [gameState.phase, gameState.session_id, savedUser, alreadyPlayed]);

  // College email validation handler
  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);

    const trimmed = val.trim();
    if (trimmed === '') {
      setEmailError('');
      return;
    }

    // Admin shortcut bypass (212, 232)
    if (
      trimmed === '212' ||
      trimmed === '232' ||
      trimmed.toUpperCase().includes('212') ||
      trimmed.toUpperCase().includes('232')
    ) {
      setEmailError('');
      return;
    }

    if (!/^[a-zA-Z0-9._%+-]+@nmamit\.in$/i.test(trimmed)) {
      setEmailError('Please use your official @nmamit.in college email');
    } else {
      setEmailError('');
    }
  };

  // Form submit handler
  const handleRegister = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2 || trimmedName.length > 40) {
      return;
    }

    // Admin shortcut check
    const is212 = trimmedEmail === '212' || trimmedEmail.toUpperCase().includes('212');
    const is232 = trimmedEmail === '232' || trimmedEmail.toUpperCase().includes('232');
    if (is212 || is232) {
      const adminCode = is212 ? '212' : '232';
      const adminUsn = `NN25CSE${adminCode}`;
      try {
        sessionStorage.setItem('adminUsn', adminUsn);
      } catch (err) {
        console.error('SessionStorage error:', err);
      }
      navigate('/host');
      return;
    }

    if (!/^[a-zA-Z0-9._%+-]+@nmamit\.in$/i.test(trimmedEmail)) {
      setEmailError('Please use your official @nmamit.in college email');
      return;
    }

    setIsSubmittingForm(true);

    const activeSessionId = gameState.session_id || 1;
    const userData = {
      name: trimmedName,
      email: trimmedEmail.toLowerCase(),
      usn: trimmedEmail.toLowerCase(),
      sessionId: activeSessionId,
    };

    try {
      localStorage.setItem('quiz_user', JSON.stringify(userData));
    } catch (err) {
      console.warn('LocalStorage error:', err);
    }

    setSavedUser(userData);
    setIsSubmittingForm(false);
  };

  // Synchronized countdown timer driven by server clock
  useEffect(() => {
    if (gameState.phase !== 'playing' || !gameState.started_at || quizFinished) return;

    const tick = () => {
      const rem = calculateRemainingSeconds(gameState.started_at, gameState.duration_seconds, offset);
      setRemainingSeconds(rem);
      if (rem <= 0 && !quizFinished) {
        handleFinalSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 250);

    return () => clearInterval(interval);
  }, [gameState.phase, gameState.started_at, gameState.duration_seconds, offset, quizFinished]);

  // Load questions on phase === 'playing' with 0-400ms random jitter to avoid thundering herd
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    if (alreadyPlayed || quizFinished) return;
    if (questions.length > 0) return;

    // Check if we already have saved shuffled questions in localStorage
    try {
      const saved = localStorage.getItem('quiz_shuffled_questions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
          return;
        }
      }
    } catch {}

    let isMounted = true;
    const jitterMs = Math.floor(Math.random() * 400);

    const timer = setTimeout(async () => {
      if (!isSupabaseConfigured || !supabase) return;

      try {
        const { data, error } = await supabase.rpc('get_questions');

        if (error) {
          console.error('Failed to get_questions:', error);
          if (isMounted) setLoadQuestionsError(error.message);
          return;
        }

        if (isMounted && Array.isArray(data) && data.length > 0) {
          const formatted = data.map((item, index) => {
            // Read options from Supabase columns: option_a, option_b, option_c, option_d
            const rawOpts = (item.option_a !== undefined || item.option_b !== undefined)
              ? {
                  option_a: item.option_a,
                  option_b: item.option_b,
                  option_c: item.option_c,
                  option_d: item.option_d,
                }
              : (item.options || item);

            const shuffled = prepareShuffledOptions(rawOpts);
            return {
              qNum: item.id || item.q || item.question_number || (index + 1),
              text: item.question_text || item.question || `Question ${index + 1}`,
              options: shuffled,
            };
          });

          // Shuffle the 20 questions independently for this student
          const studentShuffled = fisherYatesShuffle(formatted);

          try {
            localStorage.setItem('quiz_shuffled_questions', JSON.stringify(studentShuffled));
          } catch (e) {
            console.warn('Failed to save quiz_shuffled_questions:', e);
          }

          setQuestions(studentShuffled);
        }
      } catch (err) {
        console.error('Exception fetching questions:', err);
        if (isMounted) setLoadQuestionsError(err.message);
      }
    }, jitterMs);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [gameState.phase, alreadyPlayed, quizFinished, questions.length, retryQuestionsCount]);

  // Submit score with retry backoff
  const submitScoreWithRetry = async (finalAnswersArray) => {
    if (!savedUser || !isSupabaseConfigured || !supabase) return;

    const maxRetries = 3;
    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        const { error } = await supabase.rpc('submit_score', {
          p_name: savedUser.name,
          p_usn: savedUser.usn,
          p_answers: finalAnswersArray,
        });

        if (!error) {
          success = true;
          break;
        }
        console.warn(`submit_score attempt ${attempt + 1} failed:`, error.message);
      } catch (err) {
        console.warn(`submit_score attempt ${attempt + 1} exception:`, err);
      }

      attempt++;
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }

    try {
      localStorage.setItem('submitted', 'true');
    } catch {}
    setAlreadyPlayed(true);
    setQuizFinished(true);
  };

  // Final submission handler
  const handleFinalSubmit = useCallback(async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmittingScore(true);

    // Format all 20 answers, filling unanswered with null
    const finalAnswersArray = [];
    for (let i = 1; i <= 20; i++) {
      const recordedAns = answers[i] !== undefined ? answers[i] : null;
      finalAnswersArray.push({ q: i, a: recordedAns });
    }

    try {
      localStorage.setItem('quiz_answers', JSON.stringify(answers));
    } catch {}

    await submitScoreWithRetry(finalAnswersArray);
    setIsSubmittingScore(false);
  }, [answers, savedUser]);

  // Option selection handler
  const handleSelectOption = (opt, slotIdx) => {
    if (isAnswerLocking || quizFinished || remainingSeconds <= 0) return;
    setIsAnswerLocking(true);
    setSelectedSlot(slotIdx);

    const activeQuestion = questions[currentIdx];
    const qNum = activeQuestion?.qNum || currentIdx + 1;
    const originalLetter = opt.originalLetter;

    const updatedAnswers = { ...answers, [qNum]: originalLetter };
    setAnswers(updatedAnswers);
    try {
      localStorage.setItem('quiz_answers', JSON.stringify(updatedAnswers));
    } catch {}

    // Lock and advance after 250ms
    setTimeout(() => {
      setSelectedSlot(null);
      setIsAnswerLocking(false);

      if (currentIdx + 1 < questions.length) {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        try {
          localStorage.setItem('quiz_current_idx', String(nextIdx));
        } catch {}
      } else {
        handleFinalSubmit();
      }
    }, 250);
  };

  // Anti-cheat 1: Block contextmenu, copy, selectstart, dragstart during gameplay
  useEffect(() => {
    const isGameplay = gameState.phase === 'playing' && !quizFinished && !alreadyPlayed;
    if (!isGameplay) return;

    const preventDefaultAction = (e) => {
      // Allow interaction only on explicit inputs if any
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', preventDefaultAction);
    document.addEventListener('copy', preventDefaultAction);
    document.addEventListener('selectstart', preventDefaultAction);
    document.addEventListener('dragstart', preventDefaultAction);

    return () => {
      document.removeEventListener('contextmenu', preventDefaultAction);
      document.removeEventListener('copy', preventDefaultAction);
      document.removeEventListener('selectstart', preventDefaultAction);
      document.removeEventListener('dragstart', preventDefaultAction);
    };
  }, [gameState.phase, quizFinished, alreadyPlayed]);

  // Anti-cheat 2: Visibility change & blur detection
  useEffect(() => {
    const isGameplay = gameState.phase === 'playing' && questions.length > 0 && !quizFinished && !alreadyPlayed;
    if (!isGameplay) return;

    const handleSwitchViolation = () => {
      if (isSwitchHandledRef.current) return;
      isSwitchHandledRef.current = true;
      pendingTabSwitchToastRef.current = true;

      // Mark current question wrong (null) and advance to next
      const activeQ = questions[currentIdx];
      if (activeQ) {
        const qNum = activeQ.qNum;
        setAnswers((prev) => {
          const updated = { ...prev, [qNum]: null };
          try {
            localStorage.setItem('quiz_answers', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }

      if (currentIdx + 1 < questions.length) {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        try {
          localStorage.setItem('quiz_current_idx', String(nextIdx));
        } catch {}
      } else {
        handleFinalSubmit();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleSwitchViolation();
      } else if (document.visibilityState === 'visible') {
        if (pendingTabSwitchToastRef.current) {
          setShowToast(true);
          pendingTabSwitchToastRef.current = false;
          setTimeout(() => setShowToast(false), 3000);
        }
        // Reset switch guard after short delay
        setTimeout(() => {
          isSwitchHandledRef.current = false;
        }, 600);
      }
    };

    const isDesktop = window.innerWidth >= 768;
    const handleWindowBlur = () => {
      if (!isDesktop) return;
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = setTimeout(() => {
        handleSwitchViolation();
      }, 500);
    };

    const handleWindowFocus = () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (isDesktop) {
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (isDesktop) {
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('focus', handleWindowFocus);
      }
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, [gameState.phase, questions, currentIdx, quizFinished, alreadyPlayed, handleFinalSubmit]);

  // =========================================================================
  // Check if saved user belongs to current session
  const isCurrentSessionUser = Boolean(
    savedUser && (!savedUser.sessionId || savedUser.sessionId === gameState.session_id)
  );

  return (
    <div
      className={`relative min-h-[100dvh] flex flex-col justify-between p-4 safe-area-inset z-10 ${
        gameState.phase === 'playing' && !quizFinished ? 'anti-cheat-active' : ''
      }`}
    >
      {/* Tab Switch Toast Alert */}
      <Toast
        message="TAB SWITCH DETECTED! Question forfeited."
        type="danger"
        isVisible={showToast}
        onDismiss={() => setShowToast(false)}
      />

      {/* Top Header Status Bar */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between py-2 border-b border-cyan-500/20 text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-400 font-bold tracking-wider">LIVE CAMPUS QUIZ</span>
        </div>
        <div className="text-slate-400 text-[11px] tracking-wider truncate max-w-[200px]">
          {savedUser ? (savedUser.email || savedUser.usn) : 'SYS//GUEST'}
        </div>
      </header>

      {/* Main Content Sections */}
      <main className="w-full max-w-lg mx-auto my-auto py-4">
        {/* CASE A: Registered player who already submitted or quiz finished for them */}
        {savedUser && (alreadyPlayed || quizFinished) ? (
          <Corners
            label="STATUS//COMPLETED"
            nodeId="SYS_DONE"
            accent="cyan"
            className="p-6 text-center"
          >
            <div className="w-12 h-12 mx-auto mb-4 border border-cyan-400 flex items-center justify-center text-cyan-400 text-2xl font-mono">
              ✓
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl text-cyan-300 font-bold mb-2">
              Time&apos;s Up! Look at the projector.
            </h1>
            <p className="text-slate-400 font-mono text-sm leading-relaxed mb-6">
              Your responses have been transmitted to the central server.
              The final standings and podium will be broadcast on the main screen.
            </p>
            <div className="inline-block px-4 py-2 bg-cyan-950/40 border border-cyan-800 text-xs text-cyan-400 font-mono tracking-widest truncate max-w-full">
              PLAYER: {savedUser?.name} // {savedUser?.email || savedUser?.usn}
            </div>
          </Corners>
        ) : gameState.phase === 'finished' ? (
          /* CASE B: Session concluded & visitor is not a registered player */
          <Corners
            label="STATUS//CONCLUDED"
            nodeId="SYS_FINISHED"
            accent="cyan"
            className="p-6 text-center"
          >
            <div className="w-12 h-12 mx-auto mb-4 border border-cyan-400/80 flex items-center justify-center text-cyan-400 text-2xl font-mono">
              ◈
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl text-cyan-300 font-bold mb-2">
              Session Concluded.
            </h1>
            <p className="text-slate-400 font-mono text-sm leading-relaxed mb-6">
              This quiz round has ended. Look at the main projector screen to view the podium and final standings. Registration will reopen when the host starts the next session.
            </p>
            <div className="text-xs text-slate-500 font-mono">
              SESSION STATUS: COMPLETED
            </div>
          </Corners>
        ) : !isCurrentSessionUser && gameState.phase === 'playing' ? (
          /* CASE C: Lockout - Active game in progress, new registration blocked */
          <Corners
            label="SEC//LOCKOUT"
            nodeId="ACCESS_DENIED"
            accent="amber"
            className="p-6 text-center"
          >
            <div className="w-12 h-12 mx-auto mb-4 border border-amber-400/80 flex items-center justify-center text-amber-400 text-2xl font-mono">
              !
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl text-amber-400 font-bold mb-2">
              Game already in progress.
            </h1>
            <p className="text-slate-400 font-mono text-sm leading-relaxed mb-6">
              New registrations are closed for this active session. Please watch the live projection or wait for the host to reset.
            </p>
            <div className="text-xs text-slate-500 font-mono">
              LOBBY STATUS: LOCKED
            </div>
          </Corners>
        ) : !isCurrentSessionUser ? (
          /* CASE D: Holding Room - Registration Form */
          <Corners
            label="SYS//REGISTRATION"
            nodeId="TERMINAL_01"
            accent="cyan"
            className="p-6"
          >
            <div className="mb-6">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-cyan-400 tracking-wider">
                PARTICIPANT ACCESS
              </h1>
              <p className="text-slate-400 font-mono text-xs mt-1">
                Enter your credentials to link your mobile handset.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              {/* Field 1: Name */}
              <div>
                <label htmlFor="player-name" className="block text-xs font-mono uppercase text-slate-300 mb-1.5 tracking-wider">
                  Full Name (2–40 chars)
                </label>
                <input
                  id="player-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full px-3.5 py-3 bg-slate-950/80 border border-cyan-500/30 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-100 font-mono transition-colors"
                />
              </div>

              {/* Field 2: College Email */}
              <div>
                <label htmlFor="player-email" className="block text-xs font-mono uppercase text-slate-300 mb-1.5 tracking-wider">
                  College Email (@nmamit.in)
                </label>
                <input
                  id="player-email"
                  type="text"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="e.g. student@nmamit.in"
                  className="w-full px-3.5 py-3 bg-slate-950/80 border border-cyan-500/30 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-100 font-mono transition-colors"
                />

                {/* Inline Validation Warning */}
                {emailError && (
                  <p
                    id="email-error-msg"
                    role="alert"
                    aria-live="polite"
                    className="text-red-400 text-xs font-mono mt-1.5 font-semibold flex items-center gap-1.5"
                  >
                    <span>⚠</span> {emailError}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingForm || name.trim().length < 2 || !email.trim() || Boolean(emailError)}
                className="w-full py-3.5 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-heading font-bold text-base uppercase tracking-wider transition-colors shadow-cyan-sm cursor-pointer disabled:cursor-not-allowed mt-2"
              >
                {isSubmittingForm ? 'LINKING DEVICE...' : 'ENTER ARENA →'}
              </button>
            </form>
          </Corners>
        ) : gameState.phase === 'lobby' ? (
          /* CASE E: Registered & Waiting in Lobby */
          <Corners
            label="SYS//WAITING_ROOM"
            nodeId="NODE_READY"
            accent="cyan"
            className="p-8 text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-5 border-2 border-cyan-400 flex items-center justify-center">
              <span className="w-8 h-8 rounded-full bg-cyan-400/20 animate-ping absolute" />
              <span className="font-mono text-cyan-400 font-bold text-lg">READY</span>
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl text-cyan-300 font-bold mb-3 tracking-wide">
              You&apos;re in!
            </h1>
            <p className="text-slate-300 font-mono text-sm leading-relaxed mb-6">
              Look at the projector. Waiting for host to start...
            </p>

            <div className="p-3 bg-slate-950/80 border border-cyan-500/20 font-mono text-xs space-y-1">
              <div className="text-slate-400">REGISTERED IDENTITY:</div>
              <div className="text-cyan-400 font-bold tracking-wider">{savedUser.name}</div>
              <div className="text-slate-400 font-mono text-[11px] truncate">{savedUser.email || savedUser.usn}</div>
            </div>
          </Corners>
        ) : (
          /* CASE E: Live Quiz Gameplay */
          <div className="space-y-4">
            {/* Top Telemetry Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-950/80 border border-cyan-500/30">
              {/* Question Progress Counter */}
              <div className="flex items-baseline gap-1 font-mono text-sm">
                <span className="text-slate-400 text-xs">PROGRESS:</span>
                <span className="text-cyan-400 font-bold font-heading text-base">
                  {questions.length > 0 ? `${currentIdx + 1}/${questions.length}` : '...'}
                </span>
              </div>

              {/* Synchronized Tabular Timer */}
              <div className="flex items-center gap-2 font-mono tabular-nums text-sm">
                <span className="text-slate-400 text-xs">TIME:</span>
                <span
                  className={`font-bold text-base ${
                    remainingSeconds < 30 ? 'text-red-400 animate-pulse' : 'text-cyan-300'
                  }`}
                >
                  {formatTimeMMSS(remainingSeconds)}
                </span>
              </div>
            </div>

            {/* Countdown / Progress Bar */}
            <div className="w-full h-1 bg-slate-900 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-300"
                style={{
                  width: `${
                    questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0
                  }%`,
                }}
              />
            </div>

            {/* Question Card */}
            {questions.length > 0 && questions[currentIdx] ? (
              <Corners
                label={`QUESTION ${currentIdx + 1}`}
                nodeId={`QID_${questions[currentIdx].qNum}`}
                accent="cyan"
                className="p-5"
              >
                <h2 className="font-heading text-lg sm:text-xl font-bold text-slate-100 leading-snug mb-6 min-h-[3.5rem] flex items-center">
                  {questions[currentIdx].text}
                </h2>

                {/* Shuffled 4 Option Buttons (min-height 64px, high-contrast) */}
                <div className="space-y-3">
                  {questions[currentIdx].options.map((opt, slotIdx) => {
                    const isSelected = selectedSlot === slotIdx;
                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        disabled={isAnswerLocking || isSubmittingScore}
                        onClick={() => handleSelectOption(opt, slotIdx)}
                        className={`w-full min-h-[64px] p-4 text-left flex items-center justify-between gap-4 border transition-all select-none active:scale-[0.99] cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-cyan-md'
                            : 'bg-slate-950/70 hover:bg-slate-900 border-cyan-500/20 hover:border-cyan-400/50 text-slate-200'
                        }`}
                      >
                        <span className="font-mono text-sm sm:text-base leading-snug flex-1 break-words">
                          {opt.text}
                        </span>
                        <span
                          className={`w-7 h-7 flex-shrink-0 flex items-center justify-center font-mono text-xs border ${
                            isSelected
                              ? 'border-black text-black bg-white/20'
                              : 'border-cyan-500/30 text-cyan-400 bg-cyan-950/40'
                          }`}
                        >
                          {String.fromCharCode(65 + slotIdx)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Corners>
            ) : loadQuestionsError ? (
              <Corners label="ERR//SYNC" accent="red" className="p-6 text-center">
                <p className="text-red-400 text-sm font-mono mb-4">
                  Unable to load questions: {loadQuestionsError}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoadQuestionsError(null);
                    setRetryQuestionsCount((c) => c + 1);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase"
                >
                  Retry Connection
                </button>
              </Corners>
            ) : (
              <Corners label="SYS//SYNC" accent="cyan" className="p-8 text-center">
                <div className="font-mono text-sm text-cyan-400 animate-pulse">
                  DOWNLOADING ENCRYPTED PACKET...
                </div>
              </Corners>
            )}
          </div>
        )}
      </main>

      {/* Footer System Telemetry */}
      <footer className="w-full max-w-lg mx-auto py-2 border-t border-cyan-500/10 flex items-center justify-between text-[10px] font-mono text-slate-500 select-none">
        <div>NET://SECURE_CHANNEL</div>
        <div>V2.0_CAMPUS_ARENA</div>
      </footer>
    </div>
  );
}
