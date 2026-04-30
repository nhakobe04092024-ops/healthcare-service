/**
 * Free geocoder using OpenStreetMap Nominatim.
 * No API key, no billing — just respect the 1 req/sec rate limit.
 *
 * Usage:
 *   node scripts/geocode-nominatim.js
 *   node scripts/geocode-nominatim.js --dry-run
 *   node scripts/geocode-nominatim.js --force        (re-geocode verified entries too)
 *
 * Strategy: try the most-specific query first ("<name>, <real_address>"),
 *   then fall back to just the address, then to just the facility name.
 *   Skips entries already marked verified unless --force.
 *
 * Output:
 *   - Backs up the JSON before writing.
 *   - Writes scripts/geocode-report.json with full audit trail
 *     (drift, matched display name, fallback level used).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src/data/hcmc_healthcare_facilities_interactive_map.json');
const REPORT_PATH = path.join(ROOT, 'scripts/geocode-report.json');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

// Nominatim's usage policy requires a real User-Agent identifying your app.
const USER_AGENT = 'hcmc-healthcare-map/1.0 (geocoding research; contact: pnhuudat2201@gmail.com)';

// HCMC bounding box (lon_min, lat_min, lon_max, lat_max) — keeps results local.
const VIEWBOX = '106.30,10.30,107.20,11.40';

if (!fs.existsSync(DATA_PATH)) {
  console.error(`❌  Data file not found: ${DATA_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

async function nominatimSearch(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'vn',
      viewbox: VIEWBOX,
      bounded: '1',
      'accept-language': 'vi,en',
    });

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.json();
  if (!arr.length) return null;
  const top = arr[0];
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    display_name: top.display_name,
    osm_id: top.osm_id,
    type: top.type,
  };
}

async function geocodeOne(facility) {
  const name = facility.name;
  const address = facility.real_address || facility.address_hint || '';

  const attempts = [
    { level: 'name+address', query: address ? `${name}, ${address}` : name },
    { level: 'address-only', query: address || null },
    { level: 'name-only', query: name },
  ].filter((a) => a.query);

  for (const a of attempts) {
    try {
      const result = await nominatimSearch(a.query);
      await sleep(1100); // Nominatim policy: ≤1 req/sec
      if (result) return { ...result, level: a.level, query: a.query };
    } catch (err) {
      console.log(`     attempt failed (${a.level}): ${err.message}`);
      await sleep(1100);
    }
  }
  return null;
}

async function run() {
  console.log(`\n🔍 Geocoding ${data.facilities.length} facilities via OpenStreetMap Nominatim`);
  console.log(`   Force: ${FORCE} · Dry run: ${DRY_RUN}`);
  console.log(`   ⏱  ~1 second per request — full run takes ~1–2 minutes\n`);

  const report = {
    run_at: new Date().toISOString(),
    source: 'nominatim',
    total: data.facilities.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    changes: [],
  };

  for (const f of data.facilities) {
    if (!FORCE && f.coordinate_confidence === 'verified') {
      report.skipped++;
      console.log(`⏭️   ${f.code} ${f.name} — already verified`);
      continue;
    }

    const result = await geocodeOne(f);
    if (!result) {
      report.failed++;
      console.log(`❌  ${f.code} ${f.name} — no match found`);
      report.changes.push({ code: f.code, name: f.name, status: 'no_match' });
      continue;
    }

    const prev = { lat: f.lat, lng: f.lng };
    const drift = haversineMeters(prev, result);
    report.updated++;
    report.changes.push({
      code: f.code,
      name: f.name,
      from: prev,
      to: { lat: result.lat, lng: result.lng },
      drift_meters: Math.round(drift),
      matched: result.display_name,
      fallback_level: result.level,
      query_used: result.query,
    });

    if (!DRY_RUN) {
      f.lat = round6(result.lat);
      f.lng = round6(result.lng);
      f.coordinate_confidence = 'verified';
      f.geocode_source = 'nominatim';
      f.geocode_match_level = result.level;
    }

    const driftFlag = drift > 800 ? ' ⚠️ large drift' : '';
    console.log(
      `✅  ${f.code} ${f.name} — ${result.level}, moved ${Math.round(drift)} m${driftFlag}`
    );
  }

  if (!DRY_RUN && report.updated > 0) {
    data.data_note =
      (data.data_note ? data.data_note + ' ' : '') +
      `[${new Date().toISOString().slice(0, 10)}] ${report.updated} facilities geocoded via OSM Nominatim.`;

    const backupPath = DATA_PATH.replace(/\.json$/, `.backup-${Date.now()}.json`);
    fs.copyFileSync(DATA_PATH, backupPath);
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`\n💾 Updated:  ${path.relative(ROOT, DATA_PATH)}`);
    console.log(`   Backup:   ${path.relative(ROOT, backupPath)}`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`📄 Report:   ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(
    `\n✨ Done — updated ${report.updated} · skipped ${report.skipped} · failed ${report.failed}`
  );
  console.log(
    `   Spot-check entries with drift > 800 m and any 'name-only' matches in the report.\n`
  );
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
