import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Confetti from 'react-confetti';
import { supabase, isSupabaseConfigured, checkSupabaseHealth } from '../lib/supabase';
import { useGameState } from '../hooks/useGameState';
import { usePresence } from '../hooks/usePresence';
import { useServerClock } from '../hooks/useServerClock';
import { formatTimeMMSS, calculateRemainingSeconds, formatSecondsDetailed } from '../lib/time';
import { Corners } from '../components/Corners';

export default function Host() {
  const navigate = useNavigate();
  const gameState = useGameState();
  const { offset } = useServerClock();

  // Guard check: admin USN in sessionStorage
  const [adminUsn] = useState(() => {
    try {
      return sessionStorage.getItem('adminUsn');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!adminUsn) {
      navigate('/play', { replace: true });
    }
  }, [adminUsn, navigate]);

  // Presence hook tracking joined players
  const { playerCount, recentPlayers } = usePresence({ isHost: true });

  // Host UI state
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isResettingGame, setIsResettingGame] = useState(false);
  const [healthStatus, setHealthStatus] = useState({ ok: true, checking: false });
  const [remainingSeconds, setRemainingSeconds] = useState(360);

  // Podium sequence states: 'idle' | 'calculating' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'empty'
  const [podiumStage, setPodiumStage] = useState('idle');
  const [topPlayers, setTopPlayers] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [isAllResultsOpen, setIsAllResultsOpen] = useState(false);
  const [isLoadingAllResults, setIsLoadingAllResults] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState(false);

  // Guards to run podium sequence once per page load
  const hasRunPodiumRef = useRef(false);
  const finishGamePollingRef = useRef(null);

  // Window resize listener for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Periodic health check for Supabase connection (green/red dot)
  useEffect(() => {
    let isMounted = true;
    async function runCheck() {
      const res = await checkSupabaseHealth();
      if (isMounted) setHealthStatus({ ok: res.ok, checking: false });
    }

    runCheck();
    const interval = setInterval(runCheck, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Synchronized countdown for projector screen
  useEffect(() => {
    if (gameState.phase !== 'playing' || !gameState.started_at) return;

    const tick = () => {
      const rem = calculateRemainingSeconds(gameState.started_at, gameState.duration_seconds, offset);
      setRemainingSeconds(rem);

      if (rem <= 0) {
        // At 00:00 call finish_game() and retry every 1s until true
        triggerFinishGame();
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.started_at, gameState.duration_seconds, offset]);

  // Call finish_game() RPC with 1s retry loop until true
  const triggerFinishGame = useCallback(() => {
    if (finishGamePollingRef.current) return;

    async function attemptFinish() {
      if (!isSupabaseConfigured || !supabase) return;
      try {
        const { data: isFinished, error } = await supabase.rpc('finish_game');
        if (!error && isFinished === true) {
          if (finishGamePollingRef.current) {
            clearInterval(finishGamePollingRef.current);
            finishGamePollingRef.current = null;
          }
          gameState.refetch();
          return;
        }
      } catch (err) {
        console.warn('finish_game poll exception:', err);
      }
    }

    attemptFinish();
    finishGamePollingRef.current = setInterval(attemptFinish, 1000);
  }, [gameState]);

  // Clean up finish game polling on unmount
  useEffect(() => {
    return () => {
      if (finishGamePollingRef.current) {
        clearInterval(finishGamePollingRef.current);
        finishGamePollingRef.current = null;
      }
    };
  }, []);

  // Admin-controlled Result Reveal
  const handleRevealResults = async () => {
    if (!adminUsn || isRevealing || podiumStage !== 'idle') return;
    setIsRevealing(true);
    setPodiumStage('calculating');

    let players = [];
    try {
      const { data, error } = await supabase.rpc('get_top_players');
      if (!error && Array.isArray(data)) {
        players = data
          .map((p) => ({
            playerName: p.player_name || p.name || '',
            usn: p.usn || '',
            correctAnswers: p.correct_answers ?? p.score ?? 0,
            timeTakenSeconds: Number(p.time_taken_seconds ?? 0),
          }))
          .filter((p) => Boolean(p.playerName || p.usn));
      }
    } catch (err) {
      console.warn('Failed to fetch top players:', err);
    }

    setTopPlayers(players);

    // 1. "CALCULATING FINAL STANDINGS..." spinner for exactly 3 seconds
    setTimeout(() => {
      setIsRevealing(false);
      if (players.length === 0) {
        setPodiumStage('empty');
        return;
      }

      if (players.length === 1) {
        // Exactly 1 player exists: reveal 1st place directly
        setPodiumStage('reveal_first');
        setConfettiActive(true);
        setTimeout(() => {
          setConfettiActive(false);
        }, 8000);
        return;
      }

      if (players.length === 2) {
        // 2 players: reveal 2nd place first, then 1st place
        setPodiumStage('reveal_second');
        setTimeout(() => {
          setPodiumStage('reveal_first');
          setConfettiActive(true);
          setTimeout(() => {
            setConfettiActive(false);
          }, 8000);
        }, 2500);
        return;
      }

      // 3 or more players: reveal 3rd place first, then 2nd place, then 1st place
      setPodiumStage('reveal_third');
      setTimeout(() => {
        setPodiumStage('reveal_second');
        setTimeout(() => {
          setPodiumStage('reveal_first');
          setConfettiActive(true);
          setTimeout(() => {
            setConfettiActive(false);
          }, 8000);
        }, 2500);
      }, 2500);
    }, 3000);
  };

  // Open Full Results modal & fetch all participants
  const handleOpenAllResults = async () => {
    setIsAllResultsOpen(true);
    setIsLoadingAllResults(true);
    try {
      const { data, error } = await supabase.rpc('get_all_results');
      if (!error && Array.isArray(data)) {
        setAllResults(
          data.map((p, idx) => ({
            rank: idx + 1,
            playerName: p.player_name || '',
            usn: p.usn || '',
            correctAnswers: p.correct_answers ?? 0,
            timeTakenSeconds: Number(p.time_taken_seconds ?? 0),
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to fetch all results:', err);
    } finally {
      setIsLoadingAllResults(false);
    }
  };

  // Action: Start Game
  const handleStartGame = async () => {
    if (isStartingGame || !adminUsn) return;
    setIsStartingGame(true);

    try {
      const { error } = await supabase.rpc('start_game', { p_usn: adminUsn });
      if (error) {
        alert(`Failed to start game: ${error.message}`);
      } else {
        await gameState.refetch();
      }
    } catch (err) {
      alert(`Network error starting game: ${err.message}`);
    } finally {
      setIsStartingGame(false);
    }
  };

  // Action: Reset Game
  const handleResetGame = async () => {
    if (!adminUsn) return;
    const confirmed = window.confirm(
      'Are you sure you want to RESET the game? This will conclude the current session, preserve results in the database, and open the lobby for a new session.'
    );
    if (!confirmed) return;

    setIsResettingGame(true);
    try {
      const { error } = await supabase.rpc('reset_game', { p_usn: adminUsn });
      if (error) {
        alert(`Failed to reset game: ${error.message}`);
      } else {
        hasRunPodiumRef.current = false;
        setPodiumStage('idle');
        setIsRevealing(false);
        setConfettiActive(false);
        setTopPlayers([]);
        setAllResults([]);
        setIsAllResultsOpen(false);
        await gameState.refetch();
      }
    } catch (err) {
      alert(`Network error resetting game: ${err.message}`);
    } finally {
      setIsResettingGame(false);
    }
  };

  // Target URL for mobile player QR code
  // Priority: VITE_PUBLIC_URL (for LAN testing) -> window.location.origin
  const playUrl = import.meta.env.VITE_PUBLIC_URL
    ? `${import.meta.env.VITE_PUBLIC_URL.replace(/\/$/, '')}/play`
    : `${window.location.origin}/play`;

  if (!adminUsn) return null;

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between p-6 sm:p-10 select-none z-10 overflow-hidden">
      {/* Confetti container for 1st place victory */}
      {confettiActive && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={true}
          numberOfPieces={400}
          gravity={0.25}
          colors={['#22d3ee', '#2563eb', '#f5a524', '#ffffff', '#38bdf8']}
        />
      )}

      {/* Top Projector Header */}
      <header className="flex items-center justify-between border-b border-cyan-500/30 pb-4 font-mono">
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-cyan-950/80 border border-cyan-400 text-cyan-400 font-bold text-sm tracking-widest uppercase">
            HOST PROJECTOR MATRIX
          </div>
          <span className="text-slate-400 text-xs hidden md:inline-block">
            AUTHENTICATED: {adminUsn}
          </span>
        </div>

        {/* Health status indicator & Reset Control */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                healthStatus.ok ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
              }`}
            />
            <span className="text-slate-400">
              SUPABASE // {healthStatus.ok ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleResetGame}
            disabled={isResettingGame}
            className="px-3 py-1 text-xs border border-red-500/40 text-red-400 hover:bg-red-950/50 hover:border-red-400 uppercase tracking-wider transition-colors cursor-pointer"
          >
            {isResettingGame ? 'RESETTING...' : 'RESET ARENA'}
          </button>
        </div>
      </header>

      {/* MAIN PROJECTOR VIEWPORT */}
      <main className="my-auto py-6">
        {/* VIEW 1: LOBBY */}
        {gameState.phase === 'lobby' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-7xl mx-auto">
            {/* Left Column: QR Code to Join */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <Corners
                label="ACCESS//PORTAL"
                nodeId="SCAN_TO_PLAY"
                accent="cyan"
                className="p-6 text-center shadow-cyan-md"
              >
                <div className="p-4 bg-white inline-block shadow-inner">
                  <QRCodeSVG
                    value={playUrl}
                    size={Math.min(260, Math.max(180, Math.floor(window.innerWidth * 0.18)))}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div className="mt-4 font-mono text-xs text-slate-300 tracking-wider">
                  SCAN ON SMARTPHONE TO JOIN
                </div>
                <div className="mt-1 font-mono text-[11px] text-cyan-400 truncate max-w-xs">
                  {playUrl}
                </div>
              </Corners>
            </div>

            {/* Right Column: Telemetry & Start Button */}
            <div className="lg:col-span-7 space-y-6">
              {/* Huge Live Participant Counter */}
              <Corners
                label="SYS//TELEMETRY"
                nodeId="PRESENCE_ACTIVE"
                accent="cyan"
                className="p-6"
              >
                <div className="flex items-baseline justify-between mb-4">
                  <span className="font-heading text-lg text-slate-300 font-bold tracking-wider">
                    DEVICES LINKED IN LOBBY
                  </span>
                  <span className="font-mono text-xs text-cyan-400 animate-pulse">
                    LIVE_SYNC
                  </span>
                </div>

                <div className="font-heading text-6xl sm:text-8xl font-black text-cyan-400 tabular-nums tracking-tight mb-2 drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                  {String(playerCount).padStart(2, '0')}
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Target Concurrency: ~80 Mobile Terminals
                </div>
              </Corners>

              {/* Live Terminal Feed of Registered Players (Scrollable) */}
              <Corners
                label="FEED//ACTIVE_NODES"
                nodeId="STREAM_ACTIVE"
                accent="blue"
                className="p-4"
              >
                <div className="text-xs font-mono text-slate-400 mb-2 border-b border-blue-500/20 pb-1 flex justify-between items-center">
                  <span>LAST ACTIVE NODES ({recentPlayers.length})</span>
                  <span>STATUS</span>
                </div>
                <div className="h-44 overflow-y-auto overscroll-contain space-y-1.5 font-mono text-xs pr-1">
                  {recentPlayers.length > 0 ? (
                    recentPlayers.map((player) => (
                      <div
                        key={player.usn}
                        className="flex items-center justify-between text-slate-300 px-2 py-1.5 bg-blue-950/20 border border-blue-500/10 hover:border-cyan-500/30 transition-colors"
                      >
                        <div className="flex items-baseline gap-2 min-w-0 pr-2">
                          <span className="text-cyan-300 font-bold truncate max-w-[140px] sm:max-w-[180px]">
                            {player.name}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px] truncate max-w-[160px] sm:max-w-[220px]">
                            {player.email || player.usn}
                          </span>
                        </div>
                        <span className="text-emerald-400 text-[10px] flex-shrink-0">VERIFIED</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 italic text-center py-8">
                      Awaiting participant connections...
                    </div>
                  )}
                </div>
              </Corners>

              {/* Prominent START GAME Button */}
              <button
                type="button"
                onClick={handleStartGame}
                disabled={isStartingGame}
                className="w-full py-5 px-8 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-heading font-black text-2xl sm:text-3xl uppercase tracking-widest transition-all shadow-cyan-lg hover:shadow-cyan-lg active:scale-[0.99] cursor-pointer"
              >
                {isStartingGame ? 'INITIALIZING STAMP...' : '⚡ START GAME NOW'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: PLAYING - Fullscreen Huge Countdown */}
        {gameState.phase === 'playing' && (
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-950/80 border border-cyan-400 text-cyan-400 text-sm font-mono tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              LIVE MATCH IN PROGRESS
            </div>

            {/* Massive MM:SS Timer */}
            <div className="py-6">
              <div
                className={`font-heading text-[18vw] sm:text-[14vw] font-black leading-none tabular-nums tracking-tighter ${
                  remainingSeconds < 30
                    ? 'text-red-500 drop-shadow-[0_0_35px_rgba(239,68,68,0.7)] animate-pulse'
                    : 'text-cyan-300 drop-shadow-[0_0_40px_rgba(34,211,238,0.5)]'
                }`}
              >
                {formatTimeMMSS(remainingSeconds)}
              </div>
            </div>

            {/* Subtitle guidance */}
            <p className="font-mono text-slate-400 text-sm sm:text-lg tracking-wide uppercase">
              Participants are submitting answers on mobile terminals. Complete silence.
            </p>
          </div>
        )}

        {/* VIEW 3: FINISHED - ADMIN CONTROLLED RESULT REVEAL & PODIUM */}
        {gameState.phase === 'finished' && (
          <div className="max-w-5xl mx-auto text-center w-full">
            {podiumStage === 'idle' ? (
              /* A. RESULTS READY SCREEN (Awaiting Admin Activation) */
              <div className="max-w-2xl mx-auto text-center space-y-8 py-8 animate-fadeIn">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-950/80 border border-cyan-400 text-cyan-400 text-sm font-mono tracking-widest uppercase">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  SESSION CONCLUDED // FINAL SCORES COMPILED
                </div>

                <Corners
                  label="SYS//STATUS"
                  nodeId="STANDINGS_LOCKED"
                  accent="cyan"
                  className="p-8 sm:p-12 text-center"
                >
                  <div className="w-16 h-16 mx-auto mb-6 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 text-3xl font-mono">
                    ◈
                  </div>

                  <h1 className="font-heading text-3xl sm:text-5xl font-black text-slate-100 tracking-wider mb-8">
                    RESULTS READY
                  </h1>

                  <button
                    type="button"
                    id="reveal-results-btn"
                    onClick={handleRevealResults}
                    disabled={isRevealing}
                    className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-cyan-500 via-cyan-400 to-amber-400 hover:from-cyan-400 hover:to-amber-300 text-slate-950 font-heading font-black text-2xl sm:text-3xl uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:shadow-[0_0_40px_rgba(245,165,36,0.6)] active:scale-[0.99] cursor-pointer"
                  >
                    ⚡ REVEAL RESULTS
                  </button>
                </Corners>
              </div>
            ) : podiumStage === 'calculating' ? (
              /* B. CALCULATING FINAL STANDINGS... spinner for exactly 3 seconds */
              <div className="py-16 space-y-6">
                <div className="w-20 h-20 mx-auto border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <h1 className="font-heading text-4xl sm:text-5xl font-black text-cyan-400 tracking-widest animate-pulse">
                  CALCULATING FINAL STANDINGS...
                </h1>
                <p className="font-mono text-slate-400 text-sm">
                  Verifying cryptographic hashes and computing latency delta...
                </p>
              </div>
            ) : (
              /* C. PODIUM REVEAL (TOP THREE ORDER: 3RD -> 2ND -> 1ST) */
              <div className="space-y-8 animate-fadeIn">
                <div className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-2">
                  OFFICIAL EVENT STANDINGS
                </div>
                <h1 className="font-heading text-4xl sm:text-6xl font-black text-slate-100 tracking-wider">
                  CHAMPIONSHIP PODIUM
                </h1>

                {topPlayers.length === 0 ? (
                  <Corners accent="cyan" className="p-8 max-w-md mx-auto text-center">
                    <div className="text-xl font-heading font-bold text-cyan-400 mb-2">
                      NO SUBMITTED RESULTS
                    </div>
                    <p className="font-mono text-slate-400 text-sm">
                      No eligible player submissions were recorded for this session.
                    </p>
                  </Corners>
                ) : topPlayers.length === 1 ? (
                  /* Single player podium (no fabricated positions) */
                  <div className="max-w-md mx-auto pt-4 transition-all duration-700 transform scale-105">
                    <Corners
                      label="RANK 01"
                      nodeId="GOLD_PODIUM"
                      accent="amber"
                      className="p-10 text-center bg-slate-950/95 border-amber-400 shadow-amber-md ring-1 ring-amber-400/40"
                    >
                      <div className="text-3xl font-heading font-black text-amber-400 mb-2 tracking-wider uppercase drop-shadow-[0_0_20px_rgba(245,165,36,0.6)]">
                        1ST PLACE
                      </div>
                      <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-amber-300 mb-1 truncate">
                        {topPlayers[0].playerName}
                      </h2>
                      {topPlayers[0].usn && (
                        <div className="text-amber-200/70 font-mono text-xs mb-5 truncate">
                          {topPlayers[0].usn}
                        </div>
                      )}

                      <div className="p-4 bg-amber-950/40 border border-amber-600/80 font-mono text-sm grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-amber-200/70 text-xs block">SCORE</span>
                          <span className="text-amber-300 font-bold text-xl">
                            {topPlayers[0].correctAnswers} / 20
                          </span>
                        </div>
                        <div>
                          <span className="text-amber-200/70 text-xs block">TIME</span>
                          <span className="text-amber-300 font-bold text-xl">
                            {formatSecondsDetailed(topPlayers[0].timeTakenSeconds)}
                          </span>
                        </div>
                      </div>
                    </Corners>
                  </div>
                ) : topPlayers.length === 2 ? (
                  /* 2-player podium */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end max-w-4xl mx-auto pt-6">
                    {/* 2nd Place Card (Revealed first) */}
                    <div
                      className={`transition-all duration-700 transform ${
                        podiumStage === 'reveal_second' || podiumStage === 'reveal_first'
                          ? 'opacity-100 translate-y-0'
                          : 'opacity-0 translate-y-8'
                      }`}
                    >
                      <Corners
                        label="RANK 02"
                        nodeId="SILVER_PODIUM"
                        accent="blue"
                        className="p-8 text-center bg-slate-950/90 border-blue-500/50 shadow-lg"
                      >
                        <div className="text-3xl font-heading font-black text-blue-400 mb-2 tracking-wider uppercase">
                          2ND PLACE
                        </div>
                        <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-100 mb-1 truncate">
                          {topPlayers[1].playerName}
                        </h2>
                        {topPlayers[1].usn && (
                          <div className="text-slate-400 font-mono text-xs mb-4 truncate">
                            {topPlayers[1].usn}
                          </div>
                        )}

                        <div className="p-3 bg-blue-950/40 border border-blue-800/60 font-mono text-sm grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-400 text-xs block">SCORE</span>
                            <span className="text-blue-300 font-bold text-lg">
                              {topPlayers[1].correctAnswers} / 20
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-xs block">TIME</span>
                            <span className="text-blue-300 font-bold text-lg">
                              {formatSecondsDetailed(topPlayers[1].timeTakenSeconds)}
                            </span>
                          </div>
                        </div>
                      </Corners>
                    </div>

                    {/* 1st Place Card (Revealed last with confetti) */}
                    <div
                      className={`transition-all duration-700 transform ${
                        podiumStage === 'reveal_first'
                          ? 'opacity-100 scale-105'
                          : 'opacity-0 scale-90'
                      }`}
                    >
                      <Corners
                        label="RANK 01"
                        nodeId="GOLD_PODIUM"
                        accent="amber"
                        className="p-10 text-center bg-slate-950/95 border-amber-400 shadow-amber-md ring-1 ring-amber-400/40"
                      >
                        <div className="text-3xl font-heading font-black text-amber-400 mb-2 tracking-wider uppercase drop-shadow-[0_0_20px_rgba(245,165,36,0.6)]">
                          1ST PLACE
                        </div>
                        <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-amber-300 mb-1 truncate">
                          {topPlayers[0].playerName}
                        </h2>
                        {topPlayers[0].usn && (
                          <div className="text-amber-200/70 font-mono text-xs mb-5 truncate">
                            {topPlayers[0].usn}
                          </div>
                        )}

                        <div className="p-4 bg-amber-950/40 border border-amber-600/80 font-mono text-sm grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-amber-200/70 text-xs block">SCORE</span>
                            <span className="text-amber-300 font-bold text-xl">
                              {topPlayers[0].correctAnswers} / 20
                            </span>
                          </div>
                          <div>
                            <span className="text-amber-200/70 text-xs block">TIME</span>
                            <span className="text-amber-300 font-bold text-xl">
                              {formatSecondsDetailed(topPlayers[0].timeTakenSeconds)}
                            </span>
                          </div>
                        </div>
                      </Corners>
                    </div>
                  </div>
                ) : (
                  /* 3-player podium (Order on desktop: 2nd on Left, 1st in Center, 3rd on Right) */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end max-w-5xl mx-auto pt-6">
                    {/* 2nd Place Card (Revealed Second) */}
                    <div className="order-2 md:order-1">
                      {podiumStage === 'reveal_second' || podiumStage === 'reveal_first' ? (
                        <div className="transition-all duration-700 transform opacity-100 translate-y-0">
                          <Corners
                            label="RANK 02"
                            nodeId="SILVER_PODIUM"
                            accent="blue"
                            className="p-7 text-center bg-slate-950/90 border-blue-500/50 shadow-lg"
                          >
                            <div className="text-2xl sm:text-3xl font-heading font-black text-blue-400 mb-2 tracking-wider uppercase">
                              2ND PLACE
                            </div>
                            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-100 mb-1 truncate">
                              {topPlayers[1].playerName}
                            </h2>
                            {topPlayers[1].usn && (
                              <div className="text-slate-400 font-mono text-xs mb-4 truncate">
                                {topPlayers[1].usn}
                              </div>
                            )}

                            <div className="p-3 bg-blue-950/40 border border-blue-800/60 font-mono text-sm grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-slate-400 text-xs block">SCORE</span>
                                <span className="text-blue-300 font-bold text-lg">
                                  {topPlayers[1].correctAnswers} / 20
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block">TIME</span>
                                <span className="text-blue-300 font-bold text-lg">
                                  {formatSecondsDetailed(topPlayers[1].timeTakenSeconds)}
                                </span>
                              </div>
                            </div>
                          </Corners>
                        </div>
                      ) : (
                        <Corners
                          label="RANK 02"
                          nodeId="SILVER_PENDING"
                          accent="blue"
                          className="p-7 text-center bg-slate-950/50 border-blue-500/20 border-dashed"
                        >
                          <div className="text-2xl font-heading font-bold text-slate-600 mb-2 tracking-wider uppercase animate-pulse">
                            2ND PLACE
                          </div>
                          <div className="py-8 font-mono text-xs text-blue-400/50 tracking-widest animate-pulse">
                            ◈ STANDBY // REVEALING...
                          </div>
                        </Corners>
                      )}
                    </div>

                    {/* 1st Place Card (Revealed Last with Confetti) */}
                    <div className="order-1 md:order-2 md:-translate-y-4">
                      {podiumStage === 'reveal_first' ? (
                        <div className="transition-all duration-700 transform opacity-100 scale-105">
                          <Corners
                            label="RANK 01"
                            nodeId="GOLD_PODIUM"
                            accent="amber"
                            className="p-9 text-center bg-slate-950/95 border-amber-400 shadow-amber-md ring-1 ring-amber-400/40"
                          >
                            <div className="text-3xl sm:text-4xl font-heading font-black text-amber-400 mb-2 tracking-wider uppercase drop-shadow-[0_0_20px_rgba(245,165,36,0.6)]">
                              1ST PLACE
                            </div>
                            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-amber-300 mb-1 truncate">
                              {topPlayers[0].playerName}
                            </h2>
                            {topPlayers[0].usn && (
                              <div className="text-amber-200/70 font-mono text-xs mb-5 truncate">
                                {topPlayers[0].usn}
                              </div>
                            )}

                            <div className="p-4 bg-amber-950/40 border border-amber-600/80 font-mono text-sm grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-amber-200/70 text-xs block">SCORE</span>
                                <span className="text-amber-300 font-bold text-xl">
                                  {topPlayers[0].correctAnswers} / 20
                                </span>
                              </div>
                              <div>
                                <span className="text-amber-200/70 text-xs block">TIME</span>
                                <span className="text-amber-300 font-bold text-xl">
                                  {formatSecondsDetailed(topPlayers[0].timeTakenSeconds)}
                                </span>
                              </div>
                            </div>
                          </Corners>
                        </div>
                      ) : (
                        <Corners
                          label="RANK 01"
                          nodeId="GOLD_PENDING"
                          accent="amber"
                          className="p-9 text-center bg-slate-950/50 border-amber-500/20 border-dashed"
                        >
                          <div className="text-2xl sm:text-3xl font-heading font-bold text-slate-600 mb-2 tracking-wider uppercase animate-pulse">
                            1ST PLACE CHAMPION
                          </div>
                          <div className="py-10 font-mono text-xs text-amber-400/50 tracking-widest animate-pulse">
                            ◈ CLASSIFIED // PENDING REVEAL
                          </div>
                        </Corners>
                      )}
                    </div>

                    {/* 3rd Place Card (Revealed First) */}
                    <div className="order-3 md:order-3">
                      <div className="transition-all duration-700 transform opacity-100 translate-y-0">
                        <Corners
                          label="RANK 03"
                          nodeId="BRONZE_PODIUM"
                          accent="orange"
                          className="p-7 text-center bg-slate-950/90 border-amber-700/50 shadow-lg"
                        >
                          <div className="text-2xl sm:text-3xl font-heading font-black text-amber-500 mb-2 tracking-wider uppercase">
                            3RD PLACE
                          </div>
                          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-200 mb-1 truncate">
                            {topPlayers[2].playerName}
                          </h2>
                          {topPlayers[2].usn && (
                            <div className="text-slate-400 font-mono text-xs mb-4 truncate">
                              {topPlayers[2].usn}
                            </div>
                          )}

                          <div className="p-3 bg-amber-950/30 border border-amber-700/60 font-mono text-sm grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-slate-400 text-xs block">SCORE</span>
                              <span className="text-amber-400 font-bold text-lg">
                                {topPlayers[2].correctAnswers} / 20
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-xs block">TIME</span>
                              <span className="text-amber-400 font-bold text-lg">
                                {formatSecondsDetailed(topPlayers[2].timeTakenSeconds)}
                              </span>
                            </div>
                          </div>
                        </Corners>
                      </div>
                    </div>
                  </div>
                )}

                {/* Prominent ALL RESULTS Button after podium reveal */}
                <div className="pt-6 flex justify-center items-center gap-4">
                  <button
                    type="button"
                    id="view-all-results-btn"
                    onClick={handleOpenAllResults}
                    className="px-8 py-3.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400 text-cyan-300 hover:text-white font-mono font-bold text-sm uppercase tracking-wider transition-all shadow-cyan-sm hover:shadow-cyan-md flex items-center gap-2.5 cursor-pointer active:scale-95"
                  >
                    <span>📊</span>
                    <span>ALL RESULTS</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ALL RESULTS MODAL */}
        {isAllResultsOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
            <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
              <Corners
                label="EVENT//OFFICIAL_STANDINGS"
                nodeId="ALL_RESULTS_MATRIX"
                accent="cyan"
                className="p-6 bg-slate-950 border-cyan-400 flex flex-col max-h-[85vh] shadow-[0_0_40px_rgba(34,211,238,0.25)]"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-cyan-500/30 pb-4 mb-4">
                  <div>
                    <h2 className="font-heading text-2xl sm:text-3xl font-black text-cyan-400 tracking-wider">
                      ALL PARTICIPANT RESULTS
                    </h2>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">
                      OFFICIAL RANKINGS // SORTED BY CORRECT ANSWERS (DESC), TIME TAKEN (ASC)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAllResultsOpen(false)}
                    className="px-3 py-1.5 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-950 hover:border-cyan-300 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    ✕ CLOSE
                  </button>
                </div>

                {/* Content */}
                {isLoadingAllResults ? (
                  <div className="py-16 text-center space-y-4">
                    <div className="w-12 h-12 mx-auto border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <p className="font-mono text-sm text-cyan-300 tracking-widest animate-pulse">
                      RETRIEVING VALIDATED RECORDS...
                    </p>
                  </div>
                ) : allResults.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="text-xl font-heading font-bold text-cyan-400">
                      NO PARTICIPANT RESULTS RECORDED
                    </div>
                    <p className="font-mono text-xs text-slate-400">
                      No verified submissions were received for this quiz session.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-y-auto overscroll-contain flex-1 pr-1 max-h-[55vh]">
                    <table className="w-full font-mono text-left text-xs sm:text-sm border-collapse">
                      <thead className="sticky top-0 bg-slate-900 border-b border-cyan-500/30 text-cyan-400 text-xs uppercase tracking-wider z-10">
                        <tr>
                          <th className="py-3 px-3 w-16 text-center">RANK</th>
                          <th className="py-3 px-4">PARTICIPANT</th>
                          <th className="py-3 px-4">COLLEGE EMAIL</th>
                          <th className="py-3 px-4 text-center">SCORE</th>
                          <th className="py-3 px-4 text-right">COMPLETION TIME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/10 text-slate-300">
                        {allResults.map((r) => {
                          const isGold = r.rank === 1;
                          const isSilver = r.rank === 2;
                          const isBronze = r.rank === 3;
                          return (
                            <tr
                              key={r.usn || r.rank}
                              className={`hover:bg-cyan-950/30 transition-colors ${
                                isGold
                                  ? 'bg-amber-950/20 text-amber-200'
                                  : isSilver
                                  ? 'bg-blue-950/20 text-blue-200'
                                  : isBronze
                                  ? 'bg-orange-950/20 text-orange-200'
                                  : ''
                              }`}
                            >
                              <td className="py-3 px-3 text-center font-bold">
                                {isGold ? (
                                  <span className="inline-block px-2 py-0.5 bg-amber-500 text-black font-black text-xs rounded">
                                    #1
                                  </span>
                                ) : isSilver ? (
                                  <span className="inline-block px-2 py-0.5 bg-blue-400 text-black font-black text-xs rounded">
                                    #2
                                  </span>
                                ) : isBronze ? (
                                  <span className="inline-block px-2 py-0.5 bg-amber-600 text-black font-black text-xs rounded">
                                    #3
                                  </span>
                                ) : (
                                  <span className="text-slate-400">#{r.rank}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-bold truncate max-w-[180px]">
                                {r.playerName}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-400 truncate max-w-[220px]">
                                {r.usn}
                              </td>
                              <td className="py-3 px-4 text-center font-bold text-cyan-300 tabular-nums">
                                {r.correctAnswers} / 20
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                                {formatSecondsDetailed(r.timeTakenSeconds)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Modal Footer */}
                <div className="border-t border-cyan-500/20 pt-3 mt-4 flex items-center justify-between text-xs font-mono text-slate-400">
                  <div>
                    TOTAL SUBMISSIONS: <span className="text-cyan-400 font-bold">{allResults.length}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAllResultsOpen(false)}
                    className="px-4 py-2 bg-cyan-950 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    RETURN TO PODIUM
                  </button>
                </div>
              </Corners>
            </div>
          </div>
        )}
      </main>

      {/* Projector Footer Status */}
      <footer className="border-t border-cyan-500/20 pt-4 flex items-center justify-between font-mono text-xs text-slate-500">
        <div>LIVE CAMPUS TECH EVENT // ARENA CONTROLLER</div>
        <div>REALTIME_ENGINE: SUPABASE_POSTGRES</div>
      </footer>
    </div>
  );
}
