/**
 * Lives of stars: approximate evolutionary tracks on the HR diagram for five stellar masses.
 *
 * Each track is a list of key points (age, surface temperature, luminosity, stage). They are
 * hand-built approximations to the shapes and timings of published solar-composition stellar
 * models (for example the MIST and Geneva grids): good for comparing stars and stages, not for
 * reading off precise values. Between key points the position follows a smooth (Catmull-Rom)
 * curve, and the age advances linearly.
 *
 * Units: ages in years, temperatures in kelvin (as log10), luminosities and radii in Suns.
 */

export const SUN_TEFF = 5772;
const LOG_SUN_TEFF = Math.log10(SUN_TEFF);
export const UNIVERSE_AGE = 13.8e9;

export type PhaseId =
  | "ms"
  | "subgiant"
  | "rgb"
  | "clump"
  | "agb"
  | "pn"
  | "wd"
  | "bsg"
  | "rsg"
  | "late"
  | "lbv"
  | "wr"
  | "ns"
  | "bh";

/** Broad groups, used for the colours of the timeline bars. */
export type PhaseGroup = "ms" | "giant" | "end" | "remnant";

export type EventKind = "flash" | "supernova" | "collapse";

export const PHASES: Record<PhaseId, { name: string; group: PhaseGroup; fusing: string }> = {
  ms: { name: "Main sequence", group: "ms", fusing: "Hydrogen into helium, in the core" },
  subgiant: { name: "Subgiant", group: "giant", fusing: "Hydrogen in a shell around a spent helium core" },
  rgb: { name: "Red giant", group: "giant", fusing: "Hydrogen in a shell; the helium core shrinks and heats up" },
  clump: { name: "Helium-burning giant", group: "giant", fusing: "Helium into carbon and oxygen, in the core" },
  agb: { name: "Red giant again (AGB)", group: "giant", fusing: "Helium and hydrogen in shells around a carbon–oxygen core" },
  pn: { name: "Planetary nebula", group: "end", fusing: "Fusion stopping: the outer layers drift away and bare the hot core" },
  wd: { name: "White dwarf", group: "remnant", fusing: "Nothing: a cooling ember about the size of Earth" },
  bsg: { name: "Blue supergiant", group: "giant", fusing: "Hydrogen in a shell; the core contracts" },
  rsg: { name: "Red supergiant", group: "giant", fusing: "Helium into carbon and oxygen, in the core" },
  late: { name: "Red supergiant, last stages", group: "end", fusing: "Carbon, neon, oxygen, then silicon into iron, each faster than the last" },
  lbv: { name: "Unstable supergiant", group: "giant", fusing: "Helium in the core, while outbursts throw off its outer layers" },
  wr: { name: "Wolf–Rayet star", group: "end", fusing: "Helium, then heavier elements, in a stripped, very hot core" },
  ns: { name: "Neutron star", group: "remnant", fusing: "Nothing: a city-sized ball of neutrons" },
  bh: { name: "Black hole", group: "remnant", fusing: "Nothing: not even light escapes" }
};

export function isOffChart(phase: PhaseId): boolean {
  return phase === "ns" || phase === "bh";
}

export type Key = {
  t: number;
  logT: number;
  logL: number;
  /** Stage from this key until the next one. */
  phase: PhaseId;
  /** The step from this key to the next is near-instant: drawn dashed and skipped by the clock. */
  instant?: boolean;
  /** Something dramatic happens at this key (shown where the star is at that moment). */
  event?: EventKind;
};

export type Track = {
  id: string;
  mass: number;
  /** Plain label, e.g. "15 Suns". */
  label: string;
  /** Identity colour of the track (roughly the star's colour when young). */
  colour: string;
  keys: Key[];
  /** When the star's active life ends (the remnant is born), in years. */
  lifeEnd: number;
  /** Words for the end of its life, e.g. "then a white dwarf". */
  fate: string;
  /** Override for the lifetime words, e.g. for the red dwarf whose life outlasts the run. */
  lifeWords?: string;
};

/** White-dwarf cooling time to reach luminosity L (Suns), from Mestel's simple law t ∝ L^(-5/7). */
export function whiteDwarfAge(L: number, factor = 1): number {
  return factor * 1e9 * (L / 1e-3) ** (-5 / 7);
}

/** log L on a line of constant radius R (Suns): L = R² (T/T☉)⁴. */
export function logLAtRadius(logR: number, logT: number): number {
  return 2 * logR + 4 * (logT - LOG_SUN_TEFF);
}

/**
 * From the tip of the AGB: the star sheds its envelope (planetary nebula), its hot core crosses
 * left at nearly constant brightness, then fades down a line of constant radius as a white dwarf.
 */
