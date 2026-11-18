import { useMemo } from "react";
import { AppletHostAdapter } from "../core/host";
import { StarLivesCanvas } from "../applets/star_lives/StarLivesCanvas";

export function App(): JSX.Element {
  const host: AppletHostAdapter = useMemo(
    () => ({
      onClose: () => {},
      readReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }),
    []
  );

  return (
    <div className="app-shell">
      <main>
        <section className="modal card">
          <StarLivesCanvas host={host} />
        </section>
      </main>
    </div>
  );
}
