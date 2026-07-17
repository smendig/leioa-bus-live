# Leioa Bus Live

Mapa público no oficial de Lejoan Busa, el autobús urbano de Leioa. Muestra próximas llegadas y
posiciones estimadas de las líneas L1, L2 y L3.

Mapa en directo: [Lejoan Busa y autobuses de Leioa](https://smendig.github.io/leioa-bus-live/)

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Notes

- Unofficial project (not affiliated with Leioa municipality).
- Bus positions are estimated from arrivals data, not raw GPS.
- Live topology is preferred, with a validated bundled snapshot as fallback so
  lines and stops remain visible during provider outages. Arrival data is never
  fabricated.
- Startup uses two complete arrival snapshots to establish movement before the
  normal polling cadence, avoiding an unnecessary third burst across every stop.
- The estimation model and its validation boundaries are documented in
  [docs/tracking-model.md](docs/tracking-model.md).
- Debug panel is hidden by default in production. Use `?debug=1` to show it.
- See [DISCLAIMER.md](DISCLAIMER.md) for legal/disclosure notes.
