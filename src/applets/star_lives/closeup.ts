/**
 * Close-up of one star, drawn to scale against something familiar: Earth for a white dwarf, the
 * Sun for ordinary stars, and Earth's orbit for giants. Neutron stars and black holes get a sketch.
 */

import { PHASES, starAt, starColour, type Track } from "./tracks";

export const CLOSE_W = 270;
export const CLOSE_H = 212;

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.62)";

const EARTH_R = 0.00917;
const AU_R = 215;

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, colour = INK, size = 12, align: CanvasTextAlign = "center", weight = 600): void {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, colour: string, size: number): void {
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  const words = s.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      text(ctx, line, x, yy, colour, size, "center", 500);
      line = w;
      yy += size + 3;
    } else {
      line = next;
    }
  }
  if (line) text(ctx, line, x, yy, colour, size, "center", 500);
}

function sizeWords(R: number): string {
  if (R < 0.05) return `${(R / EARTH_R).toFixed(1)} × Earth's size`;
  if (R < 3) return `${R.toFixed(R < 1 ? 2 : 1)} × the Sun's size`;
  return `${Math.round(R).toLocaleString("en-US")} × the Sun's size`;
}

/** A pseudo-random but fixed speckle, so giants look mottled without flickering. */
function hash(i: number): number {
  const x = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

function drawDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, T: number, mottled: boolean, clock: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.5 + 6);
  glow.addColorStop(0, starColour(T, 0.45));
  glow.addColorStop(1, starColour(T, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5 + 6, 0, Math.PI * 2);
  ctx.fill();
  const disc = ctx.createRadialGradient(x, y, 0, x, y, r);
  disc.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  disc.addColorStop(0.35, starColour(T, 1));
  disc.addColorStop(1, starColour(T * 0.8, 0.95));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (mottled && r > 12) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 14; i++) {
      const a = hash(i) * Math.PI * 2 + clock * 0.03 * (hash(i + 50) - 0.5);
      const d = Math.sqrt(hash(i + 20)) * r * 0.85;
      const sr = r * (0.18 + 0.2 * hash(i + 40));
      const g = ctx.createRadialGradient(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, x + Math.cos(a) * d, y + Math.sin(a) * d, sr);
      g.addColorStop(0, hash(i + 70) > 0.5 ? "rgba(255, 245, 220, 0.22)" : "rgba(80, 20, 0, 0.22)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }
}

/** Close-up of the explosion itself, `age` wall-clock seconds after it went off. */
function drawBoom(ctx: CanvasRenderingContext2D, cx: number, cy: number, age: number): void {
  const fade = (a: number, b: number): number => Math.max(0, Math.min(1, 1 - (age - a) / (b - a)));
  const ease = (f: number): number => 1 - (1 - Math.min(1, Math.max(0, f))) ** 3;
  // The supergiant's last moment: its disc, swallowed by the blast.
  const giant = fade(0, 0.35);
  if (giant > 0) {
    drawDisc(ctx, cx, cy, 70 * (1 + 0.3 * (1 - giant)), 3400, true, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const flash = fade(0, 0.5);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 250, 235, ${0.85 * flash})`;
    ctx.fillRect(0, 0, CLOSE_W, CLOSE_H);
  }
  const core = fade(0.1, 2.8);
  if (core > 0) {
    const R = 20 + 90 * ease(age / 0.9);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(255, 255, 255, ${core})`);
    g.addColorStop(0.3, `rgba(200, 225, 255, ${0.7 * core})`);
    g.addColorStop(1, "rgba(100, 140, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }
  // The blown-off layers: a clumpy expanding shell, hot white turning red and teal.
  const shell = fade(2.6, 5);
  if (shell > 0) {
    const R = 18 + 95 * ease(age / 2.5);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + 0.2 * hash(i + 3);
      const rr = R * (0.8 + 0.35 * hash(i + 9));
      const fx = cx + Math.cos(a) * rr;
      const fy = cy + Math.sin(a) * rr;
      const b = 4 + 7 * hash(i + 17);
      const hot = Math.max(0, 1 - age / 1.5);
      const col = hash(i + 29) > 0.5 ? `255, ${Math.round(110 + 140 * hot)}, ${Math.round(90 + 160 * hot)}` : `${Math.round(110 + 140 * hot)}, ${Math.round(230 + 25 * hot)}, ${Math.round(210 + 45 * hot)}`;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, b);
      g.addColorStop(0, `rgba(${col}, ${0.7 * shell})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, b, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function renderCloseUp(ctx: CanvasRenderingContext2D, track: Track, t: number, clock: number, snAge: number | null = null): void {
  ctx.clearRect(0, 0, CLOSE_W, CLOSE_H);
  ctx.fillStyle = "rgba(6, 10, 18, 0.6)";
  ctx.fillRect(0, 0, CLOSE_W, CLOSE_H);

  const st = starAt(track, t);
  const phase = PHASES[st.phase];
  const cx = CLOSE_W / 2;
  const cy = 92;
  const box = 64;

  const boom = st.phase === "ns" && snAge !== null && snAge < 5;
  if (boom) {
    drawBoom(ctx, cx, cy, snAge);
  }
  text(ctx, boom && snAge < 2.4 ? `${track.label}: Supernova!` : `${track.label}: ${phase.name}`, CLOSE_W / 2, 13, track.colour, 13, "center", 700);
  if (boom) {
    // The neutron star fades in as the debris clears.
    ctx.globalAlpha = Math.max(0, Math.min(1, (snAge - 2.4) / 1.6));
  }

  if (st.phase === "ns") {
    ctx.strokeStyle = "rgba(160, 200, 255, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30 + i * 14, 10 + i * 6, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawDisc(ctx, cx, cy, 4, 1e6, false, clock);
    // Radio beams sweeping round.
    const a = clock * 3;
    ctx.strokeStyle = "rgba(200, 225, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 60, cy - Math.sin(a) * 20 - 40);
    ctx.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 20 + 40);
    ctx.stroke();
    text(ctx, "about 20 km across: the size of a city", cx, cy + 62, MUTED, 11, "center", 500);
  } else if (st.phase === "bh") {
    const g = ctx.createRadialGradient(cx, cy, 14, cx, cy, 46);
    g.addColorStop(0, "rgba(255, 170, 90, 0.85)");
    g.addColorStop(0.4, "rgba(255, 120, 60, 0.25)");
    g.addColorStop(1, "rgba(255, 120, 60, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "probably a few tens of km across", cx, cy + 62, MUTED, 11, "center", 500);
  } else {
    let k: number;
    if (st.R < 0.05) {
      // Beside Earth.
      k = (box * 0.6) / Math.max(st.R, EARTH_R);
      const er = EARTH_R * k;
      drawDisc(ctx, cx - 40, cy, st.R * k, st.T, false, clock);
      const eg = ctx.createRadialGradient(cx + 50 - er * 0.3, cy - er * 0.3, 0, cx + 50, cy, er);
      eg.addColorStop(0, "#9fd0ff");
      eg.addColorStop(1, "#2f6fb8");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(cx + 50, cy, er, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, "Earth", cx + 50, cy + er + 12, MUTED, 11, "center", 500);
    } else if (st.R < 30) {
      // Beside the Sun as it is today.
      k = (box * 0.62) / Math.max(st.R, 1);
      const sr = Math.max(1, k);
      const starX = st.R >= 1 ? cx - 18 : cx - 36;
      drawDisc(ctx, starX, cy, Math.max(1.5, st.R * k), st.T, st.R > 10, clock);
      const sunX = Math.min(CLOSE_W - 14 - sr, starX + st.R * k + sr + 22);
      ctx.strokeStyle = "rgba(255, 211, 107, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sunX, cy, sr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, "Sun today", sunX, cy + Math.max(sr, 6) + 12, "rgba(255, 211, 107, 0.9)", 11, "center", 500);
    } else {
      // Centred, with Earth's (and maybe Jupiter's) orbit drawn round it.
      k = (box * 1.05) / Math.max(st.R, AU_R);
      drawDisc(ctx, cx, cy, st.R * k, st.T, true, clock);
      ctx.strokeStyle = "rgba(111, 179, 255, 0.85)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, AU_R * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, "Earth's orbit", cx + AU_R * k * 0.72 + 4, cy - AU_R * k * 0.72 - 6, "rgba(111, 179, 255, 0.95)", 10.5, "left", 600);
    }
    text(ctx, `${sizeWords(st.R)} · ${Math.round(st.T).toLocaleString("en-US")} K`, cx, cy + 74, INK, 11.5, "center", 600);
  }
  wrap(ctx, phase.fusing, cx, cy + 94, CLOSE_W - 24, MUTED, 10.5);
  ctx.globalAlpha = 1;
}
