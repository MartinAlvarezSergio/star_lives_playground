import { useEffect, useRef, useState } from "react";
import { logicalPointer, setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { useCanvasBackingStore } from "../../ui/stage/hooks";
import {
  StageDivider,
  StageHero,
  StageIconButton,
  StageReadout,
  StageSection,
  StageSegmented,
  StageSelect,
  StageSlider,
  StageToggle
} from "../../ui/stage/StageControls";
import { runEnd, smartYearsPerSecond, stepSmart, stepSteady, T_START, type ClockMode } from "./clock";
import { CLOSE_H, CLOSE_W, renderCloseUp } from "./closeup";
import { layoutFor, renderScene, renderTimeline, SUPERNOVA_SECONDS, VIEW_H, VIEW_W, xToTime, type DrawnStar, type Layout, type SceneEvent } from "./render";
import { formatYears, PHASES, starAt, trackById, TRACKS, type Track } from "./tracks";
import "./starLives.css";

type Props = {
  host?: AppletHostAdapter;
};

type View = "race" | "single";

/** Seconds the smart clock holds still when a star explodes. */
const HOLD_SECONDS = 1.6;

const TIP = {
  play: "Start or pause the clock. Space bar works too.",
  reset: "Back to the start: every star newly born.",
  view: "All five stars on one shared clock, or one star at a time.",
  mass: "The star's mass, in Suns. Mass decides almost everything about a star's life.",
  clock:
    "Smart: each second covers more years as time goes on, and the clock slows down whenever a star is changing fast. Steady: the same number of years every second, which shows the real difference in lifetimes.",
  speed: "How fast the smart clock runs overall.",
  steady: "How many years pass each second on the steady clock.",
  stop: "Pause the clock whenever a star on screen starts a new stage of its life.",
  ahead: "Show each star's whole future path as a faint dashed line.",
  sizes: "Dashed lines through stars of the same size. Hot and big means very bright.",
  follow: "Which star the close-up (bottom right) shows. You can also click a star on the diagram.",
  age: "All the stars were born together, so they all have this age. The timeline at the bottom shows it too.",
  rate: "How many years the clock covers in one second right now.",
  temp: "Surface temperature, in kelvin. The Sun's is 5,772 K.",
  lum: "How much light the star gives out, compared with the Sun.",
  size: "Radius compared with the Sun's.",
  life: "How long the star lives before it becomes a white dwarf, neutron star or black hole."
} as const;

function fmtSig(x: number): string {
  if (x >= 1000) return Number(x.toPrecision(3)).toLocaleString("en-US");
  if (x >= 10) return String(Math.round(x));
  if (x >= 1) return x.toFixed(1);
  return x.toPrecision(2);
}

function dayWords(fraction: number): string {
  const s = fraction * 86400;
  if (s < 90) return `${Math.round(s)} seconds`;
  if (s < 5400) return `${Math.round(s / 60)} minutes`;
  if (s < 2 * 86400) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}

/** Where the overlay panels leave the canvas free, in logical x (measured from the live DOM). */
function freeBand(canvas: HTMLCanvasElement): { left: number; right: number } {
  const stage = canvas.closest(".stage");
  const cr = canvas.getBoundingClientRect();
  if (!stage || cr.width === 0) {
    return { left: 0, right: VIEW_W };
  }
  const k = VIEW_W / cr.width;
  const overlaps = (r: DOMRect): boolean => r.width > 0 && r.right > cr.left && r.left < cr.right && r.bottom > cr.top && r.top < cr.bottom;
  let left = 0;
  let right = VIEW_W;
  const controls = stage.querySelector(".stage-controls");
  if (controls) {
    const r = controls.getBoundingClientRect();
    if (overlaps(r) && r.left < cr.left + cr.width / 2) {
      left = (r.right - cr.left) * k + 4;
    }
  }
  for (const sel of [".stage-readouts", ".stage-inset:not(.stage-inset-left)"]) {
    const el = stage.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (overlaps(r) && r.left > cr.left + cr.width / 2) {
        right = Math.min(right, (r.left - cr.left) * k - 4);
      }
    }
  }
  return { left, right };
}