function postAgb(tTip: number, logTTip: number, logLTip: number, wdRadius: number, coolFactor: number): Key[] {
  const keys: Key[] = [
    { t: tTip, logT: logTTip, logL: logLTip, phase: "pn" },
    { t: tTip + 1e4, logT: 4.0, logL: logLTip, phase: "pn" },
    { t: tTip + 2.5e4, logT: 4.75, logL: logLTip - 0.05, phase: "pn" },
    { t: tTip + 4e4, logT: 5.15, logL: logLTip - 0.25, phase: "pn" },
    { t: tTip + 1.5e5, logT: 5.17, logL: 2.6, phase: "wd" }
  ];
  const logR = Math.log10(wdRadius);
  for (let logL = 1.5; logL >= -5.5; logL -= 0.25) {
    const logT = (logL - 2 * logR) / 4 + LOG_SUN_TEFF;
    keys.push({ t: tTip + whiteDwarfAge(10 ** logL, coolFactor), logT, logL, phase: "wd" });
  }
  return keys;
}

const RED_DWARF: Track = {
  id: "m0.2",
  mass: 0.2,
  label: "0.2 Sun",
  colour: "#ff7a4d",
  keys: [
    { t: 0, logT: 3.505, logL: -2.32, phase: "ms" },
    { t: 2e10, logT: 3.506, logL: -2.3, phase: "ms" },
    { t: 1e12, logT: 3.54, logL: -1.95, phase: "ms" }
  ],
  lifeEnd: 1e12,
  fate: "then slowly a white dwarf",
  lifeWords: "lives over a trillion years: no red dwarf has died yet"
};

const SUN_TIP_AGB = 12.33e9;
const SUN: Track = {
  id: "m1",
  mass: 1,
  label: "1 Sun",
  colour: "#ffd36b",
  keys: [
    { t: 0, logT: 3.748, logL: -0.15, phase: "ms" },
    { t: 4.6e9, logT: 3.7613, logL: 0.0, phase: "ms" },
    { t: 8.0e9, logT: 3.765, logL: 0.22, phase: "ms" },
    { t: 10.0e9, logT: 3.758, logL: 0.36, phase: "subgiant" },
    { t: 10.8e9, logT: 3.72, logL: 0.42, phase: "subgiant" },
    { t: 11.4e9, logT: 3.69, logL: 0.48, phase: "rgb" },
    { t: 11.85e9, logT: 3.675, logL: 0.9, phase: "rgb" },
    { t: 12.05e9, logT: 3.645, logL: 1.5, phase: "rgb" },
    { t: 12.13e9, logT: 3.6, logL: 2.2, phase: "rgb" },
    { t: 12.16e9, logT: 3.54, logL: 2.9, phase: "rgb" },
    { t: 12.17e9, logT: 3.465, logL: 3.4, phase: "rgb", instant: true, event: "flash" },
    { t: 12.1701e9, logT: 3.69, logL: 1.68, phase: "clump" },
    { t: 12.23e9, logT: 3.685, logL: 1.72, phase: "clump" },
    { t: 12.29e9, logT: 3.668, logL: 1.85, phase: "agb" },
    { t: 12.31e9, logT: 3.62, logL: 2.5, phase: "agb" },
    { t: 12.325e9, logT: 3.54, logL: 3.2, phase: "agb" },
    ...postAgb(SUN_TIP_AGB, 3.475, 3.55, 0.013, 1)
  ],
  lifeEnd: SUN_TIP_AGB + 1.5e5,
  fate: "then a white dwarf"
};

const TIP_3 = 4.47e8;
const B_STAR: Track = {
  id: "m3",
  mass: 3,
  label: "3 Suns",
  colour: "#dfe8ff",
  keys: [
    { t: 0, logT: 4.09, logL: 1.95, phase: "ms" },
    { t: 2.0e8, logT: 4.072, logL: 2.06, phase: "ms" },
    { t: 3.45e8, logT: 4.025, logL: 2.28, phase: "ms" },
    { t: 3.5e8, logT: 4.045, logL: 2.33, phase: "subgiant" },
    { t: 3.53e8, logT: 3.85, logL: 2.18, phase: "subgiant" },
    { t: 3.55e8, logT: 3.68, logL: 2.05, phase: "rgb" },
    { t: 3.565e8, logT: 3.635, logL: 2.3, phase: "rgb" },
    { t: 3.57e8, logT: 3.62, logL: 2.5, phase: "clump" },
    { t: 3.8e8, logT: 3.655, logL: 2.3, phase: "clump" },
    { t: 4.05e8, logT: 3.72, logL: 2.32, phase: "clump" },
    { t: 4.3e8, logT: 3.67, logL: 2.42, phase: "clump" },
    { t: 4.38e8, logT: 3.63, logL: 2.6, phase: "agb" },
    { t: 4.44e8, logT: 3.56, logL: 3.2, phase: "agb" },
    ...postAgb(TIP_3, 3.5, 3.75, 0.0105, 1.2)
  ],
  lifeEnd: TIP_3 + 1.5e5,
  fate: "then a white dwarf"
};

