export const POSITION_CHANGE_THRESHOLD = 0.05;
export const COST_PER_CHANGE = 0.001;

export interface PositionBook {
  column: string;
  positions: number[];
  problems: string[];
  longs: number;
  shorts: number;
  flats: number;
  net: number;
  gross: number;
  changes: number;
  estimatedCost: number;
}

export function parsePositions(text: string): PositionBook | { error: string } {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) return { error: "The file has no data rows." };
  const header = rows[0].split(",").map((cell) => cell.trim().toLowerCase());
  const valueIndex = header.findIndex((cell) => cell === "position" || cell === "signal");
  const tsIndex = header.indexOf("timestamp");
  if (valueIndex < 0 || tsIndex < 0) return { error: "Expected columns: timestamp,position" };

  const problems: string[] = [];
  const entries: [number, number][] = [];
  rows.slice(1).forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const ts = Number(cells[tsIndex]);
    const value = Number(cells[valueIndex]);
    if (!Number.isFinite(ts) || !Number.isFinite(value)) {
      if (problems.length < 3) problems.push(`Row ${index + 1}: non-numeric value.`);
      return;
    }
    if ((value < -1 || value > 1) && problems.length < 3) problems.push(`Row ${index + 1}: ${value} is outside -1 to 1.`);
    entries.push([ts, Math.max(-1, Math.min(1, value))]);
  });
  entries.sort((a, b) => a[0] - b[0]);
  const positions = entries.map(([, value]) => value);
  if (positions.length === 0) return { error: "No readable positions in this file." };

  let changes = 0;
  for (let i = 1; i < positions.length; i++) {
    if (Math.abs(positions[i] - positions[i - 1]) > POSITION_CHANGE_THRESHOLD) changes += 1;
  }
  const sum = positions.reduce((total, value) => total + value, 0);
  const gross = positions.reduce((total, value) => total + Math.abs(value), 0);

  return {
    column: header[valueIndex],
    positions,
    problems,
    longs: positions.filter((value) => value > POSITION_CHANGE_THRESHOLD).length,
    shorts: positions.filter((value) => value < -POSITION_CHANGE_THRESHOLD).length,
    flats: positions.filter((value) => Math.abs(value) <= POSITION_CHANGE_THRESHOLD).length,
    net: sum / positions.length,
    gross: gross / positions.length,
    changes,
    estimatedCost: changes * COST_PER_CHANGE,
  };
}
