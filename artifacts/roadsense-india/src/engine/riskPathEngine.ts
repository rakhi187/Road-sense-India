import type { Point2D, RoadHazard } from './mockData';

export const ENGINE_VERSION = 'riskPathEngine v1';
export type CandidatePath = { id: string; name: string; points: Point2D[]; length?: number; baseRisk?: number; turnBack?: boolean; avoidance?: Record<string, 'L' | 'R'>; features?: { surface?: number; trafficMix?: number; intersection?: number; accidentHistory?: number; obstacleDensity?: number } };
export type RankedPath = CandidatePath & { riskScore: number; riskLevel: 'Low' | 'Medium' | 'High'; blocked: boolean; nearestHazard?: string };
export type PlanInput = { current: Point2D; destination: Point2D; candidates: CandidatePath[]; staticHazards?: RoadHazard[]; dynamicHazards?: RoadHazard[]; drivableArea?: Point2D[]; drivableCenterline?: Point2D[]; roadHalfWidth?: number; mode?: 'route' | 'trajectory' };

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
const warnedBoundaryCandidates = new Set<string>();
function pointSegmentDistance(point: Point2D, a: Point2D, b: Point2D) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Return true when a point lies in (or on the edge of) a simple polygon. */
export function isPointInsideDrivableArea(point: Point2D, polygon: Point2D[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (pointSegmentDistance(point, a, b) < 0.01) return true;
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Validate points and the space between them, so sparse waypoints cannot cut across an edge. */
export function isPathWithinDrivableArea(points: Point2D[], polygon: Point2D[], sampleSpacing = 4) {
  if (points.length === 0 || polygon.length < 3) return false;
  if (points.some((point) => !isPointInsideDrivableArea(point, polygon))) return false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], distance = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(distance / sampleSpacing));
    for (let step = 1; step < samples; step++) {
      const t = step / samples;
      if (!isPointInsideDrivableArea({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, polygon)) return false;
    }
  }
  return true;
}

/** Check a path against the actual road corridor. This remains reliable when
 * an offset polygon folds over itself at tight bends in an imported map route. */
export function isPathWithinRoadCorridor(points: Point2D[], centerline: Point2D[], halfWidth: number, sampleSpacing = 4) {
  if (points.length === 0 || centerline.length < 2 || halfWidth <= 0) return false;
  const insideAt = (point: Point2D) => {
    for (let i = 1; i < centerline.length; i++) {
      if (pointSegmentDistance(point, centerline[i - 1], centerline[i]) <= halfWidth) return true;
    }
    return false;
  };
  if (points.some((point) => !insideAt(point))) return false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], segmentLength = distance(a, b);
    const samples = Math.max(1, Math.ceil(segmentLength / sampleSpacing));
    for (let step = 1; step < samples; step++) {
      const t = step / samples;
      if (!insideAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
  }
  return true;
}

/** Match the simulator's oriented vehicle-box collision check over the local control horizon. */
function isPathClearOfHazards(points: Point2D[], hazards: RoadHazard[], lookahead = 200) {
  const overlapsVehicle = (hazard: RoadHazard, vehicle: Point2D, heading: number) => {
    const dx = hazard.x - vehicle.x, dy = hazard.y - vehicle.y;
    const forward = dx * Math.cos(heading) + dy * Math.sin(heading);
    const lateral = -dx * Math.sin(heading) + dy * Math.cos(heading);
    const outsideX = Math.max(Math.abs(forward) - 14, 0), outsideY = Math.max(Math.abs(lateral) - 8, 0);
    return Math.hypot(outsideX, outsideY) < hazard.radius;
  };
  if (points.length === 1) return hazards.every((hazard) => !overlapsVehicle(hazard, points[0], 0));
  return hazards.every((hazard) => {
    let traveled = 0;
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1], end = points[index], dx = end.x - start.x, dy = end.y - start.y;
      const segmentLength = Math.hypot(dx, dy), heading = Math.atan2(dy, dx);
      if (traveled >= lookahead) break;
      const checkedLength = Math.min(segmentLength, lookahead - traveled);
      const samples = Math.max(1, Math.ceil(checkedLength / 3));
      // A moving hazard can enter the current safety envelope without a physical
      // collision. Do not discard every escape route just because its first
      // sample is the vehicle's current position; validate every point after it.
      const firstSample = index === 1 ? 1 : 0;
      for (let step = firstSample; step <= samples; step++) {
        const t = (checkedLength / (segmentLength || 1)) * (step / samples);
        const point = { x: start.x + dx * t, y: start.y + dy * t };
        if (overlapsVehicle(hazard, point, heading)) return false;
      }
      traveled += segmentLength;
    }
    return true;
  });
}

