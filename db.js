'use strict';

// Tiny storage layer. Supabase REST when configured, otherwise a local JSON file (dev only).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const useSupabase = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

function filePath() {
  const dir = process.env.DATA_DIR || (process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '.data'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'db.json');
}
function readFile() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch {
    return { verifications: [], leads: [] };
  }
}
function writeFile(data) {
  fs.writeFileSync(filePath(), JSON.stringify(data, null, 2));
}

async function sb(method, table, { query = '', body } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`supabase_${method}_${table}_${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function insert(table, row) {
  const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
  if (useSupabase()) return (await sb('POST', table, { body: full }))[0];
  const data = readFile();
  data[table].push(full);
  writeFile(data);
  return full;
}

async function recent(table, limit = 200) {
  if (useSupabase()) return sb('GET', table, { query: `?select=*&order=created_at.desc&limit=${limit}` });
  return readFile()[table].slice().reverse().slice(0, limit);
}

async function getById(table, id) {
  if (useSupabase()) {
    const rows = await sb('GET', table, { query: `?select=*&id=eq.${encodeURIComponent(id)}&limit=1` });
    return rows[0] || null;
  }
  return readFile()[table].find((r) => r.id === id) || null;
}

// Re-use a live (non-demo) report for the same institution + language + concern for 7 days.
async function findCachedVerification(institution_key, language, concern_category) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  if (useSupabase()) {
    const q =
      `?select=*&institution_key=eq.${encodeURIComponent(institution_key)}&language=eq.${language}` +
      `&concern_category=eq.${concern_category}&mock=eq.false&cached=eq.false&created_at=gte.${encodeURIComponent(since)}` +
      `&order=created_at.desc&limit=1`;
    return (await sb('GET', 'verifications', { query: q }))[0] || null;
  }
  return (
    readFile()
      .verifications.slice()
      .reverse()
      .find(
        (v) =>
          v.institution_key === institution_key &&
          v.language === language &&
          v.concern_category === concern_category &&
          !v.mock &&
          !v.cached &&
          v.created_at >= since
      ) || null
  );
}

async function countLiveRunsToday() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await recent('verifications', 1000);
  return rows.filter((v) => !v.mock && !v.cached && v.created_at >= start.toISOString()).length;
}

module.exports = { insert, recent, getById, findCachedVerification, countLiveRunsToday };
