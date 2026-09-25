export type Point2D = { x: number; y: number };
export type RoadHazard = Point2D & { id: string; kind: 'pothole' | 'pedestrian' | 'vehicle' | 'animal'; radius: number; dynamic?: boolean; lane?: number };

// Synthetic local scene; replace this fixture with RoadRunner/AD Toolbox exports later.
export const mockRoadSegments = [
  { id: 'market-lane', surface: 0.62, trafficMix: 0.72, intersection: 0.5, accidentHistory: 0.35, obstacleDensity: 0.2 },
  { id: 'service-lane', surface: 0.86, trafficMix: 0.32, intersection: 0.2, accidentHistory: 0.16, obstacleDensity: 0.12 },
  { id: 'main-road', surface: 0.74, trafficMix: 0.88, intersection: 0.72, accidentHistory: 0.48, obstacleDensity: 0.32 },
];

export const initialHazards: RoadHazard[] = [
  { id: 'pothole-1', x: 393, y: 205, kind: 'pothole', radius: 9 },
  { id: 'pothole-2', x: 587, y: 264, kind: 'pothole', radius: 12 },
  { id: 'pedestrian-1', x: 490, y: 220, kind: 'pedestrian', radius: 18, dynamic: true, lane: -1 },
  { id: 'auto-1', x: 712, y: 216, kind: 'vehicle', radius: 22, dynamic: true, lane: 1 },
  { id: 'dog-1', x: 761, y: 166, kind: 'animal', radius: 14, dynamic: true, lane: -1 },
];
