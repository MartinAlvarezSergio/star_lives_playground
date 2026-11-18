/**
 * Drawing for "Lives of stars": the HR diagram with tracks and moving stars, and the timeline
 * strip underneath. Everything is drawn in fixed logical units (VIEW_W × VIEW_H); the layout only
 * moves the plot so it stays clear of the overlay panels.
 */

import { T_END, T_START, type ClockMode } from "./clock";
import {
  formatYears,
  isOffChart,
  logLAtRadius,
  phaseSpans,
  PHASES,
  starAt,
  starColour,
  SUN_TODAY,
  trackPath,
  UNIVERSE_AGE,
  type EventKind,
  type PhaseGroup,
  type Track
} from "./tracks";

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const LOGT_HOT = 5.25;
export const LOGT_COOL = 3.4;
export const LOGL_MIN = -5;
export const LOGL_MAX = 6.6;

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.6)";
const BG = "#060a12";

export const GROUP_COLOURS: Record<PhaseGroup, string> = {
  ms: "#6fb3ff",
  giant: "#ff9a5c",
  end: "#c58cff",
  remnant: "rgba(200, 208, 225, 0.35)"
};

export const GROUP_NAMES: Record<PhaseGroup, string> = {
  ms: "Main sequence",
  giant: "Giant stages",
  end: "Last stages",
  remnant: "Remnant"
};

export type Layout = {
  /** HR plot rectangle. */
  px0: number;
  px1: number;
  py0: number;
  py1: number;
  /** Timeline strip: bars span tx0–tx1; rows start at ty0. */
  tx0: number;
  tx1: number;
  ty0: number;
  rowH: number;
  axisY: number;
};

const ROW_H = 23;

/** Plot and timeline placement, given the free horizontal band [left, right] and the number of rows. */
export function layoutFor(left: number, right: number, rows: number): Layout {
  const px0 = left + 84;
  const px1 = Math.max(px0 + 300, right - 22);
  const axisY = VIEW_H - 34;
  const ty0 = axisY - 8 - rows * ROW_H;
  return { px0, px1, py0: 96, py1: ty0 - 60, tx0: px0, tx1: px1, ty0, rowH: ROW_H, axisY };
}

export function xOf(l: Layout, logT: number): number {
  return l.px0 + ((LOGT_HOT - logT) / (LOGT_HOT - LOGT_COOL)) * (l.px1 - l.px0);
}

export function yOf(l: Layout, logL: number): number {
  return l.py1 - ((logL - LOGL_MIN) / (LOGL_MAX - LOGL_MIN)) * (l.py1 - l.py0);
}

/** Timeline axis: log of age for the smart clock, plain years for the steady clock. */
export function timeToX(l: Layout, t: number, mode: ClockMode): number {
  const f =
    mode === "smart"
      ? (Math.log10(Math.max(t, T_START)) - Math.log10(T_START)) / (Math.log10(T_END) - Math.log10(T_START))
      : t / T_END;
  return l.tx0 + Math.max(0, Math.min(1, f)) * (l.tx1 - l.tx0);
}

export function xToTime(l: Layout, x: number, mode: ClockMode): number {
  const f = Math.max(0, Math.min(1, (x - l.tx0) / (l.tx1 - l.tx0)));
  if (mode === "smart") {
    return 10 ** (Math.log10(T_START) + f * (Math.log10(T_END) - Math.log10(T_START)));
  }
  return f * T_END;
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  colour = INK,
  size = 13,
  align: CanvasTextAlign = "center",
  weight = 600
): number {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5, 7, 13, 0.85)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

/** On-screen size of a star dot: grows with the log of its radius (white dwarf 2 px, supergiant ~16 px). */
export function dotRadius(R: number): number {
  return Math.max(2.2, Math.min(17, 2.2 + 2.6 * (Math.log10(R) + 2)));
}

const ZAMS: [number, number][] = [
  [3.45, -3.0],
  [3.505, -2.32],
  [3.58, -1.4],
  [3.748, -0.15],
  [3.96, 1.2],
  [4.09, 1.95],
  [4.24, 2.75],
  [4.38, 3.6],
  [4.485, 4.32],
  [4.655, 5.35],
  [4.72, 5.8]
];