export function StarLivesCanvas({ host }: Props): JSX.Element {
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = host?.readReducedMotion?.() ?? false;

  const [view, setView] = useState<View>("race");
  const [singleId, setSingleId] = useState("m1");
  const [raceIds, setRaceIds] = useState<string[]>(TRACKS.map((t) => t.id));
  const [followId, setFollowId] = useState("m1");
  const [clockMode, setClockMode] = useState<ClockMode>("smart");
  const [speedExp, setSpeedExp] = useState(0);
  const [steadyExp, setSteadyExp] = useState(9);
  const [stopAtStage, setStopAtStage] = useState(false);
  const [showAhead, setShowAhead] = useState(true);
  const [showSizes, setShowSizes] = useState(true);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [uiT, setUiT] = useState(T_START);
  const [uiRate, setUiRate] = useState(0);

  useCanvasBackingStore([closeRef]);

  const tracks: Track[] = view === "race" ? TRACKS.filter((t) => raceIds.includes(t.id)) : [trackById(singleId)];
  const follow = view === "single" ? trackById(singleId) : tracks.find((t) => t.id === followId) ?? tracks[0] ?? trackById("m1");

  const live = useRef({ tracks, follow, view, clockMode, speedExp, steadyExp, stopAtStage, showAhead, showSizes, running });
  live.current = { tracks, follow, view, clockMode, speedExp, steadyExp, stopAtStage, showAhead, showSizes, running };

  const sim = useRef({
    t: T_START,
    events: [] as SceneEvent[],
    drawn: [] as DrawnStar[],
    layout: layoutFor(0, VIEW_W, TRACKS.length) as Layout,
    band: { left: 0, right: VIEW_W },
    scrubbing: false,
    /** Wall-clock time until which the smart clock holds still, so a supernova can sink in. */
    holdUntil: 0
  });

  useEffect(() => {
    const ctx = sceneRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let lastUi = 0;
    let lastMeasure = -1e9;
    const tick = (now: number): void => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      clock += dt;
      const s = live.current;
      const st = sim.current;
      const canvas = sceneRef.current;
      if (canvas && now - lastMeasure > 200) {
        lastMeasure = now;
        st.band = freeBand(canvas);
      }
      if (s.running && !st.scrubbing && s.tracks.length > 0 && clock >= st.holdUntil) {
        const r =
          s.clockMode === "smart"
            ? stepSmart(s.tracks, st.t, dt, 2 ** s.speedExp, s.stopAtStage, runEnd(s.tracks))
            : stepSteady(s.tracks, st.t, dt, 10 ** s.steadyExp, s.stopAtStage, runEnd(s.tracks));
        st.t = r.t;
        for (const c of r.crossings) {
          if (c.event) {
            const k = c.track.keys[c.key];
            st.events.push({ kind: c.event, trackId: c.track.id, logT: k.logT, logL: k.logL, wall0: clock });
            host?.onResult?.({ event: c.event, star: c.track.id, age: c.t });
            // The smart clock pauses for a beat at an explosion (the steady clock never does).
            if (c.event === "supernova" && s.clockMode === "smart") {
              st.holdUntil = clock + HOLD_SECONDS;
            }
          }
        }
        st.events = st.events.filter((e) => clock - e.wall0 < SUPERNOVA_SECONDS);
        if (r.stopped || r.ended) {
          live.current.running = false;
          setRunning(false);
        }
      }
      st.layout = layoutFor(st.band.left, st.band.right, s.tracks.length);
      setLogicalTransform(ctx, VIEW_W);
      st.drawn = renderScene(ctx, {
        layout: st.layout,
        tracks: s.tracks,
        t: st.t,
        followId: s.follow.id,
        showAhead: s.showAhead,
        showSizes: s.showSizes,
        events: st.events,
        wall: clock,
        clock,
        mode: s.clockMode,
        reducedMotion,
        labelAll: s.view === "single"
      });
      renderTimeline(ctx, st.layout, s.tracks, st.t, s.clockMode, s.follow.id);
      const cctx = closeRef.current?.getContext("2d");
      if (cctx) {
        setLogicalTransform(cctx, CLOSE_W);
        const sn = st.events.find((e) => e.kind === "supernova" && e.trackId === s.follow.id);
        renderCloseUp(cctx, s.follow, st.t, clock, sn ? clock - sn.wall0 : null);
      }
      if (now - lastUi > 120) {
        lastUi = now;
        setUiT(st.t);
        setUiRate(s.clockMode === "smart" ? smartYearsPerSecond(s.tracks, Math.max(st.t, T_START), 2 ** s.speedExp) : 10 ** s.steadyExp);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, host]);

  function startTime(mode = clockMode): number {
    return mode === "smart" ? T_START : 0;
  }

  function reset(mode = clockMode): void {
    sim.current.t = startTime(mode);
    sim.current.events = [];
    sim.current.holdUntil = 0;
    setRunning(false);
    setStarted(false);
    setUiT(sim.current.t);
  }

  function togglePlay(): void {
    if (!running && sim.current.t >= runEnd(tracks)) {
      sim.current.t = startTime();
      sim.current.events = [];
    }
    setStarted(true);
    setRunning((r) => !r);
  }

  // Space bar starts and pauses, unless typing or using a control.
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.code === "Space" && !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pointer: drag on the timeline to scrub; click a star to follow it.
  function onTimeline(p: { x: number; y: number }): boolean {
    const l = sim.current.layout;
    const rowsEnd = l.ty0 + live.current.tracks.length * l.rowH;
    return p.x >= l.tx0 - 6 && p.x <= l.tx1 + 6 && p.y >= l.ty0 - 4 && p.y <= rowsEnd + 22;
  }
  function scrubTo(p: { x: number }): void {
    const mode = live.current.clockMode;
    sim.current.t = Math.max(startTime(mode), xToTime(sim.current.layout, p.x, mode));
    sim.current.events = [];
    setStarted(true);
  }
  const canvasProps = {
    style: { touchAction: "none" as const, cursor: "default" },
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = sceneRef.current;
      if (!canvas) return;
      const p = logicalPointer(e, canvas, VIEW_W, VIEW_H);
      if (onTimeline(p)) {
        sim.current.scrubbing = true;
        canvas.setPointerCapture(e.pointerId);
        scrubTo(p);
        return;
      }
      let best: DrawnStar | null = null;
      let bestD = Infinity;
      for (const d of sim.current.drawn) {
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist < d.r + 12 && dist < bestD) {
          best = d;
          bestD = dist;
        }
      }
      if (best && live.current.view === "race") {
        setFollowId(best.id);
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = sceneRef.current;
      if (!canvas) return;
      const p = logicalPointer(e, canvas, VIEW_W, VIEW_H);
      if (sim.current.scrubbing) {
        scrubTo(p);
        return;
      }
      const overStar = sim.current.drawn.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < d.r + 12);
      canvas.style.cursor = onTimeline(p) ? "ew-resize" : overStar && live.current.view === "race" ? "pointer" : "default";
    },
    onPointerUp: () => {
      sim.current.scrubbing = false;
    },
    onPointerCancel: () => {
      sim.current.scrubbing = false;
    }
  };

  const toolbar = (
    <>
      <StageIconButton icon={running ? "pause" : "play"} label={running ? "Pause" : "Run"} tip={TIP.play} onClick={togglePlay} />
      <StageIconButton icon="reset" label="Reset" tip={TIP.reset} onClick={() => reset()} />
      <StageDivider />
      <StageSegmented<View>
        ariaLabel="View"
        value={view}
        tip={TIP.view}
        options={[
          { value: "race", label: "All at once" },
          { value: "single", label: "One star" }
        ]}
        onChange={(v) => {
          setView(v);
          if (v === "single") {
            setSingleId(follow.id);
          } else {
            setFollowId(singleId);
          }
          reset();
        }}
      />
      {view === "single" ? (
        <StageSelect
          ariaLabel="Star mass"
          value={singleId}
          tip={TIP.mass}
          options={TRACKS.map((t) => ({ value: t.id, label: `${t.label}` }))}
          onChange={(id) => {
            setSingleId(id);
            reset();
          }}
        />
      ) : null}
    </>
  );

  const controls = (
    <>
      <StageSection title="Clock">
        <StageSegmented<ClockMode>
          ariaLabel="Clock"
          label="Clock"
          value={clockMode}
          tip={TIP.clock}
          options={[
            { value: "smart", label: "Smart", tip: "Slows down for the fast stages; each step on the timeline is 10 × longer." },
            { value: "steady", label: "Steady", tip: "The same number of years every second: the honest race." }
          ]}
          onChange={(m) => {
            setClockMode(m);
            reset(m);
          }}
        />
        {clockMode === "smart" ? (
          <StageSlider label="Speed" display={`× ${fmtSig(2 ** speedExp)}`} value={speedExp} min={-2} max={2} step={1} tip={TIP.speed} onChange={setSpeedExp} />
        ) : (
          <StageSlider
            label="Each second"
            display={formatYears(10 ** steadyExp)}
            value={steadyExp}
            min={6}
            max={10}
            step={0.5}
            tip={TIP.steady}
            onChange={setSteadyExp}
          />
        )}
        <StageToggle label="Stop at each new stage" on={stopAtStage} tip={TIP.stop} onChange={setStopAtStage} />
      </StageSection>
      {view === "race" ? (
        <StageSection title="Stars in the race">
          <div className="sl-star-toggles">
            {TRACKS.map((t) => (
              <StageToggle
                key={t.id}
                label={<span style={{ color: t.colour }}>{t.label}</span>}
                on={raceIds.includes(t.id)}
                tip={`Include the ${t.label} star.`}
                onChange={(on) => setRaceIds((ids) => (on ? TRACKS.map((q) => q.id).filter((id) => id === t.id || ids.includes(id)) : ids.filter((id) => id !== t.id)))}
              />
            ))}
          </div>
          <StageSelect
            label="Close-up of"
            value={follow.id}
            tip={TIP.follow}
            options={tracks.map((t) => ({ value: t.id, label: t.label }))}
            onChange={setFollowId}
          />
        </StageSection>
      ) : null}
      <StageSection title="Show">
        <div className="sl-star-toggles">
          <StageToggle label="Path ahead" on={showAhead} tip={TIP.ahead} onChange={setShowAhead} />
          <StageToggle label="Size lines" on={showSizes} tip={TIP.sizes} onChange={setShowSizes} />
        </div>
      </StageSection>
    </>
  );

  const followState = starAt(follow, uiT);
  const readouts = (
    <>
      <StageHero label={view === "race" ? "Age of all five" : "Age"} value={formatYears(uiT)} tip={TIP.age} />
      <StageReadout label="Clock speed" value={`${formatYears(uiRate, "yr")} / s`} tip={TIP.rate} />
      {view === "race" ? (
        tracks.map((t) => {
          const st = starAt(t, uiT);
          const remnant = PHASES[st.phase].group === "remnant";
          return (
            <StageReadout
              key={t.id}
              label={<span style={{ color: t.colour, fontWeight: t.id === follow.id ? 800 : 600 }}>{t.label}</span>}
              value={PHASES[st.phase].name}
              valueColor={remnant ? "rgba(235, 232, 226, 0.55)" : undefined}
              tip={PHASES[st.phase].fusing}
            />
          );
        })
      ) : (
        <>
          <StageReadout label="Stage" value={PHASES[followState.phase].name} tip={PHASES[followState.phase].fusing} />
          {followState.onChart ? (
            <>
              <StageReadout label="Surface" value={`${Math.round(followState.T).toLocaleString("en-US")} K`} tip={TIP.temp} />
              <StageReadout label="Brightness" value={`${fmtSig(followState.L)} × Sun`} tip={TIP.lum} />
              <StageReadout label="Size" value={`${fmtSig(followState.R)} × Sun`} tip={TIP.size} />
            </>
          ) : null}
          <StageReadout label="Whole life" value={follow.lifeWords ? "over a trillion years" : formatYears(follow.lifeEnd)} tip={TIP.life} />
        </>
      )}
    </>
  );

  const inset = (
    <canvas
      ref={closeRef}
      style={{ width: CLOSE_W, height: CLOSE_H }}
      role="img"
      aria-label={`Close-up of the ${follow.label} star, drawn to scale against a familiar object`}
    />
  );

  const sun = trackById("m1");
  const info = (
    <>
      <h4>What you are seeing</h4>
      <ul>
        <li>
          An HR (Hertzsprung–Russell) diagram: each star is a dot placed by its surface temperature (hot on the left, cool on the right) and how much light it gives out (bright at the top).
          The dot's colour is the star's colour; its size grows with the star's real size.
        </li>
        <li>Five stars, from 0.2 to 40 times the Sun's mass, are born together and age on one shared clock. The lines are their paths: solid where they have been, faint where they will go.</li>
        <li>The timeline underneath shows each star's whole life, coloured by stage, with the white cursor at the current age. Drag it to move through time.</li>
        <li>Bottom right: a close-up of one star to scale (click a star on the diagram to choose it).</li>
      </ul>
      <h4>Why heavy stars die young</h4>
      <ul>
        <li>A star 15 times heavier than the Sun has 15 times the fuel but burns it about 20,000 times faster. So it lives about a thousand times shorter.</li>
        <li>
          If the Sun's whole life ({formatYears(sun.lifeEnd)}) were squeezed into one day:
          {TRACKS.filter((t) => t.id !== "m1").map((t) => (
            <span key={t.id}>
              {" "}
              the {t.label} star would live {dayWords(t.lifeEnd / sun.lifeEnd)}
              {t.lifeWords ? " (and counting)" : ""};
            </span>
          ))}
        </li>
        <li>Every star spends about 90% of its life quietly on the main sequence, fusing hydrogen in its core. Everything after that is fast.</li>
      </ul>
      <h4>The two clocks</h4>
      <ul>
        <li>Smart: each second covers more years than the last (the timeline's steps grow 10 × at a time), and the clock slows down whenever a star changes quickly, so you can watch every stage. The age readout is always the true age.</li>
        <li>Steady: the same number of years every second. At a billion years per second the two heaviest stars are gone in a hundredth of a second, while the Sun takes over 12 seconds.</li>
      </ul>
      <h4>Try</h4>
      <ul>
        <li>Run the race with the steady clock. Which stars do you even see move?</li>
        <li>When the Universe is as old as it is today (13.8 billion years), which of these stars are still on the main sequence? Why has no red dwarf ever died?</li>
        <li>Follow the Sun. How big does it get as a red giant, compared with Earth's orbit?</li>
        <li>Which stars end as white dwarfs, and which as something stranger?</li>
      </ul>
      <h4>Simplified on purpose</h4>
      <ul>
        <li>
          The paths are hand-built approximations to the shapes and timings of published stellar models for stars like the Sun in composition (for example the MIST and Geneva model grids). They are good for comparing stars and stages, not for reading off precise values.
        </li>
        <li>Real paths depend on what the star is made of, how fast it spins, and how much mass it blows away, which is most uncertain for the heaviest stars. Whether a 40-Sun star explodes before becoming a black hole, or collapses quietly, is still debated.</li>
        <li>Stars start on the main sequence; their earlier birth (contracting gas clouds) is left out.</li>
        <li>The Sun's helium flash happens deep inside in minutes; the star then takes a while to settle onto the helium-burning stage. The dashed line skips that settling.</li>
        <li>White dwarfs cool along a line of constant size, using a simple cooling law (Mestel's). Neutron stars and black holes are far too small and dim to plot.</li>
        <li>The red dwarf's life (over a trillion years) is a theoretical prediction: the Universe is far too young for any red dwarf to have died.</li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={VIEW_W}
      logicalHeight={VIEW_H}
      canvasRef={sceneRef}
      canvasLabel={
        view === "race"
          ? "HR diagram: five stars of different masses evolving on one shared clock, with a timeline of their lives below"
          : `HR diagram: the life of a ${follow.label} star`
      }
      canvasProps={canvasProps}
      toolbar={toolbar}
      controls={controls}
      controlsWidth={260}
      controlsDefaultOpen={false}
      readouts={readouts}
      inset={inset}
      info={info}
      play={{ visible: !running && !started, label: "Start the clock", onClick: togglePlay }}
      rootClassName="star-lives"
    />
  );
}
