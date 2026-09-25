import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, MapPin, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { ENGINE_VERSION, isPathWithinRoadCorridor, isTrajectoryCollisionFree, rankRiskPaths, trajectoryCandidates } from '../engine/riskPathEngine';
import { initialHazards, mockRoadSegments, type Point2D, type RoadHazard } from '../engine/mockData';

type SimulationState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CRASHED';
type RoutePickMode = 'START' | 'DESTINATION' | null;
export type SimulationRoute = { points: Point2D[]; origin: string; destination: string; routeName: string; eta: string; distance: string; distanceMeters: number; durationSeconds: number; verifiedRoadRoute: boolean };
const MAP_WIDTH = 950, MAP_HEIGHT = 460;
// Synthetic neighborhood scene: its painted road is 80 canvas units wide, treated as a 10 m street.
const DEMO_PIXELS_PER_METER = 8;
const MAX_PIXELS_PER_TICK = 3.3;
const SIMULATION_TICK_MS = 160;
const SAFE_HOLD_SIM_SECONDS_PER_TICK = SIMULATION_TICK_MS / 1000;
const CRUISE_SPEED_KMH = 18;
const roadStart: Point2D = { x: 92, y: 310 }, roadFinish: Point2D = { x: 858, y: 172 };
const hazardColors = { pothole: '#a87554', pedestrian: '#4285f4', vehicle: '#6d91ad', animal: '#8b76a6' };
const formatTime = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
const pathLength = (points: Point2D[]) => points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
const formatSimDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;

function cubic(a: Point2D, b: Point2D, c: Point2D, d: Point2D, steps = 60) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps, u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
  });
}

// The visual road, routing graph, and drivable area all derive from this one curved street.
const roadCenterline = [
  ...cubic(roadStart, { x: 280, y: 370 }, { x: 350, y: 110 }, { x: 510, y: 235 }),
  ...cubic({ x: 510, y: 235 }, { x: 650, y: 345 }, { x: 720, y: 100 }, roadFinish).slice(1),
];

function roadStrip(centerline: Point2D[], halfWidth: number) {
  const left: Point2D[] = [], right: Point2D[] = [];
  centerline.forEach((point, index) => {
    const before = centerline[Math.max(0, index - 1)], after = centerline[Math.min(centerline.length - 1, index + 1)];
    const dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length, ny = dx / length;
    left.push({ x: point.x + nx * halfWidth, y: point.y + ny * halfWidth });
    right.push({ x: point.x - nx * halfWidth, y: point.y - ny * halfWidth });
  });
  const rightEdge = right.reverse();
  return { polygon: [...left, ...rightEdge], left, right: rightEdge };
}

function routeOnStreet(from: Point2D, to: Point2D, centerline = roadCenterline) {
  const nearest = (point: Point2D) => centerline.reduce((best, candidate, index) => distance(candidate, point) < distance(centerline[best], point) ? index : best, 0);
  const fromIndex = nearest(from), toIndex = nearest(to);
  const middle = fromIndex <= toIndex
    ? centerline.slice(fromIndex, toIndex + 1)
    : centerline.slice(toIndex, fromIndex + 1).reverse();
  return [from, ...middle, to];
}

function nearestPathIndex(points: Point2D[], point: Point2D) {
  return points.reduce((best, candidate, index) => distance(candidate, point) < distance(points[best], point) ? index : best, 0);
}

function pointToSegment(point: Point2D, a: Point2D, b: Point2D) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// Collision uses the actual rotated vehicle box, not the planner's larger safety margin.
function overlapsVehicle(hazard: RoadHazard, vehicle: Point2D, heading: number) {
  const dx = hazard.x - vehicle.x, dy = hazard.y - vehicle.y;
  const forward = dx * Math.cos(heading) + dy * Math.sin(heading);
  const lateral = -dx * Math.sin(heading) + dy * Math.cos(heading);
  const outsideX = Math.max(Math.abs(forward) - 14, 0), outsideY = Math.max(Math.abs(lateral) - 8, 0);
  return Math.hypot(outsideX, outsideY) < hazard.radius;
}

function freshHazards(): RoadHazard[] { return initialHazards.map((hazard) => ({ ...hazard })); }

