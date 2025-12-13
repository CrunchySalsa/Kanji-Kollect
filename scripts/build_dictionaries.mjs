/**
 * Build offline Japanese dictionaries (KANJIDIC2 + JMdict) into compact JSON.
 *
 * Outputs:
 *  - assets/dictionaries/kanji.json
 *  - assets/dictionaries/words.json
 *
 * Source data (EDRDG):
 *  - https://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz
 *  - https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
 *
 * Note: This is a build-time script (Node.js), not used at runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'assets', 'dictionaries');
const TMP_DIR = path.join(ROOT, '.tmp-dictionaries');
const GEN_DIR = path.join(ROOT, 'services', 'generated');

const URLS = {
  // Use www.edrdg.org for TLS certificate compatibility.
  kanjidic2: 'https://www.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
  jmdict: 'https://www.edrdg.org/pub/Nihongo/JMdict_e.gz',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: ${url} (status ${res.statusCode})`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });
  });
}

function gunzipFile(gzPath, outPath) {
  return new Promise((resolve, reject) => {
    const inp = fs.createReadStream(gzPath);
    const out = fs.createWriteStream(outPath);
    inp
      .pipe(zlib.createGunzip())
      .pipe(out)
      .on('finish', resolve)
      .on('error', reject);
  });
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
}

function arr(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

async function buildKanjidic2(xmlPath) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const xml = readText(xmlPath);
  const data = parser.parse(xml);
  const chars = arr(data?.kanjidic2?.character);

  // Output map keyed by kanji char
  const out = {};

  for (const c of chars) {
    const literal = c?.literal;
    if (!literal || typeof literal !== 'string') continue;

    const readingMeaning = c?.reading_meaning?.rmgroup;
    const readings = arr(readingMeaning?.reading);
    const meanings = arr(readingMeaning?.meaning)
      .filter((m) => typeof m === 'string') // ignore ones with attributes/lang
      .filter((m) => !/^\d+\*\*\d+$/.test(m)); // remove scientific notation like "10**16"

    const onyomi = [];
    const kunyomi = [];
    for (const r of readings) {
      const t = typeof r === 'string' ? r : r?.['#text'];
      const type = typeof r === 'object' ? r?.['@_r_type'] : null;
      if (!t) continue;
      if (type === 'ja_on') onyomi.push(t);
      if (type === 'ja_kun') kunyomi.push(t);
    }

    out[literal] = {
      readings: { onyomi, kunyomi },
      meanings,
    };
  }

  return out;
}

async function buildJmdict(xmlPath) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const xml = readText(xmlPath);
  const data = parser.parse(xml);
  const entries = arr(data?.JMdict?.entry);

  // Build a lookup table keyed by surface form (kanji or kana).
  // Keep only one best entry per key for simplicity.
  const out = {};

  for (const e of entries) {
    const kebs = arr(e?.k_ele).flatMap((k) => arr(k?.keb)).filter((x) => typeof x === 'string');
    const rebs = arr(e?.r_ele).flatMap((r) => arr(r?.reb)).filter((x) => typeof x === 'string');

    // First reading is good enough for our UI
    const reading = rebs[0] ?? null;

    const senses = arr(e?.sense);
    const glosses = senses
      .flatMap((s) => arr(s?.gloss))
      .map((g) => (typeof g === 'string' ? g : g?.['#text']))
      .filter((g) => typeof g === 'string' && g.length > 0)
      .filter((g) => !/^\d+\*\*\d+$/.test(g)); // remove scientific notation like "10**16"

    if (!glosses.length) continue;
    const meaning = glosses.slice(0, 6); // cap for UI

    // Save entries for all surface forms
    const keys = [...kebs, ...rebs];
    for (const key of keys) {
      if (!key || out[key]) continue;
      out[key] = {
        reading: reading ?? (rebs[0] ?? ''),
        meaning,
      };
    }
  }

  return out;
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(TMP_DIR);
  ensureDir(GEN_DIR);

  const kanjiGz = path.join(TMP_DIR, 'kanjidic2.xml.gz');
  const kanjiXml = path.join(TMP_DIR, 'kanjidic2.xml');
  const jmGz = path.join(TMP_DIR, 'JMdict_e.gz');
  const jmXml = path.join(TMP_DIR, 'JMdict_e.xml');

  console.log('Downloading KANJIDIC2...');
  await download(URLS.kanjidic2, kanjiGz);
  console.log('Decompressing KANJIDIC2...');
  await gunzipFile(kanjiGz, kanjiXml);

  console.log('Downloading JMdict...');
  await download(URLS.jmdict, jmGz);
  console.log('Decompressing JMdict...');
  await gunzipFile(jmGz, jmXml);

  console.log('Building kanji.json...');
  const kanji = await buildKanjidic2(kanjiXml);
  writeJson(path.join(OUT_DIR, 'kanji.json'), kanji);

  console.log('Building words.json...');
  const wordsMap = await buildJmdict(jmXml);
  // IMPORTANT: Do NOT output as one giant object or one giant array.
  // Hermes will crash on giant objects (property storage limit) and large JSON
  // parse on startup causes multi-second UI freezes.
  //
  // Instead, shard the word tuples into buckets and generate a TS module with
  // static `require()`s so Metro can bundle them.
  const bucketCount = 64;
  const buckets = Array.from({ length: bucketCount }, () => []);
  for (const [k, v] of Object.entries(wordsMap)) {
    const first = (k && typeof k === 'string') ? (k.codePointAt(0) ?? 0) : 0;
    const idx = first % bucketCount;
    buckets[idx].push([k, v.reading, v.meaning]); // [surface, reading, meanings]
  }
  for (const b of buckets) {
    b.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  const wordsDir = path.join(OUT_DIR, 'words');
  ensureDir(wordsDir);
  for (let i = 0; i < bucketCount; i++) {
    const name = `bucket_${i.toString(16).padStart(2, '0')}.json`;
    writeJson(path.join(wordsDir, name), buckets[i]);
  }

  // Also write a small index file for debugging/human verification.
  writeJson(path.join(OUT_DIR, 'words_meta.json'), { bucketCount });

  // Generate static require map for Metro (dynamic require won't bundle JSON).
  const lines = [];
  lines.push('/* AUTO-GENERATED by scripts/build_dictionaries.mjs */');
  lines.push('/* eslint-disable @typescript-eslint/no-var-requires */');
  lines.push('export const WORD_BUCKET_COUNT = 64 as const;');
  lines.push('export const WORD_BUCKETS: Record<string, readonly [string, string, string[]][]> = {');
  for (let i = 0; i < bucketCount; i++) {
    const key = i.toString(16).padStart(2, '0');
    lines.push(`  "${key}": require("../../assets/dictionaries/words/bucket_${key}.json"),`);
  }
  lines.push('} as const;');
  lines.push('');
  fs.writeFileSync(path.join(GEN_DIR, 'wordBuckets.ts'), lines.join('\n'), 'utf8');

  console.log('Done.');
  console.log(`Wrote: assets/dictionaries/kanji.json (${Object.keys(kanji).length} kanji)`);
  console.log(`Wrote: assets/dictionaries/words/* buckets (${Object.keys(wordsMap).length} word keys total)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


