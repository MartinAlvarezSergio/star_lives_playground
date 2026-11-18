# Lives of stars

Standalone GitHub Pages build of the stellar-evolution applet from [physics_demos](https://github.com/MartinAlvarezSergio/physics_demos).

Live: https://martinalvarezsergio.github.io/star_lives_playground/

Five stars, from 0.2 to 40 times the Sun's mass, are born together and cross the HR diagram on one
shared clock. The heaviest swell into supergiants and explode or collapse within a few million
years; the Sun takes about 12 billion years to become a red giant and then a white dwarf; the red
dwarf has barely started.

- **All at once**: the race, with a timeline of every star's life that you can drag to scrub.
- **One star**: follow a single mass through each stage, with a to-scale close-up.
- **Smart clock** slows down for the fast stages; **steady clock** shows the true difference in
  lifetimes (at a billion years per second the heaviest stars are gone in a blink).

The tracks are hand-built approximations to published solar-composition stellar models (e.g. MIST
and Geneva): good for comparing stars and stages, not for precise values.

```bash
npm install
npm run dev
npm run deploy   # build + publish gh-pages
```

The applet code is synchronized from `physics_demos/src/applets/star_lives`.
Publish source changes on `main`, then run `npm run deploy` to update GitHub Pages.
