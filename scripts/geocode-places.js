/**
 * Geocode every facility's `real_address` (or `name`) via Google Places API
 * and rewrite the JSON in place with verified coordinates.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=your_key node scripts/geocode-places.js
 *
 * Or with a .env.local file at the project root containing:
 *   GOOGLE_MAPS_API_KEY=your_key
 *
 * Behaviour:
 *   - Backs up the existing JSON to <name>.backup-<timestamp>.json
 *   - For each facility, queries Google Places Text Search with
 *     "<facility name>, <real_address>" and uses the top result's geometry.
 *   - Writes verified lat/lng + sets coordinate_confidence: "verified".
 *   - Records every change in scripts/geocode-report.json for auditing.
 *   - Skips facilities already marked verified unless --force is passed.
 *
 * Cost: ~$0.017 per request × 37 ≈ $0.63 USD per full run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src/data/hcmc_healthcare_facilities_interactive_map.json');
const REPORT_PATH = path.join(ROOT, 'scripts/geocode-report.json');

// --- Load .env.local if present so users can store the key in a file ---
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadDotEnv();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('\n❌  Missing GOOGLE_MAPS_API_KEY.');
  console.error('   Create .env.local at the project root with:');
  console.error('     GOOGLE_MAPS_API_KEY=your_key_here');
  console.error('   Or run inline:');
  console.error('     GOOGLE_MAPS_API_KEY=your_key node scripts/geocode-places.js\n');
  process.exit(1);
}

if (!fs.existsSync(DATA_PATH)) {
  console.error(`❌  Data file not found: ${DATA_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// Bias results to HCMC region
const LOCATION_BIAS = {
  circle: {
    center: { latitude: data.center?.lat ?? 10.83, longitude: data.center?.lng ?? 106.72 },
    radius: 60000, // 60 km — covers HCMC + former Binh Duong + Ba Ria – Vung Tau
  },
};

async function geocodeOne(facility) {
  const queryParts = [facility.name, facility.real_address || facility.address_hint].filter(Boolean);
  const textQuery = queryParts.join(', ');

  const body = {
    textQuery,
    languageCode: 'vi',
    regionCode: 'VN',
    locationBias: LOCATION_BIAS,
    maxResultCount: 1,
  };

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const top = json.places?.[0];
  if (!top?.location) return null;

  return {
    lat: top.location.latitude,
    lng: top.location.longitude,
    place_id: top.id,
    matched_name: top.displayName?.text,
    matched_address: top.formattedAddress,
  };
}

async function run() {
  console.log(`\n🔍 Geocoding ${data.facilities.length} facilities via Google Places API`);
  console.log(`   Force re-geocode verified entries: ${FORCE}`);
  console.log(`   Dry run (no file writes): ${DRY_RUN}\n`);

  const report = {
    run_at: new Date().toISOString(),
    total: data.facilities.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    changes: [],
  };

  for (const f of data.facilities) {
    if (!FORCE && f.coordinate_confidence === 'verified') {
      report.skipped++;
      console.log(`⏭️   ${f.code} ${f.name} — already verified, skipping`);
      continue;
    }

    try {
      const result = await geocodeOne(f);
      if (!result) {
        report.failed++;
        console.log(`⚠️   ${f.code} ${f.name} — no match found`);
        report.changes.push({ code: f.code, status: 'no_match', name: f.name });
      } else {
        const prev = { lat: f.lat, lng: f.lng };
        const drift = haversineMeters(prev, result);
        report.updated++;
        report.changes.push({
          code: f.code,
          name: f.name,
          from: prev,
          to: { lat: result.lat, lng: result.lng },
          drift_meters: Math.round(drift),
          matched_name: result.matched_name,
          matched_address: result.matched_address,
          place_id: result.place_id,
        });
        if (!DRY_RUN) {
          f.lat = round6(result.lat);
          f.lng = round6(result.lng);
          f.coordinate_confidence = 'verified';
          f.geocode_source = 'google_places';
          f.google_place_id = result.place_id;
        }
        console.log(
          `✅  ${f.code} ${f.name} — moved ${Math.round(drift)} m (${result.matched_name || 'match'})`
        );
      }
    } catch (err) {
      report.failed++;
      console.log(`❌  ${f.code} ${f.name} — ${err.message}`);
      report.changes.push({ code: f.code, status: 'error', error: err.message });
    }

    // Friendly throttle: ~5 req/sec, well under Google's quota
    await sleep(220);
  }

  // Update top-level note
  if (!DRY_RUN && report.updated > 0) {
    data.data_note =
      (data.data_note ? data.data_note + ' ' : '') +
      `[${new Date().toISOString().slice(0, 10)}] ${report.updated} facilities geocoded via Google Places.`;

    const backupPath = DATA_PATH.replace(/\.json$/, `.backup-${Date.now()}.json`);
    fs.copyFileSync(DATA_PATH, backupPath);
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`\n💾 Wrote updated JSON: ${path.relative(ROOT, DATA_PATH)}`);
    console.log(`   Backup saved at:    ${path.relative(ROOT, backupPath)}`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`📄 Report:            ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`\n✨ Done — updated ${report.updated} · skipped ${report.skipped} · failed ${report.failed}\n`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function round6(n) { return Math.round(n * 1e6) / 1e6; }
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

run().catch((err) => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