const SPECTRAL: { letter: string; hot: number; cool: number }[] = [
  { letter: "O", hot: 5.25, cool: Math.log10(30000) },
  { letter: "B", hot: Math.log10(30000), cool: 4 },
  { letter: "A", hot: 4, cool: Math.log10(7500) },
  { letter: "F", hot: Math.log10(7500), cool: Math.log10(6000) },
  { letter: "G", hot: Math.log10(6000), cool: Math.log10(5200) },
  { letter: "K", hot: Math.log10(5200), cool: Math.log10(3700) },
  { letter: "M", hot: Math.log10(3700), cool: 3.4 }
];

const T_TICKS = [100000, 50000, 20000, 10000, 6000, 4000, 3000];
const L_TICKS: [number, string][] = [
  [-4, "1/10,000"],
  [-2, "1/100"],
  [0, "1"],
  [2, "100"],
  [4, "10,000"],
  [6, "1,000,000"]
];

const SIZE_LINES: { logR: number; label: string; at: number }[] = [
  { logR: 3, label: "1000 × the Sun's size", at: 3.5 },
  { logR: 2, label: "100 ×", at: 3.47 },
  { logR: 0, label: "Sun-sized", at: 4.45 },
  { logR: -2, label: "Earth-sized (1/100 ×)", at: 4.62 }
];

/** Keep rotated text upright. */
function upright(angle: number): number {
  if (angle > Math.PI / 2) return angle - Math.PI;
  if (angle < -Math.PI / 2) return angle + Math.PI;
  return angle;
}

function clipPlot(ctx: CanvasRenderingContext2D, l: Layout): void {
  ctx.beginPath();
  ctx.rect(l.px0, l.py0, l.px1 - l.px0, l.py1 - l.py0);
  ctx.clip();
}