/** Shared trajectory safety check for the autonomous controller's active local horizon. */
export function isTrajectoryCollisionFree(points: Point2D[], hazards: RoadHazard[]) {
  // The controller needs a short, stable local horizon. Checking moving hazards
  // all the way to the destination made a distant crossing force repeated turns.
  return isPathClearOfHazards(points, hazards, 80);
}

/** Score a path using one shared weighted model for both route guidance and vehicle control. */
export function rankRiskPaths(input: PlanInput): { rankedPaths: RankedPath[]; recommended: RankedPath; overallRisk: number } {
  const hazards = [...(input.staticHazards ?? []), ...(input.dynamicHazards ?? [])];
  // Boundary violations are hard exclusions, never a soft score penalty.
  const candidateIsInBounds = (points: Point2D[]) => input.drivableCenterline?.length
    ? isPathWithinRoadCorridor(points, input.drivableCenterline, input.roadHalfWidth ?? 36)
    : input.drivableArea ? isPathWithinDrivableArea(points, input.drivableArea) : true;
  const admissibleCandidates = input.drivableArea || input.drivableCenterline
    ? input.candidates.filter((path) => {
      const isInside = candidateIsInBounds(path.points);
      if (!isInside && !warnedBoundaryCandidates.has(path.id)) {
        warnedBoundaryCandidates.add(path.id);
        console.warn(`[${ENGINE_VERSION}] Rejected ${path.name}: candidate crosses the drivable-area boundary.`);
      }
      const staticPathIsClear = isPathClearOfHazards(path.points, hazards.filter((hazard) => !hazard.dynamic), Number.POSITIVE_INFINITY);
      const dynamicPathIsClear = isPathClearOfHazards(path.points, hazards.filter((hazard) => hazard.dynamic), 200);
      return isInside && !path.turnBack && (input.mode !== 'trajectory' || (staticPathIsClear && dynamicPathIsClear));
    })
    : input.candidates;
  const rankedPaths = admissibleCandidates.map((path) => {
    const f = path.features ?? {};
    const roadRisk = (f.obstacleDensity ?? 0.15) * 0.25 + (1 - (f.surface ?? 0.8)) * 0.24 + (f.trafficMix ?? 0.35) * 0.18 + (f.intersection ?? 0.25) * 0.13 + (f.accidentHistory ?? 0.2) * 0.2;
    let hazardPenalty = 0, nearest = Number.POSITIVE_INFINITY, nearestHazard: string | undefined, blocked = false;
    for (const hazard of hazards) {
      let d = Number.POSITIVE_INFINITY;
      for (let i = 1; i < path.points.length; i++) d = Math.min(d, pointSegmentDistance(hazard, path.points[i - 1], path.points[i]));
      const clearance = hazard.radius + (input.mode === 'trajectory' ? 26 : 12);
      if (d < nearest) { nearest = d; nearestHazard = hazard.id; }
      if (d < clearance) {
        hazardPenalty += (1 - d / clearance) * (hazard.dynamic ? 0.24 : 0.18);
        // A future crossing should trigger route selection; only a nearby conflict needs an immediate yield.
        if (hazard.dynamic && d < clearance * 0.48 && distance(hazard, input.current) < 96) blocked = true;
      }
    }
    const riskScore = Math.round(clamp(roadRisk + hazardPenalty + (path.baseRisk ?? 0)) * 100);
    return { ...path, riskScore, riskLevel: riskScore < 32 ? 'Low' as const : riskScore < 62 ? 'Medium' as const : 'High' as const, blocked, nearestHazard };
  }).sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.riskScore - b.riskScore || (a.length ?? 0) - (b.length ?? 0));
  const recommended = rankedPaths[0] ?? { id: 'stop', name: 'Safe stop', points: [input.current], riskScore: 100, riskLevel: 'High' as const, blocked: true };
  return { rankedPaths, recommended, overallRisk: recommended.riskScore };
}

