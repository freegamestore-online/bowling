import { useState, useCallback, useEffect, useRef } from "react";
import { GameShell, GameTopbar, GameAuth } from "@freegamestore/games";
import { Game } from "./components/Game";
import type { GamePhase } from "./types";

const BEST_SCORE_KEY = "freebowling-best";

function getBestScore(): number {
  try {
    const v = localStorage.getItem(BEST_SCORE_KEY);
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    // localStorage can be disabled or throw on access in some browsers
    // (Safari Private, locked-down embeds). Treat as "no best score yet".
    return 0;
  }
}

function trySetBestScore(value: number) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch {
    // Safari Private throws QuotaExceededError on setItem. Ignore.
  }
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore);
  const [gameKey, setGameKey] = useState(0);
  const [frame, setFrame] = useState(1);
  const scoreRef = useRef(0);

  const handleScore = useCallback((s: number) => {
    scoreRef.current = s;
    setScore(s);
  }, []);

  const handleStats = useCallback((stats: { frame: number }) => {
    setFrame(stats.frame);
  }, []);

  const handleGameOver = useCallback(() => {
    const final = scoreRef.current;
    const best = getBestScore();
    if (final > best) {
      trySetBestScore(final);
      setBestScore(final);
    }
    setPhase("over");
  }, []);

  const start = useCallback(() => {
    setScore(0);
    scoreRef.current = 0;
    setGameKey((k) => k + 1);
    setPhase("playing");
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (phase !== "playing" && (e.key === " " || e.key === "Enter")) {
        start();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, start]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Bowling"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Best", value: bestScore },
            { label: "Frame", value: `${frame}/10` },
          ]}
          actions={<GameAuth />}
          onRestart={start}
          rules={<div><h3 style={{fontWeight:700}}>Bowling</h3><h4 style={{fontWeight:600}}>Controls</h4><ul><li><b>Aim</b> — drag left/right or use arrow keys</li><li><b>Power</b> — bar oscillates, tap to lock</li><li><b>Spin</b> — drag or arrows to set hook direction</li><li>The blue trajectory line previews where the ball will go</li></ul><h4 style={{fontWeight:600}}>Rules</h4><ul><li>Full 10-frame game</li><li>Strikes (X) and spares (/) score bonus points</li><li>Gutter balls count as 0</li></ul><h4 style={{fontWeight:600}}>Scoring</h4><ul><li>Strike = 10 + next 2 rolls</li><li>Spare = 10 + next 1 roll</li><li>Perfect game = 300</li></ul><p style={{marginTop:12,fontSize:12,opacity:0.7}}>A free game on <a href="https://freegamestore.online" style={{color:"var(--accent)"}}>freegamestore.online</a></p></div>}
        />
      }
    >
      <div className="relative w-full h-full min-h-[400px]">
        <Game key={gameKey} onScore={handleScore} onGameOver={handleGameOver} onStats={handleStats} />
        {phase === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(0,0,0,0.55)" }}>
            <p
              className="text-xl font-bold"
              style={{ color: "var(--accent)", fontFamily: "Fraunces, serif" }}
            >
              Game Over! Final Score: {score}
            </p>
            <button
              onClick={start}
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
