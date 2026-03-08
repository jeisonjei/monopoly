import { DEFAULT_BOARD_GEOMETRY, getTileCenterPoint, getTileGeometry, TileGeometryMap } from './board-geometry';

export type BoardPoint = { leftPct: number; topPct: number };

export function getTilePoint(tileIndex: number, geometryMap: TileGeometryMap = DEFAULT_BOARD_GEOMETRY): BoardPoint {
  return getTileCenterPoint(tileIndex, geometryMap);
}

export function getTileBounds(tileIndex: number, geometryMap: TileGeometryMap = DEFAULT_BOARD_GEOMETRY) {
  return getTileGeometry(tileIndex, geometryMap);
}
