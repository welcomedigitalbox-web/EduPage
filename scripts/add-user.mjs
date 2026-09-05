#!/usr/bin/env node
// Creates or updates a dashboard account. Use this once to make the first
// manager; after that, managers add people from Settings.
//
//   node scripts/add-user.mjs <email> <password> [agent|manager] ["Full Name"]

import { readFileSync } from 'node:fs';
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* file may not exist */ }
  }
}

const [email, password, role = 'agent', name = null] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: node scripts/add-user.mjs <email> <password> [agent|manager] ["Name"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('password must be at least 8 characters');
  process.exit(1);
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scrypt(password, salt, 64);
const password_hash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;

const res = await fetch(`${url}/rest/v1/msgr_users?on_conflict=email`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify([{
    email: email.trim().toLowerCase(),
    name,
    password_hash,
    role: role === 'manager' ? 'manager' : 'agent',
    is_active: true,
  }]),
});

if (!res.ok) {
  console.error('failed:', res.status, await res.text());
  process.exit(1);
}
const [row] = await res.json();
console.log(`ok: ${row.email} (${row.role})`);