const SN_15 = 1.245e7;
const SUPERGIANT: Track = {
  id: "m15",
  mass: 15,
  label: "15 Suns",
  colour: "#5fc8ff",
  keys: [
    { t: 0, logT: 4.485, logL: 4.32, phase: "ms" },
    { t: 6e6, logT: 4.468, logL: 4.43, phase: "ms" },
    { t: 1.08e7, logT: 4.42, logL: 4.6, phase: "ms" },
    { t: 1.1e7, logT: 4.445, logL: 4.64, phase: "bsg" },
    { t: 1.103e7, logT: 4.25, logL: 4.7, phase: "bsg" },
    { t: 1.106e7, logT: 3.85, logL: 4.74, phase: "bsg" },
    { t: 1.11e7, logT: 3.62, logL: 4.78, phase: "rsg" },
    { t: 1.2e7, logT: 3.565, logL: 4.95, phase: "rsg" },
    { t: 1.244e7, logT: 3.545, logL: 5.07, phase: "late" },
    { t: SN_15, logT: 3.54, logL: 5.09, phase: "late", instant: true, event: "supernova" },
    { t: SN_15 + 1, logT: 3.54, logL: 5.09, phase: "ns" }
  ],
  lifeEnd: SN_15,
  fate: "then a supernova and a neutron star"
};

const END_40 = 5.45e6;
const GIANT_40: Track = {
  id: "m40",
  mass: 40,
  label: "40 Suns",
  colour: "#8f8cff",
  keys: [
    { t: 0, logT: 4.655, logL: 5.35, phase: "ms" },
    { t: 3.0e6, logT: 4.625, logL: 5.45, phase: "ms" },
    { t: 4.55e6, logT: 4.53, logL: 5.6, phase: "ms" },
    { t: 4.65e6, logT: 4.555, logL: 5.63, phase: "bsg" },
    { t: 4.72e6, logT: 4.3, logL: 5.67, phase: "bsg" },
    { t: 4.78e6, logT: 4.08, logL: 5.7, phase: "lbv" },
    { t: 4.95e6, logT: 4.15, logL: 5.66, phase: "lbv" },
    { t: 5.05e6, logT: 4.55, logL: 5.56, phase: "wr" },
    { t: 5.35e6, logT: 4.92, logL: 5.42, phase: "wr" },
    { t: END_40, logT: 5.05, logL: 5.36, phase: "wr", instant: true, event: "collapse" },
    { t: END_40 + 1, logT: 5.05, logL: 5.36, phase: "bh" }
  ],
  lifeEnd: END_40,
  fate: "then it collapses into a black hole"
};

/** Heaviest first: the order of the timeline rows. */
export const TRACKS: Track[] = [GIANT_40, SUPERGIANT, B_STAR, SUN, RED_DWARF];

export function trackById(id: string): Track {
  return TRACKS.find((t) => t.id === id) ?? SUN;
}

/** Where the Sun is today, for the "you are here" marker. */
export const SUN_TODAY = { t: 4.6e9, logT: LOG_SUN_TEFF, logL: 0 };

/** Index of the key at or before age t (the start of the current step). */
export function keyIndexAt(track: Track, t: number): number {
  const keys = track.keys;
  if (t < keys[0].t) {
    return 0;
  }
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export type PhaseSpan = { phase: PhaseId; start: number; end: number };

const spanCache = new Map<string, PhaseSpan[]>();

/** Consecutive keys with the same stage, merged into spans. The last span runs on for ever. */
export function phaseSpans(track: Track): PhaseSpan[] {
  const cached = spanCache.get(track.id);
  if (cached) {
    return cached;
  }
  const spans: PhaseSpan[] = [];
  for (const k of track.keys) {
    const last = spans[spans.length - 1];
    if (last && last.phase === k.phase) {
      continue;
    }
    if (last) {
      last.end = k.t;
    }
    spans.push({ phase: k.phase, start: k.t, end: Infinity });
  }
  spanCache.set(track.id, spans);
  return spans;
}

export function spanAt(track: Track, t: number): PhaseSpan {
  const spans = phaseSpans(track);
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].start <= t) {
      return spans[i];
    }
  }
  return spans[0];
}

/** Uniform Catmull-Rom between p1 and p2 at s ∈ [0, 1]. */
function catmull(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
}

