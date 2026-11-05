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

export type ThrowMark = "strike" | "spare" | null;

// What the last ball of a frame's `throws` was. A strike clears a fresh rack in one
// ball; a spare clears the rest of a rack with its second ball. In the 10th frame a
// new rack is set after a strike or spare, so the 2nd and 3rd balls can be either.
export function throwMark(throws: number[]): ThrowMark {
  const last = throws.length - 1;
  if (last < 0) return null;
  // Index of the first ball thrown at the rack the last ball was thrown at.
  let rackStart = 0;
  while (rackStart < last) {
    if (throws[rackStart] === 10) rackStart += 1;
    else if (rackStart + 1 < last) rackStart += 2;
    else break;
  }
  if (last === rackStart) return throws[last] === 10 ? "strike" : null;
  return throws[rackStart]! + throws[last]! === 10 ? "spare" : null;
}
