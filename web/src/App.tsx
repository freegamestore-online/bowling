import { useState, useCallback, useEffect, useRef } from "react";
import { GameShell, GameTopbar, GameAuth } from "@freegamestore/games";
import { Game } from "./components/Game";
import type { GamePhase } from "./types";

const BEST_SCORE_KEY = "freebowling-best";

function getBestScore(): number {
  const v = localStorage.getItem(BEST_SCORE_KEY);
  return v ? parseInt(v, 10) : 0;
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore);
  const [gameKey, setGameKey] = useState(0);
  const scoreRef = useRef(0);

  const handleScore = useCallback((s: number) => {
    scoreRef.current = s;
    setScore(s);
  }, []);

  const handleGameOver = useCallback(() => {
    const final = scoreRef.current;
    const best = getBestScore();
    if (final > best) {
      localStorage.setItem(BEST_SCORE_KEY, String(final));
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
          ]}
          actions={<GameAuth />}
          onRestart={start}
          rules={<div><h3 style={{fontWeight:700}}>Bowling</h3><h4 style={{fontWeight:600}}>Controls</h4><ul><li>Aim with left/right</li><li>Set power, then throw</li></ul><h4 style={{fontWeight:600}}>Rules</h4><ul><li>Full 10-frame game</li><li>Strikes (X) and spares (/) score bonus points</li><li>3D physics simulation</li></ul><h4 style={{fontWeight:600}}>Scoring</h4><ul><li>Strike = 10 + next 2 rolls</li><li>Spare = 10 + next 1 roll</li><li>Perfect game = 300</li></ul></div>}
        />
      }
    >
      <div className="relative w-full h-full min-h-[400px]">
        <Game key={gameKey} onScore={handleScore} onGameOver={handleGameOver} />
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
