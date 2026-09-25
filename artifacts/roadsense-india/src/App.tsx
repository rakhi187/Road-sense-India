import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AutonomousSimulation, { type SimulationRoute } from './components/AutonomousSimulation';
import { ENGINE_VERSION, rankRiskPaths } from './engine/riskPathEngine';
import { initialHazards, type Point2D } from './engine/mockData';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  CircleDot,
  CloudRain,
  Gauge,
  Info,
  Layers3,
  MapPinned,
  Menu,
  Navigation,
  Network,
  Pause,
  Play,
  PlayCircle,
  Radio,
  Route as RouteIcon,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  Sparkles,
  TrafficCone,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type View = 'home' | 'live' | 'routes' | 'scenario' | 'architecture';

type NavItem = {
  id: View;
  label: string;
  icon: LucideIcon;
  helper: string;
};

type IndiaLocation = {
  id: string;
  city: string;
  state: string;
  region: string;
  defaultOrigin: string;
  defaultDestination: string;
  weather: string;
  coordinates?: GeoPoint;
};

type LocationControls = {
  locations: IndiaLocation[];
  selectedId: string;
  onChange: (id: string) => void;
  onAdd: (city: string, coordinates: PlaceCoordinate) => void;
};

type RoutePlannerTrip = { start: string; destination: string };

const navItems: NavItem[] = [
  { id: 'home', label: 'Overview', icon: Activity, helper: 'Start here' },
  { id: 'architecture', label: 'Architecture', icon: Network, helper: 'How it works' },
  { id: 'routes', label: 'Route planner', icon: RouteIcon, helper: 'Compare choices' },
  { id: 'scenario', label: 'Scenario player', icon: PlayCircle, helper: 'Practise decisions' },
  { id: 'live', label: 'Street simulation', icon: MapPinned, helper: 'Test changing road states' },
];

const indiaLocations: IndiaLocation[] = [
  { id: 'bengaluru', city: 'Bengaluru', state: 'Karnataka', region: 'South India', defaultOrigin: 'Kalyan Nagar', defaultDestination: 'Malleswaram', weather: 'Rain watch' },
  { id: 'delhi', city: 'New Delhi', state: 'Delhi', region: 'North India', defaultOrigin: 'Connaught Place', defaultDestination: 'Dwarka', weather: 'Clear with haze' },
  { id: 'mumbai', city: 'Mumbai', state: 'Maharashtra', region: 'West India', defaultOrigin: 'Andheri East', defaultDestination: 'Bandra West', weather: 'Coastal showers' },
  { id: 'hyderabad', city: 'Hyderabad', state: 'Telangana', region: 'South India', defaultOrigin: 'Hitech City', defaultDestination: 'Secunderabad', weather: 'Dry and warm' },
  { id: 'chennai', city: 'Chennai', state: 'Tamil Nadu', region: 'South India', defaultOrigin: 'Adyar', defaultDestination: 'Anna Nagar', weather: 'Humid with cloud' },
  { id: 'kolkata', city: 'Kolkata', state: 'West Bengal', region: 'East India', defaultOrigin: 'Salt Lake', defaultDestination: 'Park Street', weather: 'Monsoon watch' },
  { id: 'pune', city: 'Pune', state: 'Maharashtra', region: 'West India', defaultOrigin: 'Kothrud', defaultDestination: 'Viman Nagar', weather: 'Light rain possible' },
  { id: 'ahmedabad', city: 'Ahmedabad', state: 'Gujarat', region: 'West India', defaultOrigin: 'Navrangpura', defaultDestination: 'Bopal', weather: 'Bright and dry' },
  { id: 'jaipur', city: 'Jaipur', state: 'Rajasthan', region: 'North India', defaultOrigin: 'C-Scheme', defaultDestination: 'Mansarovar', weather: 'Clear and warm' },
  { id: 'lucknow', city: 'Lucknow', state: 'Uttar Pradesh', region: 'North India', defaultOrigin: 'Hazratganj', defaultDestination: 'Gomti Nagar', weather: 'Cloudy intervals' },
  { id: 'guwahati', city: 'Guwahati', state: 'Assam', region: 'North-East India', defaultOrigin: 'Paltan Bazaar', defaultDestination: 'Khanapara', weather: 'Heavy rain watch' },
  { id: 'kochi', city: 'Kochi', state: 'Kerala', region: 'South India', defaultOrigin: 'Edappally', defaultDestination: 'Fort Kochi', weather: 'Wet roads' },
];

const indiaMapCenters: Record<string, { latitude: number; longitude: number }> = {
  bengaluru: { latitude: 12.9716, longitude: 77.5946 },
  delhi: { latitude: 28.6139, longitude: 77.2090 },
  mumbai: { latitude: 19.0760, longitude: 72.8777 },
  hyderabad: { latitude: 17.3850, longitude: 78.4867 },
  chennai: { latitude: 13.0827, longitude: 80.2707 },
  kolkata: { latitude: 22.5726, longitude: 88.3639 },
  pune: { latitude: 18.5204, longitude: 73.8567 },
  ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
  jaipur: { latitude: 26.9124, longitude: 75.7873 },
  lucknow: { latitude: 26.8467, longitude: 80.9462 },
  guwahati: { latitude: 26.1445, longitude: 91.7362 },
  kochi: { latitude: 9.9312, longitude: 76.2673 },
};

function mapCenterFor(location: IndiaLocation) {
  // Custom locations are created with an explicit coordinate. Prefer it over
  // the old central-India fallback so an entered city is never shown in the
  // wrong place (for example, Ajmer must not land near Bhopal).
  return location.coordinates ?? indiaMapCenters[location.id] ?? { latitude: 22.9734, longitude: 78.6569 };
}

function projectDevicePosition(point: GeoPoint, location: IndiaLocation) {
  const center = mapCenterFor(location);
  return {
    x: Math.max(42, Math.min(958, 500 + (point.longitude - center.longitude) * 3200)),
    y: Math.max(42, Math.min(478, 260 - (point.latitude - center.latitude) * 3500)),
  };
}

function routePathFromPoint(point: { x: number; y: number }, destination = { x: 900, y: 125 }) {
  const dx = destination.x - point.x;
  const dy = destination.y - point.y;
  const curve = Math.max(-120, Math.min(120, dx * 0.18));
  return `M${point.x.toFixed(1)} ${point.y.toFixed(1)} C${(point.x + dx * 0.28).toFixed(1)} ${(point.y + dy * 0.1 + curve).toFixed(1)} ${(destination.x - dx * 0.28).toFixed(1)} ${(destination.y - dy * 0.1 - curve).toFixed(1)} ${destination.x} ${destination.y}`;
}

