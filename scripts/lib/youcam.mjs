// YouCam client for the seed scripts. Every finished task is cached in scripts/.cache,
// so re-running a script never spends units twice.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(SCRIPTS, '..');
export const CACHE = path.join(SCRIPTS, '.cache');
const TASKS = path.join(CACHE, 'tasks');
const LEDGER = path.join(CACHE, 'ledger.json');
fs.mkdirSync(TASKS, { recursive: true });

const BASE = 'https://yce-api-01.makeupar.com';
/** Hard limit for the whole 01.4 package. */
export const BUDGET = 230;

function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}
const KEY = process.env.YOUCAM_API_KEY || readEnv().YOUCAM_API_KEY;

async function api(method, p, body) {
  if (!KEY) throw new Error('YOUCAM_API_KEY is missing in project/.env');
  const r = await fetch(BASE + p, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status !== 200) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

export const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);

export async function credit() {
  const j = await api('GET', '/s2s/v1.0/client/credit');
  return j.results.reduce((a, x) => a + x.amount, 0);
}

// ---- budget ledger -------------------------------------------------------
function ledger() {
  return fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { spent: 0, tasks: [] };
}
export const spent = () => ledger().spent;
function charge(key, units) {
  const l = ledger();
  l.spent += units;
  l.tasks.push({ key, units, at: new Date().toISOString() });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}
function guard(units, key) {
  const s = spent();
  if (s + units > BUDGET) {
    throw new Error(`Budget stop: ${key} needs ${units} units, already spent ${s} of ${BUDGET}`);
  }
}

/** Prints the balance and the package spend; call at the start and end of every script. */
export async function logBalance(label) {
  const c = await credit();
  console.log(`[units] ${label}: balance ${c}, package spent ${spent()} / ${BUDGET}`);
  return c;
}

// ---- files and tasks -----------------------------------------------------
export async function upload(buf, contentType = 'image/jpeg', fileName = 'photo.jpg') {
  const j = await api('POST', '/s2s/v2.0/file', { files: [{ content_type: contentType, file_name: fileName, file_size: buf.length }] });
  const f = j.data.files[0];
  const req = f.requests[0];
  const put = await fetch(req.url, { method: req.method || 'PUT', headers: req.headers, body: buf });
  if (!put.ok) throw new Error('upload PUT failed ' + put.status);
  return f.file_id;
}

async function runTask(task, body, every = 2000) {
  const t0 = Date.now();
  const j = await api('POST', `/s2s/v2.0/task/${task}`, body);
  const id = j.data.task_id;
  for (;;) {
    await new Promise((r) => setTimeout(r, every));
    const s = await api('GET', `/s2s/v2.0/task/${task}/${id}`);
    if (s.data.task_status === 'success') return { data: s.data, ms: Date.now() - t0 };
    if (s.data.task_status === 'error') throw new Error(`${task} error ${JSON.stringify(s.data).slice(0, 300)}`);
    if (Date.now() - t0 > 120_000) throw new Error(`${task} timeout ${id}`);
  }
}

async function fetchBuf(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error('download failed ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Runs a task once. The record and all downloaded files live in .cache/tasks/<key>/.
 * `collect(data)` returns { name: url } for files to download right away (URLs expire in 2 h).
 */
async function cachedTask(key, units, task, makeBody, collect) {
  const dir = path.join(TASKS, key);
  const rec = path.join(dir, 'task.json');
  if (fs.existsSync(rec)) return { ...JSON.parse(fs.readFileSync(rec, 'utf8')), dir, cached: true };
  guard(units, key);
  const body = await makeBody();
  let data;
  let ms;
  try {
    ({ data, ms } = await runTask(task, body));
  } catch (e) {
    // YouCam has been seen to charge failed analyses too: count them, stay on the safe side.
    if (/ error /.test(String(e.message))) charge(`${key} (failed)`, units);
    throw e;
  }
  charge(key, units);
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [name, url] of Object.entries(collect(data))) {
    const buf = await fetchBuf(url);
    fs.writeFileSync(path.join(dir, name), buf);
    files[name] = name;
  }
  const out = { key, task, body: { ...body, src_file_id: undefined }, ms, units, data, files };
  fs.writeFileSync(rec, JSON.stringify(out, null, 2));
  return { ...out, dir, cached: false };
}

const ext = (url, fallback) => (url.split('?')[0].match(/\.(png|jpe?g)$/i)?.[1] || fallback).toLowerCase().replace('jpeg', 'jpg');

/** text-to-image/youcam, 1 unit. Returns the local image path. */
export async function textToImage(key, prompt, negative) {
  const r = await cachedTask(`t2i-${key}`, 1, 'text-to-image/youcam',
    async () => ({ model: 'youcam-image-v2', prompt, negative_prompt: negative, size: '1104*1472' }),
    (d) => {
      const url = d.results?.url || d.results?.[0]?.url;
      return { [`image.${ext(url, 'png')}`]: url };
    });
  return path.join(r.dir, Object.keys(r.files)[0]);
}

export const analysisCost = (n) => (n <= 4 ? 9 : n <= 8 ? 12 : 14);

/**
 * SD skin analysis of a JPEG buffer. Cached by image hash + concerns.
 * Returns { dir, scores, overall, skinAge, image (path), masks: { concern: path } }.
 */
export async function analyze(buf, concerns, label = '') {
  const cs = [...concerns].sort();
  const key = `an-${label ? label + '-' : ''}${sha(buf)}-${cs.join('.')}`;
  const r = await cachedTask(key, analysisCost(cs.length), 'skin-analysis',
    async () => ({ src_file_id: await upload(buf), dst_actions: cs, format: 'json' }),
    (d) => {
      const files = {};
      for (const o of d.results.output) {
        if (o.type === 'resize_image') files['image.jpg'] = o.mask_urls[0];
        else if (o.mask_urls?.length) files[`mask-${o.type}.png`] = o.mask_urls[0];
      }
      return files;
    });
  return normalizeAnalysis(r);
}

export function normalizeAnalysis(r) {
  const out = { dir: r.dir, cached: r.cached, scores: {}, masks: {}, overall: 0, skinAge: 0, image: path.join(r.dir, 'image.jpg') };
  for (const o of r.data.results.output) {
    if (o.type === 'all') out.overall = o.score;
    else if (o.type === 'skin_age') out.skinAge = o.score;
    else if (o.type !== 'resize_image' && typeof o.ui_score === 'number') {
      out.scores[o.type] = { ui: o.ui_score, raw: Math.round(o.raw_score * 100) / 100 };
      out.masks[o.type] = path.join(r.dir, `mask-${o.type}.png`);
    }
  }
  return out;
}

/** Skin simulation of a JPEG buffer, 4 units for 1–4 concerns. Returns the local PNG path. */
export async function simulate(buf, intensities, label = '') {
  const clean = Object.fromEntries(Object.entries(intensities).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v * 1000) / 1000]).sort());
  const n = Object.keys(clean).length;
  const key = `sim-${label ? label + '-' : ''}${sha(buf)}-${sha(Buffer.from(JSON.stringify(clean)))}`;
  const r = await cachedTask(key, n <= 4 ? 4 : 6, 'skin-simulation',
    async () => ({ src_file_id: await upload(buf), ...clean }),
    (d) => {
      const url = d.results?.url || d.results?.[0]?.url;
      return { [`image.${ext(url, 'png')}`]: url };
    });
  return path.join(r.dir, Object.keys(r.files)[0]);
}