function drawBackdrop(ctx: CanvasRenderingContext2D, l: Layout, showSizes: boolean): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Plot panel.
  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  ctx.fillRect(l.px0, l.py0, l.px1 - l.px0, l.py1 - l.py0);

  ctx.save();
  clipPlot(ctx, l);

  // Main-sequence band.
  ctx.beginPath();
  ZAMS.forEach(([t, L], i) => (i === 0 ? ctx.moveTo(xOf(l, t), yOf(l, L - 0.2)) : ctx.lineTo(xOf(l, t), yOf(l, L - 0.2))));
  for (let i = ZAMS.length - 1; i >= 0; i--) {
    const [t, L] = ZAMS[i];
    ctx.lineTo(xOf(l, t - 0.02), yOf(l, L + 0.55));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(111, 179, 255, 0.08)";
  ctx.fill();

  // Giants and supergiants regions (soft blobs).
  const blob = (logT: number, logL: number, rx: number, ry: number, colour: string): void => {
    const x = xOf(l, logT);
    const y = yOf(l, logL);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 1);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  blob(3.64, 2.0, 70, 75, "rgba(255, 154, 92, 0.10)");
  blob(3.9, 5.2, 260, 40, "rgba(255, 210, 160, 0.06)");

  // White-dwarf strip.
  ctx.beginPath();
  ctx.moveTo(xOf(l, 5.1), yOf(l, logLAtRadius(-1.75, 5.1)));
  ctx.lineTo(xOf(l, 3.65), yOf(l, logLAtRadius(-1.75, 3.65)));
  ctx.lineTo(xOf(l, 3.65), yOf(l, logLAtRadius(-2.05, 3.65)));
  ctx.lineTo(xOf(l, 5.1), yOf(l, logLAtRadius(-2.05, 5.1)));
  ctx.closePath();
  ctx.fillStyle = "rgba(220, 228, 255, 0.06)";
  ctx.fill();

  // Lines of equal size.
  if (showSizes) {
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(235, 232, 226, 0.16)";
    for (const s of SIZE_LINES) {
      ctx.beginPath();
      ctx.moveTo(xOf(l, LOGT_HOT), yOf(l, logLAtRadius(s.logR, LOGT_HOT)));
      ctx.lineTo(xOf(l, LOGT_COOL), yOf(l, logLAtRadius(s.logR, LOGT_COOL)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const angle = Math.atan2(yOf(l, 4) - yOf(l, 0), xOf(l, 4.761) - xOf(l, 3.761));
    for (const s of SIZE_LINES) {
      const x = xOf(l, s.at);
      const y = yOf(l, logLAtRadius(s.logR, s.at));
      if (y < l.py0 + 10 || y > l.py1 - 10) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(upright(angle));
      text(ctx, s.label, 0, -7, "rgba(235, 232, 226, 0.38)", 10.5, "center", 500);
      ctx.restore();
    }
  }
  ctx.restore();

  // Region labels.
  const msAngle = Math.atan2(yOf(l, 2.75) - yOf(l, 1.2), xOf(l, 4.24) - xOf(l, 3.96));
  ctx.save();
  ctx.translate(xOf(l, 4.18), yOf(l, 2.0));
  ctx.rotate(upright(msAngle));
  text(ctx, "MAIN SEQUENCE", 0, 18, "rgba(111, 179, 255, 0.55)", 12, "center", 700);
  ctx.restore();
  text(ctx, "GIANTS", xOf(l, 3.57), yOf(l, 1.15), "rgba(255, 154, 92, 0.55)", 12, "center", 700);
  text(ctx, "SUPERGIANTS", xOf(l, 3.95), yOf(l, 6.25), "rgba(255, 210, 160, 0.5)", 12, "center", 700);
  const wdAngle = Math.atan2(yOf(l, logLAtRadius(-1.9, 4.6)) - yOf(l, logLAtRadius(-1.9, 4.2)), xOf(l, 4.6) - xOf(l, 4.2));
  ctx.save();
  ctx.translate(xOf(l, 4.3), yOf(l, logLAtRadius(-1.9, 4.3)));
  ctx.rotate(upright(wdAngle));
  text(ctx, "WHITE DWARFS", 0, 16, "rgba(220, 228, 255, 0.5)", 12, "center", 700);
  ctx.restore();

  // Frame and axes.
  ctx.strokeStyle = "rgba(235, 232, 226, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(l.px0, l.py0, l.px1 - l.px0, l.py1 - l.py0);

  // Temperature colour strip under the plot.
  const strip = ctx.createLinearGradient(l.px0, 0, l.px1, 0);
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    strip.addColorStop(f, starColour(10 ** (LOGT_HOT - f * (LOGT_HOT - LOGT_COOL)), 0.9));
  }
  ctx.fillStyle = strip;
  ctx.fillRect(l.px0, l.py1 + 1, l.px1 - l.px0, 4);

  for (const T of T_TICKS) {
    const x = xOf(l, Math.log10(T));
    ctx.strokeStyle = "rgba(235, 232, 226, 0.35)";
    ctx.beginPath();
    ctx.moveTo(x, l.py1);
    ctx.lineTo(x, l.py1 + 8);
    ctx.stroke();
    text(ctx, T.toLocaleString("en-US"), x, l.py1 + 17, MUTED, 11, "center", 500);
  }
  text(ctx, "← hotter        Surface temperature (K)        cooler →", (l.px0 + l.px1) / 2, l.py1 + 34, MUTED, 12, "center", 600);

  for (const [logL, label] of L_TICKS) {
    const y = yOf(l, logL);
    ctx.strokeStyle = "rgba(235, 232, 226, 0.35)";
    ctx.beginPath();
    ctx.moveTo(l.px0 - 6, y);
    ctx.lineTo(l.px0, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(235, 232, 226, 0.05)";
    ctx.beginPath();
    ctx.moveTo(l.px0, y);
    ctx.lineTo(l.px1, y);
    ctx.stroke();
    text(ctx, label, l.px0 - 9, y, MUTED, 11, "right", 500);
  }
  ctx.save();
  ctx.translate(l.px0 - 68, (l.py0 + l.py1) / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "Brightness (× the Sun)  →  brighter", 0, 0, MUTED, 12, "center", 600);
  ctx.restore();

  // Spectral letters along the top.
  for (const s of SPECTRAL) {
    const x0 = xOf(l, s.hot);
    const x1 = xOf(l, s.cool);
    const mid = s.letter === "O" ? xOf(l, 4.68) : (x0 + x1) / 2;
    text(ctx, s.letter, mid, l.py0 - 11, starColour(10 ** ((s.hot + s.cool) / 2), 0.95), 12, "center", 700);
    if (s.letter !== "O") {
      ctx.strokeStyle = "rgba(235, 232, 226, 0.2)";
      ctx.beginPath();
      ctx.moveTo(x0, l.py0 - 18);
      ctx.lineTo(x0, l.py0 - 4);
      ctx.stroke();
    }
  }
}

export type SceneEvent = { kind: EventKind; trackId: string; logT: number; logL: number; wall0: number };

export type DrawnStar = { id: string; x: number; y: number; r: number };

export type SceneInput = {
  layout: Layout;
  tracks: Track[];
  t: number;
  followId: string;
  showAhead: boolean;
  showSizes: boolean;
  events: SceneEvent[];
  wall: number;
  clock: number;
  mode: ClockMode;
  reducedMotion: boolean;
  /** Label each star with its stage (single-star view) or only the followed one. */
  labelAll: boolean;
};

function strokeRun(ctx: CanvasRenderingContext2D, l: Layout, pts: { logT: number; logL: number }[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(l, p.logT), yOf(l, p.logL)) : ctx.lineTo(xOf(l, p.logT), yOf(l, p.logL))));
  ctx.stroke();
}

function drawTracks(ctx: CanvasRenderingContext2D, s: SceneInput): void {
  const l = s.layout;
  ctx.save();
  clipPlot(ctx, l);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const track of s.tracks) {
    const runs = trackPath(track);
    if (s.showAhead) {
      ctx.strokeStyle = track.colour;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.2;
      for (const run of runs) {
        ctx.setLineDash(run.instant ? [2, 5] : [4, 4]);
        strokeRun(ctx, l, run.pts);
      }
      ctx.setLineDash([]);
    }
    // The path already travelled, solid.
    const now = starAt(track, s.t);
    ctx.globalAlpha = track.id === s.followId ? 0.95 : 0.7;
    ctx.strokeStyle = track.colour;
    ctx.lineWidth = track.id === s.followId ? 2.2 : 1.6;
    for (const run of runs) {
      if (run.pts[0].t > s.t) break;
      const pts = run.pts.filter((p) => p.t <= s.t);
      if (now.onChart && run.pts[run.pts.length - 1].t > s.t) {
        pts.push({ t: s.t, logT: now.logT, logL: now.logL });
      }
      ctx.setLineDash(run.instant ? [2, 5] : []);
      strokeRun(ctx, l, pts);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Labels at each track's starting point (zero-age main sequence).
  for (const track of s.tracks) {
    const k = track.keys[0];
    const x = xOf(l, k.logT);
    const y = yOf(l, k.logL);
    ctx.fillStyle = track.colour;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, track.label, x - 10, y + 12, track.colour, 12, "right", 700);
  }

  // The Sun today.
  if (s.tracks.some((t) => t.id === "m1")) {
    const x = xOf(l, SUN_TODAY.logT);
    const y = yOf(l, SUN_TODAY.logL);
    ctx.strokeStyle = "rgba(255, 211, 107, 0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 4);
    ctx.lineTo(x + 22, y - 20);
    ctx.stroke();
    text(ctx, "the Sun today", x + 24, y - 26, "rgba(255, 211, 107, 0.9)", 11, "left", 600);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, T: number, glow: number): void {
  const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * (2.6 + glow));
  halo.addColorStop(0, starColour(T, 0.55));
  halo.addColorStop(1, starColour(T, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * (2.6 + glow), 0, Math.PI * 2);
  ctx.fill();
  const disc = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
  disc.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  disc.addColorStop(0.45, starColour(T, 1));
  disc.addColorStop(1, starColour(T, 0.85));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** How long (wall-clock seconds) the supernova effect lasts on screen. */
export const SUPERNOVA_SECONDS = 7;

function hash01(i: number): number {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

const easeOut = (f: number): number => 1 - (1 - Math.min(1, Math.max(0, f))) ** 3;

/** Debris: fixed random directions and speeds, so every explosion looks the same and never flickers. */
const DEBRIS = Array.from({ length: 70 }, (_, i) => ({
  angle: hash01(i) * Math.PI * 2,
  speed: 90 + 260 * hash01(i + 100) ** 1.5,
  size: 1 + 2.2 * hash01(i + 200),
  hue: hash01(i + 300)
}));

/** A wobbly shell of glowing filaments: the supernova remnant left expanding behind. */
const FILAMENTS = Array.from({ length: 34 }, (_, i) => ({
  angle: (i / 34) * Math.PI * 2 + 0.15 * hash01(i + 400),
  wobble: 0.75 + 0.5 * hash01(i + 500),
  red: hash01(i + 600) > 0.45
}));

/**
 * The supernova, in wall-clock seconds since it went off: a flash that lights up the whole screen,
 * a blinding point with spikes, shock rings, flying debris, and a glowing remnant shell that
 * keeps expanding as it fades.
 */
function drawSupernova(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, reducedMotion: boolean): void {
  const fade = (start: number, end: number): number => Math.max(0, Math.min(1, 1 - (age - start) / (end - start)));
  ctx.save();

  // 1. Whole-screen flash.
  const flash = fade(0, reducedMotion ? 0.2 : 0.45);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 252, 240, ${(reducedMotion ? 0.25 : 0.6) * flash})`;
    ctx.fillRect(-40, -40, VIEW_W + 80, VIEW_H + 80);
  }

  ctx.globalCompositeOperation = "lighter";

  // 2. Blinding core and spikes.
  const core = fade(0, 2.6);
  if (core > 0) {
    const R = 40 + 150 * easeOut(age / 0.8);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(255, 255, 255, ${core})`);
    g.addColorStop(0.15, `rgba(220, 235, 255, ${0.85 * core})`);
    g.addColorStop(0.45, `rgba(140, 180, 255, ${0.35 * core})`);
    g.addColorStop(1, "rgba(80, 120, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    const len = 60 + 260 * easeOut(age / 0.5);
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const sp = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
      sp.addColorStop(0, `rgba(255, 255, 255, ${0.9 * core})`);
      sp.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = sp;
      ctx.lineWidth = 3 * core + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // 3. Shock rings racing outwards.
  const rings: [number, string][] = [
    [0, "255, 255, 255"],
    [0.18, "150, 220, 255"],
    [0.4, "255, 170, 90"]
  ];
  for (const [delay, rgb] of rings) {
    const f = (age - delay) / 2.4;
    if (f <= 0 || f >= 1) continue;
    ctx.strokeStyle = `rgba(${rgb}, ${0.8 * (1 - f)})`;
    ctx.lineWidth = 6 * (1 - f) + 1;
    ctx.beginPath();
    ctx.arc(x, y, 10 + 420 * easeOut(f), 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Debris streaking out, slowing and cooling from white to orange.
  if (!reducedMotion && age < 3.5) {
    const f = age / 3.5;
    for (const d of DEBRIS) {
      const r = d.speed * easeOut(age / 2.2);
      const r0 = Math.max(0, r - 25 * (1 - f));
      const cx = Math.cos(d.angle);
      const cy = Math.sin(d.angle);
      const hot = 1 - f;
      const col = d.hue > 0.6 ? `255, ${Math.round(180 + 75 * hot)}, ${Math.round(110 + 145 * hot)}` : `${Math.round(200 + 55 * hot)}, ${Math.round(220 + 35 * hot)}, 255`;
      ctx.strokeStyle = `rgba(${col}, ${0.9 * (1 - f)})`;
      ctx.lineWidth = d.size;
      ctx.beginPath();
      ctx.moveTo(x + cx * r0, y + cy * r0);
      ctx.lineTo(x + cx * r, y + cy * r);
      ctx.stroke();
    }
  }

  // 5. The remnant: a glowing, filamentary shell that keeps growing as it fades.
  const shell = Math.min(1, (age - 0.6) / 0.8) * fade(3.5, SUPERNOVA_SECONDS);
  if (shell > 0) {
    const R = 25 + 32 * age;
    for (const fl of FILAMENTS) {
      const rr = R * fl.wobble;
      const fx = x + Math.cos(fl.angle) * rr;
      const fy = y + Math.sin(fl.angle) * rr;
      const blob = 6 + 0.12 * rr;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, blob);
      g.addColorStop(0, fl.red ? `rgba(255, 110, 90, ${0.55 * shell})` : `rgba(110, 230, 210, ${0.5 * shell})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, blob, 0, Math.PI * 2);
      ctx.fill();
    }
    const haze = ctx.createRadialGradient(x, y, R * 0.3, x, y, R * 1.1);
    haze.addColorStop(0, "rgba(120, 150, 255, 0)");
    haze.addColorStop(0.8, `rgba(170, 130, 255, ${0.14 * shell})`);
    haze.addColorStop(1, "rgba(170, 130, 255, 0)");
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // 6. The word, popping in big and settling.
  const words = fade(3.2, 4.6);
  if (words > 0 && age > 0.08) {
    const pop = reducedMotion ? 1 : 1 + 0.5 * Math.max(0, 1 - age / 0.35);
    text(ctx, "SUPERNOVA!", x - 20, y + 48, `rgba(255, 255, 255, ${words})`, Math.round(28 * pop), "right", 900);
    if (age > 0.6) {
      text(ctx, "brighter than a whole galaxy, for weeks", x - 20, y + 74, `rgba(220, 230, 255, ${0.85 * words * Math.min(1, (age - 0.6) / 0.4)})`, 12.5, "right", 600);
    }
  }
}

/** Screen shake for a moment after a supernova (none with reduced motion). */
function shakeFor(s: SceneInput): { dx: number; dy: number } {
  if (s.reducedMotion) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  for (const e of s.events) {
    const age = s.wall - e.wall0;
    if (e.kind === "supernova" && age < 0.7) {
      const amp = 9 * (1 - age / 0.7) ** 2;
      dx += amp * Math.sin(age * 83);
      dy += amp * Math.cos(age * 67);
    }
  }
  return { dx, dy };
}

function drawEvents(ctx: CanvasRenderingContext2D, s: SceneInput): void {
  const l = s.layout;
  for (const e of s.events) {
    const age = s.wall - e.wall0;
    const x = xOf(l, e.logT);
    const y = yOf(l, e.logL);
    if (e.kind === "flash" && age < 2.2) {
      const f = age / 2.2;
      ctx.strokeStyle = `rgba(255, 220, 120, ${0.9 * (1 - f)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6 + 26 * f, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, "Helium flash!", x + 14, y - 22, `rgba(255, 220, 120, ${1 - f * 0.7})`, 13, "left", 700);
    } else if (e.kind === "supernova" && age < SUPERNOVA_SECONDS) {
      drawSupernova(ctx, x, y, age, s.reducedMotion);
    } else if (e.kind === "collapse" && age < 3.5) {
      const f = age / 3.5;
      ctx.strokeStyle = `rgba(255, 170, 90, ${0.9 * (1 - f)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 40 * (1 - f) + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.9 * (1 - f)})`;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, "Collapse: a black hole", x + 14, y - 26, `rgba(255, 190, 120, ${1 - f * 0.6})`, 14, "left", 800);
    }
  }
}

function drawRemnantTray(ctx: CanvasRenderingContext2D, s: SceneInput): void {
  const l = s.layout;
  const gone = s.tracks.filter((tr) => isOffChart(starAt(tr, s.t).phase));
  if (gone.length === 0) return;
  const x0 = l.px0 + 10;
  const h = 26 + gone.length * 22;
  const y0 = l.py1 - 10 - h;
  const w = 238;
  ctx.fillStyle = "rgba(10, 14, 24, 0.85)";
  ctx.strokeStyle = "rgba(235, 232, 226, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 8);
  ctx.fill();
  ctx.stroke();
  text(ctx, "Off the chart: too small and dim to plot", x0 + 10, y0 + 13, MUTED, 10.5, "left", 600);
  gone.forEach((tr, i) => {
    const phase = starAt(tr, s.t).phase;
    const y = y0 + 34 + i * 22;
    const x = x0 + 18;
    if (phase === "bh") {
      ctx.strokeStyle = "rgba(255, 170, 90, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawStar(ctx, x, y, 2, 6e5, 0.5);
    }
    text(ctx, `${PHASES[phase].name} (from the ${tr.label} star)`, x + 14, y, tr.colour, 11.5, "left", 600);
  });
}

export function renderScene(ctx: CanvasRenderingContext2D, s: SceneInput): DrawnStar[] {
  const l = s.layout;
  // Fill first, unshaken, so a shake never shows the canvas edge.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const shake = shakeFor(s);
  ctx.save();
  ctx.translate(shake.dx, shake.dy);
  drawBackdrop(ctx, l, s.showSizes);
  drawTracks(ctx, s);
  drawRemnantTray(ctx, s);

  const drawn: DrawnStar[] = [];
  ctx.save();
  clipPlot(ctx, l);
  for (const track of s.tracks) {
    const st = starAt(track, s.t);
    if (!st.onChart || st.logL < LOGL_MIN - 0.5) continue;
    const x = xOf(l, st.logT);
    const y = yOf(l, st.logL);
    const r = dotRadius(st.R);
    // A planetary nebula: the shed outer layers, expanding round the bare core.
    if (st.phase === "pn" || (st.phase === "wd" && s.t - phaseStart(track, "wd") < 3e5)) {
      const span = phaseSpans(track).find((p) => p.phase === "pn");
      if (span) {
        const f = Math.min(1, (s.t - span.start) / 3.5e5);
        const nr = 10 + 46 * Math.sqrt(f);
        ctx.strokeStyle = `rgba(150, 230, 210, ${0.55 * (1 - f)})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, nr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(200, 140, 255, ${0.5 * (1 - f)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, nr + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    let pulse = s.reducedMotion ? 0 : 0.25 * Math.sin(s.clock * 2.4 + track.mass);
    // In its last stages the core is about to give way: the star flickers and throbs.
    if (st.phase === "late" && !s.reducedMotion) {
      pulse += 1.1 * Math.abs(Math.sin(s.clock * 9)) + 0.5 * Math.abs(Math.sin(s.clock * 23));
    }
    drawStar(ctx, x, y, r, st.T, pulse + (st.phase === "wd" ? 0 : 0.4));
    drawn.push({ id: track.id, x, y, r });
    if (track.id === s.followId && s.tracks.length > 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();

  // Stage labels next to the stars.
  for (const track of s.tracks) {
    const st = starAt(track, s.t);
    const d = drawn.find((q) => q.id === track.id);
    if (!d || !(s.labelAll || track.id === s.followId)) continue;
    const right = d.x < (l.px0 + l.px1) / 2 + 120;
    text(ctx, PHASES[st.phase].name, d.x + (right ? 1 : -1) * (d.r + 12), d.y - d.r - 8, INK, 12.5, right ? "left" : "right", 700);
  }

  drawEvents(ctx, s);
  ctx.restore();
  return drawn;
}

function phaseStart(track: Track, phase: string): number {
  return phaseSpans(track).find((p) => p.phase === phase)?.start ?? Infinity;
}

// ---------------------------------------------------------------- timeline

const T_TICKS_LOG: [number, string][] = [
  [1e5, "100 thousand"],
  [1e6, "1 million"],
  [1e7, "10 million"],
  [1e8, "100 million"],
  [1e9, "1 billion"],
  [1e10, "10 billion years"]
];

function lifeWords(track: Track): string {
  return track.lifeWords ?? `lives ${formatYears(track.lifeEnd)}, ${track.fate}`;
}

export function renderTimeline(ctx: CanvasRenderingContext2D, l: Layout, tracks: Track[], t: number, mode: ClockMode, followId: string): void {
  const tx = (x: number): number => timeToX(l, x, mode);

  tracks.forEach((track, i) => {
    const y = l.ty0 + i * l.rowH;
    const barY = y + 12;
    // Row words.
    const w = text(ctx, track.label, l.tx0, y + 5, track.colour, 11.5, "left", 800);
    text(ctx, ` · ${lifeWords(track)}`, l.tx0 + w, y + 5, track.id === followId ? INK : MUTED, 11, "left", 500);
    // Stage bars.
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(l.tx0, barY, l.tx1 - l.tx0, 8);
    for (const span of phaseSpans(track)) {
      const a = tx(span.start);
      const b = tx(Math.min(span.end, T_END));
      if (b <= l.tx0 || span.start >= T_END) continue;
      const group = PHASES[span.phase].group;
      ctx.fillStyle = GROUP_COLOURS[group];
      // Short stages stay visible as at least a sliver.
      ctx.fillRect(a, barY, Math.max(b - a, group === "remnant" ? 0 : 1.5), 8);
    }
    if (track.lifeEnd > T_END) {
      // The red dwarf: an arrow off the end.
      ctx.fillStyle = GROUP_COLOURS.ms;
      ctx.beginPath();
      ctx.moveTo(l.tx1 + 1, barY - 2);
      ctx.lineTo(l.tx1 + 9, barY + 4);
      ctx.lineTo(l.tx1 + 1, barY + 10);
      ctx.fill();
    }
  });

  const rowsEnd = l.ty0 + tracks.length * l.rowH;

  // Axis.
  ctx.strokeStyle = "rgba(235, 232, 226, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(l.tx0, rowsEnd + 2);
  ctx.lineTo(l.tx1, rowsEnd + 2);
  ctx.stroke();
  const ticks: [number, string][] =
    mode === "smart"
      ? T_TICKS_LOG
      : [0, 2e9, 4e9, 6e9, 8e9, 10e9, 12e9, 14e9, 16e9, 18e9].map((v) => [v, v === 0 ? "0" : `${v / 1e9} billion`]);
  ticks.forEach(([v, label]) => {
    const x = tx(v);
    ctx.beginPath();
    ctx.moveTo(x, rowsEnd + 2);
    ctx.lineTo(x, rowsEnd + 7);
    ctx.stroke();
    text(ctx, label, x, rowsEnd + 15, MUTED, 10.5, v === ticks[0][0] ? "left" : "center", 500);
  });

  // Today's Universe.
  const xu = tx(UNIVERSE_AGE);
  ctx.strokeStyle = "rgba(235, 232, 226, 0.35)";
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(xu, l.ty0 - 2);
  ctx.lineTo(xu, rowsEnd + 2);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, "Universe today", xu, l.ty0 - 8, "rgba(235, 232, 226, 0.55)", 10, "center", 600);

  // The shared clock: one cursor for every star.
  const xc = tx(t);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xc, l.ty0 + 8);
  ctx.lineTo(xc, rowsEnd + 2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(xc - 6, rowsEnd + 10);
  ctx.lineTo(xc + 6, rowsEnd + 10);
  ctx.lineTo(xc, rowsEnd + 3);
  ctx.closePath();
  ctx.fill();

  // Legend and axis name.
  let x = l.tx0;
  const ly = l.axisY + 22;
  (Object.keys(GROUP_COLOURS) as PhaseGroup[]).forEach((g) => {
    ctx.fillStyle = GROUP_COLOURS[g];
    ctx.fillRect(x, ly - 4, 10, 8);
    x += 14 + text(ctx, GROUP_NAMES[g], x + 14, ly, MUTED, 10.5, "left", 500) + 14;
  });
  const caption = mode === "smart" ? "Age (each step is 10 × longer) · drag to scrub" : "Age (even steps) · drag to scrub";
  ctx.font = "500 10.5px system-ui, sans-serif";
  if (l.tx1 - ctx.measureText(caption).width > x + 8) {
    text(ctx, caption, l.tx1, ly, MUTED, 10.5, "right", 500);
  }
}