function openStreetMapEmbedUrl(location: IndiaLocation, zoom: number) {
  const { latitude, longitude } = mapCenterFor(location);
  const spans: Record<number, number> = { 11: 0.9, 12: 0.45, 13: 0.22, 14: 0.11, 15: 0.055 };
  const latitudeSpan = spans[zoom] ?? 0.45;
  const longitudeSpan = latitudeSpan * 1.25;
  const bbox = [
    longitude - longitudeSpan,
    latitude - latitudeSpan,
    longitude + longitudeSpan,
    latitude + latitudeSpan,
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
}

type GeoPoint = { longitude: number; latitude: number };

type DevicePosition = GeoPoint & {
  accuracy: number;
};

type PlaceCoordinate = GeoPoint & {
  label: string;
  state: string;
};

const indianPlaceCoordinates: Record<string, PlaceCoordinate> = {
  adyar: { label: 'Adyar', state: 'Tamil Nadu', latitude: 13.0012, longitude: 80.2565 },
  ajmer: { label: 'Ajmer', state: 'Rajasthan', latitude: 26.4499, longitude: 74.6399 },
  ahmedabad: { label: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  agra: { label: 'Agra', state: 'Uttar Pradesh', latitude: 27.1767, longitude: 78.0081 },
  amritsar: { label: 'Amritsar', state: 'Punjab', latitude: 31.6340, longitude: 74.8723 },
  annanager: { label: 'Anna Nagar', state: 'Tamil Nadu', latitude: 13.0850, longitude: 80.2101 },
  andherieast: { label: 'Andheri East', state: 'Maharashtra', latitude: 19.1197, longitude: 72.8468 },
  bandrawest: { label: 'Bandra West', state: 'Maharashtra', latitude: 19.0607, longitude: 72.8362 },
  bengaluru: { label: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  bhopal: { label: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  bhubaneswar: { label: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  chandigarh: { label: 'Chandigarh', state: 'Chandigarh', latitude: 30.7333, longitude: 76.7794 },
  chennai: { label: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  coimbatore: { label: 'Coimbatore', state: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558 },
  cscheme: { label: 'C-Scheme', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  delhi: { label: 'New Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.2090 },
  dehradun: { label: 'Dehradun', state: 'Uttarakhand', latitude: 30.3165, longitude: 78.0322 },
  dwarka: { label: 'Dwarka', state: 'Delhi', latitude: 28.5921, longitude: 77.0460 },
  edappally: { label: 'Edappally', state: 'Kerala', latitude: 10.0261, longitude: 76.3084 },
  faridabad: { label: 'Faridabad', state: 'Haryana', latitude: 28.4089, longitude: 77.3178 },
  goa: { label: 'Panaji', state: 'Goa', latitude: 15.4909, longitude: 73.8278 },
  gurugram: { label: 'Gurugram', state: 'Haryana', latitude: 28.4595, longitude: 77.0266 },
  guwahati: { label: 'Guwahati', state: 'Assam', latitude: 26.1445, longitude: 91.7362 },
  hazratganj: { label: 'Hazratganj', state: 'Uttar Pradesh', latitude: 26.8500, longitude: 80.9499 },
  hyderabad: { label: 'Hyderabad', state: 'Telangana', latitude: 17.3850, longitude: 78.4867 },
  hitechcity: { label: 'Hitech City', state: 'Telangana', latitude: 17.4483, longitude: 78.3915 },
  indore: { label: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  jaipur: { label: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  jodhpur: { label: 'Jodhpur', state: 'Rajasthan', latitude: 26.2389, longitude: 73.0243 },
  kanpur: { label: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  kalyannagar: { label: 'Kalyan Nagar', state: 'Karnataka', latitude: 13.0285, longitude: 77.6440 },
  khanapara: { label: 'Khanapara', state: 'Assam', latitude: 26.1143, longitude: 91.8217 },
  kochi: { label: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  kolkata: { label: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  kota: { label: 'Kota', state: 'Rajasthan', latitude: 25.2138, longitude: 75.8648 },
  lucknow: { label: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  madurai: { label: 'Madurai', state: 'Tamil Nadu', latitude: 9.9252, longitude: 78.1198 },
  mangaluru: { label: 'Mangaluru', state: 'Karnataka', latitude: 12.9141, longitude: 74.8560 },
  mansarovar: { label: 'Mansarovar', state: 'Rajasthan', latitude: 26.8500, longitude: 75.7633 },
  mumbai: { label: 'Mumbai', state: 'Maharashtra', latitude: 19.0760, longitude: 72.8777 },
  mysuru: { label: 'Mysuru', state: 'Karnataka', latitude: 12.2958, longitude: 76.6394 },
  nagpur: { label: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  navrangpura: { label: 'Navrangpura', state: 'Gujarat', latitude: 23.0356, longitude: 72.5595 },
  newdelhi: { label: 'New Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.2090 },
  noida: { label: 'Noida', state: 'Uttar Pradesh', latitude: 28.5355, longitude: 77.3910 },
  panaji: { label: 'Panaji', state: 'Goa', latitude: 15.4909, longitude: 73.8278 },
  patna: { label: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
  parkstreet: { label: 'Park Street', state: 'West Bengal', latitude: 22.5535, longitude: 88.3521 },
  paltanbazaar: { label: 'Paltan Bazaar', state: 'Assam', latitude: 26.1836, longitude: 91.7505 },
  prayagraj: { label: 'Prayagraj', state: 'Uttar Pradesh', latitude: 25.4358, longitude: 81.8463 },
  pune: { label: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  raipur: { label: 'Raipur', state: 'Chhattisgarh', latitude: 21.2514, longitude: 81.6296 },
  rajkot: { label: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022 },
  ranchi: { label: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096 },
  saltlake: { label: 'Salt Lake', state: 'West Bengal', latitude: 22.5804, longitude: 88.4126 },
  surat: { label: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  secunderabad: { label: 'Secunderabad', state: 'Telangana', latitude: 17.4399, longitude: 78.4983 },
  thiruvananthapuram: { label: 'Thiruvananthapuram', state: 'Kerala', latitude: 8.5241, longitude: 76.9366 },
  udaipur: { label: 'Udaipur', state: 'Rajasthan', latitude: 24.5854, longitude: 73.7125 },
  varanasi: { label: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.3176, longitude: 82.9739 },
  vadodara: { label: 'Vadodara', state: 'Gujarat', latitude: 22.3072, longitude: 73.1812 },
  vijayawada: { label: 'Vijayawada', state: 'Andhra Pradesh', latitude: 16.5062, longitude: 80.6480 },
  visakhapatnam: { label: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185 },
  vimannagar: { label: 'Viman Nagar', state: 'Maharashtra', latitude: 18.5679, longitude: 73.9143 },
  fortkochi: { label: 'Fort Kochi', state: 'Kerala', latitude: 9.9658, longitude: 76.2426 },
  bopal: { label: 'Bopal', state: 'Gujarat', latitude: 22.9388, longitude: 72.4662 },
  connaughtplace: { label: 'Connaught Place', state: 'Delhi', latitude: 28.6315, longitude: 77.2167 },
  kothrud: { label: 'Kothrud', state: 'Maharashtra', latitude: 18.5074, longitude: 73.8077 },
  gomtinagar: { label: 'Gomti Nagar', state: 'Uttar Pradesh', latitude: 26.8547, longitude: 81.0078 },
  malleswaram: { label: 'Malleswaram', state: 'Karnataka', latitude: 13.0035, longitude: 77.5700 },
};

function normalizePlace(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function coordinateForPlace(value: string, location?: IndiaLocation): PlaceCoordinate | null {
  const normalized = normalizePlace(value);
  const direct = indianPlaceCoordinates[normalized.replace(/\s/g, '')] ?? indianPlaceCoordinates[normalized];
  if (direct) return direct;
  if (location && [location.city, location.defaultOrigin, location.defaultDestination].some((place) => normalizePlace(place) === normalized)) {
    const center = location.coordinates ?? indiaMapCenters[location.id];
    if (center) {
      const isOrigin = normalizePlace(location.defaultOrigin) === normalized;
      const isDestination = normalizePlace(location.defaultDestination) === normalized;
      // A custom saved place is already an exact coordinate. Keep its offline
      // fallback nearby instead of shifting it several kilometres like the
      // broad city-centre defaults used by the built-in demo locations.
      const offsetScale = location.coordinates ? 0.0035 : 0.035;
      const localOffset = isOrigin ? { latitude: -offsetScale, longitude: -offsetScale * 1.25 } : isDestination ? { latitude: offsetScale, longitude: offsetScale * 1.25 } : { latitude: 0, longitude: 0 };
      return { latitude: center.latitude + localOffset.latitude, longitude: center.longitude + localOffset.longitude, label: value, state: location.state };
    }
  }
  return null;
}

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  type?: string;
  name?: string;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    state?: string;
    state_district?: string;
    district?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    country?: string;
    country_code?: string;
  };
};

type PlaceSearchResult = PlaceCoordinate & {
  id: string;
  displayName: string;
  type: string;
};

const nominatimCache = new Map<string, NominatimResult[]>();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchNominatimResults(query: string) {
  const cacheKey = normalizePlace(query);
  const cached = nominatimCache.get(cacheKey);
  if (cached) return cached;

  const request = nominatimQueue.then(async () => {
    const queuedCache = nominatimCache.get(cacheKey);
    if (queuedCache) return queuedCache;

    const elapsed = Date.now() - lastNominatimRequestAt;
    if (elapsed < 1100) await wait(1100 - elapsed);
    lastNominatimRequestAt = Date.now();

    const params = new URLSearchParams({
      q: `${query}, India`,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'in',
      limit: '6',
      dedupe: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error('Place search is temporarily rate-limited. Try again in a moment.');
      if (response.status === 403) throw new Error('Place search was refused by the map service. Try again in a moment.');
      throw new Error(`Place search returned ${response.status}`);
    }
    const results = await response.json() as NominatimResult[];
    nominatimCache.set(cacheKey, results);
    return results;
  });
  nominatimQueue = request.then(() => undefined, () => undefined);
  return request;
}

type RoutedPath = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoPoint[];
};

function decodeGooglePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0, latitude = 0, longitude = 0;
  while (index < encoded.length) {
    const readValue = () => {
      let result = 0, shift = 0, byte = 0;
      do {
        if (index >= encoded.length) throw new Error('Invalid Google route geometry.');
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return (result & 1) ? ~(result >> 1) : result >> 1;
    };
    latitude += readValue();
    longitude += readValue();
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

async function fetchGoogleRoadRoutes(start: GeoPoint, destination: GeoPoint): Promise<RoutedPath[] | null> {
  const response = await fetch('/api/google-routes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: start, destination }),
  });
  // When no server-side key is configured, use the existing OSM router and
  // mark it as such in the UI rather than pretending those are Google values.
  if (response.status === 204) return null;
  const data = await response.json() as {
    error?: { message?: string };
    routes?: Array<{ distanceMeters: number; duration: string; polyline?: { encodedPolyline?: string } }>;
  };
  if (!response.ok) throw new Error(data.error?.message || `Google Routes returned ${response.status}.`);
  return (data.routes ?? []).map((route) => ({
    distanceMeters: route.distanceMeters,
    durationSeconds: Number.parseFloat(route.duration),
    geometry: decodeGooglePolyline(route.polyline?.encodedPolyline ?? ''),
  })).filter((route) => route.distanceMeters > 0 && route.durationSeconds > 0 && route.geometry.length > 1);
}

function placeResultFromNominatim(item: NominatimResult, query: string, index: number): PlaceSearchResult | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const address = item.address ?? {};
  const label = item.name?.trim() || item.display_name.split(',')[0]?.trim() || query;
  const state = address.state ?? address.state_district ?? address.district ?? address.county ?? 'India';
  return {
    id: String(item.place_id ?? `${item.osm_type ?? 'place'}-${item.osm_id ?? index}-${latitude}-${longitude}`),
    label,
    displayName: item.display_name,
    type: item.type ?? 'place',
    state,
    latitude,
    longitude,
  };
}

function dedupePlaceResults(results: PlaceSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.label.toLowerCase()}|${result.latitude.toFixed(5)}|${result.longitude.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchIndianPlaces(value: string, location?: IndiaLocation): Promise<PlaceSearchResult[]> {
  const searchText = value.trim();
  if (searchText.length < 2) return [];
  const results = await fetchNominatimResults(searchText);
  const queryKey = normalizePlace(searchText);
  const geocodedResults = dedupePlaceResults(
    results
      .filter((item) => item.address?.country_code === 'in')
      .map((item, index) => placeResultFromNominatim(item, searchText, index))
      .filter((result): result is PlaceSearchResult => result !== null),
  ).sort((a, b) => {
    const relevance = (place: PlaceSearchResult) => {
      const label = normalizePlace(place.label);
      const display = normalizePlace(place.displayName);
      const type = normalizePlace(place.type);
      const exactLabel = label === queryKey ? 100 : label.startsWith(queryKey) ? 55 : label.includes(queryKey) ? 30 : 0;
      const locality = /city|town|village|municipality|administrative|suburb|neighbourhood|locality|road/.test(type) ? 18 : 0;
      const pointOfInterest = /attraction|museum|restaurant|park|place of worship|hotel|shop/.test(type) ? -24 : 0;
      return exactLabel + locality + pointOfInterest + (display.startsWith(queryKey) ? 8 : 0);
    };
    return relevance(b) - relevance(a);
  });
  if (geocodedResults.length > 0) return geocodedResults;

  // This is an offline fallback for the app's original demo places only. It
  // never uses a partial match, so an unknown name cannot become a nearby but
  // unrelated hardcoded location.
  const knownCoordinate = coordinateForPlace(searchText, location);
  return knownCoordinate
    ? [{
      ...knownCoordinate,
      id: `known-${normalizePlace(searchText).replace(/\s/g, '-')}`,
      displayName: `${knownCoordinate.label}, ${knownCoordinate.state}, India`,
      type: 'known place',
    }]
    : [];
}

async function resolvePlaceCoordinate(value: string, location?: IndiaLocation): Promise<PlaceCoordinate | null> {
  const results = await searchIndianPlaces(value, location);
  return results[0] ?? null;
}

function routeDistanceMeters(points: GeoPoint[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + haversineDistanceKm(points[index], point) * 1000,
    0,
  );
}

async function fetchRoadRoutes(start: GeoPoint, destination: GeoPoint): Promise<RoutedPath[]> {
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const query = new URLSearchParams({
    alternatives: 'true',
    overview: 'full',
    geometries: 'geojson',
    steps: 'false',
  });
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Road routing returned ${response.status}`);
  const data = await response.json() as {
    code?: string;
    routes?: Array<{ distance: number; duration: number; geometry?: { coordinates: number[][] } }>;
  };
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No drivable route was found between those places.');

  const routes = data.routes
    .filter((route) => route.geometry?.coordinates?.length && Number.isFinite(route.distance) && route.distance >= 0 && Number.isFinite(route.duration) && route.duration > 0)
    .map((route) => {
      const geometry = route.geometry!.coordinates.map(([longitude, latitude]) => ({ longitude, latitude }));
      return {
        // The routing service's distance and duration are the road estimate.
        // Geometry is only the fallback for a malformed distance value; its
        // point-to-point sum is not guaranteed to match the service summary.
        distanceMeters: route.distance > 0 ? route.distance : routeDistanceMeters(geometry),
        durationSeconds: route.duration,
        geometry,
      };
    });
  const directDistanceMeters = haversineDistanceKm(start, destination) * 1000;
  const plausibleRoutes = routes.filter((route) => {
    if (route.geometry.length < 2 || route.distanceMeters < directDistanceMeters * 0.95) return false;
    const detourMeters = route.distanceMeters - directDistanceMeters;
    const detourRatio = route.distanceMeters / Math.max(directDistanceMeters, 1);
    // A nearby pair of places should not quietly become a cross-country trip
    // because the geocoder or router snapped to an unrelated road.
    return !(detourMeters > 75_000 && detourRatio > 8);
  });
  if (plausibleRoutes.length === 0) {
    const shortestRoute = routes.reduce((shortest, route) => Math.min(shortest, route.distanceMeters), Number.POSITIVE_INFINITY);
    const directKm = (directDistanceMeters / 1000).toFixed(1);
    const routedKm = Number.isFinite(shortestRoute) ? (shortestRoute / 1000).toFixed(1) : 'unknown';
    throw new Error(`The map returned an implausible ${routedKm} km route for places only ${directKm} km apart. Check the selected place and its state, then search again.`);
  }
  return plausibleRoutes;
}

type IndiaStateGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

type IndiaStateFeature = {
  type: 'Feature';
  properties: { NAME_1: string; ENGTYPE_1: string };
  geometry: IndiaStateGeometry;
};

function projectIndiaPoint(point: GeoPoint, width = 1000, height = 680) {
  const x = ((point.longitude - 66) / 32) * width;
  const y = ((37 - point.latitude) / 31) * height;
  return { x, y };
}

function indiaPathFromRing(ring: number[][]) {
  return `${ring.map(([longitude, latitude], index) => {
    const { x, y } = projectIndiaPoint({ longitude, latitude });
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ')} Z`;
}

function indiaPathFromGeometry(geometry: IndiaStateGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map(indiaPathFromRing).join(' ')).join(' ');
}

function IndiaOverviewMap({
  locations,
  selectedLocation,
  zoom,
  onSelectLocation,
}: {
  locations: IndiaLocation[];
  selectedLocation: IndiaLocation;
  zoom: number;
  onSelectLocation: (id: string) => void;
}) {
  const scale = 1 + (zoom - 5) * 0.08;
  const [indiaStateFeatures, setIndiaStateFeatures] = useState<IndiaStateFeature[]>([]);
  const [mapDataError, setMapDataError] = useState(false);

  useEffect(() => {
    fetch('/india-states-simplified.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`India boundary data returned ${response.status}`);
        return response.json() as Promise<{ type: 'FeatureCollection'; features: IndiaStateFeature[] }>;
      })
      .then((data) => setIndiaStateFeatures(data.features))
      .catch(() => setMapDataError(true));
  }, []);

  const points = locations.map((location) => {
    const center = location.coordinates ?? indiaMapCenters[location.id];
    if (!center) return null;
    return { location, ...projectIndiaPoint(center) };
  }).filter((point): point is { location: IndiaLocation; x: number; y: number } => point !== null);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#dcebe5]" data-testid="india-overview-map">
      <svg viewBox="0 0 1000 680" className="size-full" role="img" aria-label="Map of India with supported RoadSense locations">
        <defs>
          <pattern id="india-map-grid" width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M52 0H0V52" fill="none" stroke="#c7ded7" strokeWidth="1" opacity=".65" />
          </pattern>
          <filter id="india-map-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#17394e" floodOpacity=".14" />
          </filter>
        </defs>
        <rect width="1000" height="680" fill="url(#india-map-grid)" />
        <g transform={`translate(${(1 - scale) * 500} ${(1 - scale) * 340}) scale(${scale})`}>
          <g aria-label="India states and union territories">
            {indiaStateFeatures.length > 0
              ? indiaStateFeatures.map((feature) => (
                <path
                  key={feature.properties.NAME_1}
                  d={indiaPathFromGeometry(feature.geometry)}
                  fill="#f8f4eb"
                  stroke="#7fb4a6"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{feature.properties.NAME_1} · {feature.properties.ENGTYPE_1}</title>
                </path>
              ))
              : <text x="500" y="330" textAnchor="middle" fill="#315a5c" fontFamily="DM Sans, sans-serif" fontSize="16" fontWeight="700">{mapDataError ? 'India boundary data could not be loaded' : 'Loading India boundary data…'}</text>}
          </g>
          {points.map(({ location: pointLocation, x, y }) => {
            const isSelected = pointLocation.id === selectedLocation.id;
            return (
              <g key={pointLocation.id} role="button" tabIndex={0} aria-label={`Select ${pointLocation.city}`} onClick={() => onSelectLocation(pointLocation.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectLocation(pointLocation.id); }} className="cursor-pointer">
                {isSelected ? <circle cx={x} cy={y} r="22" fill="#e6b64f" opacity=".25"><animate attributeName="r" values="17;25;17" dur="2.2s" repeatCount="indefinite" /></circle> : null}
                <circle cx={x} cy={y} r={isSelected ? 11 : 8} fill={isSelected ? '#267d70' : '#17394e'} stroke="#f8f4eb" strokeWidth="4" />
                <text x={x + 15} y={y + 4} fill="#17394e" fontFamily="DM Sans, sans-serif" fontSize="15" fontWeight="700">{pointLocation.city}</text>
              </g>
            );
          })}
        </g>
        <text x="38" y="58" fill="#315a5c" fontFamily="Space Grotesk, sans-serif" fontSize="22" fontWeight="700">INDIA</text>
          <text x="38" y="83" fill="#56736f" fontFamily="DM Sans, sans-serif" fontSize="13" fontWeight="600">Current state and UT boundaries</text>
        <g transform="translate(38 606)">
          <circle cx="8" cy="8" r="7" fill="#267d70" stroke="#f8f4eb" strokeWidth="3" />
          <text x="24" y="13" fill="#315a5c" fontFamily="DM Sans, sans-serif" fontSize="12" fontWeight="600">Selected location</text>
        </g>
      </svg>
    </div>
  );
}

const classNames = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

function ActionButton({
  children,
  onClick,
  variant = 'primary',
  icon: Icon,
  testId,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: LucideIcon;
  testId: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      data-testid={testId}
      className={classNames(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-transform duration-200 active:scale-[.98]',
        variant === 'primary' && 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md',
        variant === 'secondary' && 'border border-border bg-card text-foreground shadow-xs hover:-translate-y-0.5 hover:shadow-sm',
        variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'danger' && 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

function LocationPicker({ locations, selectedId, onChange, onAdd }: LocationControls) {
  const [newCity, setNewCity] = useState('');
  const [addError, setAddError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const selected = locations.find((location) => location.id === selectedId) ?? locations[0];

  const addCity = async () => {
    const city = newCity.trim();
    if (!city) return;
    setIsAdding(true);
    setAddError('');
    try {
      const coordinates = await resolvePlaceCoordinate(city);
      if (!coordinates) {
        setAddError('We could not find that Indian place. Add its district or state and try again.');
        return;
      }
      onAdd(city, coordinates);
      setNewCity('');
    } catch {
      setAddError('Place search is unavailable right now. Try again in a moment.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addCity();
    }
  };

  return (
    <div className="rounded-2xl border border-[#c5d8d1] bg-[#eef6f2] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="block min-w-0 flex-1">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-primary">India location</span>
          <span className="flex items-center gap-3 rounded-xl border border-[#c5d8d1] bg-card px-3 py-2.5">
            <MapPinned size={17} className="shrink-0 text-primary" />
            <select value={selectedId} onChange={(event) => onChange(event.target.value)} data-testid="select-india-location" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.city}, {location.state}</option>)}
            </select>
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">{selected?.region} · {selected?.weather} · Local demo network</span>
        </label>
        <div className="w-full lg:max-w-[380px]">
          <div className="flex gap-2">
            <input value={newCity} onChange={(event) => { setNewCity(event.target.value); if (addError) setAddError(''); }} onKeyDown={handleKeyDown} placeholder="Add any Indian city, village, or area" aria-label="Add any Indian place" data-testid="input-add-india-location" className="min-w-0 flex-1 rounded-xl border border-[#c5d8d1] bg-card px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />
            <button type="button" onClick={() => void addCity()} disabled={isAdding} data-testid="button-add-india-location" className="rounded-xl bg-[#17394e] px-3 py-2.5 text-xs font-bold text-[#f8f4eb] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">{isAdding ? 'Searching…' : 'Add place'}</button>
          </div>
          {addError ? <p role="alert" data-testid="status-add-india-location-error" className="mt-2 text-xs font-semibold text-destructive">{addError}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, tone = 'good', icon: Icon = Check }: { label: string; tone?: 'good' | 'watch' | 'alert' | 'neutral'; icon?: LucideIcon }) {
  return (
    <span
      data-testid={`status-${label.toLowerCase().replaceAll(' ', '-')}`}
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        tone === 'good' && 'border-primary/20 bg-primary/10 text-primary',
        tone === 'watch' && 'border-accent/30 bg-accent/20 text-[#765316]',
        tone === 'alert' && 'border-destructive/20 bg-destructive/10 text-destructive',
        tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
      )}
    >
      <Icon size={13} strokeWidth={2.4} />
      {label}
    </span>
  );
}

function SectionEyebrow({ children, icon: Icon = Sparkles }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary">
      <Icon size={14} strokeWidth={2.3} />
      {children}
    </div>
  );
}

function Shell({ view, setView, mode, setMode, children }: { view: View; setView: (view: View) => void; mode: 'autonomous' | 'driver-assist'; setMode: (mode: 'autonomous' | 'driver-assist') => void; children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell noise-layer">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[#f8f4eb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 md:px-8">
          <button type="button" data-testid="button-brand-home" onClick={() => navigate('home')} className="group flex items-center gap-3 text-left">
            <span className="grid size-10 place-items-center rounded-[13px] bg-[#17394e] text-[#f8f4eb] shadow-sm transition-transform group-hover:-rotate-3">
              <Navigation size={19} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block font-display text-base font-bold tracking-[-.03em] text-[#17394e]">RoadSense <span className="text-primary">India</span></span>
              <span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Road intelligence simulator</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navItems.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={classNames(
                    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                    view === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button type="button" aria-label={mode === 'autonomous' ? 'Switch to Driver-Assist Mode' : 'Switch to Autonomous Mode'} onClick={() => setMode(mode === 'autonomous' ? 'driver-assist' : 'autonomous')} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">{mode === 'autonomous' ? 'Switch to Driver-Assist Mode' : 'Return to Autonomous Mode'}</button>
            <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-2 text-xs font-semibold text-primary sm:flex">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              {mode === 'driver-assist' ? ENGINE_VERSION : 'Demo system online'}
            </div>
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileNavOpen}
              data-testid="button-toggle-navigation"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-xl border border-border bg-card text-foreground lg:hidden"
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <div className="border-t border-border bg-card px-5 py-3 lg:hidden">
            <div className="grid gap-1 sm:grid-cols-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    data-testid={`mobile-nav-${item.id}`}
                    className={classNames(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-left',
                      view === item.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <Icon size={17} />
                    <span><strong className="block text-sm">{item.label}</strong><small className="text-xs text-muted-foreground">{item.helper}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 md:py-10">{children}</main>
      <footer className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 pb-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <span>Built for clear decisions on changing roads.</span>
        <span className="font-mono tracking-wide">LOCAL DEMO · v1.0</span>
      </footer>
    </div>
  );
}

function HomeView({ setView }: { setView: (view: View) => void }) {
  const quickActions = [
    { id: 'live' as View, label: 'Open street simulation', description: 'Test changing road states', icon: MapPinned, tone: 'teal' },
    { id: 'architecture' as View, label: 'Explore architecture', description: 'Follow data to decision', icon: Network, tone: 'plum' },
    { id: 'routes' as View, label: 'Compare routes', description: 'Balance time and safety', icon: RouteIcon, tone: 'gold' },
    { id: 'scenario' as View, label: 'Play a scenario', description: 'Practise the next decision', icon: PlayCircle, tone: 'blue' },
  ];

  return (
    <div className="page-in space-y-8">
      <section className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-stretch">
        <div className="relative overflow-hidden rounded-[28px] border border-[#d8d2c5] bg-[#efe7d8] p-7 shadow-sm md:p-10">
          <div className="absolute -right-20 -top-24 size-72 rounded-full border-[34px] border-[#dfd4bd]/70" />
          <div className="absolute -bottom-24 right-20 size-56 rounded-full border-[18px] border-[#dfd4bd]/50" />
          <div className="relative max-w-2xl">
            <SectionEyebrow icon={Radio}>A calm view of the road</SectionEyebrow>
            <h1 className="max-w-xl font-display text-[clamp(2.55rem,6vw,5.5rem)] font-bold leading-[.96] tracking-[-.065em] text-[#17394e]">
              Know the road.<br /><span className="text-primary">Choose well.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#4d5c60] md:text-lg">
              RoadSense shows India’s mapped locations and turns route conditions into clear next steps. Compare routes or practise a decision before you need it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ActionButton testId="button-start-street-simulation" icon={MapPinned} onClick={() => setView('live')}>Start street simulation</ActionButton>
              <ActionButton testId="button-open-architecture-preview" variant="secondary" icon={Network} onClick={() => setView('architecture')}>See how it works</ActionButton>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#d8d2c5] pt-5 text-xs font-semibold text-[#536264]">
               <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-primary" /> Accurate India map</span>
               <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#e2b146]" /> Coordinate-based routes</span>
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#4c84a3]" /> No account needed</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[24px] border border-card-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Operational overview</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.04em]">A clear start point</h2>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Signal size={19} /></span>
            </div>
            <div className="mt-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-muted/60">
               <div className="p-3 text-center"><strong className="block font-display text-2xl">36</strong><span className="text-[11px] text-muted-foreground">states + UTs</span></div>
               <div className="p-3 text-center"><strong className="block font-display text-2xl">03</strong><span className="text-[11px] text-muted-foreground">route options</span></div>
               <div className="p-3 text-center"><strong className="block font-display text-2xl">0</strong><span className="text-[11px] text-muted-foreground">live feeds</span></div>
            </div>
            <div className="mt-5 space-y-3">
               <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-primary" /> Boundary data</span><strong className="text-primary">Verified</strong></div>
               <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-accent" /> Road conditions</span><strong className="text-[#765316]">Demo</strong></div>
               <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-[#4c84a3]" /> Route engine</span><strong>Coordinates</strong></div>
            </div>
          </div>
          <button type="button" data-testid="button-home-architecture-card" onClick={() => setView('architecture')} className="group flex flex-1 flex-col justify-between rounded-[24px] border border-[#bcd7cf] bg-[#dfeee8] p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Architecture preview</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.04em] text-[#17394e]">From signal to safer choice.</h2>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-card/70 text-primary transition-transform group-hover:translate-x-1"><ArrowRight size={19} /></span>
            </div>
            <div className="mt-7 flex items-center gap-1.5">
              {['Sense', 'Understand', 'Guide'].map((label, index) => (
                <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#17394e] text-xs font-bold text-[#dfeee8]">{index + 1}</span>
                  <span className="truncate text-xs font-bold text-[#315a5a]">{label}</span>
                  {index < 2 ? <ArrowRight size={13} className="ml-auto text-primary/60" /> : null}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#4f6f6b]">A short tour of the four layers that turn road conditions into useful guidance.</p>
          </button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><SectionEyebrow icon={Zap}>Quick actions</SectionEyebrow><h2 className="font-display text-3xl font-bold tracking-[-.045em]">Pick a way in</h2></div>
          <span className="hidden text-sm text-muted-foreground sm:block">Everything important is one click away.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button type="button" key={action.id} data-testid={`quick-action-${action.id}`} onClick={() => setView(action.id)} className="group flex min-h-[150px] flex-col justify-between rounded-2xl border border-card-border bg-card p-5 text-left shadow-xs transition-all hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className={classNames('grid size-11 place-items-center rounded-xl', action.tone === 'teal' && 'bg-primary/12 text-primary', action.tone === 'gold' && 'bg-accent/25 text-[#765316]', action.tone === 'blue' && 'bg-[#e1edf2] text-[#3b6f86]', action.tone === 'plum' && 'bg-[#eee6ef] text-[#78547e]')}><Icon size={21} /></span>
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <div><h3 className="font-display text-lg font-bold tracking-[-.025em]">{action.label}</h3><p className="mt-1 text-sm text-muted-foreground">{action.description}</p></div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 border-t border-border pt-8 md:grid-cols-[.8fr_1.2fr] md:items-center">
        <div>
          <SectionEyebrow icon={ShieldCheck}>Designed for understanding</SectionEyebrow>
          <h2 className="max-w-md font-display text-3xl font-bold leading-tight tracking-[-.045em]">Less noise. Better road decisions.</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card/70 p-4"><Gauge size={18} className="text-primary" /><p className="mt-5 text-sm font-semibold">See what changed</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Every signal has a plain-language status.</p></div>
          <div className="rounded-2xl border border-border bg-card/70 p-4"><TriangleAlert size={18} className="text-[#b7791f]" /><p className="mt-5 text-sm font-semibold">Compare trade-offs</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Time is not the only thing that matters.</p></div>
          <div className="rounded-2xl border border-border bg-card/70 p-4"><PlayCircle size={18} className="text-[#4c84a3]" /><p className="mt-5 text-sm font-semibold">Learn by doing</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Step into a scenario and see why.</p></div>
        </div>
      </section>
    </div>
  );
}

type SimulationPoint = { x: number; y: number };
type RouteRoad = { path: string; label: string };
type RouteLandmark = { x: number; y: number; label: string };
type RouteEventDefinition = {
  id: string;
  title: string;
  detail: string;
  eventTone: 'good' | 'watch' | 'alert';
  progress: number;
  roadEvent?: { label: string; kind: 'obstacle' | 'water' | 'incident' };
};
type Segment = {
  id: string;
  name: string;
  area: string;
  status: 'Clear' | 'Watch' | 'Caution';
  confidence: string;
  note: string;
  path: string;
  coordinates: SimulationPoint[];
  context: { roads: RouteRoad[]; landmarks: RouteLandmark[] };
  events: RouteEventDefinition[];
  pulse: { surface: [string, number]; traffic: [string, number]; weather: [string, number] };
  detections: { obstacles: number; potholes: number };
};

// Route-owned data is the source of truth for the street simulation. The
// location picker supplies the city context; each route owns its local road
// context, waypoints, detections, pulse, and event sequence.
const segments: Segment[] = [
  {
    id: 'ring-east',
    name: 'North corridor',
    area: 'North approach',
    status: 'Clear',
    confidence: '94%',
    note: 'Flow is moving normally near the northern interchange. Good visibility.',
    path: 'M95 295 C190 235 240 190 335 175 S520 190 620 135 S770 90 900 125',
    coordinates: [{ x: 95, y: 295 }, { x: 220, y: 235 }, { x: 335, y: 175 }, { x: 520, y: 190 }, { x: 620, y: 135 }, { x: 770, y: 90 }, { x: 900, y: 125 }],
    context: {
      roads: [
        { path: 'M0 105 C180 145 290 110 430 135 S760 185 1000 120', label: 'Outer ring road' },
        { path: 'M150 0 C190 100 130 200 215 300 S280 430 250 520', label: 'Airport link' },
        { path: 'M700 0 C650 100 720 195 680 300 S720 430 790 520', label: 'Service lane' },
      ],
      landmarks: [{ x: 104, y: 118, label: 'Hebbal market' }, { x: 746, y: 74, label: 'Metro interchange' }, { x: 74, y: 440, label: 'Bus depot' }],
    },
    events: [
      { id: 'route-synced', title: 'North route synced', detail: 'Live position is on the selected North corridor. No route change is needed.', eventTone: 'good', progress: 0.12 },
      { id: 'sudden-obstacle', title: 'Bus merge detected', detail: 'A bus is merging near the northern interchange. The selected route is marked for review.', eventTone: 'alert', progress: 0.58, roadEvent: { label: 'Bus merge', kind: 'obstacle' } },
      { id: 'off-route-correction', title: 'North approach drifted', detail: 'The live position drifted from the selected North corridor. The replay was rebuilt from this route.', eventTone: 'watch', progress: 0.42, roadEvent: { label: 'Position drift', kind: 'incident' } },
      { id: 'surface-water', title: 'Drainage dip flagged', detail: 'A wet low point was detected on the North corridor. The selected route remains the active path.', eventTone: 'alert', progress: 0.68, roadEvent: { label: 'Wet low point', kind: 'water' } },
      { id: 'road-event-cleared', title: 'North route cleared', detail: 'The northern road event is clear. The selected route remains the verified path.', eventTone: 'good', progress: 0.84 },
    ],
    pulse: { surface: ['Good', 90], traffic: ['Free flow', 78], weather: ['Clear', 82] },
    detections: { obstacles: 0, potholes: 0 },
  },
  {
    id: 'central-corridor',
    name: 'Central corridor',
    area: 'Central approach',
    status: 'Watch',
    confidence: '87%',
    note: 'Rain has slowed the central approach near the city centre.',
    path: 'M95 295 C210 315 280 350 385 315 S530 250 640 275 S760 315 900 278',
    coordinates: [{ x: 95, y: 295 }, { x: 230, y: 330 }, { x: 385, y: 315 }, { x: 530, y: 250 }, { x: 640, y: 275 }, { x: 760, y: 315 }, { x: 900, y: 278 }],
    context: {
      roads: [
        { path: 'M0 80 C170 120 270 80 430 118 S730 176 1000 112', label: 'Market Road' },
        { path: 'M-20 438 C150 370 250 450 390 410 S700 350 1020 430', label: 'Ring service road' },
        { path: 'M530 -20 C480 90 560 160 510 255 S565 400 620 540', label: 'Central metro link' },
      ],
      landmarks: [{ x: 70, y: 102, label: 'Shivajinagar market' }, { x: 714, y: 68, label: 'City junction' }, { x: 784, y: 454, label: 'Civic centre' }],
    },
    events: [
      { id: 'route-synced', title: 'Central route synced', detail: 'Live position is on the selected Central corridor. No route change is needed.', eventTone: 'good', progress: 0.12 },
      { id: 'sudden-obstacle', title: 'Stopped auto detected', detail: 'A stopped auto appeared ahead on the Central corridor. The selected route is marked for review.', eventTone: 'alert', progress: 0.58, roadEvent: { label: 'Stopped auto', kind: 'obstacle' } },
      { id: 'off-route-correction', title: 'Central approach drifted', detail: 'The live position drifted from the selected Central corridor. The replay was rebuilt from this route.', eventTone: 'watch', progress: 0.42, roadEvent: { label: 'Position drift', kind: 'incident' } },
      { id: 'surface-water', title: 'Central water patch detected', detail: 'Surface water was detected along the Central corridor. The selected route remains the active path.', eventTone: 'alert', progress: 0.68, roadEvent: { label: 'Surface water', kind: 'water' } },
      { id: 'road-event-cleared', title: 'Central route cleared', detail: 'The central road event is clear. The selected route remains the verified path.', eventTone: 'good', progress: 0.84 },
    ],
    pulse: { surface: ['Damp', 68], traffic: ['Steady', 64], weather: ['Rain watch', 48] },
    detections: { obstacles: 2, potholes: 1 },
  },
  {
    id: 'lake-road',
    name: 'South bypass',
    area: 'Southern approach',
    status: 'Caution',
    confidence: '72%',
    note: 'Surface water is reported at two low points on the southern bypass.',
    path: 'M335 175 C325 230 340 260 385 315 S490 420 560 410 S690 345 760 315',
    coordinates: [{ x: 335, y: 175 }, { x: 350, y: 255 }, { x: 385, y: 315 }, { x: 470, y: 395 }, { x: 560, y: 410 }, { x: 690, y: 345 }, { x: 760, y: 315 }],
    context: {
      roads: [
        { path: 'M0 250 C160 225 250 280 390 250 S690 210 1000 270', label: 'Lake junction road' },
        { path: 'M45 470 C170 400 270 470 410 450 S710 410 960 480', label: 'South service road' },
        { path: 'M820 -20 C760 100 850 180 780 270 S760 410 860 540', label: 'Industrial link' },
      ],
      landmarks: [{ x: 88, y: 228, label: 'Lakeview turn' }, { x: 520, y: 456, label: 'Low bridge' }, { x: 812, y: 454, label: 'South depot' }],
    },
    events: [
      { id: 'route-synced', title: 'South bypass synced', detail: 'Live position is on the selected South bypass. No route change is needed.', eventTone: 'good', progress: 0.12 },
      { id: 'sudden-obstacle', title: 'Roadwork barrier detected', detail: 'A roadwork barrier appeared ahead on the South bypass. The selected route is marked for review.', eventTone: 'alert', progress: 0.58, roadEvent: { label: 'Roadwork barrier', kind: 'obstacle' } },
      { id: 'off-route-correction', title: 'South approach drifted', detail: 'The live position drifted from the selected South bypass. The replay was rebuilt from this route.', eventTone: 'watch', progress: 0.42, roadEvent: { label: 'Position drift', kind: 'incident' } },
      { id: 'surface-water', title: 'Low bridge water alert', detail: 'Surface water was detected near the low bridge. The selected route remains the active path.', eventTone: 'alert', progress: 0.68, roadEvent: { label: 'Low bridge water', kind: 'water' } },
      { id: 'road-event-cleared', title: 'South bypass cleared', detail: 'The southern road event is clear. The selected route remains the verified path.', eventTone: 'good', progress: 0.84 },
    ],
    pulse: { surface: ['Wet', 42], traffic: ['Light', 72], weather: ['Storm watch', 36] },
    detections: { obstacles: 1, potholes: 3 },
  },
];

type SimulationStop = { x: number; y: number; label: string };

function simulationPointsForSegment(routeId: Segment['id']) {
  return segments.find((segment) => segment.id === routeId)?.coordinates ?? [];
}

function simulationPathFromPoints(points: SimulationPoint[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    const next = points[index + 1] ?? point;
    const controlX = previous.x + (next.x - previous.x) * 0.32;
    const controlY = previous.y + (next.y - previous.y) * 0.32;
    return `${path} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, '');
}

function simulationPathForSegment(routeId: Segment['id']) {
  return segments.find((segment) => segment.id === routeId)?.path ?? '';
}

function orderedSimulationEvents(routeId: Segment['id']) {
  return [...(segments.find((segment) => segment.id === routeId)?.events ?? [])].sort(
    (left, right) => left.progress - right.progress,
  );
}

function pointAlongSimulationRoute(points: SimulationPoint[], progress: number): SimulationPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let distance = totalLength * clampedProgress;

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (distance <= segmentLength) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = segmentLength === 0 ? 0 : distance / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    distance -= segmentLength;
  }

  return points[points.length - 1];
}

type MapRoutePoint = GeoPoint;

type LiveRouteData = {
  locationId: string;
  routeId: Segment['id'];
  geometry: MapRoutePoint[];
  start: PlaceCoordinate;
  destination: PlaceCoordinate;
  distanceMeters: number;
  durationSeconds: number;
  source: 'openstreetmap' | 'unavailable';
};

function segmentRouteIndex(routeId: Segment['id']) {
  return ['ring-east', 'central-corridor', 'south-bypass'].indexOf(routeId);
}

function liveRouteEndpoints(location: IndiaLocation, route: Segment) {
  const origin = coordinateForPlace(location.defaultOrigin, location);
  const destination = coordinateForPlace(location.defaultDestination, location);
  const center = mapCenterFor(location);
  const cityCenter: PlaceCoordinate = {
    ...center,
    label: `${location.city} centre`,
    state: location.state,
  };

  if (!origin || !destination) return { start: null, destination: null };
  if (route.id === 'central-corridor') return { start: cityCenter, destination };
  if (route.id === 'south-bypass') return { start: origin, destination: cityCenter };
  return { start: origin, destination };
}

function geoPointAlongRoute(points: MapRoutePoint[], progress: number): MapRoutePoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const lengths = points.slice(1).map((point, index) => haversineDistanceKm(points[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let distance = totalLength * clampedProgress;

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (distance <= segmentLength) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = segmentLength === 0 ? 0 : distance / segmentLength;
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
    }
    distance -= segmentLength;
  }

  return points[points.length - 1];
}

function leafletMarkerIcon(kind: 'start' | 'destination' | 'vehicle' | 'obstacle' | 'pothole' | 'event', label?: string) {
  const styles = {
    start: 'background:#17394e;color:#f8f4eb;border:3px solid #f8f4eb;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;font:bold 12px DM Sans,sans-serif;box-shadow:0 2px 8px rgba(23,57,78,.28)',
    destination: 'background:#d75d58;color:#fffaf0;border:3px solid #fffaf0;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;font:bold 12px DM Sans,sans-serif;box-shadow:0 2px 8px rgba(23,57,78,.28)',
    vehicle: 'background:#267d70;color:#f8f4eb;border:4px solid #f8f4eb;border-radius:999px;width:34px;height:34px;display:grid;place-items:center;font:bold 15px DM Sans,sans-serif;box-shadow:0 2px 10px rgba(23,57,78,.35)',
    obstacle: 'background:#fff1c9;color:#b7791f;border:3px solid #b7791f;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;font:bold 16px DM Sans,sans-serif;box-shadow:0 2px 8px rgba(23,57,78,.25)',
    pothole: 'background:#f7f0f8;color:#78547e;border:3px solid #78547e;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;font:bold 15px DM Sans,sans-serif;box-shadow:0 2px 8px rgba(23,57,78,.25)',
    event: 'background:#fff3ef;color:#b44943;border:3px solid #d75d58;border-radius:999px;width:34px;height:34px;display:grid;place-items:center;font:bold 17px DM Sans,sans-serif;box-shadow:0 2px 8px rgba(23,57,78,.28)',
  } as const;
  const content = kind === 'start' ? 'A' : kind === 'destination' ? 'B' : kind === 'vehicle' ? 'V' : kind === 'obstacle' ? '!' : kind === 'pothole' ? '◌' : '!';
  return L.divIcon({
    className: 'roadsense-leaflet-marker',
    html: `<span style="${styles[kind]}">${content}</span>${label ? `<span class="roadsense-leaflet-label">${label}</span>` : ''}`,
    iconSize: kind === 'vehicle' || kind === 'event' ? [34, 34] : [30, 30],
    iconAnchor: kind === 'vehicle' || kind === 'event' ? [17, 17] : [15, 15],
  });
}

type SimulationEvent = {
  id: string;
  title: string;
  detail: string;
  segmentId: Segment['id'];
  status: Segment['status'];
  vehicle: SimulationStop;
  routePath: string;
  previousPath?: string;
  eventTone: 'good' | 'watch' | 'alert';
  progress: number;
  roadEvent?: { x: number; y: number; label: string; kind: 'obstacle' | 'water' | 'incident' };
  detections: { obstacles: number; potholes: number };
};

function simulationEventForStep(step: number, routeId: Segment['id']) {
  const route = segments.find((segment) => segment.id === routeId);
  if (!route) throw new Error(`Unknown simulation route: ${routeId}`);
  const events = orderedSimulationEvents(route.id);
  const event = events[Math.max(0, Math.min(step - 1, events.length - 1))] ?? events[0];
  const routePoints = simulationPointsForSegment(route.id);
  const routePath = simulationPathForSegment(route.id);
  const eventPosition = pointAlongSimulationRoute(routePoints, event.progress);
  const status = event.id === 'road-event-cleared'
    ? 'Clear'
    : event.eventTone === 'alert'
      ? 'Caution'
      : event.eventTone === 'watch'
        ? 'Watch'
        : route.status;

  return {
    ...event,
    segmentId: route.id,
    status,
    vehicle: { ...eventPosition, label: event.id === 'route-synced' ? 'LIVE' : event.id === 'road-event-cleared' ? 'CLEAR' : 'ALERT' },
    routePath,
    progress: event.progress,
    roadEvent: event.roadEvent
      ? { ...event.roadEvent, x: eventPosition.x, y: eventPosition.y }
      : undefined,
    detections: route.detections,
  } satisfies SimulationEvent;
}

function simulationStepForEvent(eventId: string, routeId: Segment['id']) {
  const eventIndex = orderedSimulationEvents(routeId).findIndex((event) => event.id === eventId);
  return Math.max(1, eventIndex + 1);
}

function simulationStepForProgress(progress: number, routeId: Segment['id']) {
  const events = orderedSimulationEvents(routeId);
  if (events.length <= 1) return 1;

  let step = 1;
  for (let index = 1; index < events.length; index += 1) {
    if (progress >= events[index].progress) step = index + 1;
  }
  return step;
}

type SimulationState = {
  step: number;
  progress: number;
};

function initialSimulationState(step = 1): SimulationState {
  return {
    step,
    progress: 0,
  };
}

function LiveMapView({ location, locationControls }: { location: IndiaLocation; locationControls: LocationControls }) {
  const [selectedId, setSelectedId] = useState('central-corridor');
  const [simulationState, setSimulationState] = useState<SimulationState>(initialSimulationState);
  const [selectedEventId, setSelectedEventId] = useState('route-synced');
  const [hasRunSimulation, setHasRunSimulation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>('normal');
  const [simulationLoopKey, setSimulationLoopKey] = useState(0);
  const [layers, setLayers] = useState({ traffic: true, incidents: true, weather: true, obstacles: true, potholes: true });
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [liveRoute, setLiveRoute] = useState<LiveRouteData | null>(null);
  const [routeState, setRouteState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const simulationTimerRef = useRef<number | null>(null);
  const simulationStateRef = useRef(simulationState);
  simulationStateRef.current = simulationState;
  const selected = segments.find((segment) => segment.id === selectedId) ?? segments[0];
  const selectedLocationLabel = `${location.city} · ${selected.area}`;
  const selectedRoutePoints = simulationPointsForSegment(selected.id);
  const baseEvent = simulationEventForStep(simulationState.step, selected.id);
  const simulationVehiclePosition = pointAlongSimulationRoute(selectedRoutePoints, simulationState.progress);
  const roadEventPosition = baseEvent.id === 'off-route-correction'
    ? pointAlongSimulationRoute(selectedRoutePoints, 0)
    : pointAlongSimulationRoute(
      selectedRoutePoints,
      Math.min(simulationState.progress + 0.28, 0.86),
    );
  const activeEvent = {
    ...baseEvent,
    title: simulationState.step === 1 ? `${selected.name} route ready` : baseEvent.title,
    detail: simulationState.step === 1
      ? `${selected.note} The replay starts at this segment's beginning and uses its selected path.`
      : `${baseEvent.detail} Active route: ${selected.name}.`,
    segmentId: selected.id,
    status: selected.status,
    detections: selected.detections,
    vehicle: { ...baseEvent.vehicle, ...simulationVehiclePosition, label: simulationState.progress < 0.08 ? 'LIVE' : baseEvent.vehicle.label },
    routePath: simulationPathForSegment(selected.id),
    roadEvent: baseEvent.roadEvent ? { ...baseEvent.roadEvent, x: roadEventPosition.x, y: roadEventPosition.y } : undefined,
    progress: simulationState.progress,
  };
  const stepText = activeEvent.title;
  const simulationVehicle = activeEvent.vehicle;
  const simulationTickMs = 120;
  const simulationProgressPerTick = { slow: 0.006, normal: 0.012, fast: 0.024 } as const;

  const stopSimulationLoop = () => {
    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
  };

  const startSimulationFromBeginning = (step = 1) => {
    stopSimulationLoop();
    const nextState = initialSimulationState(step);
    simulationStateRef.current = nextState;
    setSimulationState(nextState);
    setHasRunSimulation(true);
    setSimulationLoopKey((current) => current + 1);
    setIsPlaying(true);
  };

  const selectSimulationRoute = (routeId: Segment['id']) => {
    // Stop the old loop before replacing its route, then rebuild every piece
    // of simulation state from the newly selected segment.
    stopSimulationLoop();
    setIsPlaying(false);
    // Do not let the previous route's ETA remain visible while the new route
    // is being fetched.
    setLiveRoute(null);
    setRouteState('loading');
    setSelectedId(routeId);
    setSelectedEventId('route-synced');
    const nextState = initialSimulationState();
    simulationStateRef.current = nextState;
    setSimulationState(nextState);
    setHasRunSimulation(false);
    setDetailsOpen(true);
  };

  const runSelectedSimulation = () => {
    // Every run starts at the beginning of the currently selected route,
    // regardless of the previously selected event or replay position.
    setSelectedEventId('route-synced');
    startSimulationFromBeginning();
  };

  const simulateOffRoute = () => {
    setSelectedEventId('off-route-correction');
    startSimulationFromBeginning(simulationStepForEvent('off-route-correction', selected.id));
  };

  const resetSimulation = () => {
    stopSimulationLoop();
    setIsPlaying(false);
    const nextState = initialSimulationState();
    simulationStateRef.current = nextState;
    setSimulationState(nextState);
    setSelectedEventId('route-synced');
    setSimulationSpeed('normal');
    setHasRunSimulation(false);
  };

  useEffect(() => {
    stopSimulationLoop();
    if (!isPlaying) return;

    const routeId = selected.id;
    simulationTimerRef.current = window.setInterval(() => {
      const current = simulationStateRef.current;
      const nextProgress = Math.min(
        1,
        current.progress + simulationProgressPerTick[simulationSpeed],
      );
      const nextStep = simulationStepForProgress(nextProgress, routeId);
      const nextState = { progress: nextProgress, step: nextStep };

      simulationStateRef.current = nextState;
      setSimulationState(nextState);
      setSelectedEventId(simulationEventForStep(nextStep, routeId).id);

      if (nextProgress >= 1) {
        stopSimulationLoop();
        setIsPlaying(false);
      }
    }, simulationTickMs);

    return stopSimulationLoop;
  }, [isPlaying, location.id, selected.id, simulationSpeed, simulationLoopKey]);

  useEffect(() => {
    stopSimulationLoop();
    setLiveRoute(null);
    setRouteState('loading');
    setSimulationState(initialSimulationState());
    setSelectedId('central-corridor');
    setSelectedEventId('route-synced');
    setHasRunSimulation(false);
    setIsPlaying(false);
  }, [location.id]);

  useEffect(() => {
    let cancelled = false;
    const { start, destination } = liveRouteEndpoints(location, selected);
    setLiveRoute(null);
    setRouteState('loading');

    if (!start || !destination) {
      setRouteState('fallback');
      return () => {
        cancelled = true;
      };
    }

    void fetchRoadRoutes(start, destination)
      .then((routes) => {
        if (cancelled) return;
        const route = routes[segmentRouteIndex(selected.id)] ?? routes[0];
        if (!route) throw new Error('No route geometry returned.');
        setLiveRoute({
          locationId: location.id,
          routeId: selected.id,
          geometry: route.geometry,
          start,
          destination,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          source: 'openstreetmap',
        });
        setRouteState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLiveRoute({
          locationId: location.id,
          routeId: selected.id,
          geometry: [],
          start,
          destination,
          distanceMeters: 0,
          durationSeconds: 0,
          source: 'unavailable',
        });
        setRouteState('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [location.id, selected.id]);

  // A request for a prior location/segment can finish after the user has
  // already moved on. Keep route identity with the response so stale data
  // cannot become the selected segment's ETA.
  const currentLiveRoute = liveRoute?.locationId === location.id && liveRoute.routeId === selected.id
    ? liveRoute
    : null;
  const estimatedTravelSeconds = currentLiveRoute
    ? estimatedRouteTravelSeconds(currentLiveRoute, selected)
    : null;
  const expectedTravel = estimatedTravelSeconds !== null
    ? `${Math.max(1, Math.ceil(estimatedTravelSeconds / 60))} min`
    : routeState === 'loading' ? 'Loading…' : '—';
  const routeConfidence = currentLiveRoute?.source === 'openstreetmap' ? 'Mapped route' : currentLiveRoute ? 'Route unavailable' : 'Loading…';
  const routeDistanceDebug = currentLiveRoute?.source === 'openstreetmap'
    ? formatDistance(currentLiveRoute.distanceMeters)
    : currentLiveRoute ? 'Unavailable' :
    routeState === 'loading' ? 'Loading…' : '—';
  const routingDurationDebug = currentLiveRoute?.source === 'openstreetmap'
    ? formatEtaDuration(currentLiveRoute.durationSeconds)
    : currentLiveRoute
      ? 'Unavailable (fallback)'
      : routeState === 'loading' ? 'Loading…' : '—';
  const finalEtaDebug = estimatedTravelSeconds !== null
    ? formatEtaDuration(estimatedTravelSeconds)
    : routeState === 'loading' ? 'Loading…' : '—';

  return (
    <div className="page-in space-y-6">
       <PageHeading eyebrow="Street simulation" title={`Simulate ${selectedLocationLabel} as it changes`} description={`Replay a moving vehicle through the selected ${selected.name} in ${location.city}. Pause freezes the live position; route events and detections stay on this selected path.`}>
        <StatusPill label={isPlaying ? 'Simulation running' : hasRunSimulation ? 'Simulation paused' : 'Ready to run'} tone={isPlaying ? 'good' : hasRunSimulation ? 'neutral' : 'watch'} icon={isPlaying ? Radio : hasRunSimulation ? Pause : Play} />
      </PageHeading>
      <LocationPicker {...locationControls} />
      <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
        <section className="overflow-hidden rounded-[24px] border border-card-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><MapPinned size={18} /></span><div><h2 className="font-display font-bold">{selectedLocationLabel} live replay</h2><p className="text-xs text-muted-foreground">{selected.name} · OpenStreetMap route context and events</p></div></div>
            <div className="flex items-center gap-2"><span className="hidden text-xs font-semibold text-muted-foreground sm:inline">Layers & detections</span><button type="button" aria-label="Toggle all map layers and detections" data-testid="button-map-layers" onClick={() => setLayers((current) => { const next = !(current.traffic && current.incidents && current.weather && current.obstacles && current.potholes); return { traffic: next, incidents: next, weather: next, obstacles: next, potholes: next }; })} className="grid size-9 place-items-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground"><Layers3 size={16} /></button></div>
          </div>
          <div className="relative min-h-[500px] overflow-hidden">
            <IndianStreetSimulation
              location={location}
              route={selected}
              vehicle={simulationVehicle}
              vehicleProgress={simulationState.progress}
              isPlaying={isPlaying}
              event={activeEvent}
              eventProgress={baseEvent.progress}
              layers={layers}
              routeGeometry={currentLiveRoute?.geometry ?? []}
              routeState={routeState}
              originLabel={currentLiveRoute?.start.label ?? location.defaultOrigin}
              destinationLabel={currentLiveRoute?.destination.label ?? location.defaultDestination}
            />
            <div className="absolute left-5 top-5 z-10 rounded-xl border border-white/70 bg-[#f8f4eb]/90 p-3 shadow-sm backdrop-blur">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Visible layers</p>
              <div className="space-y-2">
                {([['traffic', 'Traffic flow', TrafficCone], ['incidents', 'Road events', AlertTriangle], ['weather', 'Rain signal', CloudRain], ['obstacles', 'Obstacle detection', TrafficCone], ['potholes', 'Pothole detection', CircleDot]] as const).map(([key, label, Icon]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={layers[key]} onChange={() => setLayers((current) => ({ ...current, [key]: !current[key] }))} data-testid={`checkbox-layer-${key}`} className="size-3.5 accent-[#368c7d]" />
                    <Icon size={13} className={key === 'weather' ? 'text-[#4c84a3]' : key === 'incidents' ? 'text-destructive' : key === 'obstacles' ? 'text-[#b7791f]' : key === 'potholes' ? 'text-[#78547e]' : 'text-primary'} />{label}
                  </label>
                ))}
              </div>
            </div>
            <div className={classNames('absolute right-5 top-5 z-10 max-w-[250px] rounded-xl border p-3 shadow-sm backdrop-blur', activeEvent.eventTone === 'alert' ? 'border-destructive/30 bg-[#fff3ef]/95' : activeEvent.eventTone === 'watch' ? 'border-accent/40 bg-[#fff8e8]/95' : 'border-white/70 bg-[#f8f4eb]/90')}>
              <div className="flex items-center gap-2">
                <span className={classNames('size-2 rounded-full', activeEvent.eventTone === 'alert' ? 'bg-destructive' : activeEvent.eventTone === 'watch' ? 'bg-accent' : 'bg-primary')} />
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{activeEvent.id === 'route-synced' ? 'Live route' : 'Sudden update'}</p>
              </div>
              <p className="mt-1 text-xs font-bold text-[#17394e]">{stepText}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{activeEvent.detail}</p>
            </div>
             <label className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-xl border border-white/80 bg-[#f8f4eb]/95 px-3 py-2 text-xs font-semibold text-[#31525c] shadow-sm backdrop-blur">
               <span className="size-2 rounded-full bg-[#368c7d]" />
               <span className="text-muted-foreground">Route</span>
               <select value={selectedId} onChange={(event) => selectSimulationRoute(event.target.value as Segment['id'])} aria-label="Select simulation route" data-testid="select-simulation-route" className="max-w-[145px] bg-transparent font-bold outline-none">
                  {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name} · {segment.area}</option>)}
               </select>
             </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={classNames('size-2 rounded-full', isPlaying ? 'animate-pulse bg-primary' : 'bg-muted-foreground')} />{isPlaying ? 'Selected simulation is running' : hasRunSimulation ? 'Simulation paused · position frozen' : 'Select a simulation, then run it'}</div>
             <div className="flex flex-wrap gap-2">
                <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground">
                  <span className="text-muted-foreground">Simulation</span>
                  <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} aria-label="Select simulation event" data-testid="select-simulation-event" className="max-w-[170px] bg-transparent outline-none">
                     {selected.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
                  </select>
                </label>
               <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground">
                 <span className="text-muted-foreground">Speed</span>
                 <select value={simulationSpeed} onChange={(event) => setSimulationSpeed(event.target.value as SimulationSpeed)} aria-label="Simulation speed" data-testid="select-simulation-speed" className="bg-transparent outline-none">
                   <option value="slow">Slow</option>
                   <option value="normal">Normal</option>
                   <option value="fast">Fast</option>
                 </select>
               </label>
               <ActionButton testId="button-run-selected-simulation" variant="secondary" icon={Play} onClick={runSelectedSimulation}>Run selected simulation</ActionButton>
               <ActionButton testId="button-simulate-off-route" variant="quiet" icon={Navigation} onClick={simulateOffRoute}>Run off-route shortcut</ActionButton>
               <ActionButton testId="button-reset-simulation" variant="quiet" icon={RotateCcw} onClick={resetSimulation}>Reset</ActionButton>
               <ActionButton testId="button-toggle-simulation" variant="secondary" icon={isPlaying ? Pause : Play} onClick={() => setIsPlaying((playing) => !playing)}>{isPlaying ? 'Pause simulation' : 'Resume simulation'}</ActionButton>
             </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm" data-testid="selected-segment-panel" data-route-id={selected.id}>
             <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Selected segment</p><h2 className="mt-2 font-display text-xl font-bold" data-testid="selected-segment-name">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selectedLocationLabel}</p></div><button type="button" data-testid="button-toggle-segment-details" aria-label={detailsOpen ? 'Close segment details' : 'Open segment details'} onClick={() => setDetailsOpen((open) => !open)} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">{detailsOpen ? <X size={16} /> : <ChevronDown size={16} />}</button></div>
            {detailsOpen ? <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-muted/70 p-3"><span className="text-sm text-muted-foreground">Current status</span><StatusPill label={activeEvent.status} tone={activeEvent.status === 'Clear' ? 'good' : activeEvent.status === 'Watch' ? 'watch' : 'alert'} icon={activeEvent.status === 'Clear' ? Check : TriangleAlert} /></div>
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Expected travel</p><strong className="mt-1 block font-display text-xl">{expectedTravel}</strong></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Route source</p><strong className="mt-1 block font-display text-sm">{routeConfidence}</strong></div></div>
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs" data-testid="eta-debug">
                  <p className="font-semibold text-muted-foreground">ETA debug</p>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Route distance</dt><dd className="font-semibold" data-testid="debug-route-distance">{routeDistanceDebug}</dd>
                    <dt className="text-muted-foreground">Routing duration</dt><dd className="font-semibold" data-testid="debug-routing-duration">{routingDurationDebug}</dd>
                    <dt className="text-muted-foreground">Final ETA</dt><dd className="font-semibold" data-testid="debug-final-eta">{finalEtaDebug}</dd>
                  </dl>
                </div>
               <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#e2c98e] bg-[#fff8e8] p-3"><div className="flex items-center gap-2 text-[#9b6b1c]"><TrafficCone size={14} /><p className="text-xs font-semibold">Obstacles detected</p></div><strong className="mt-1 block font-display text-xl text-[#765316]">{activeEvent.detections.obstacles}</strong></div><div className="rounded-xl border border-[#d8c8dd] bg-[#f7f0f8] p-3"><div className="flex items-center gap-2 text-[#78547e]"><CircleDot size={14} /><p className="text-xs font-semibold">Potholes detected</p></div><strong className="mt-1 block font-display text-xl text-[#78547e]">{activeEvent.detections.potholes}</strong></div></div>
              <div className="flex gap-3 rounded-xl border border-accent/25 bg-accent/10 p-3 text-sm leading-5 text-[#6e531b]"><Info size={17} className="mt-0.5 shrink-0" /><span>{activeEvent.detail}</span></div>
            </div> : <p className="mt-4 text-sm text-muted-foreground">Open details to inspect this road segment.</p>}
          </div>
          <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Network pulse</h2><Signal size={17} className="text-primary" /></div>
            <div className="mt-4 space-y-4">
               <PulseRow label="Road surface" value={selected.pulse.surface[0]} percent={selected.pulse.surface[1]} color="bg-primary" />
               <PulseRow label="Traffic flow" value={selected.pulse.traffic[0]} percent={selected.pulse.traffic[1]} color="bg-[#4c84a3]" />
               <PulseRow label="Weather confidence" value={selected.pulse.weather[0]} percent={selected.pulse.weather[1]} color="bg-accent" />
            </div>
          </div>
          <div className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Detection controls</p><h2 className="mt-2 font-display text-lg font-bold">Spot road hazards</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Show or hide computer-vision detections on the map.</p></div><ScanSearch size={18} className="text-primary" /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" data-testid="button-toggle-obstacle-detection" onClick={() => setLayers((current) => ({ ...current, obstacles: !current.obstacles }))} className={classNames('rounded-xl border p-3 text-left transition-colors', layers.obstacles ? 'border-accent/50 bg-accent/15' : 'border-border bg-muted/50')}>
                <TrafficCone size={17} className="text-[#b7791f]" /><span className="mt-2 block text-xs font-semibold">Obstacles</span><span className="mt-1 block text-[11px] text-muted-foreground">{layers.obstacles ? 'Visible on map' : 'Hidden'}</span>
              </button>
              <button type="button" data-testid="button-toggle-pothole-detection" onClick={() => setLayers((current) => ({ ...current, potholes: !current.potholes }))} className={classNames('rounded-xl border p-3 text-left transition-colors', layers.potholes ? 'border-[#d8c8dd] bg-[#f7f0f8]' : 'border-border bg-muted/50')}>
                <CircleDot size={17} className="text-[#78547e]" /><span className="mt-2 block text-xs font-semibold">Potholes</span><span className="mt-1 block text-[11px] text-muted-foreground">{layers.potholes ? 'Visible on map' : 'Hidden'}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PulseRow({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  return <div><div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={classNames('h-full rounded-full transition-all duration-500', color)} style={{ width: `${percent}%` }} /></div></div>;
}

function IndianStreetSimulation({
  location,
  route,
  vehicle,
  vehicleProgress,
  isPlaying,
  event,
  eventProgress,
  layers,
  routeGeometry,
  routeState,
  originLabel,
  destinationLabel,
}: {
  location: IndiaLocation;
  route: Segment;
  vehicle: SimulationStop;
  vehicleProgress: number;
  isPlaying: boolean;
  event: Pick<SimulationEvent, 'title' | 'eventTone' | 'roadEvent' | 'detections'>;
  eventProgress: number;
  layers: { traffic: boolean; incidents: boolean; weather: boolean; obstacles: boolean; potholes: boolean };
  routeGeometry: MapRoutePoint[];
  routeState: 'loading' | 'ready' | 'fallback';
  originLabel: string;
  destinationLabel: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const staticLayerRef = useRef<L.LayerGroup | null>(null);
  const eventLayerRef = useRef<L.LayerGroup | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const mapRouteRef = useRef<MapRoutePoint[]>([]);
  const toneClass = event.eventTone === 'alert' ? 'bg-[#fff3ef] text-[#b44943]' : event.eventTone === 'watch' ? 'bg-[#fff8e8] text-[#9b6b1c]' : 'bg-[#e7f3ef] text-[#267d70]';

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    staticLayerRef.current?.remove();
    eventLayerRef.current?.remove();
    vehicleMarkerRef.current?.remove();

    const staticLayer = L.layerGroup().addTo(map);
    const eventLayer = L.layerGroup().addTo(map);
    staticLayerRef.current = staticLayer;
    eventLayerRef.current = eventLayer;
    mapRouteRef.current = routeGeometry;
    const latLngs = mapRouteRef.current.map((point) => [point.latitude, point.longitude] as [number, number]);
    if (latLngs.length === 0) {
      return () => {
        staticLayer.remove();
        eventLayer.remove();
        vehicleMarkerRef.current?.remove();
        vehicleMarkerRef.current = null;
      };
    }

    L.polyline(latLngs, {
      color: '#fffaf0',
      weight: 14,
      opacity: 0.96,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(staticLayer);
    L.polyline(latLngs, {
      color: '#267d70',
      weight: 8,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'roadsense-selected-route',
    }).bindTooltip(`${route.name} · selected route`, { sticky: true }).addTo(staticLayer);

    const start = mapRouteRef.current[0];
    const destination = mapRouteRef.current[mapRouteRef.current.length - 1];
    if (start) L.marker([start.latitude, start.longitude], { icon: leafletMarkerIcon('start') }).bindTooltip(`Start · ${originLabel}`).addTo(staticLayer);
    if (destination) L.marker([destination.latitude, destination.longitude], { icon: leafletMarkerIcon('destination') }).bindTooltip(`Destination · ${destinationLabel}`).addTo(staticLayer);

    const pointAt = (progress: number) => {
      return geoPointAlongRoute(mapRouteRef.current, progress);
    };

    if (layers.traffic) {
      [0.2, 0.5, 0.78].forEach((progress, index) => {
        const point = pointAt(progress);
        if (!point) return;
        L.circleMarker([point.latitude, point.longitude], {
          radius: 6,
          color: '#fffaf0',
          weight: 3,
          fillColor: '#e6b64f',
          fillOpacity: 1,
        }).bindTooltip(`Traffic indicator ${index + 1} · ${route.name}`).addTo(staticLayer);
      });
    }
    if (layers.obstacles && event.detections.obstacles > 0) {
      const point = pointAt(0.58);
      if (point) L.marker([point.latitude, point.longitude], { icon: leafletMarkerIcon('obstacle') }).bindTooltip(`${event.detections.obstacles} obstacle${event.detections.obstacles === 1 ? '' : 's'} · ${route.name}`).addTo(staticLayer);
    }
    if (layers.potholes && event.detections.potholes > 0) {
      const point = pointAt(0.76);
      if (point) L.marker([point.latitude, point.longitude], { icon: leafletMarkerIcon('pothole') }).bindTooltip(`${event.detections.potholes} pothole${event.detections.potholes === 1 ? '' : 's'} · ${route.name}`).addTo(staticLayer);
    }

    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [48, 48], maxZoom: 15, animate: true });
    }

    return () => {
      staticLayer.remove();
      eventLayer.remove();
      vehicleMarkerRef.current?.remove();
      vehicleMarkerRef.current = null;
    };
  }, [location.id, route.id, layers.traffic, layers.obstacles, layers.potholes, event.detections.obstacles, event.detections.potholes, routeGeometry, originLabel, destinationLabel]);

  useEffect(() => {
    const map = mapRef.current;
    const eventLayer = eventLayerRef.current;
    const mapRoute = mapRouteRef.current;
    if (!map || !eventLayer || !mapRoute.length) return;

    eventLayer.clearLayers();
    if (!layers.incidents || !event.roadEvent) return;
    const mapPoint = geoPointAlongRoute(mapRoute, eventProgress);
    if (mapPoint) {
      L.marker([mapPoint.latitude, mapPoint.longitude], { icon: leafletMarkerIcon('event') })
        .bindTooltip(`${event.roadEvent.label} · ${route.name}`)
        .addTo(eventLayer);
    }
  }, [event.roadEvent, event.eventTone, eventProgress, layers.incidents, location.id, route.id]);

  useEffect(() => {
    const map = mapRef.current;
    const routeMap = mapRouteRef.current;
    if (!map || !routeMap.length) return;

    const mapPoint = geoPointAlongRoute(routeMap, vehicleProgress);
    if (!mapPoint) return;

    if (!vehicleMarkerRef.current) {
      vehicleMarkerRef.current = L.marker([mapPoint.latitude, mapPoint.longitude], {
        icon: leafletMarkerIcon('vehicle', vehicle.label),
        zIndexOffset: 500,
      }).addTo(map);
    } else {
      vehicleMarkerRef.current.setLatLng([mapPoint.latitude, mapPoint.longitude]);
      vehicleMarkerRef.current.setIcon(leafletMarkerIcon('vehicle', vehicle.label));
    }
    vehicleMarkerRef.current.bindTooltip(`Vehicle · ${route.name} · ${location.city}`);
  }, [vehicleProgress, vehicle.label, isPlaying, location.id, route.id]);

  return (
    <div className="size-full min-h-[500px]" data-testid="indian-street-simulation" data-route-id={route.id}>
      <div className="relative size-full min-h-[500px] overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 size-full min-h-[500px] roadsense-leaflet" role="img" aria-label={`OpenStreetMap route simulation for ${route.name} in ${location.city}`} data-testid="real-route-map" />
        {routeState === 'loading' || !routeGeometry.length ? (
          <div className="absolute inset-0 z-[5] grid place-items-center bg-[#dcebe5]/70 p-6 text-center backdrop-blur-[1px]">
            <div className="rounded-xl border border-white/80 bg-[#f8f4eb]/95 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
                {routeState === 'loading' ? 'Loading mapped route' : 'Mapped route unavailable'}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#17394e]">
                {routeState === 'loading' ? 'Fetching the selected route from OpenStreetMap…' : 'The map is centered on the selected endpoints.'}
              </p>
            </div>
          </div>
        ) : null}
        <div className="absolute left-5 top-5 rounded-xl border border-white/80 bg-[#f8f4eb]/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">OpenStreetMap navigation</p>
          <p className="mt-1 text-xs font-bold text-[#17394e]">{route.name} · {location.city}</p>
        </div>
        <div className={classNames('absolute right-5 top-5 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-sm', toneClass)}>{event.title}</div>
        <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-xl border border-white/80 bg-[#f8f4eb]/95 px-3 py-2 text-[11px] font-semibold text-[#31525c] shadow-sm backdrop-blur">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#267d70]" />Selected route</span>
          {event.detections.obstacles > 0 ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#b7791f]" />{event.detections.obstacles} obstacles</span> : null}
          {event.detections.potholes > 0 ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#78547e]" />{event.detections.potholes} potholes</span> : null}
        </div>
      </div>
    </div>
  );
}

type RoadCondition = 'clear' | 'rain' | 'night' | 'hazards';
type RouteOption = { id: string; name: string; time: string; etaMinutes?: number; distance: string; distanceMeters?: number; durationSeconds?: number; safety: string; safetyTone: 'good' | 'watch'; note: string; tags: string[]; path: string; condition: string; riskScore?: number; riskLevel?: 'Low' | 'Medium' | 'High' };
type RouteSearchField = 'start' | 'destination';

const roadConditionProfiles: Record<RoadCondition, { label: string; detail: string }> = {
  clear: { label: 'Clear roads', detail: 'Dry surface and normal visibility provide the baseline.' },
  rain: { label: 'Rain watch', detail: 'Wet pavement and low points increase surface and stopping risk.' },
  night: { label: 'Night return', detail: 'Lower visibility raises risk around merges and unlit segments.' },
  hazards: { label: 'Obstacle alert', detail: 'Reported obstacles increase risk near affected segments.' },
};

function shortPlace(value: string) {
  return value.trim().replace(/\s+/g, ' ').split(' ').slice(0, 2).join(' ');
}

function haversineDistanceKm(start: GeoPoint, destination: GeoPoint) {
  const earthRadiusKm = 6371;
  const latitudeDelta = (destination.latitude - start.latitude) * Math.PI / 180;
  const longitudeDelta = (destination.longitude - start.longitude) * Math.PI / 180;
  const startLatitude = start.latitude * Math.PI / 180;
  const destinationLatitude = destination.latitude * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type SimulationSpeed = 'slow' | 'normal' | 'fast';

function estimatedRouteTravelSeconds(
  liveRoute: LiveRouteData,
  _route: Segment,
) {
  const distanceMeters = liveRoute.distanceMeters > 0
    ? liveRoute.distanceMeters
    : routeDistanceMeters(liveRoute.geometry);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0
    || !Number.isFinite(liveRoute.durationSeconds) || liveRoute.durationSeconds <= 0) return null;

  // A routed duration is already the road-time estimate for this route. Do
  // not derive a second duration from the rendered polyline: geometry length
  // can differ slightly from the routing service's road-distance summary, and
  // do not add synthetic hazard seconds on top of the service duration.
  return liveRoute.durationSeconds;
}

function projectRoutePoint(point: GeoPoint, start: GeoPoint, destination: GeoPoint) {
  const longitudeSpan = Math.max(Math.abs(destination.longitude - start.longitude), 0.08);
  const latitudeSpan = Math.max(Math.abs(destination.latitude - start.latitude), 0.08);
  const x = 90 + ((point.longitude - Math.min(start.longitude, destination.longitude)) / longitudeSpan) * 820;
  const y = 350 - ((point.latitude - Math.min(start.latitude, destination.latitude)) / latitudeSpan) * 255;
  return { x, y };
}

function routePathFromGeometry(geometry: GeoPoint[], start: GeoPoint, destination: GeoPoint) {
  const step = Math.max(1, Math.ceil(geometry.length / 180));
  const visiblePoints = geometry.filter((_, index) => index % step === 0);
  const points = visiblePoints[visiblePoints.length - 1] === geometry[geometry.length - 1]
    ? visiblePoints
    : [...visiblePoints, geometry[geometry.length - 1]];
  return points.map((point, index) => {
    const projected = projectRoutePoint(point, start, destination);
    return `${index === 0 ? 'M' : 'L'}${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
  }).join(' ');
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters / 10) * 10} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatEtaDuration(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function formatRouteEta(seconds: number) {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr${minutes ? ` ${minutes} min` : ''}` : `${totalMinutes} min`;
}

function sampleRoutePath(pathData: string): Point2D[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  const totalLength = path.getTotalLength();
  if (!Number.isFinite(totalLength) || totalLength <= 0) return [];
  const sampleCount = Math.min(240, Math.max(40, Math.ceil(totalLength / 5)));
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const point = path.getPointAtLength((totalLength * index) / sampleCount);
    return { x: point.x * 0.95, y: point.y * (460 / 430) };
  });
}

function buildRoutedOptions(
  routes: RoutedPath[],
  start: string,
  destination: string,
  condition: RoadCondition,
  startCoordinate: PlaceCoordinate,
  destinationCoordinate: PlaceCoordinate,
  source: 'google' | 'openstreetmap',
): RouteOption[] {
  const profile = roadConditionProfiles[condition];
  const sortedRoutes = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds).slice(0, 3);
  const routeNames = ['Fastest route', 'Alternative route', 'Alternative route 2'];
  const tripCode = `${shortPlace(start)}, ${startCoordinate.state} → ${shortPlace(destination)}, ${destinationCoordinate.state}`;

  return sortedRoutes.map((route, index) => {
    const etaMinutes = Math.max(0, route.durationSeconds / 60);
    const routeName = routeNames[index];
    return {
      id: `routed-${index}`,
      name: `${routeName} · ${tripCode}`,
      time: formatRouteEta(route.durationSeconds),
      etaMinutes,
      distance: formatDistance(route.distanceMeters),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      note: `${source === 'google' ? 'Google Maps Routes' : 'OpenStreetMap/OSRM'} road distance and driving duration for ${startCoordinate.label}, ${startCoordinate.state} to ${destinationCoordinate.label}, ${destinationCoordinate.state}. ${profile.label} changes the risk score, not the route service's ETA.`,
      safety: index === 0 ? 'Best available time' : 'Compare conditions',
      safetyTone: index === 0 ? 'good' : 'watch',
      tags: [index === 0 ? 'Shortest routed time' : 'Routed alternative', profile.label],
      path: routePathFromGeometry(route.geometry, startCoordinate, destinationCoordinate),
      condition: `${routeName} · ${startCoordinate.label} to ${destinationCoordinate.label}`,
    };
  });
}

function RoutePlannerView({ location, locationControls, routeTrip, onRouteTripChange, onUseRoute }: { location: IndiaLocation; locationControls: LocationControls; routeTrip: RoutePlannerTrip; onRouteTripChange: (field: RouteSearchField, value: string) => void; onUseRoute?: (route: SimulationRoute) => void }) {
  const [mode, setMode] = useState<'safest' | 'fastest'>('safest');
  const [selectedRoute, setSelectedRoute] = useState('routed-0');
  const [planned, setPlanned] = useState(false);
  const [submittedTrip, setSubmittedTrip] = useState(routeTrip);
  const [routeError, setRouteError] = useState('');
  const [condition, setCondition] = useState<RoadCondition>('rain');
  const [recalculation, setRecalculation] = useState(0);
  const [startCoordinate, setStartCoordinate] = useState<PlaceCoordinate | null>(null);
  const [destinationCoordinate, setDestinationCoordinate] = useState<PlaceCoordinate | null>(null);
  const [routedPaths, setRoutedPaths] = useState<RoutedPath[]>([]);
  const [routeSource, setRouteSource] = useState<'google' | 'openstreetmap' | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const requestId = useRef(0);
  const [activeSearchField, setActiveSearchField] = useState<RouteSearchField | null>(null);
  const [searchResults, setSearchResults] = useState<Record<RouteSearchField, PlaceSearchResult[]>>({ start: [], destination: [] });
  const [searchLoading, setSearchLoading] = useState<Record<RouteSearchField, boolean>>({ start: false, destination: false });
  const [searchErrors, setSearchErrors] = useState<Record<RouteSearchField, string>>({ start: '', destination: '' });
  const [selectedPlaces, setSelectedPlaces] = useState<Record<RouteSearchField, PlaceSearchResult | null>>({ start: null, destination: null });
  const searchRequestIds = useRef<Record<RouteSearchField, number>>({ start: 0, destination: 0 });
  const searchTimers = useRef<Partial<Record<RouteSearchField, ReturnType<typeof setTimeout>>>>({});
  const baseRoutes = startCoordinate && destinationCoordinate && routeSource
    ? buildRoutedOptions(routedPaths, submittedTrip.start, submittedTrip.destination, condition, startCoordinate, destinationCoordinate, routeSource)
    : [];
  const engineRoutes = baseRoutes.length > 0 ? rankRiskPaths({
    current: { x: 70, y: 350 }, destination: { x: 880, y: 110 }, mode: 'route', staticHazards: initialHazards.filter((hazard) => !hazard.dynamic),
    candidates: baseRoutes.map((route, index) => ({ id: route.id, name: route.name, length: Number.parseInt(route.distance) || 1,
      points: [{ x: 70, y: 350 }, { x: 350 + index * 34, y: 240 + index * 52 }, { x: 610 - index * 30, y: 210 + index * 44 }, { x: 880, y: 110 }],
      features: { surface: condition === 'rain' ? 0.55 + index * 0.08 : 0.78 + index * 0.04, trafficMix: 0.7 - index * 0.12, intersection: 0.62 - index * 0.13, accidentHistory: 0.43 - index * 0.1, obstacleDensity: 0.38 - index * 0.1 } }))
  }).rankedPaths : [];
  const availableRoutes = baseRoutes.map((route) => {
    const scored = engineRoutes.find((item) => item.id === route.id);
    return scored ? { ...route, riskScore: scored.riskScore, riskLevel: scored.riskLevel, safety: `${scored.riskLevel} risk · ${scored.riskScore}/100`, safetyTone: scored.riskLevel === 'Low' ? 'good' as const : 'watch' as const } : route;
  });
  const orderedRoutes = mode === 'fastest' ? [...availableRoutes].sort((a, b) => (a.etaMinutes ?? Number.POSITIVE_INFINITY) - (b.etaMinutes ?? Number.POSITIVE_INFINITY)) : [...availableRoutes].sort((a, b) => (a.riskScore ?? 100) - (b.riskScore ?? 100));
  const selectedRouteOption = availableRoutes.find((route) => route.id === selectedRoute) ?? availableRoutes[0];
  const publishRouteToSimulation = (route: RouteOption | undefined, origin = submittedTrip.start, tripDestination = submittedTrip.destination) => {
    if (!route || !onUseRoute) return;
    const points = sampleRoutePath(route.path);
    if (points.length > 1 && route.distanceMeters && route.durationSeconds) onUseRoute({ points, origin, destination: tripDestination, routeName: route.name, eta: route.time, distance: route.distance, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, verifiedRoadRoute: true });
  };
  const selectRouteOption = (routeId: string) => {
    setSelectedRoute(routeId);
    setPlanned(false);
    publishRouteToSimulation(availableRoutes.find((route) => route.id === routeId));
  };

  const calculateRoutes = async (
    nextStart: string,
    nextDestination: string,
    preferredStart: PlaceSearchResult | null = null,
    preferredDestination: PlaceSearchResult | null = null,
  ) => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setActiveSearchField(null);
    setSubmittedTrip({ start: nextStart, destination: nextDestination });
    setRouteState('loading');
    setRouteError('');
    setRouteSource(null);
    setRoutedPaths([]);
    setStartCoordinate(null);
    setDestinationCoordinate(null);
    setPlanned(false);

    let resolvedStart: PlaceCoordinate | null = preferredStart && normalizePlace(preferredStart.label) === normalizePlace(nextStart) ? preferredStart : null;
    let resolvedDestination: PlaceCoordinate | null = preferredDestination && normalizePlace(preferredDestination.label) === normalizePlace(nextDestination) ? preferredDestination : null;
    try {
      [resolvedStart, resolvedDestination] = await Promise.all([
        resolvedStart ? Promise.resolve(resolvedStart) : resolvePlaceCoordinate(nextStart, location),
        resolvedDestination ? Promise.resolve(resolvedDestination) : resolvePlaceCoordinate(nextDestination, location),
      ]);
      if (!resolvedStart || !resolvedDestination) {
        const missing = !resolvedStart ? nextStart : nextDestination;
        throw new Error(`Could not find “${missing}” in India. Try adding its district or state.`);
      }
      const googleRouted = await fetchGoogleRoadRoutes(resolvedStart, resolvedDestination);
      const routeProvider = googleRouted ? 'google' : 'openstreetmap';
      const routed = googleRouted ?? await fetchRoadRoutes(resolvedStart, resolvedDestination);
      if (requestId.current !== currentRequestId) return;
      setStartCoordinate(resolvedStart);
      setDestinationCoordinate(resolvedDestination);
      setRoutedPaths(routed);
      setRouteSource(routeProvider);
      setRouteState('ready');
      setSelectedRoute('routed-0');
      publishRouteToSimulation(buildRoutedOptions(routed, nextStart, nextDestination, condition, resolvedStart, resolvedDestination, routeProvider)[0], nextStart, nextDestination);
      setRecalculation((current) => current + 1);
    } catch (error) {
      if (requestId.current !== currentRequestId) return;
      if (resolvedStart && resolvedDestination) {
        setStartCoordinate(resolvedStart);
        setDestinationCoordinate(resolvedDestination);
        setRouteSource(null);
        setRouteState('idle');
        setRouteError(`${error instanceof Error ? error.message : 'Mapped-road routing is unavailable.'} No distance or time is shown without a calculated road route.`);
      } else {
        setRouteState('idle');
        setRouteError(error instanceof Error ? error.message : 'Could not find both places. Add a district or state and try again.');
      }
    }
  };

  const handlePlaceInput = (field: RouteSearchField, value: string) => {
    onRouteTripChange(field, value);
    setActiveSearchField(field);
    setSelectedPlaces((current) => ({ ...current, [field]: null }));
    setSearchErrors((current) => ({ ...current, [field]: '' }));
    setSearchResults((current) => ({ ...current, [field]: [] }));
    setSearchLoading((current) => ({ ...current, [field]: false }));

    const existingTimer = searchTimers.current[field];
    if (existingTimer) clearTimeout(existingTimer);
    const currentSearchId = searchRequestIds.current[field] + 1;
    searchRequestIds.current[field] = currentSearchId;
    if (value.trim().length < 2) return;

    setSearchLoading((current) => ({ ...current, [field]: true }));
    searchTimers.current[field] = setTimeout(() => {
      void searchIndianPlaces(value, location)
        .then((results) => {
          if (searchRequestIds.current[field] !== currentSearchId) return;
          setSearchResults((current) => ({ ...current, [field]: results }));
          if (results.length === 0) {
            setSearchErrors((current) => ({ ...current, [field]: 'Location not found. Try a more specific place name.' }));
          }
        })
        .catch((error) => {
          if (searchRequestIds.current[field] !== currentSearchId) return;
          setSearchErrors((current) => ({ ...current, [field]: error instanceof Error ? error.message : 'Location search is unavailable right now.' }));
        })
        .finally(() => {
          if (searchRequestIds.current[field] === currentSearchId) {
            setSearchLoading((current) => ({ ...current, [field]: false }));
          }
        });
    }, 350);
  };

  const selectPlace = (field: RouteSearchField, result: PlaceSearchResult) => {
    onRouteTripChange(field, result.label);
    setSelectedPlaces((current) => ({ ...current, [field]: result }));
    setSearchResults((current) => ({ ...current, [field]: [] }));
    setSearchErrors((current) => ({ ...current, [field]: '' }));
    setSearchLoading((current) => ({ ...current, [field]: false }));
    setActiveSearchField(null);
  };

  useEffect(() => {
    void calculateRoutes(routeTrip.start, routeTrip.destination);
    return () => {
      requestId.current += 1;
      (Object.keys(searchTimers.current) as RouteSearchField[]).forEach((field) => {
        const timer = searchTimers.current[field];
        if (timer) clearTimeout(timer);
      });
      searchRequestIds.current.start += 1;
      searchRequestIds.current.destination += 1;
    };
  }, [location.id]);

  const refreshComparison = () => {
    const nextStart = routeTrip.start.trim();
    const nextDestination = routeTrip.destination.trim();
    if (!nextStart || !nextDestination) {
      setRouteError('Add both a starting point and a destination before searching.');
      return;
    }
    void calculateRoutes(nextStart, nextDestination, selectedPlaces.start, selectedPlaces.destination);
  };

  return (
    <div className="page-in space-y-6">
      <PageHeading eyebrow={`Route planner · ${ENGINE_VERSION}`} title={`Compare ${location.city} routes`} description="The shortest route is not always the easiest route to trust. See the reasoning beside each option.">
        <StatusPill
          label={routeState === 'loading' ? 'Finding road routes' : availableRoutes.length > 0 ? `${availableRoutes.length} routes ready` : 'Waiting for places'}
          tone={routeState === 'loading' ? 'watch' : availableRoutes.length > 0 ? 'good' : 'neutral'}
          icon={routeState === 'loading' ? Activity : RouteIcon}
        />
      </PageHeading>
      <LocationPicker {...locationControls} />
      <section className="rounded-[24px] border border-card-border bg-card p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
           <LocationField label="Starting point" value={routeTrip.start} onChange={(value) => handlePlaceInput('start', value)} onFocus={() => setActiveSearchField('start')} placeholder="Enter starting point" icon={CircleDot} testId="input-route-start" searchResults={searchResults.start} searchLoading={searchLoading.start} searchError={searchErrors.start} showSuggestions={activeSearchField === 'start'} onSelectPlace={(result) => selectPlace('start', result)} />
          <div className="hidden pb-3 text-muted-foreground md:block"><ArrowRight size={18} /></div>
           <LocationField label="Destination" value={routeTrip.destination} onChange={(value) => handlePlaceInput('destination', value)} onFocus={() => setActiveSearchField('destination')} placeholder="Enter destination" icon={MapPinned} testId="input-route-destination" searchResults={searchResults.destination} searchLoading={searchLoading.destination} searchError={searchErrors.destination} showSuggestions={activeSearchField === 'destination'} onSelectPlace={(result) => selectPlace('destination', result)} />
          <ActionButton testId="button-refresh-routes" icon={routeState === 'loading' ? Activity : Zap} onClick={refreshComparison}>{routeState === 'loading' ? 'Finding routes…' : 'Find road routes'}</ActionButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
           <p className="text-muted-foreground">Search any Indian city, village, neighborhood, or local area. Google Maps Routes is used when its server key is configured; otherwise the app labels its OpenStreetMap estimate.</p>
           <p className="font-semibold text-primary" data-testid="text-active-trip">Comparing {submittedTrip.start} → {submittedTrip.destination} · recalculation {recalculation + 1}</p>
        </div>
        {routeError ? <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{routeError}</p> : null}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Sort by</p><div className="mt-2 inline-flex rounded-xl border border-border bg-muted p-1">
            <button type="button" data-testid="button-route-mode-safest" onClick={() => setMode('safest')} className={classNames('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'safest' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground')}>Safer first</button>
            <button type="button" data-testid="button-route-mode-fastest" onClick={() => setMode('fastest')} className={classNames('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'fastest' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground')}>Fastest first</button>
          </div></div>
          <label className="block min-w-[190px]"><span className="block text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Road condition</span><select value={condition} onChange={(event) => { setCondition(event.target.value as RoadCondition); setPlanned(false); }} data-testid="select-road-condition" className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold outline-none focus:border-primary"><option value="clear">Clear roads</option><option value="rain">Rain watch</option><option value="night">Night return</option><option value="hazards">Obstacle alert</option></select></label>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/70 p-3 text-sm text-muted-foreground"><CloudRain size={16} className="shrink-0 text-[#4c84a3]" /><span><strong className="text-foreground">{roadConditionProfiles[condition].label}:</strong> {roadConditionProfiles[condition].detail}</span></div>
      </section>
       <section className="overflow-hidden rounded-[22px] border border-card-border bg-card shadow-sm">
           <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">{routeSource === 'google' ? 'Google Maps road calculation' : routeSource === 'openstreetmap' ? 'OpenStreetMap fallback · Google key not configured' : 'Mapped road calculation'}</p><h2 className="mt-1 font-display text-xl font-bold">Different choice, different path</h2></div><span className="text-xs font-semibold text-primary">{selectedRouteOption ? `${routeSource === 'google' ? 'Google Maps · traffic-aware ETA' : 'OSM estimate · no live traffic'} · ${selectedRouteOption.time}` : routeState === 'loading' ? 'Searching roads…' : 'Waiting for a mapped route'}</span></div>
        <div className="relative h-[230px] overflow-hidden route-atlas-map p-4">
           {availableRoutes.length > 0 && startCoordinate && destinationCoordinate ? (
             <svg viewBox="0 0 1000 430" className="size-full" role="img" aria-label={`Calculated route paths from ${submittedTrip.start} to ${submittedTrip.destination}`}>
               <defs><pattern id="route-atlas-paper" width="42" height="42" patternUnits="userSpaceOnUse"><rect width="42" height="42" fill="#efe4ca"/><path d="M0 0H42M0 0V42" fill="none" stroke="#b5a17c" strokeWidth=".7" opacity=".32"/><circle cx="9" cy="13" r=".8" fill="#927b55" opacity=".34"/><circle cx="31" cy="34" r=".65" fill="#927b55" opacity=".28"/></pattern></defs>
               <rect width="1000" height="430" fill="url(#route-atlas-paper)" />
               <path d="M15 70 C210 38 362 94 540 63 S830 34 985 70 M10 170 C210 140 380 196 558 163 S830 139 990 170 M10 280 C205 248 395 305 570 274 S824 245 990 282 M12 385 C210 355 392 413 580 381 S832 355 988 390" fill="none" stroke="#a99570" strokeWidth="1" opacity=".3" />
               {availableRoutes.map((route) => <g key={route.id} role="button" tabIndex={0} aria-label={`Select ${route.name}`} onClick={() => selectRouteOption(route.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectRouteOption(route.id); }} className="cursor-pointer"><path d={route.path} className="map-road transition-all" stroke={selectedRoute === route.id ? '#8e352b' : '#978465'} strokeWidth={selectedRoute === route.id ? 14 : 7} opacity={selectedRoute === route.id ? 1 : .72} /><path d={route.path} className="map-road" stroke={selectedRoute === route.id ? '#edc77d' : 'transparent'} strokeWidth="3" strokeDasharray="12 12" /></g>)}
               <circle cx={projectRoutePoint(startCoordinate, startCoordinate, destinationCoordinate).x} cy={projectRoutePoint(startCoordinate, startCoordinate, destinationCoordinate).y} r="15" fill="#386248" stroke="#f4e8cf" strokeWidth="3" /><circle cx={projectRoutePoint(destinationCoordinate, startCoordinate, destinationCoordinate).x} cy={projectRoutePoint(destinationCoordinate, startCoordinate, destinationCoordinate).y} r="15" fill="#8e352b" stroke="#f4e8cf" strokeWidth="3" /><text x={projectRoutePoint(startCoordinate, startCoordinate, destinationCoordinate).x} y={projectRoutePoint(startCoordinate, startCoordinate, destinationCoordinate).y + 5} fill="#fff7e6" fontSize="12" fontWeight="700" textAnchor="middle">A</text><text x={projectRoutePoint(destinationCoordinate, startCoordinate, destinationCoordinate).x} y={projectRoutePoint(destinationCoordinate, startCoordinate, destinationCoordinate).y + 5} fill="#fff7e6" fontSize="12" fontWeight="700" textAnchor="middle">B</text>
               <g transform="translate(951 56)" fill="none" stroke="#674d32" strokeWidth="2"><circle r="24"/><path d="M0 -19V19M-13 0H13"/><path d="M0 -19L-6 -4L0 -8L6 -4Z" fill="#8e352b"/><text x="0" y="-29" fill="#674d32" stroke="none" fontSize="12" fontWeight="700" textAnchor="middle">N</text></g>
               <text x="30" y="32" fill="#674d32" fontFamily="Georgia,serif" fontSize="12" fontWeight="700" letterSpacing="2">BHARAT · ROAD ATLAS</text>
             </svg>
            ) : <div className="grid h-full place-items-center p-6 text-center text-sm font-semibold text-muted-foreground">{routeState === 'loading' ? 'Finding the nearest mapped roads…' : 'Enter two Indian places and choose Find road routes.'}</div>}
          <div className="absolute bottom-3 left-5 rounded-lg border border-white/80 bg-[#f8f4eb]/90 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur">{submittedTrip.start} → {submittedTrip.destination}</div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
         {orderedRoutes.map((route, index) => (
          <button type="button" key={route.id} data-testid={`route-option-${route.id}`} onClick={() => selectRouteOption(route.id)} className={classNames('route-card flex flex-col rounded-[22px] border bg-card p-5 text-left transition-all hover:-translate-y-1 hover:shadow-md', selectedRoute === route.id ? 'route-card-selected border-primary' : 'border-card-border shadow-xs')}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={classNames('grid size-9 place-items-center rounded-xl text-sm font-bold', index === 0 && mode === 'safest' ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground')}>{String.fromCharCode(65 + index)}</span><div><h2 className="font-display font-bold">{route.name}</h2><p className="text-xs text-muted-foreground">{route.distance}</p></div></div>{selectedRoute === route.id ? <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={15} /></span> : null}</div>
            <div className="mt-7 flex items-end justify-between"><div><strong className="font-display text-4xl tracking-[-.06em]">{route.time}</strong><span className="ml-2 text-sm text-muted-foreground">drive</span></div><StatusPill label={route.safety} tone={route.safetyTone} icon={route.safetyTone === 'good' ? ShieldCheck : TriangleAlert} /></div>
            <p className="mt-4 min-h-12 text-sm leading-5 text-muted-foreground">{route.note}</p>
            <div className="mt-5 flex flex-wrap gap-1.5">{route.tags.map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">{tag}</span>)}</div>
          </button>
        ))}
       </div>
       {orderedRoutes.length === 0 ? <p role="status" className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-semibold text-destructive">No route options are shown until both places are recognized.</p> : null}
       <section className="flex flex-col gap-4 rounded-[22px] border border-[#bed9d1] bg-[#e1efe9] p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3"><span className="mt-0.5 text-primary"><ShieldCheck size={20} /></span><div><h2 className="font-display font-bold">Your considered choice</h2><p className="mt-1 text-sm text-[#4f6f6b]">{selectedRouteOption?.note ?? 'Choose two recognized Indian places to see a calculated route.'}</p><p className="mt-2 text-xs font-semibold text-primary">{planned ? `Selected for ${submittedTrip.start} → ${submittedTrip.destination}` : `Ready for ${submittedTrip.start} → ${submittedTrip.destination}`}</p></div></div>
        <ActionButton testId="button-use-selected-route" variant="secondary" icon={planned ? Check : Navigation} onClick={() => { setPlanned(true); publishRouteToSimulation(selectedRouteOption); }}>{planned ? 'Route selected' : 'Use this route'}</ActionButton>
      </section>
    </div>
  );
}

function LocationField({
  label,
  value,
  onChange,
  onFocus,
  placeholder,
  icon: Icon,
  testId,
  searchResults = [],
  searchLoading = false,
  searchError = '',
  showSuggestions = false,
  onSelectPlace,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  icon: LucideIcon;
  testId: string;
  searchResults?: PlaceSearchResult[];
  searchLoading?: boolean;
  searchError?: string;
  showSuggestions?: boolean;
  onSelectPlace?: (result: PlaceSearchResult) => void;
}) {
  const showSearchPanel = showSuggestions && (searchLoading || Boolean(searchError) || searchResults.length > 0);
  return (
    <label className="relative block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-3 rounded-xl border border-input bg-background px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Icon size={17} className="shrink-0 text-primary" />
        <input
          type="text"
          data-testid={testId}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={showSearchPanel}
        />
      </span>
      {showSearchPanel ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg" role="listbox" aria-label={`${label} search results`}>
          {searchLoading ? <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">Searching Indian places…</p> : null}
          {searchError ? <p role="alert" className="px-3 py-2 text-xs font-semibold text-destructive">{searchError}</p> : null}
          {searchResults.map((result, index) => (
            <button
              type="button"
              key={result.id}
              role="option"
              aria-selected={false}
              data-testid={`${testId}-result-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectPlace?.(result)}
              className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <span className="block text-sm font-semibold text-foreground">{result.label}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.displayName} · {result.type}</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

type Scenario = { id: string; label: string; title: string; intro: string; steps: { kicker: string; question: string; context: string; actions: { label: string; outcome: string; tone: 'safe' | 'quick' | 'wait' }[] }[] };
const scenarios: Scenario[] = [
  { id: 'monsoon', label: 'Monsoon commute', title: 'A low point after rain', intro: 'You are heading home when the weather signal changes. Read the clues and choose what to do next.', steps: [
    { kicker: '01 · Notice', question: 'The rain has eased, but the road ahead looks glossy. What do you check first?', context: 'The live signal shows surface-water confidence at 61%. Visibility is still fair.', actions: [{ label: 'Slow down and check the next segment', outcome: 'Good call. You looked for the condition before committing to speed.', tone: 'safe' }, { label: 'Keep the same speed', outcome: 'The road may be fine, but the signal suggests a check is worthwhile.', tone: 'quick' }] },
    { kicker: '02 · Decide', question: 'A shallow low point is flagged on your route. Which option is more sensible?', context: 'The alternate road adds 6 minutes and avoids the flagged segment.', actions: [{ label: 'Take the alternate road', outcome: 'You traded a little time for more predictable road conditions.', tone: 'safe' }, { label: 'Continue and watch for water', outcome: 'Possible, but harder to judge at night or in spray.', tone: 'wait' }] },
    { kicker: '03 · Reflect', question: 'What made the safer choice easier to see?', context: 'A condition, a confidence level, and a route trade-off were shown together.', actions: [{ label: 'The signals had context', outcome: 'Exactly. RoadSense keeps the reason beside the recommendation.', tone: 'safe' }, { label: 'Only the travel time', outcome: 'Time helps, but it is only one part of the decision.', tone: 'quick' }] },
  ] },
  { id: 'night', label: 'Night return', title: 'A busy merge after dark', intro: 'The route is familiar, but the conditions are not. Make the next decision with limited visibility.', steps: [
    { kicker: '01 · Notice', question: 'Traffic is moving, but a merge is busier than usual. What is the useful first signal?', context: 'The map reports steady flow overall and a local merge confidence of 54%.', actions: [{ label: 'Reduce speed before the merge', outcome: 'That creates more room where the uncertainty is localised.', tone: 'safe' }, { label: 'Use the faster lane', outcome: 'It may save seconds, but removes space to react.', tone: 'quick' }] },
    { kicker: '02 · Decide', question: 'A well-lit road takes four minutes longer. What do you value now?', context: 'The route planner marks the lit road as lower exposure for this scenario.', actions: [{ label: 'Choose the well-lit road', outcome: 'A small time cost buys a clearer, calmer approach.', tone: 'safe' }, { label: 'Stay on the familiar road', outcome: 'Familiarity helps, but it does not remove the merge condition.', tone: 'wait' }] },
    { kicker: '03 · Reflect', question: 'What did the system do instead of telling you what to do?', context: 'It surfaced the local condition and showed the cost of an alternative.', actions: [{ label: 'It made the trade-off visible', outcome: 'Yes. The driver stays in control, with better context.', tone: 'safe' }, { label: 'It picked the shortest path', outcome: 'Not quite. The shortest path is not always the clearest choice.', tone: 'quick' }] },
  ] },
];

function ScenarioPlayerView({ location, locationControls, onOpenLiveMap }: { location: IndiaLocation; locationControls: LocationControls; onOpenLiveMap: () => void }) {
  const [scenarioId, setScenarioId] = useState('monsoon');
  const [step, setStep] = useState(0);
  const [selectedAction, setSelectedAction] = useState<number | null>(null);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const current = scenario.steps[step];

  const changeScenario = (id: string) => { setScenarioId(id); setStep(0); setSelectedAction(null); };
  const chooseAction = (index: number) => setSelectedAction(index);
  const nextStep = () => { setStep((currentStep) => currentStep === scenario.steps.length - 1 ? 0 : currentStep + 1); setSelectedAction(null); };

  return (
    <div className="page-in space-y-6">
      <PageHeading eyebrow="Scenario player" title={`Practise ${location.city} decisions`} description="Short, guided situations help you understand why a road recommendation changes at each Indian location.">
        <div className="flex flex-wrap gap-2">
          <StatusPill label={`${step + 1} of ${scenario.steps.length}`} icon={PlayCircle} />
          <ActionButton testId="button-open-scenario-map" variant="secondary" icon={MapPinned} onClick={onOpenLiveMap}>Open this location on map</ActionButton>
        </div>
      </PageHeading>
      <LocationPicker {...locationControls} />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="rounded-[24px] border border-card-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Choose a scene</p><SlidersHorizontal size={16} className="text-muted-foreground" /></div>
          <div className="mt-4 space-y-2">
            {scenarios.map((item) => <button type="button" key={item.id} data-testid={`button-scenario-${item.id}`} onClick={() => changeScenario(item.id)} className={classNames('w-full rounded-xl border p-3 text-left transition-colors', scenarioId === item.id ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:bg-muted')}><span className="flex items-center justify-between gap-2"><strong className={scenarioId === item.id ? 'text-primary' : ''}>{item.label}</strong>{scenarioId === item.id ? <Check size={16} className="text-primary" /> : null}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.title}</span></button>)}
          </div>
          <div className="mt-6 rounded-xl bg-muted/70 p-3 text-xs leading-5 text-muted-foreground"><Info size={15} className="mb-2 text-primary" />There is no perfect answer. Look for the choice that makes the condition easier to handle.</div>
        </aside>
        <section className="overflow-hidden rounded-[24px] border border-card-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#17394e] px-6 py-5 text-[#f8f4eb]">
            <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a8d9ce]">{scenario.label}</p><h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">{scenario.title}</h2></div>
            <div className="flex items-center gap-1.5">{scenario.steps.map((item, index) => <span key={item.kicker} className={classNames('h-1.5 w-10 rounded-full', index <= step ? 'bg-[#78c6b7]' : 'bg-white/20')} />)}</div>
          </div>
          <div className="grid gap-8 p-6 md:p-9 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <span className="font-mono text-xs font-semibold text-primary">{current.kicker}</span>
              <h3 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.045em]">{current.question}</h3>
              <p className="mt-5 rounded-2xl border border-accent/25 bg-accent/10 p-4 text-sm leading-6 text-[#6e531b]">{current.context} This scenario is currently mapped to {location.city}, {location.state}.</p>
            </div>
            <div><p className="mb-3 text-sm font-semibold text-muted-foreground">Choose your next move</p><div className="space-y-3">
              {current.actions.map((action, index) => <button type="button" key={action.label} data-testid={`scenario-choice-${index}`} onClick={() => chooseAction(index)} className={classNames('w-full rounded-2xl border p-4 text-left transition-all', selectedAction === index ? 'border-primary bg-primary/8 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-muted/60')}><span className="flex items-start gap-3"><span className={classNames('grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold', selectedAction === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{String.fromCharCode(65 + index)}</span><span><strong className="block text-sm">{action.label}</strong>{selectedAction === index ? <span className="mt-2 block text-sm leading-5 text-muted-foreground">{action.outcome}</span> : null}</span></span></button>)}
            </div>
              <div className="mt-6 flex flex-wrap justify-between gap-3"><ActionButton testId="button-scenario-back" variant="quiet" icon={ArrowLeft} onClick={() => { setStep((currentStep) => Math.max(currentStep - 1, 0)); setSelectedAction(null); }}>Previous</ActionButton><ActionButton testId="button-scenario-next" icon={step === scenario.steps.length - 1 ? Check : ArrowRight} onClick={nextStep}>{step === scenario.steps.length - 1 ? 'Review again' : 'Next decision'}</ActionButton></div>
            </div>
          </div>
          <div className="border-t border-border bg-muted/50 px-6 py-4 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Scenario note:</span> {scenario.intro}</div>
        </section>
      </div>
    </div>
  );
}

function ArchitectureView() {
  const [openLayer, setOpenLayer] = useState(1);
  const layers = [
    { number: '01', title: 'Sense', subtitle: 'Collect signals', icon: Radio, color: 'teal', detail: 'Road observations, weather changes, traffic flow, and reported events arrive as small, local signals.' },
    { number: '02', title: 'Understand', subtitle: 'Add context', icon: Layers3, color: 'blue', detail: 'Signals are grouped by road segment, time, and confidence so a single noisy report does not overreact.' },
    { number: '03', title: 'Compare', subtitle: 'Model choices', icon: RouteIcon, color: 'gold', detail: 'Possible routes are scored against time, exposure, and current conditions. The trade-off stays visible.' },
    { number: '04', title: 'Guide', subtitle: 'Explain next steps', icon: ShieldCheck, color: 'plum', detail: 'The interface turns the result into a short explanation a person can use, not a black-box score.' },
  ];
  return (
    <div className="page-in space-y-6">
      <PageHeading eyebrow="Architecture" title="From road signal to human decision" description="The system is easiest to trust when every layer has a clear job. Follow the path below.">
        <StatusPill label="4 connected layers" icon={Network} />
      </PageHeading>
      <section className="rounded-[26px] border border-[#bcd7cf] bg-[#dfeee8] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">The decision loop</p><h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-.05em] text-[#17394e] md:text-4xl">A little less data noise at every step.</h2></div><div className="flex items-center gap-2 text-sm font-semibold text-[#4f6f6b]"><span className="size-2 rounded-full bg-primary" /> Local demo flow</div></div>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {layers.map((layer, index) => { const Icon = layer.icon; const isOpen = openLayer === index; return <div key={layer.number} className="flex items-stretch gap-3 md:block"><button type="button" data-testid={`button-architecture-layer-${index}`} onClick={() => setOpenLayer(index)} className={classNames('group w-full rounded-2xl border p-4 text-left transition-all md:min-h-[152px]', isOpen ? 'border-primary/35 bg-card shadow-sm' : 'border-[#bdd5cd] bg-[#edf6f2]/50 hover:bg-card/70')}><div className="flex items-start justify-between"><span className={classNames('grid size-10 place-items-center rounded-xl', layer.color === 'teal' && 'bg-primary/12 text-primary', layer.color === 'blue' && 'bg-[#e1edf2] text-[#3b6f86]', layer.color === 'gold' && 'bg-accent/25 text-[#765316]', layer.color === 'plum' && 'bg-[#eee6ef] text-[#78547e]')}><Icon size={19} /></span><span className="font-mono text-xs text-muted-foreground">{layer.number}</span></div><p className="mt-5 font-display font-bold text-[#17394e]">{layer.title}</p><p className="mt-1 text-xs text-[#4f6f6b]">{layer.subtitle}</p>{isOpen ? <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground md:hidden">{layer.detail}</p> : null}</button>{index < 3 ? <ArrowRight size={17} className="mt-6 shrink-0 text-primary/70 md:hidden" /> : null}{index < 3 ? <ArrowRight size={17} className="absolute mt-[70px] ml-[calc(25%-8px)] hidden text-primary/70 md:block" /> : null}</div>; })}
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-[24px] border border-card-border bg-card p-6 shadow-sm"><SectionEyebrow icon={Info}>Selected layer</SectionEyebrow><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 font-mono font-bold text-primary">{layers[openLayer].number}</span><div><h2 className="font-display text-2xl font-bold">{layers[openLayer].title}</h2><p className="text-sm text-muted-foreground">{layers[openLayer].subtitle}</p></div></div><p className="mt-6 text-sm leading-7 text-muted-foreground">{layers[openLayer].detail}</p></div>
        <div className="rounded-[24px] border border-card-border bg-card p-6 shadow-sm"><SectionEyebrow icon= {BellRing}>What the user sees</SectionEyebrow><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-muted/70 p-4"><AlertTriangle size={18} className="text-[#b7791f]" /><strong className="mt-4 block text-sm">A status</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Clear, watch, or caution.</p></div><div className="rounded-xl bg-muted/70 p-4"><RouteIcon size={18} className="text-primary" /><strong className="mt-4 block text-sm">A choice</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Options with a reason beside them.</p></div><div className="rounded-xl bg-muted/70 p-4"><Info size={18} className="text-[#4c84a3]" /><strong className="mt-4 block text-sm">A why</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Short context, no jargon.</p></div></div></div>
      </section>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between"><div><SectionEyebrow>{eyebrow}</SectionEyebrow><h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-.055em] md:text-5xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p></div>{children ? <div className="shrink-0">{children}</div> : null}</div>;
}

function App() {
  const [view, setView] = useState<View>('live');
  const [mode, setMode] = useState<'autonomous' | 'driver-assist'>('autonomous');
  const [locations, setLocations] = useState<IndiaLocation[]>(indiaLocations);
  const [locationId, setLocationId] = useState('bengaluru');
  const [routeTrip, setRouteTrip] = useState<RoutePlannerTrip>(() => ({ start: indiaLocations[0].defaultOrigin, destination: indiaLocations[0].defaultDestination }));
  const [simulationRoute, setSimulationRoute] = useState<SimulationRoute | null>(null);
  // Discard route objects saved by older app versions that lacked route sanity checks.
  const verifiedSimulationRoute = simulationRoute?.verifiedRoadRoute ? simulationRoute : null;
  const selectedLocation = locations.find((location) => location.id === locationId) ?? locations[0];
  const locationControls: LocationControls = {
    locations,
    selectedId: selectedLocation.id,
    onChange: (id) => {
      const nextLocation = locations.find((location) => location.id === id);
      if (!nextLocation) return;
      setLocationId(id);
      setRouteTrip({ start: nextLocation.defaultOrigin, destination: nextLocation.defaultDestination });
      setSimulationRoute(null);
    },
    onAdd: (city, coordinates) => {
      const id = `${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${locations.length + 1}`;
      const customLocation: IndiaLocation = {
        id,
        city,
        state: coordinates.state,
        region: 'India',
        defaultOrigin: coordinates.label,
        defaultDestination: `${coordinates.label} centre`,
        weather: 'Local demo conditions',
        coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude },
      };
      setLocations((current) => [...current, customLocation]);
      setLocationId(id);
      setRouteTrip({ start: customLocation.defaultOrigin, destination: customLocation.defaultDestination });
      setSimulationRoute(null);
    },
  };
  const content = mode === 'autonomous'
    ? view === 'routes'
      ? <RoutePlannerView key={`autonomous-${selectedLocation.id}`} location={selectedLocation} locationControls={locationControls} routeTrip={routeTrip} onRouteTripChange={(field, value) => setRouteTrip((current) => ({ ...current, [field]: value }))} onUseRoute={setSimulationRoute} />
      : view === 'scenario'
        ? <ScenarioPlayerView location={selectedLocation} locationControls={locationControls} onOpenLiveMap={() => setView('live')} />
        : view === 'home'
          ? <HomeView setView={setView} />
          : view === 'architecture'
            ? <ArchitectureView />
            : <AutonomousSimulation plannedRoute={verifiedSimulationRoute} />
    : view === 'home'
    ? <HomeView setView={setView} />
    : view === 'live'
      ? <LiveMapView key={selectedLocation.id} location={selectedLocation} locationControls={locationControls} />
      : view === 'routes'
        ? <RoutePlannerView key={selectedLocation.id} location={selectedLocation} locationControls={locationControls} routeTrip={routeTrip} onRouteTripChange={(field, value) => setRouteTrip((current) => ({ ...current, [field]: value }))} />
        : view === 'scenario'
          ? <ScenarioPlayerView location={selectedLocation} locationControls={locationControls} onOpenLiveMap={() => setView('live')} />
          : <ArchitectureView />;
  return <Shell view={view} setView={setView} mode={mode} setMode={setMode}>{content}</Shell>;
}

export default App;