/** Smooth position along step i (key i to key i+1) at fraction s; instant steps stay straight. */
export function positionOnStep(track: Track, i: number, s: number): { logT: number; logL: number } {
  const keys = track.keys;
  const a = keys[i];
  const b = keys[i + 1] ?? a;
  if (a.instant || b === a) {
    return { logT: a.logT + (b.logT - a.logT) * s, logL: a.logL + (b.logL - a.logL) * s };
  }
  const prev = i > 0 && !keys[i - 1].instant ? keys[i - 1] : a;
  const next = keys[i + 2] && !b.instant ? keys[i + 2] : b;
  return {
    logT: catmull(prev.logT, a.logT, b.logT, next.logT, s),
    logL: catmull(prev.logL, a.logL, b.logL, next.logL, s)
  };
}

export type StarState = {
  phase: PhaseId;
  onChart: boolean;
  logT: number;
  logL: number;
  /** Surface temperature (K), luminosity and radius (in Suns). */
  T: number;
  L: number;
  R: number;
  key: number;
};

export function radiusFrom(logT: number, logL: number): number {
  return Math.sqrt(10 ** logL) * (SUN_TEFF / 10 ** logT) ** 2;
}

export function starAt(track: Track, t: number): StarState {
  const i = keyIndexAt(track, t);
  const a = track.keys[i];
  const b = track.keys[i + 1];
  const s = b ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const p = positionOnStep(track, i, s);
  return {
    phase: a.phase,
    onChart: !isOffChart(a.phase),
    logT: p.logT,
    logL: p.logL,
    T: 10 ** p.logT,
    L: 10 ** p.logL,
    R: radiusFrom(p.logT, p.logL),
    key: i
  };
}

export type PathRun = { instant: boolean; pts: { t: number; logT: number; logL: number }[] };

const pathCache = new Map<string, PathRun[]>();

/** The whole on-chart path, sampled finely, split into solid runs and instant (dashed) jumps. */
export function trackPath(track: Track): PathRun[] {
  const cached = pathCache.get(track.id);
  if (cached) {
    return cached;
  }
  const runs: PathRun[] = [];
  const keys = track.keys;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (isOffChart(a.phase) || isOffChart(b.phase)) {
      continue;
    }
    const instant = Boolean(a.instant);
    let run = runs[runs.length - 1];
    if (!run || run.instant !== instant || instant) {
      run = { instant, pts: [{ t: a.t, logT: a.logT, logL: a.logL }] };
      runs.push(run);
    }
    const n = instant ? 1 : 12;
    for (let j = 1; j <= n; j++) {
      const s = j / n;
      const p = positionOnStep(track, i, s);
      run.pts.push({ t: a.t + (b.t - a.t) * s, ...p });
    }
  }
  pathCache.set(track.id, runs);
  return runs;
}

/** A star colour for a surface temperature, saturated a little so it reads on a dark screen. */
const COLOUR_STOPS: [number, [number, number, number]][] = [
  [2500, [255, 118, 58]],
  [3000, [255, 148, 78]],
  [3500, [255, 178, 108]],
  [4500, [255, 208, 150]],
  [5500, [255, 236, 200]],
  [6500, [255, 250, 240]],
  [8000, [225, 235, 255]],
  [10000, [200, 215, 255]],
  [15000, [175, 198, 255]],
  [25000, [150, 180, 255]],
  [40000, [135, 165, 255]],
  [100000, [125, 155, 255]]
];

export function starColour(T: number, alpha = 1): string {
  const logT = Math.log10(T);
  let rgb = COLOUR_STOPS[COLOUR_STOPS.length - 1][1];
  if (T <= COLOUR_STOPS[0][0]) {
    rgb = COLOUR_STOPS[0][1];
  } else {
    for (let i = 0; i < COLOUR_STOPS.length - 1; i++) {
      const [ta, ca] = COLOUR_STOPS[i];
      const [tb, cb] = COLOUR_STOPS[i + 1];
      if (T <= tb) {
        const f = (logT - Math.log10(ta)) / (Math.log10(tb) - Math.log10(ta));
        rgb = [0, 1, 2].map((c) => Math.round(ca[c] + (cb[c] - ca[c]) * f)) as [number, number, number];
        break;
      }
    }
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** "5.4 million years", "12.3 billion years", "350 thousand years". */
export function formatYears(t: number, unit = "years"): string {
  const fmt = (x: number): string => {
    const r = x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
    return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  if (t >= 1e12) return `${fmt(t / 1e12)} trillion ${unit}`;
  if (t >= 1e9) return `${fmt(t / 1e9)} billion ${unit}`;
  if (t >= 1e6) return `${fmt(t / 1e6)} million ${unit}`;
  if (t >= 1e3) return `${fmt(t / 1e3)} thousand ${unit}`;
  return `${Math.round(t)} ${unit}`;
}
