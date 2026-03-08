export type BoardPoint = { leftPct: number; topPct: number };

export function getTilePoint(tileIndex: number): BoardPoint {
  const i = ((tileIndex % 40) + 40) % 40;

  const pad = 3;
  const min = pad;
  const max = 100 - pad;

  if (i <= 10) {
    const t = i / 10;
    return { leftPct: max - (max - min) * t, topPct: max };
  }

  if (i <= 20) {
    const t = (i - 10) / 10;
    return { leftPct: min, topPct: max - (max - min) * t };
  }

  if (i <= 30) {
    const t = (i - 20) / 10;
    return { leftPct: min + (max - min) * t, topPct: min };
  }

  const t = (i - 30) / 10;
  return { leftPct: max, topPct: min + (max - min) * t };
}
