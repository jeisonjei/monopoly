import boardGeometryJson from './board-geometry.json';

export type TileGeometry = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export type TileGeometryMap = Record<number, TileGeometry>;

const BOARD_TILE_COUNT = 40;
const MIN_TILE_SIZE_PCT = 2;

function createDefaultBoardGeometryFromJson(): TileGeometryMap {
  const rawGeometry = boardGeometryJson as Record<string, TileGeometry>;
  const geometry: TileGeometryMap = {};

  for (let tileIndex = 0; tileIndex < BOARD_TILE_COUNT; tileIndex += 1) {
    const item = rawGeometry[String(tileIndex)];
    if (item) {
      geometry[tileIndex] = clampTileGeometry(item);
    }
  }

  return geometry;
}

export const DEFAULT_BOARD_GEOMETRY = createDefaultBoardGeometryFromJson();

export function normalizeTileIndex(tileIndex: number): number {
  return ((tileIndex % BOARD_TILE_COUNT) + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;
}

export function getTileGeometry(tileIndex: number, geometryMap: TileGeometryMap = DEFAULT_BOARD_GEOMETRY): TileGeometry {
  return geometryMap[normalizeTileIndex(tileIndex)] ?? DEFAULT_BOARD_GEOMETRY[normalizeTileIndex(tileIndex)];
}

export function getTileCenterPoint(tileIndex: number, geometryMap: TileGeometryMap = DEFAULT_BOARD_GEOMETRY): { leftPct: number; topPct: number } {
  const geometry = getTileGeometry(tileIndex, geometryMap);
  return {
    leftPct: geometry.leftPct + geometry.widthPct / 2,
    topPct: geometry.topPct + geometry.heightPct / 2
  };
}

export function clampTileGeometry(geometry: TileGeometry): TileGeometry {
  const widthPct = Math.max(MIN_TILE_SIZE_PCT, Math.min(100, geometry.widthPct));
  const heightPct = Math.max(MIN_TILE_SIZE_PCT, Math.min(100, geometry.heightPct));
  const leftPct = Math.max(0, Math.min(100 - widthPct, geometry.leftPct));
  const topPct = Math.max(0, Math.min(100 - heightPct, geometry.topPct));

  return {
    leftPct,
    topPct,
    widthPct,
    heightPct
  };
}

export function cloneGeometryMap(geometryMap: TileGeometryMap): TileGeometryMap {
  return Object.fromEntries(
    Object.entries(geometryMap).map(([tileIndex, geometry]) => [Number(tileIndex), { ...geometry }])
  );
}

export function createBoardGeometryJson(geometryMap: TileGeometryMap): string {
  const orderedEntries = Array.from({ length: BOARD_TILE_COUNT }, (_, tileIndex) => {
    const geometry = clampTileGeometry(getTileGeometry(tileIndex, geometryMap));
    return [tileIndex, geometry] as const;
  });

  return `${JSON.stringify(Object.fromEntries(orderedEntries), null, 2)}\n`;
}
