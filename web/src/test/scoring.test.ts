import { describe, it, expect } from "vitest";
import { computeTotalScore, throwMark, type FrameScore } from "../scoring";

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

describe("throwMark", () => {
  it("marks a first-ball strike and a second-ball spare", () => {
    expect(throwMark([10])).toBe("strike");
    expect(throwMark([7, 3])).toBe("spare");
    expect(throwMark([0, 10])).toBe("spare");
  });

  it("marks 10th-frame strikes on the 2nd and 3rd balls", () => {
    expect(throwMark([10, 10])).toBe("strike");
    expect(throwMark([10, 10, 10])).toBe("strike");
    expect(throwMark([7, 3, 10])).toBe("strike");
  });

  it("marks a 10th-frame spare on the 3rd ball after a strike", () => {
    expect(throwMark([10, 3, 7])).toBe("spare");
    expect(throwMark([10, 0, 10])).toBe("spare");
  });

  it("is not a spare after a 10th-frame strike", () => {
    expect(throwMark([10, 3])).toBe(null);
    expect(throwMark([10, 0])).toBe(null);
  });

  it("marks nothing for open balls", () => {
    expect(throwMark([4, 3])).toBe(null);
    expect(throwMark([3])).toBe(null);
    expect(throwMark([7, 3, 5])).toBe(null);
    expect(throwMark([10, 10, 4])).toBe(null);
    expect(throwMark([10, 3, 4])).toBe(null);
  });
});