/** Make local left/right bypass candidates around a nearby dynamic obstacle. */
export function trajectoryCandidates(current: Point2D, destination: Point2D, hazards: RoadHazard[], roadCenterline?: Point2D[], preferredSides: Record<string, 'L' | 'R'> = {}): CandidatePath[] {
  const corridor = roadCenterline?.length ? roadCenterline : [current, destination];
  let nearestIndex = 0, nearestDistance = Number.POSITIVE_INFINITY;
  corridor.forEach((point, index) => { const d = distance(point, current); if (d < nearestDistance) { nearestDistance = d; nearestIndex = index; } });
  const remaining = [current, ...corridor.slice(Math.min(nearestIndex + 1, corridor.length - 1))];
  remaining[remaining.length - 1] = destination;
  const length = remaining.slice(1).reduce((sum, point, index) => sum + distance(remaining[index], point), 0);
  const threats = hazards.flatMap((hazard) => {
    let threatIndex = -1, threatDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((point, index) => {
      const d = distance(hazard, point);
      if (index > 1 && d < threatDistance) { threatIndex = index; threatDistance = d; }
    });
    return threatIndex >= 0 && threatDistance < hazard.radius + 72 ? [{ hazard, index: threatIndex }] : [];
  });
  const variants = threats.length === 0 ? [null] : [null, ...Array.from({ length: Math.min(32, 2 ** threats.length) }, (_, mask) => mask)];
  return variants.map((variant) => {
    const mask = variant ?? 0;
    const avoidance = Object.fromEntries(threats.map(({ hazard }, index) => [hazard.id, (mask & (1 << index)) === 0 ? 'L' : 'R'])) as Record<string, 'L' | 'R'>;
    let points = remaining.map((point, index) => {
      if (variant === null) return point;
      const before = remaining[Math.max(0, index - 1)], after = remaining[Math.min(remaining.length - 1, index + 1)];
      const dx = after.x - before.x, dy = after.y - before.y, span = Math.hypot(dx, dy) || 1;
      const rawOffset = threats.reduce((total, { hazard, index: threatIndex }, threatNumber) => {
        if (index < threatIndex - 10 || index > threatIndex + 10) return total;
        const normalized = (index - (threatIndex - 10)) / 20;
        const side = (mask & (1 << threatNumber)) === 0 ? -1 : 1;
        // Create a separate local lane choice for every upcoming obstacle.
        return total + side * Math.min(38, Math.max(36, hazard.radius + 18)) * Math.sin(normalized * Math.PI);
      }, 0);
      const offset = Math.max(-38, Math.min(38, rawOffset));
      return offset === 0 ? point : { x: point.x - dy / span * offset, y: point.y + dx / span * offset };
    });
    const sideChanges = Object.entries(avoidance).filter(([hazardId, side]) => preferredSides[hazardId] && preferredSides[hazardId] !== side).length;
    // Gently smooth offset transitions so avoidance maneuvers form one arc rather
    // than sharp kinks. Preserve both endpoints and keep only forward-facing steps.
    for (let pass = 0; pass < 2 && points.length > 2; pass += 1) {
      points = points.map((point, index) => index === 0 || index === points.length - 1 ? point : {
        x: points[index - 1].x * 0.2 + point.x * 0.6 + points[index + 1].x * 0.2,
        y: points[index - 1].y * 0.2 + point.y * 0.6 + points[index + 1].y * 0.2,
      });
    }
    const hasTurnBack = points.slice(2).some((point, offset) => {
      const index = offset + 2, previous = points[index - 1], before = points[index - 2];
      const incoming = { x: previous.x - before.x, y: previous.y - before.y };
      const outgoing = { x: point.x - previous.x, y: point.y - previous.y };
      return incoming.x * outgoing.x + incoming.y * outgoing.y < 0;
    });
    const sideName = variant === null ? 'Current corridor' : 'Local multi-hazard bypass';
    const assignment = variant === null ? 'center' : threats.map(({ hazard }, index) => `${hazard.id}-${(variant & (1 << index)) === 0 ? 'L' : 'R'}`).join('_');
    return {
      id: `trajectory-${assignment}`,
      name: sideName, points, turnBack: hasTurnBack, avoidance, length: length + (variant === null ? 0 : 95 * threats.length), baseRisk: (variant === null ? 0.04 : 0.015) + sideChanges * 0.18,
      features: { surface: 0.72, trafficMix: 0.42, intersection: 0.2, accidentHistory: 0.2, obstacleDensity: 0.12 },
    };
  });
}
