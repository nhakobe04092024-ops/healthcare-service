# HCMC Private Healthcare Landscape — Interactive Map

A responsive React + Leaflet + OpenStreetMap web app that visualizes 39 private healthcare facilities across Ho Chi Minh City and the former Binh Duong / Ba Ria – Vung Tau regions for executive strategy review.

## Features

- All 39 facilities plotted on an OpenStreetMap base layer with **coded markers** (H01, C01, M01, S01, T01, PCH01, …).
- Marker shapes & colors are driven by the JSON's `marker_styles` (circle, rounded square, hexagon, diamond, triangle).
- **Filters**: 6 category checkboxes, 3 region checkboxes, and live search by code or name.
- **Side panel** with full facility details, specialty tags, and notes.
- **Summary panel** rendered from the JSON `summary` object (highlight tiles + breakdown).
- **Legend** auto-rendered from `marker_styles`.
- **"Find C01 Estella Clinic"** button flies to the strategic clinic asset.
- Executive theme: navy header, white panels, light-gray background.
- Mobile-friendly: filters slide in over the map.

## Project structure

```
src/
  App.jsx
  main.jsx
  data/hcmc_healthcare_facilities_interactive_map.json
  components/
    MapView.jsx
    FilterPanel.jsx
    FacilityDetail.jsx
    SummaryPanel.jsx
    Legend.jsx
  styles/
    app.css
```

## Quick start

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview   # local smoke test of the production bundle
```

The static, ready-to-deploy bundle is emitted to `dist/`.

## Deploy

Any static host works — Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 + CloudFront, or an internal nginx server. Upload the contents of `dist/` and you're done; no server-side runtime is required.

## Updating the data

Replace `src/data/hcmc_healthcare_facilities_interactive_map.json` with a new version — the same shape (`facilities`, `marker_styles`, `summary`, `center`) is required. Verify the lat/lng before any leadership presentation.

> Draft strategic map for discussion only — coordinates require final verification.
