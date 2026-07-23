import { test } from "node:test";
import assert from "node:assert/strict";

import {
  haversineMeters,
  pointInPolygon,
  pointInGeometry,
  distanceToGeometry,
  type Position,
  type Geometry,
} from "./geo";

// 中和工地附近的示範方形多邊形
const square: Position[][] = [
  [
    [121.498, 25.001],
    [121.502, 25.001],
    [121.502, 25.004],
    [121.498, 25.004],
    [121.498, 25.001],
  ],
];

test("pointInPolygon 命中與未命中", () => {
  assert.equal(pointInPolygon([121.5, 25.0025], square), true);
  assert.equal(pointInPolygon([121.49, 25.0025], square), false);
});

test("pointInGeometry 支援 MultiPolygon", () => {
  const geom: Geometry = { type: "MultiPolygon", coordinates: [square] };
  assert.equal(pointInGeometry([121.5, 25.0025], geom), true);
  assert.equal(pointInGeometry([121.6, 25.0025], geom), false);
});

test("haversineMeters 約略距離", () => {
  // 約 1 個經度分 ≈ 1.7km @ 25°N；此處取近距離校驗量級
  const d = haversineMeters([121.5, 25.0], [121.5, 25.001]);
  assert.ok(d > 100 && d < 130, `expected ~111m, got ${d}`);
});

test("distanceToGeometry 取最近代表點", () => {
  const school: Geometry = { type: "Point", coordinates: [121.5015, 25.0035] };
  const d = distanceToGeometry([121.5, 25.0025], school);
  assert.ok(d > 0 && d < 400, `got ${d}`);
});
