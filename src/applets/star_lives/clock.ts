/**
 * The shared clock. Every star on screen always has the same age; only how fast that age
 * advances on screen changes.
 *
 * - Smart clock: the age grows by a steady factor per second (a log clock), but slows down
 *   whenever any star on screen is moving fast across the diagram or is in a short stage, so each
 *   stage stays visible for at least about a second. The readout always shows the true age.
 * - Steady clock: a fixed number of years per second, which shows the real contrast in lifetimes.
 */

import { isOffChart, keyIndexAt, PHASES, spanAt, type EventKind, type Track } from "./tracks";

/** The smart clock starts here: nothing visible happens to any star before 100,000 years. */
export const T_START = 1e5;
/** Both clocks stop here (20 billion years: past today's Universe age and the Sun's death). */
export const T_END = 2e10;

/** Smart clock: decades of age per second when nothing is happening. */
export const BASE_DEX_PER_S = 0.2;
/** Smart clock: each stage of a star on screen lasts at least this long (s). */
export const MIN_STAGE_SECONDS = 1.2;
/** Smart clock: no star moves faster than this across the diagram (nominal px/s). */
export const MAX_PX_PER_S = 300;
/** Nominal diagram scale for the speed limit, so the clock does not depend on the layout. */
const PX_PER_DEX_T = 450;
const PX_PER_DEX_L = 38;

export type ClockMode = "smart" | "steady";

/**
 * When the run stops. With one star that ends as a neutron star or black hole there is nothing
 * left to watch, so the clock stops a little after its death; otherwise it runs to T_END.
 */
export function runEnd(tracks: Track[]): number {
  if (tracks.length === 1) {
    const last = tracks[0].keys[tracks[0].keys.length - 1];
    if (isOffChart(last.phase)) {
      return Math.min(T_END, tracks[0].lifeEnd * 1.5);
    }
  }
  return T_END;
}

export type Crossing = { track: Track; key: number; t: number; event?: EventKind; stageChange: boolean };

export type StepResult = { t: number; crossings: Crossing[]; stopped: boolean; ended: boolean };

/** Smart clock rate (decades of age per second) at age t, before the speed multiplier. */
export function smartRate(tracks: Track[], t: number): number {
  let rate = BASE_DEX_PER_S;
  for (const track of tracks) {
    const i = keyIndexAt(track, t);
    const a = track.keys[i];
    const b = track.keys[i + 1];
    if (!b || a.instant || isOffChart(a.phase) || PHASES[a.phase].group === "remnant") {
      continue;
    }
    // Speed across the (nominal) diagram, in px per decade of age.
    const dist = Math.hypot((b.logT - a.logT) * PX_PER_DEX_T, (b.logL - a.logL) * PX_PER_DEX_L);
    const pxPerDex = (dist / (b.t - a.t)) * t * Math.LN10;
    if (pxPerDex > 0) {
      rate = Math.min(rate, MAX_PX_PER_S / pxPerDex);
    }
    // Short stages get at least MIN_STAGE_SECONDS on screen.
    const span = spanAt(track, t);
    if (Number.isFinite(span.end)) {
      const dex = Math.log10(span.end / Math.max(span.start, T_START));
      if (dex > 0) {
        rate = Math.min(rate, dex / MIN_STAGE_SECONDS);
      }
    }
  }
  return rate;
}

/** Years per second shown by the smart clock at age t. */
export function smartYearsPerSecond(tracks: Track[], t: number, mult: number): number {
  return mult * smartRate(tracks, t) * t * Math.LN10;
}

function nextKeyTime(tracks: Track[], t: number): number {
  let next = Infinity;
  for (const track of tracks) {
    const k = track.keys[keyIndexAt(track, t) + 1];
    if (k && k.t > t) {
      next = Math.min(next, k.t);
    } else if (t < track.keys[0].t) {
      next = Math.min(next, track.keys[0].t);
    }
  }
  return next;
}

function crossing(track: Track, key: number): Crossing {
  const k = track.keys[key];
  const prev = track.keys[key - 1];
  return { track, key, t: k.t, event: k.event, stageChange: Boolean(k.event) || (prev !== undefined && prev.phase !== k.phase) };
}

/** Keys passed when the age goes from t0 (excluded) to t1 (included), in time order. */
export function crossingsBetween(tracks: Track[], t0: number, t1: number): Crossing[] {
  const out: Crossing[] = [];
  for (const track of tracks) {
    track.keys.forEach((k, i) => {
      if (k.t > t0 && k.t <= t1 && i > 0) {
        out.push(crossing(track, i));
      }
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * An instant step (the helium flash, a supernova, a collapse) is never left half-done: once its
 * start is reached the clock jumps to its end, so a paused clock never shows a star that has
 * already exploded.
 */
function skipInstant(tracks: Track[], t: number, here: Crossing[]): { t: number; extra: Crossing[] } {
  let to = t;
  for (const c of here) {
    if (c.track.keys[c.key].instant) {
      to = Math.max(to, c.track.keys[c.key + 1]?.t ?? to);
    }
  }
  return to > t ? { t: to, extra: crossingsBetween(tracks, t, to) } : { t, extra: [] };
}

export function stepSmart(tracks: Track[], t: number, wallDt: number, mult: number, stopAtStage: boolean, tEnd = T_END): StepResult {
  let tt = Math.max(t, T_START);
  let remaining = wallDt;
  const crossings: Crossing[] = [];
  for (let iter = 0; iter < 2000 && remaining > 0; iter++) {
    const r = mult * smartRate(tracks, tt);
    const tb = Math.min(nextKeyTime(tracks, tt), tEnd);
    const u = Math.log10(tt);
    const need = (Math.log10(tb) - u) / r;
    if (need > remaining) {
      tt = Math.min(10 ** (u + r * remaining), tb);
      remaining = 0;
      if (tt < tb) {
        break;
      }
    } else {
      remaining -= need;
    }
    tt = tb;
    const here = crossingsBetween(tracks, tb - Math.max(1e-9 * tb, 1e-6), tb);
    const skip = skipInstant(tracks, tt, here);
    tt = skip.t;
    here.push(...skip.extra);
    crossings.push(...here);
    if (tb >= tEnd) {
      return { t: tEnd, crossings, stopped: false, ended: true };
    }
    if (stopAtStage && here.some((c) => c.stageChange)) {
      return { t: tt, crossings, stopped: true, ended: false };
    }
  }
  return { t: tt, crossings, stopped: false, ended: false };
}

export function stepSteady(tracks: Track[], t: number, wallDt: number, yearsPerSecond: number, stopAtStage: boolean, tEnd = T_END): StepResult {
  let t1 = Math.min(t + yearsPerSecond * wallDt, tEnd);
  let crossings = crossingsBetween(tracks, t, t1);
  let stopped = false;
  if (stopAtStage) {
    const first = crossings.find((c) => c.stageChange);
    if (first) {
      const atStop = crossings.filter((c) => c.t === first.t);
      const skip = skipInstant(tracks, first.t, atStop);
      t1 = skip.t;
      crossings = [...crossings.filter((c) => c.t <= first.t), ...skip.extra];
      stopped = true;
    }
  }
  return { t: t1, crossings, stopped, ended: t1 >= tEnd };
}
