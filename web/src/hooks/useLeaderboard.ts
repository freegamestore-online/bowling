import { useCallback, useEffect, useState } from "react";

const API = "https://freegamestore-leaderboard.serge-the-dev.workers.dev";

export interface LeaderboardEntry {
  player_name: string;
  score: number;
  created_at: string;
}

interface SubmitResult {
  ok: boolean;
  rank?: number;
  error?: string;
}

export function useLeaderboard(gameId: string) {
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const [recentScores, setRecentScores] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScores = useCallback(async () => {
    try {
      const [topRes, recentRes] = await Promise.all([
        fetch(`${API}/api/leaderboard/${gameId}?limit=10`),
        fetch(`${API}/api/leaderboard/${gameId}/recent?limit=10`),
      ]);
      if (topRes.ok) {
        const data = await topRes.json() as { scores: LeaderboardEntry[] };
        setTopScores(data.scores);
      }
      if (recentRes.ok) {
        const data = await recentRes.json() as { scores: LeaderboardEntry[] };
        setRecentScores(data.scores);
      }
    } catch {
      // Offline — game still works
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const submitScore = useCallback(
    async (score: number, name?: string): Promise<SubmitResult> => {
      try {
        const res = await fetch(`${API}/api/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: gameId, score, name: name ?? "Anonymous" }),
        });
        const data = await res.json() as SubmitResult;
        if (data.ok) fetchScores();
        return data;
      } catch {
        return { ok: false, error: "Offline" };
      }
    },
    [gameId, fetchScores],
  );

  return { topScores, recentScores, submitScore, loading, refresh: fetchScores };
}
