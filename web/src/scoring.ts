export interface FrameScore {
  throws: number[];
}

export function computeTotalScore(frames: FrameScore[]): number {
  let total = 0;
  const allThrows: number[] = [];
  for (const f of frames) {
    for (const t of f.throws) {
      allThrows.push(t);
    }
  }

  let throwIdx = 0;
  for (let f = 0; f < 10; f++) {
    const frame = frames[f];
    if (!frame) break;

    if (f < 9) {
      if (frame.throws[0] === 10) {
        const b1 = allThrows[throwIdx + 1] ?? 0;
        const b2 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1 + b2;
        throwIdx += 1;
      } else if ((frame.throws[0] ?? 0) + (frame.throws[1] ?? 0) === 10) {
        const b1 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1;
        throwIdx += 2;
      } else {
        total += (frame.throws[0] ?? 0) + (frame.throws[1] ?? 0);
        throwIdx += 2;
      }
    } else {
      for (const t of frame.throws) {
        total += t;
      }
      throwIdx += frame.throws.length;
    }
  }
  return total;
}

// A spare clears the rack with the second ball of a frame. In the 10th frame
// the second ball after a strike is thrown at a fresh rack, so it is not a spare.
export function isSpare(throws: number[]): boolean {
  return throws.length === 2 && throws[0] !== 10 && throws[0]! + throws[1]! === 10;
}
