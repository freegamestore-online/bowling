import { describe, it, expect } from "vitest";
import { computeTotalScore, isSpare, type FrameScore } from "../scoring";

const game = (...frames: number[][]): FrameScore[] => frames.map((throws) => ({ throws }));

describe("computeTotalScore", () => {
  it("scores a perfect game as 300", () => {
    expect(computeTotalScore(game(...Array.from({ length: 9 }, () => [10]), [10, 10, 10]))).toBe(300);
  });

  it("scores all 5/5 spares with a 5 fill ball as 150", () => {
    expect(computeTotalScore(game(...Array.from({ length: 9 }, () => [5, 5]), [5, 5, 5]))).toBe(150);
  });

  it("scores open frames as the pin sum", () => {
    expect(computeTotalScore(game(...Array.from({ length: 10 }, () => [3, 4])))).toBe(70);
  });

  it("scores a partial game with pending strike bonus", () => {
    expect(computeTotalScore(game([10], [3, 4]))).toBe(24);
  });
});

describe("isSpare", () => {
  it("is a spare when two balls clear the rack", () => {
    expect(isSpare([7, 3])).toBe(true);
    expect(isSpare([0, 10])).toBe(true);
  });

  it("is not a spare after a 10th-frame strike", () => {
    expect(isSpare([10, 3])).toBe(false);
    expect(isSpare([10, 0])).toBe(false);
  });

  it("is not a spare for an open frame or a single ball", () => {
    expect(isSpare([4, 3])).toBe(false);
    expect(isSpare([3])).toBe(false);
  });
});
