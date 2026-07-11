# Leioa Bus Live

Visualize Leioa buses on a live map.

Live demo: [smendig.github.io/leioa-bus-live](https://smendig.github.io/leioa-bus-live/)

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Notes

- Unofficial project (not affiliated with Leioa municipality).
- Bus positions are estimated from arrivals data, not raw GPS.
- The estimation model and its validation boundaries are documented in
  [docs/tracking-model.md](docs/tracking-model.md).
- Debug panel is hidden by default in production. Use `?debug=1` to show it.
- See [DISCLAIMER.md](DISCLAIMER.md) for legal/disclosure notes.

## Validate the tracking model

With a local sharded capture, run:

```bash
npm run tracking:validate -- captures/sessions/<session-id> --cutoff=<ISO-date>
```
