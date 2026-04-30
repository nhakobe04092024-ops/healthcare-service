/**
 * Geocode every facility via LocationIQ (free tier: 5,000 req/day, 2 req/sec).
 * No billing, no card, no Google. Just an email signup at https://locationiq.com.
 *
 * Usage:
 *   LOCATIONIQ_TOKEN=your_token node scripts/geocode-locationiq.js
 *   node scripts/geocode-locationiq.js --dry-run
 *   node scripts/geocode-locationiq.js --force
 *
 * Or put it in .env.local at the project root:
 *   LOCATIONIQ_TOKEN=pk.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Strategy: try name+address, then address-only, then name-only.
 *   Backs up the JSON, writes a full audit report, never overwrites silently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src/data/hcmc_healthcare_facilities_interactive_map.json');
const REPORT_PATH = path.join(ROOT, 'scripts/geocode-report.json');

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

const TOKEN = process.env.LOCATIONIQ_TOKEN;
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('\n❌  Missing LOCATIONIQ_TOKEN.');
  console.error('   1. Sign up free at https://locationiq.com (email + password, no card)');
  console.error('   2. Copy your access token from the dashboard');
  console.error('   3. Add to .env.local:');
  console.error('        LOCATIONIQ_TOKEN=pk.your_token_here\n');
  process.exit(1);
}

if (!fs.existsSync(DATA_PATH)) {
  console.error(`❌  Data file not found: ${DATA_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// HCMC bounding box keeps results local
const VIEWBOX = '106.30,11.40,107.20,10.30'; // left,top,right,bottom

async function search(query) {
  const url =
    'https://us1.locationiq.com/v1/search?' +
    new URLSearchParams({
      key: TOKEN,
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'vn',
      viewbox: VIEWBOX,
      bounded: '1',
      'accept-language': 'vi,en',
      addressdetails: '1',
    });

  const res = await fetch(url);
  if (res.status === 404) return null; // No match
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const top = arr[0];
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    display_name: top.display_name,
    osm_id: top.osm_id,
    osm_type: top.osm_type,
    place_class: top.class,
    place_type: top.type,
    importance: top.importance,
  };
}

async function geocodeOne(facility) {
  const name = facility.name;
  const address = facility.real_address || facility.address_hint || '';

  const attempts = [
    { level: 'name+address', query: address ? `${name}, ${address}` : name },
    { level: 'address-only', query: address || null },
    { level: 'name-only', query: `${name}, Ho Chi Minh City, Vietnam` },
  ].filter((a) => a.query);

  for (const a of attempts) {
    try {
      const result = await search(a.query);
      await sleep(550); // free tier: 2 req/sec → ~550ms gap is safe
      if (result) return { ...result, level: a.level, query: a.query };
    } catch (err) {
      console.log(`     attempt failed (${a.level}): ${err.message}`);
      await sleep(550);
    }
  }
  return null;
}

async function run() {
  console.log(`\n🔍 Geocoding ${data.facilities.length} facilities via LocationIQ`);
  console.log(`   Force: ${FORCE} · Dry run: ${DRY_RUN}`);
  console.log(`   ⏱  ~0.5–1.5 s per facility — full run ≈ 1–2 minutes\n`);

  const report = {
    run_at: new Date().toISOString(),
    source: 'locationiq',
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
      place_class: result.place_class,
      place_type: result.place_type,
    });

    if (!DRY_RUN) {
      f.lat = round6(result.lat);
      f.lng = round6(result.lng);
      f.coordinate_confidence = 'verified';
      f.geocode_source = 'locationiq';
      f.geocode_match_level = result.level;
    }

    const driftFlag = drift > 800 ? ' ⚠️ large drift' : '';
    const fallbackFlag = result.level === 'name-only' ? ' ⚠️ name-only' : '';
    console.log(
      `✅  ${f.code} ${f.name} — ${result.level}, moved ${Math.round(drift)} m${driftFlag}${fallbackFlag}`
    );
  }

  if (!DRY_RUN && report.updated > 0) {
    data.data_note =
      (data.data_note ? data.data_note + ' ' : '') +
      `[${new Date().toISOString().slice(0, 10)}] ${report.updated} facilities geocoded via LocationIQ.`;
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