function hazardsOnRoute(hazards: RoadHazard[], centerline: Point2D[]) {
  if (centerline.length < 2) return hazards;
  const lengths = centerline.slice(1).map((point, index) => distance(centerline[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
  return hazards.map((hazard, hazardIndex) => {
    const targetDistance = totalLength * (0.18 + (0.64 * (hazardIndex + 1)) / (hazards.length + 1));
    let travelled = 0;
    for (let segmentIndex = 0; segmentIndex < lengths.length; segmentIndex += 1) {
      const segmentLength = lengths[segmentIndex] || 1;
      if (travelled + segmentLength >= targetDistance) {
        const a = centerline[segmentIndex], b = centerline[segmentIndex + 1];
        const t = Math.max(0, Math.min(1, (targetDistance - travelled) / segmentLength));
        const dx = b.x - a.x, dy = b.y - a.y;
        const normalLength = Math.hypot(dx, dy) || 1;
        const side = hazardIndex % 2 === 0 ? 1 : -1;
        const offset = hazard.kind === 'pothole' ? 0 : side * 13;
        return { ...hazard, x: a.x + dx * t - (dy / normalLength) * offset, y: a.y + dy * t + (dx / normalLength) * offset };
      }
      travelled += segmentLength;
    }
    return hazard;
  });
}

export default function AutonomousSimulation({ plannedRoute = null }: { plannedRoute?: SimulationRoute | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plannerRouteWasActive = useRef(false);
  const lastMovementTick = useRef(-1), simulationStep = useRef(0), distanceTravelledMetersRef = useRef(0), lastPlanId = useRef(''), safetyHoldLogged = useRef(false), progressIndex = useRef(0), activePath = useRef<Point2D[]>([]), activePathCursor = useRef(0), activePathId = useRef(''), avoidanceSides = useRef<Record<string, 'L' | 'R'>>({});
  const [simulationState, setSimulationState] = useState<SimulationState>('IDLE');
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>(null);
  const [tick, setTick] = useState(0);
  const [followPlannerRoute, setFollowPlannerRoute] = useState(false);
  // Preload a full demo route so the first run exercises the whole neighborhood.
  // Map clicks still replace it with any custom start/destination pair.
  const [routeStart, setRouteStart] = useState<Point2D | null>(roadCenterline[0]);
  const [destination, setDestination] = useState<Point2D | null>(roadCenterline[roadCenterline.length - 1]);
  const [destinationName, setDestinationName] = useState('Kalyan Nagar Main Road');
  const baseHazards = useRef<RoadHazard[]>(freshHazards());
  const [position, setPosition] = useState<Point2D | null>(null);
  const [hazards, setHazards] = useState<RoadHazard[]>(freshHazards);
  const [pathTaken, setPathTaken] = useState<Point2D[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [replans, setReplans] = useState(0);
  const [elapsedSimSeconds, setElapsedSimSeconds] = useState(0);
  const [distanceTravelledMeters, setDistanceTravelledMeters] = useState(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [routeMessage, setRouteMessage] = useState('Demo route ready. Press Start Simulation, or use Change destination to add a named point on the road.');
  const [collisionLabel, setCollisionLabel] = useState('');
  const [controllerHolding, setControllerHolding] = useState(false);

  const roadGeometry = plannedRoute && plannedRoute.points.length > 1 ? plannedRoute.points : roadCenterline;
  const drivableRoad = useMemo(() => roadStrip(roadGeometry, 40), [roadGeometry]);
  const paintedRoadEdges = useMemo(() => roadStrip(roadGeometry, 42), [roadGeometry]);
  const usesPlannerRoute = Boolean(followPlannerRoute && plannedRoute && plannedRoute.points.length > 1);
  const plannerPathPixelLength = usesPlannerRoute ? pathLength(plannedRoute!.points) : 0;
  // Imported routes scale their canvas polyline to the router's real road meters;
  // the synthetic neighborhood uses the documented 8 canvas units per meter above.
  const pixelsPerMeter = usesPlannerRoute && plannedRoute?.distanceMeters && plannerPathPixelLength > 0
    ? plannerPathPixelLength / plannedRoute.distanceMeters
    : DEMO_PIXELS_PER_METER;
  // For planner routes, retain the router's road ETA as the calibrated speed
  // for this compressed canvas. The animation runs faster than wall clock, but
  // simulated time advances in proportion to actual path metres and this speed.
  const routeSpeedKmh = usesPlannerRoute && plannedRoute?.distanceMeters && plannedRoute.durationSeconds > 0
    ? plannedRoute.distanceMeters / plannedRoute.durationSeconds * 3.6
    : CRUISE_SPEED_KMH;
  // Use the source centerline as the authoritative corridor. A single offset
  // polygon can self-fold at tight turns in imported map routes.
  const pathInsideRoad = (points: Point2D[]) => isPathWithinRoadCorridor(points, roadGeometry, 38);
  const routeCenterline = useMemo(() => routeStart && destination ? followPlannerRoute && plannedRoute && plannedRoute.points.length > 1 ? plannedRoute.points : routeOnStreet(routeStart, destination, roadGeometry) : [], [routeStart, destination, plannedRoute, roadGeometry, followPlannerRoute]);

  useEffect(() => {
    if (!plannedRoute || plannedRoute.points.length < 2) {
      if (!plannerRouteWasActive.current) return;
      plannerRouteWasActive.current = false;
      setFollowPlannerRoute(false);
      setSimulationState('IDLE'); setRoutePickMode(null); setRouteStart(roadCenterline[0]); setDestination(roadCenterline[roadCenterline.length - 1]); setDestinationName('Kalyan Nagar Main Road');
      setPosition(null); setPathTaken([]); setAvoided([]); setReplans(0); setElapsedSimSeconds(0); setDistanceTravelledMeters(0); distanceTravelledMetersRef.current = 0; setCurrentSpeedKmh(0); setCollisionLabel(''); setControllerHolding(false);
      baseHazards.current = freshHazards(); setHazards(baseHazards.current.map((hazard) => ({ ...hazard })));
      setRouteMessage('Demo route ready. Press Start Simulation, or use Change destination to add a named point on the road.');
      return;
    }
    const points = plannedRoute.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) return;
    plannerRouteWasActive.current = true;
    baseHazards.current = hazardsOnRoute(freshHazards(), points);
    setHazards(baseHazards.current.map((hazard) => ({ ...hazard })));
    setFollowPlannerRoute(true);
    setSimulationState('IDLE'); setRoutePickMode(null); setRouteStart(points[0]); setDestination(points[points.length - 1]); setDestinationName(plannedRoute.destination);
    setPosition(null); setPathTaken([]); setAvoided([]); setReplans(0); setElapsedSimSeconds(0); setDistanceTravelledMeters(0); distanceTravelledMetersRef.current = 0; setCurrentSpeedKmh(0); setCollisionLabel(''); setControllerHolding(false);
    avoidanceSides.current = {}; progressIndex.current = 0; activePath.current = []; activePathCursor.current = 0; activePathId.current = ''; lastMovementTick.current = -1; lastPlanId.current = ''; safetyHoldLogged.current = false; simulationStep.current = 0; setTick(0);
    setRouteMessage(`${plannedRoute.routeName} loaded for ${plannedRoute.origin} → ${plannedRoute.destination}. Press Start Simulation to follow it.`);
  }, [plannedRoute]);
  const plan = useMemo(() => {
    if (!position || !destination || routeCenterline.length < 2 || simulationState === 'IDLE') return null;
    // Replan from the path the vehicle is already following. Projecting back to
    // the original road centerline during a bypass caused abrupt lane reversals.
    const remainingRoute = simulationState === 'RUNNING' && activePath.current.length
      ? [position, ...activePath.current.slice(activePathCursor.current)]
      : routeCenterline.slice(progressIndex.current);
    const ranked = rankRiskPaths({
      current: position, destination, candidates: trajectoryCandidates(position, destination, hazards, remainingRoute, avoidanceSides.current),
      staticHazards: hazards.filter((hazard) => !hazard.dynamic), dynamicHazards: hazards.filter((hazard) => hazard.dynamic),
      drivableArea: drivableRoad.polygon, drivableCenterline: roadGeometry, roadHalfWidth: 38, mode: 'trajectory',
    });
    // Keep a still-safe chosen bypass; only yield it for a conflict or a materially safer route.
    const previous = lastPlanId.current ? ranked.rankedPaths.find((path) => path.id === lastPlanId.current) : undefined;
    if (previous && !previous.blocked) {
      return { ...ranked, recommended: previous, overallRisk: previous.riskScore };
    }
    return ranked;
  }, [position, destination, routeCenterline, hazards, simulationState]);
  const pathWithinBoundary = !plan || pathInsideRoad(plan.recommended.points);
  const remainingPath = simulationState === 'COMPLETED'
    ? []
    : position
      ? activePath.current.length > activePathCursor.current
        ? [position, ...activePath.current.slice(activePathCursor.current)]
        : plan?.recommended.blocked
          ? [position, ...routeCenterline.slice(progressIndex.current + 1)]
          : plan?.recommended.points ?? [position, ...routeCenterline.slice(progressIndex.current + 1)]
      : routeCenterline;
  const remainingDistanceMeters = Math.max(0, pathLength(remainingPath) / Math.max(pixelsPerMeter, 0.000001));
  const simulatedRouteDistanceMeters = distanceTravelledMeters + remainingDistanceMeters;
  const etaSeconds = simulationState === 'COMPLETED'
    ? 0
      : currentSpeedKmh > 0
        ? remainingDistanceMeters / (currentSpeedKmh / 3.6)
      : simulationState === 'IDLE'
        ? remainingDistanceMeters / (routeSpeedKmh / 3.6)
        : null;

  useEffect(() => {
    const holding = simulationState === 'RUNNING' && (Boolean(plan?.recommended.blocked) || controllerHolding);
    if (holding && !safetyHoldLogged.current && position) {
      console.info(`[${ENGINE_VERSION}] Safety hold at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}): no collision-free local trajectory is currently available.`);
    }
    safetyHoldLogged.current = holding;
  }, [simulationState, plan, position, controllerHolding]);

  useEffect(() => {
    if (!pathWithinBoundary) console.warn(`[${ENGINE_VERSION}] Recommended path violated the drivable-area boundary.`);
  }, [pathWithinBoundary, plan]);

  // The clock and moving obstacles tick only while RUNNING; state changes never reset the run.
  useEffect(() => {
    if (simulationState !== 'RUNNING') return;
    const timer = window.setInterval(() => {
      simulationStep.current += 1;
      setTick((value) => value + 1);
      const step = simulationStep.current;
      setHazards((items) => items.map((item) => {
        if (!item.dynamic) return item;
        const base = baseHazards.current.find((hazard) => hazard.id === item.id) ?? item;
        if (item.kind === 'pedestrian') return { ...item, x: base.x, y: base.y + Math.sin(step / 9) * 25 };
        if (item.kind === 'vehicle') return { ...item, x: base.x + Math.sin(step / 15) * 22, y: base.y };
        return { ...item, x: base.x + Math.sin(step / 11) * 12, y: base.y + Math.cos(step / 11) * 12 };
      }));
    }, SIMULATION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [simulationState]);

  useEffect(() => {
    if (simulationState !== 'RUNNING' || !plan || !position || !destination) return;
    // React can render multiple times per tick. A vehicle advances exactly once for each clock tick.
    if (lastMovementTick.current === tick) return;
    lastMovementTick.current = tick;
    // Follow adjacent sampled waypoints so the controller cannot cut a corner outside the drivable strip.
    const pixelsPerTick = hazards.some((hazard) => hazard.dynamic && distance(hazard, position) < 82) ? 2.1 : MAX_PIXELS_PER_TICK;
    const nextFor = (path: typeof plan.recommended) => {
      const target = path.points[Math.min(1, path.points.length - 1)] ?? destination;
      const dx = target.x - position.x, dy = target.y - position.y, length = Math.hypot(dx, dy) || 1;
      return { target, heading: Math.atan2(dy, dx), next: length <= pixelsPerTick ? target : { x: position.x + dx / length * pixelsPerTick, y: position.y + dy / length * pixelsPerTick } };
    };
    const stepIsClear = (path: typeof plan.recommended) => {
      if (path.blocked) return false;
      const { next, heading } = nextFor(path), samples = Math.max(1, Math.ceil(distance(position, next) / 3));
      return hazards.every((hazard) => Array.from({ length: samples }, (_, index) => {
        const t = (index + 1) / samples;
        return { x: position.x + (next.x - position.x) * t, y: position.y + (next.y - position.y) * t };
      }).every((sample) => !overlapsVehicle(hazard, sample, heading)));
    };
    // Verify the exact controller motion against the same vehicle box before moving. This last
    // local check catches any mismatch between sampled planner geometry and the 3 px motion sweep.
    const remainingActivePath = activePath.current.slice(activePathCursor.current);
    const activePathSafe = remainingActivePath.length > 0
      && isTrajectoryCollisionFree([position, ...remainingActivePath], hazards)
      && pathInsideRoad([position, ...remainingActivePath]);
    let selected = activePathSafe
      ? plan.rankedPaths.find((path) => path.id === activePathId.current) ?? { ...plan.recommended, id: activePathId.current }
      : plan.rankedPaths.find(stepIsClear) ?? plan.recommended;
    if (!activePathSafe) {
      if (!stepIsClear(selected)) {
        setControllerHolding(true);
        setCurrentSpeedKmh(0);
        setElapsedSimSeconds((value) => value + SAFE_HOLD_SIM_SECONDS_PER_TICK);
        return; // Yield safely while every admissible first move is blocked.
      }
      activePath.current = selected.points.slice(1);
      activePathCursor.current = 0;
      activePathId.current = selected.id;
      avoidanceSides.current = { ...avoidanceSides.current, ...selected.avoidance };
    }
    setControllerHolding(false);
    const target = activePath.current[activePathCursor.current] ?? destination;
    const dx = target.x - position.x, dy = target.y - position.y, heading = Math.atan2(dy, dx);
    const segmentLength = Math.hypot(dx, dy) || 1;
    const next = segmentLength <= pixelsPerTick ? target : { x: position.x + dx / segmentLength * pixelsPerTick, y: position.y + dy / segmentLength * pixelsPerTick };

    // Sweep the vehicle box over this tick so a fast update cannot tunnel through an obstacle.
    const contactSteps = Math.max(1, Math.ceil(distance(position, next) / 3));
    let collision: RoadHazard | undefined;
    for (let step = 1; step <= contactSteps && !collision; step += 1) {
      const t = step / contactSteps;
      const sample = { x: position.x + (next.x - position.x) * t, y: position.y + (next.y - position.y) * t };
      collision = hazards.find((hazard) => overlapsVehicle(hazard, sample, heading));
    }
    const reachedDestination = distance(destination, next) < 5;
    const actualNext = reachedDestination ? destination : next;
    setPosition(actualNext);
    const movedMeters = distance(position, actualNext) / Math.max(pixelsPerMeter, 0.000001);
    // Simulated speed is the route's calibrated road speed, reduced only while
    // the controller is in its obstacle-slowdown zone. Canvas waypoint spacing
    // must not change the vehicle's speed or ETA.
    const achievedSpeedKmh = routeSpeedKmh * (pixelsPerTick / MAX_PIXELS_PER_TICK);
    const simulatedTickSeconds = achievedSpeedKmh > 0 ? movedMeters / (achievedSpeedKmh / 3.6) : 0;
    distanceTravelledMetersRef.current += movedMeters;
    setDistanceTravelledMeters(distanceTravelledMetersRef.current);
    setCurrentSpeedKmh(achievedSpeedKmh);
    setElapsedSimSeconds((value) => value + simulatedTickSeconds);
    progressIndex.current = Math.max(progressIndex.current, nearestPathIndex(routeCenterline, next));
    if (distance(next, target) < 1) activePathCursor.current += 1;
    setPathTaken((points) => [...points.slice(-300), next]);
    if (collision) {
      console.error(`[${ENGINE_VERSION}] Collision detected with ${collision.kind} at (${collision.x.toFixed(0)}, ${collision.y.toFixed(0)}) while following ${selected.id}; from (${position.x.toFixed(1)}, ${position.y.toFixed(1)}) toward (${target.x.toFixed(1)}, ${target.y.toFixed(1)}), sample (${next.x.toFixed(1)}, ${next.y.toFixed(1)}), first points ${JSON.stringify(selected.points.slice(0, 3))}, ${plan.rankedPaths.length} admissible routes.`);
      setCollisionLabel(`${collision.kind} · ${Math.round(collision.x)}, ${Math.round(collision.y)}`);
      setSimulationState('CRASHED');
      return;
    }

    if (lastPlanId.current && selected.id !== lastPlanId.current) {
      const obstacle = hazards.find((hazard) => hazard.id === selected.nearestHazard);
      if (obstacle && distance(obstacle, position) < 220) {
      console.info(`[${ENGINE_VERSION}] Replanning due to ${obstacle.kind} at (${obstacle.x.toFixed(0)}, ${obstacle.y.toFixed(0)}); driven ${distanceTravelledMetersRef.current.toFixed(1)} m.`);
        setReplans((value) => value + 1);
      }
    }
    lastPlanId.current = selected.id;
    const passedHazard = hazards.find((hazard) => hazard.dynamic && !avoided.includes(hazard.id) && distance(hazard, next) < hazard.radius + 30);
    if (passedHazard) setAvoided((items) => [...items, passedHazard.id]);
    if (reachedDestination) {
      console.info(`[${ENGINE_VERSION}] Run complete. Actual path distance ${distanceTravelledMetersRef.current.toFixed(1)} m; simulated time ${formatTime(elapsedSimSeconds + simulatedTickSeconds)}.`);
      setCurrentSpeedKmh(0);
      setSimulationState('COMPLETED');
    }
  }, [tick, simulationState, plan, position, destination, hazards, avoided, elapsedSimSeconds, pixelsPerMeter, routeSpeedKmh]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_WIDTH * dpr; canvas.height = MAP_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.fillStyle = '#edf2e9'; ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // A compact neighborhood map palette with parks, compound walls, and Indian street labels.
    ctx.fillStyle = '#dcebd7'; ctx.beginPath(); ctx.roundRect(28, 82, 108, 82, 12); ctx.fill();
    ctx.fillStyle = '#92b58a'; ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NEIGHBOURHOOD PARK', 82, 123);

    // Low-rise blocks use restrained map colors, rounded corners and a soft lift.
    const blocks = [[42,42,92,30],[185,22,100,52],[739,30,130,49],[101,394,148,42],[596,390,177,43],[459,35,74,34],[842,270,68,45],[34,210,73,54],[178,414,90,30],[315,28,90,42],[868,370,56,50],[295,394,92,42],[516,408,64,30]];
    ctx.shadowColor = 'rgba(84,77,64,.14)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    blocks.forEach(([x,y,w,h], index) => {
      ctx.fillStyle = index % 2 ? '#e7e2d8' : '#e9e6df'; ctx.strokeStyle = '#d8d3ca'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill(); ctx.stroke();
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    const trace = (points: Point2D[]) => { ctx.beginPath(); points.forEach((point,index) => index ? ctx.lineTo(point.x,point.y) : ctx.moveTo(point.x,point.y)); };
    // Side streets make the setting read as a dense neighborhood street map.
    const sideStreets: Point2D[][] = [
      [{ x: 0, y: 191 }, { x: 102, y: 191 }, { x: 147, y: 214 }],
      [{ x: 298, y: 0 }, { x: 298, y: 92 }, { x: 328, y: 145 }],
      [{ x: 564, y: 0 }, { x: 558, y: 91 }, { x: 535, y: 151 }],
      [{ x: 950, y: 292 }, { x: 850, y: 292 }, { x: 801, y: 271 }],
      [{ x: 438, y: 460 }, { x: 440, y: 392 }, { x: 463, y: 334 }],
    ];
    sideStreets.forEach((street) => { trace(street); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#d5d7d8'; ctx.lineWidth = 46; ctx.stroke(); trace(street); ctx.strokeStyle = '#fbfbfa'; ctx.lineWidth = 39; ctx.stroke(); });

    // Main local road has a generous shoulder and clearly marked drivable limits.
    trace(roadGeometry); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#c9cdd0'; ctx.lineWidth = 96; ctx.stroke();
    trace(roadGeometry); ctx.strokeStyle = '#eef0ef'; ctx.lineWidth = 88; ctx.stroke();
    [paintedRoadEdges.left, paintedRoadEdges.right].forEach((edge) => { trace(edge); ctx.strokeStyle = '#73818a'; ctx.lineWidth = 2; ctx.setLineDash([9,6]); ctx.stroke(); });
    trace(roadGeometry); ctx.strokeStyle = '#d7a94e'; ctx.lineWidth = 2; ctx.setLineDash([12,14]); ctx.stroke(); ctx.setLineDash([]);

    // Always show the selected route; keep the route preview visible before Start and after arrival.
    if (routeStart && destination && routeCenterline.length > 1) {
      trace(routeCenterline); ctx.strokeStyle = 'rgba(34,112,217,.22)'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    // During motion, render the exact trajectory the controller is following. This
    // prevents the blue route from flickering as live obstacle scores are refreshed.
    const followingPath = simulationState === 'RUNNING' && !controllerHolding && position && activePath.current.length
      ? [position, ...activePath.current.slice(activePathCursor.current)]
      : simulationState === 'IDLE' || simulationState === 'COMPLETED' ? routeCenterline : plan?.recommended.points;
    if (followingPath?.length) {
      trace(followingPath); ctx.strokeStyle = 'rgba(34,112,217,.3)'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(34,112,217,.4)'; ctx.shadowBlur = 11; ctx.stroke();
      trace(followingPath); ctx.strokeStyle = '#2270d9'; ctx.lineWidth = 5; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.stroke();
    }
    if (pathTaken.length > 1) { trace(pathTaken); ctx.strokeStyle = '#124e9e'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke(); }

    // Map labels communicate the left-side-traffic urban setting without obscuring the route.
    const mapLabel = (text: string, x: number, y: number, color = '#536271') => { ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,.88)'; const width = ctx.measureText(text).width + 14; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 10, width, 20, 6); ctx.fill(); ctx.fillStyle = color; ctx.fillText(text, x, y); };
    mapLabel(plannedRoute && followPlannerRoute ? `${plannedRoute.origin} → ${plannedRoute.destination}`.toUpperCase().slice(0, 36) : plannedRoute ? 'CUSTOM ROAD ROUTE' : 'KALYAN NAGAR · BENGALURU', 755, 96, '#176455');
    mapLabel('5TH A CROSS ROAD', 230, 178);
    mapLabel('LEFT-SIDE TRAFFIC', 716, 354, '#a36b25');

    // Click-selected route markers remain distinct while the car is idle or running.
    const marker = (point: Point2D, label: string, color: string) => {
      ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(43,57,72,.2)'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(point.x,point.y,12,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(point.x,point.y,9,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label,point.x,point.y);
    };
    if (routeStart) marker(routeStart, 'A', '#34a853');
    if (destination) marker(destination, 'B', '#4285f4');
    if (destination && destinationName) mapLabel(destinationName, destination.x, destination.y - 22, '#2270d9');

    hazards.forEach((hazard) => {
      const color = hazardColors[hazard.kind];
      ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.shadowColor = 'rgba(42,54,64,.22)'; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(hazard.x,hazard.y,12,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hazard.x,hazard.y,9,0,Math.PI*2); ctx.fill();
      const glyph = hazard.kind === 'pothole' ? '!' : hazard.kind === 'pedestrian' ? 'P' : hazard.kind === 'vehicle' ? '🛺' : 'A';
      ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph,hazard.x,hazard.y+.5);
    });

    if (position) {
      const previous = pathTaken[pathTaken.length - 2] ?? routeStart ?? position;
      const angle = Math.atan2(position.y - previous.y, position.x - previous.x);
      // Directional blue navigation arrow with white outline and a soft elevation shadow.
      ctx.save(); ctx.translate(position.x,position.y); ctx.rotate(angle);
      ctx.shadowColor = 'rgba(26,72,147,.32)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-10,-8); ctx.lineTo(-6,0); ctx.lineTo(-10,8); ctx.closePath();
      ctx.fillStyle = '#4285f4'; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
  }, [plan, hazards, position, routeStart, destination, destinationName, pathTaken, routeCenterline, roadGeometry, simulationState, controllerHolding, plannedRoute, followPlannerRoute]);

  const handleMapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!routePickMode) { setRouteMessage('Choose Change destination or Change route before tapping the map.'); return; }
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) * MAP_WIDTH / rect.width, y: (event.clientY - rect.top) * MAP_HEIGHT / rect.height };
    if (!pathInsideRoad([point])) {
      setRouteMessage('Choose a point inside the road edges.');
      return;
    }
    if (routePickMode === 'START') {
      const startHazard = baseHazards.current.find((hazard) => distance(point, hazard) < hazard.radius + (hazard.dynamic ? 42 : 22));
      if (startHazard) {
        setRouteMessage(`That start point is too close to the ${startHazard.kind}. Choose a clear point on the road.`);
        return;
      }
      setRouteStart(point); setDestination(null); setDestinationName(''); avoidanceSides.current = {}; setRoutePickMode('DESTINATION'); setPosition(null); setPathTaken([]); setRouteMessage('Start selected. Tap the road to choose a destination.');
    } else {
      if (!routeStart) { setRouteMessage('Choose a start point first.'); setRoutePickMode('START'); return; }
      const goalHazard = baseHazards.current.find((hazard) => distance(point, hazard) < hazard.radius + (hazard.dynamic ? 42 : 22));
      if (goalHazard) {
        setRouteMessage(`That destination is too close to the ${goalHazard.kind}. Choose a clear point on the road.`);
        return;
      }
      const preview = routeOnStreet(routeStart, point, roadGeometry);
      const available = rankRiskPaths({
        current: routeStart, destination: point, candidates: trajectoryCandidates(routeStart, point, baseHazards.current, preview),
        staticHazards: baseHazards.current.filter((hazard) => !hazard.dynamic), dynamicHazards: baseHazards.current.filter((hazard) => hazard.dynamic),
        drivableArea: drivableRoad.polygon, drivableCenterline: roadGeometry, roadHalfWidth: 38, mode: 'trajectory',
      });
      if (!pathInsideRoad(preview) || !available.rankedPaths.some((path) => !path.blocked)) {
        setRouteMessage('No safe path reaches that point. Choose another point inside the road.');
        return;
      }
      setDestination(point); setDestinationName(destinationName.trim() || `Map point ${Math.round(point.x)}, ${Math.round(point.y)}`); setRoutePickMode(null); setRouteMessage('Location added. The blue line previews the route. Press Start Simulation.');
    }
  };

  const prepareRouteEdit = (mode: Exclude<RoutePickMode, null>) => {
    setFollowPlannerRoute(false);
    setSimulationState('IDLE'); setPosition(null); setPathTaken([]); setHazards(baseHazards.current.map((hazard) => ({ ...hazard })));
    setAvoided([]); setReplans(0); setElapsedSimSeconds(0); setDistanceTravelledMeters(0); distanceTravelledMetersRef.current = 0; setCurrentSpeedKmh(0); setCollisionLabel(''); setControllerHolding(false);
    avoidanceSides.current = {}; activePath.current = []; activePathCursor.current = 0; activePathId.current = ''; lastMovementTick.current = -1; lastPlanId.current = ''; safetyHoldLogged.current = false; simulationStep.current = 0; setTick(0);
    setRoutePickMode(mode);
    if (mode === 'START') { setRouteStart(null); setDestination(null); setDestinationName(''); setRouteMessage('Tap the highlighted road to place START, then choose a destination name and point.'); }
    else { setDestination(null); setDestinationName(''); setRouteMessage('Name the destination, then tap the highlighted road to place it.'); }
  };

  const startSimulation = () => {
    if (!routeStart || !destination || routePickMode || !pathInsideRoad(routeCenterline)) {
      setRouteMessage('Choose valid road points to create a route before starting.');
      return;
    }
    const initial = baseHazards.current.map((hazard) => ({ ...hazard }));
    const feasible = rankRiskPaths({
      current: routeStart, destination, candidates: trajectoryCandidates(routeStart, destination, initial, routeCenterline),
      staticHazards: initial.filter((hazard) => !hazard.dynamic), dynamicHazards: initial.filter((hazard) => hazard.dynamic),
      drivableArea: drivableRoad.polygon, drivableCenterline: roadGeometry, roadHalfWidth: 38, mode: 'trajectory',
    });
    const hasClearTrajectory = feasible.rankedPaths.some((path) => !path.blocked);
    setPosition(routeStart); setPathTaken([routeStart]); setHazards(baseHazards.current.map((hazard) => ({ ...hazard }))); setAvoided([]); setReplans(0); setElapsedSimSeconds(0); setDistanceTravelledMeters(0); distanceTravelledMetersRef.current = 0; setCurrentSpeedKmh(0); setCollisionLabel('');
    setControllerHolding(false); avoidanceSides.current = {}; progressIndex.current = 0; activePath.current = []; activePathCursor.current = 0; activePathId.current = ''; lastMovementTick.current = -1; lastPlanId.current = ''; safetyHoldLogged.current = false; simulationStep.current = 0; setTick(0);
    const initialPath = feasible.rankedPaths.find((path) => !path.blocked)?.points ?? routeCenterline;
    const initialDistanceMeters = pathLength(initialPath) / Math.max(pixelsPerMeter, 0.000001);
    console.info(`[${ENGINE_VERSION}] Simulation started. Planned path ${initialDistanceMeters.toFixed(1)} m; initial ETA ${formatTime(initialDistanceMeters / (routeSpeedKmh / 3.6))}; calibrated route speed ${routeSpeedKmh.toFixed(1)} km/h; scale ${pixelsPerMeter.toFixed(3)} px/m.`);
    if (!hasClearTrajectory) setRouteMessage('Simulation started in a safe hold. Replanning as moving hazards clear the route.');
    setSimulationState('RUNNING');
  };

  const resetSimulation = () => {
    if (simulationState !== 'IDLE') console.info(`[${ENGINE_VERSION}] Simulation reset by user from ${simulationState}.`);
    const resetCenterline = plannedRoute?.points.length ? plannedRoute.points : roadCenterline;
    setFollowPlannerRoute(Boolean(plannedRoute));
    setSimulationState('IDLE'); setRoutePickMode(null); setRouteStart(resetCenterline[0]); setDestination(resetCenterline[resetCenterline.length - 1]); setDestinationName(plannedRoute?.destination ?? 'Kalyan Nagar Main Road'); setPosition(null); setPathTaken([]); setHazards(baseHazards.current.map((hazard) => ({ ...hazard })));
    setAvoided([]); setReplans(0); setElapsedSimSeconds(0); setDistanceTravelledMeters(0); distanceTravelledMetersRef.current = 0; setCurrentSpeedKmh(0); setCollisionLabel('');
    setControllerHolding(false); avoidanceSides.current = {}; progressIndex.current = 0; activePath.current = []; activePathCursor.current = 0; activePathId.current = ''; lastMovementTick.current = -1; lastPlanId.current = ''; safetyHoldLogged.current = false; simulationStep.current = 0; setTick(0);
    setRouteMessage(plannedRoute ? `${plannedRoute.routeName} ready · ETA ${plannedRoute.eta} · press Start Simulation.` : 'Demo route ready. Press Start Simulation, or use Change destination to add a named point on the road.');
  };

  const togglePause = () => {
    if (simulationState === 'RUNNING') { console.info(`[${ENGINE_VERSION}] Simulation paused at ${formatTime(elapsedSimSeconds)} simulated seconds.`); setCurrentSpeedKmh(0); setSimulationState('PAUSED'); }
    else if (simulationState === 'PAUSED') { console.info(`[${ENGINE_VERSION}] Simulation resumed at ${formatTime(elapsedSimSeconds)} simulated seconds.`); setSimulationState('RUNNING'); }
  };
  const stateTone = simulationState === 'CRASHED' ? 'bg-red-100 text-red-800' : simulationState === 'COMPLETED' ? 'bg-blue-100 text-blue-800' : simulationState === 'RUNNING' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700';
  const speedKmh = simulationState === 'RUNNING' && !plan?.recommended.blocked && !controllerHolding ? currentSpeedKmh.toFixed(1) : '0.0';
  const boundaryStatus = pathWithinBoundary ? 'Inside road boundary' : 'Boundary violation';

  return <div className="page-in space-y-6">
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary"><Activity size={14}/>Autonomous simulation · synthetic scene</p><h1 className="font-display text-4xl font-bold tracking-[-.055em] md:text-5xl">Adaptive path control</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{plannedRoute ? `The selected route from ${plannedRoute.origin} to ${plannedRoute.destination} is loaded below. Synthetic hazards exercise autonomous replanning.` : 'Run the ready demo route, or change the destination or route on this Bengaluru neighborhood map. Live hazards trigger local replanning.'}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => prepareRouteEdit('DESTINATION')} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold">Change destination</button>
        <button type="button" onClick={() => prepareRouteEdit('START')} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold">Change route</button>
        {simulationState === 'RUNNING' || simulationState === 'PAUSED' ? <button type="button" onClick={togglePause} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{simulationState === 'RUNNING' ? <Pause size={16}/> : <Play size={16}/>} {simulationState === 'RUNNING' ? 'Pause' : 'Resume'}</button> : null}
        {simulationState === 'IDLE' ? <button type="button" onClick={startSimulation} disabled={!routeStart || !destination || Boolean(routePickMode)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"><Play size={16}/>Start Simulation</button> : null}
        <button type="button" onClick={resetSimulation} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold"><RotateCcw size={16}/>{simulationState === 'IDLE' ? 'Reset Route' : 'Reset'}</button>
      </div>
    </div>

    <section className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-[24px] border border-card-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><p className="font-display font-bold">{plannedRoute && followPlannerRoute ? `${plannedRoute.origin} → ${plannedRoute.destination} · selected road route` : plannedRoute ? 'Custom route on selected roadway' : 'Kalyan Nagar · unstructured local road'}</p><p className="mt-1 text-xs text-muted-foreground">{routeMessage}</p></div>
          <div className="flex flex-wrap items-center gap-2"><span data-testid="simulation-state" className={`rounded-full px-3 py-1.5 text-xs font-bold ${stateTone}`}>{simulationState}</span><span data-testid="boundary-validation" className={`rounded-full px-3 py-1.5 text-xs font-bold ${pathWithinBoundary ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{boundaryStatus}</span></div>
        </div>
        {routePickMode === 'DESTINATION' ? <div className="grid gap-2 border-b border-border bg-primary/[.035] px-5 py-4 sm:grid-cols-[minmax(180px,280px)_1fr] sm:items-end"><label className="text-xs font-bold text-foreground">Name this destination<input autoComplete="off" value={destinationName} onChange={(event) => setDestinationName(event.target.value)} placeholder="e.g. Home, office, market" className="mt-1.5 block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><p className="text-xs leading-5 text-muted-foreground">Then tap any point inside the outlined road. The name can be anything; the point must be on this demo map.</p></div> : null}
        <div className="p-2 md:p-4"><canvas ref={canvasRef} onClick={handleMapClick} role="application" className={`block w-full rounded-2xl ${routePickMode ? 'cursor-crosshair' : 'cursor-default'}`} style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }} aria-label={routePickMode ? `Tap a point on the road to set ${routePickMode.toLowerCase()}.` : 'Neighborhood road map. Use Change destination or Change route to edit the path.'} /></div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#34a853]"/>Start</span><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#4285f4]"/>Destination</span>{[['#a87554','Pothole'],['#4285f4','Pedestrian'],['#6d91ad','Vehicle'],['#8b76a6','Animal']].map(([color,label])=><span key={label} className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: color }}/>{label}</span>)}<span className="ml-auto text-[#4285f4]">Blue line · planned route</span></div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Control telemetry</p><div className="mt-4 grid grid-cols-2 gap-3">{[['State',simulationState,''],['Speed',speedKmh,'km/h'],['Risk score',String(plan?.overallRisk ?? '—'),'/100'],['Replans',String(replans),'events'],['Sim time',formatTime(elapsedSimSeconds),'mm:ss']].map(([label,value,unit])=><div key={label} className="rounded-2xl bg-muted/70 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl">{value}<small className="ml-1 text-xs font-medium text-muted-foreground">{unit}</small></strong></div>)}</div><div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><ShieldCheck size={17} className="text-primary"/><span>Boundary check <strong>{pathWithinBoundary ? 'pass' : 'warning'}</strong></span></div>{collisionLabel ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">Collision: {collisionLabel}</p> : null}</div>
        <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><MapPin size={16} className="text-primary"/><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selected route</p></div><p className="mt-3 text-sm"><span className="text-muted-foreground">From</span><strong className="ml-2">{plannedRoute && followPlannerRoute ? plannedRoute.origin : routeStart ? `${Math.round(routeStart.x)}, ${Math.round(routeStart.y)}` : 'Not set'}</strong></p><p className="mt-2 text-sm"><span className="text-muted-foreground">To</span><strong className="ml-2">{plannedRoute && followPlannerRoute ? plannedRoute.destination : destination ? `${destinationName || 'Custom map point'} · ${Math.round(destination.x)}, ${Math.round(destination.y)}` : 'Not set'}</strong></p><p className="mt-2 text-sm"><span className="text-muted-foreground">Projected route</span><strong className="ml-2">{formatSimDistance(simulatedRouteDistanceMeters)}</strong></p><p className="mt-2 text-sm"><span className="text-muted-foreground">Remaining</span><strong className="ml-2">{formatSimDistance(remainingDistanceMeters)}</strong></p><p className="mt-2 text-sm"><span className="text-muted-foreground">Driven</span><strong className="ml-2">{formatSimDistance(distanceTravelledMeters)}</strong></p><p className="mt-2 text-sm"><span className="text-muted-foreground">Sim ETA</span><strong className="ml-2">{etaSeconds === null ? 'Waiting' : formatTime(etaSeconds)}</strong></p><p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{routePickMode ? routeMessage : simulationState === 'IDLE' ? plannedRoute && followPlannerRoute ? 'Planner route loaded. Press Start Simulation to run autonomous hazard avoidance on this route.' : 'Use Change destination or Change route, name your place, then tap the outlined road. The blue line previews your choice.' : simulationState === 'COMPLETED' ? `Destination reached · ${formatSimDistance(distanceTravelledMeters)} driven in ${formatTime(elapsedSimSeconds)} simulated time.` : simulationState === 'CRASHED' ? 'Run ended after a vehicle-box collision. Change destination to plan another route.' : controllerHolding ? 'Safety hold: waiting for a collision-free trajectory.' : 'The shared engine is updating the route around current hazards.'}</p></div>
        <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Run log</p><div className="mt-3 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Obstacles avoided</span><strong>{avoided.length}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Scored road profiles</span><strong>{mockRoadSegments.length}</strong></div>{avoided.slice(-3).map((item)=><p key={item} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Avoided {item.replace('-', ' ')}</p>)}<p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{ENGINE_VERSION} · {simulationState === 'IDLE' ? 'waiting for route and Start' : simulationState === 'RUNNING' ? 'live trajectory control' : `run ${simulationState.toLowerCase()}`}</p></div></div>
      </aside>
    </section>
  </div>;
}
