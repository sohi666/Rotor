#!/usr/bin/env node
/**
 * App Store Connect setup that fastlane deliver doesn't cover, through the official API:
 *   - price: Free (base territory USA, applied worldwide)
 *   - availability: every territory, plus new ones automatically
 *   - App Review contact on the editable version (when REVIEW_PHONE is given)
 * Idempotent: anything already set is left as it is (pass --force-review to overwrite the contact).
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, ASC_APP_ID,
 *      REVIEW_FIRST_NAME, REVIEW_LAST_NAME, REVIEW_PHONE, REVIEW_EMAIL (optional block)
 * The App Privacy questionnaire has no public API: answer it in App Store Connect.
 */
import { createPrivateKey, sign } from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com';
const env = (k) => (process.env[k] ?? '').trim() || undefined;
const log = (...a) => console.log('[asc-setup]', ...a);

function pem(text) {
  let t = text.trim();
  if (!t.includes('-----BEGIN')) t = Buffer.from(t, 'base64').toString('utf8').trim();
  return t.replace(/\\n/g, '\n');
}
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' })}.${b64url({
    iss: env('ASC_ISSUER_ID'),
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  })}`;
  const sig = sign('sha256', Buffer.from(input), { key: createPrivateKey(pem(env('ASC_KEY_P8'))), dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

async function asc(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json.errors?.[0];
    throw new Error(`${method} ${path} -> ${res.status} ${e?.code ?? ''}: ${e?.detail ?? e?.title ?? text.slice(0, 300)}`);
  }
  return json;
}

async function all(path) {
  const out = [];
  let next = API + path;
  while (next) {
    const page = await asc(next.slice(API.length));
    out.push(...page.data);
    next = page.links?.next;
  }
  return out;
}

const APP = env('ASC_APP_ID');

async function price() {
  const existing = await asc(`/v1/apps/${APP}/appPriceSchedule`).catch(() => null);
  if (existing?.data) {
    const manual = await asc(`/v1/appPriceSchedules/${existing.data.id}/manualPrices?include=appPricePoint&limit=5`).catch(() => null);
    if (manual?.data?.length) return log('price: already set, left unchanged');
  }
  const points = await all(`/v1/apps/${APP}/appPricePoints?filter[territory]=USA&limit=200`);
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('No free price point found for USA');
  await asc('/v1/appPriceSchedules', {
    method: 'POST',
    body: {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP } },
          baseTerritory: { data: { type: 'territories', id: 'USA' } },
          manualPrices: { data: [{ type: 'appPrices', id: '${price0}' }] },
        },
      },
      included: [
        {
          type: 'appPrices',
          id: '${price0}',
          attributes: { startDate: null },
          relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
        },
      ],
    },
  });
  log('price: Free');
}

async function availability() {
  const existing = await asc(`/v1/apps/${APP}/appAvailabilityV2`).catch(() => null);
  if (existing?.data) return log('availability: already set, left unchanged');
  const territories = await all('/v1/territories?limit=200');
  const ids = territories.map((t) => t.id);
  await asc('/v2/appAvailabilities', {
    method: 'POST',
    body: {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: APP } },
          territoryAvailabilities: { data: ids.map((id) => ({ type: 'territoryAvailabilities', id: `\${${id}}` })) },
        },
      },
      included: ids.map((id) => ({
        type: 'territoryAvailabilities',
        id: `\${${id}}`,
        attributes: { available: true },
        relationships: { territory: { data: { type: 'territories', id } } },
      })),
    },
  });
  log(`availability: ${ids.length} territories, new territories included`);
}

async function reviewContact() {
  // Apple requires name, phone and email in every write to this record.
  const phone = env('REVIEW_PHONE');
  if (!phone) return log('review contact: REVIEW_PHONE not given, left unchanged (required before submitting)');
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState ?? v.attributes.appVersionState),
  );
  if (!editable) return log('review contact: no editable version, skipped');
  const attributes = {
    contactFirstName: env('REVIEW_FIRST_NAME') ?? 'Sohrab',
    contactLastName: env('REVIEW_LAST_NAME') ?? 'Behtoyi',
    contactEmail: env('REVIEW_EMAIL') ?? 'support@cibinc.ca',
    demoAccountRequired: false,
    ...(phone ? { contactPhone: phone } : {}),
  };
  const current = await asc(`/v1/appStoreVersions/${editable.id}/appStoreReviewDetail`).catch(() => null);
  if (current?.data) {
    await asc(`/v1/appStoreReviewDetails/${current.data.id}`, {
      method: 'PATCH',
      body: { data: { type: 'appStoreReviewDetails', id: current.data.id, attributes } },
    });
  } else {
    await asc('/v1/appStoreReviewDetails', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreReviewDetails',
          attributes,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: editable.id } } },
        },
      },
    });
  }
  log(`review contact: ${attributes.contactFirstName} ${attributes.contactLastName}, ${attributes.contactEmail}, phone ${phone ? 'set' : 'NOT set yet (required before submitting)'} (version ${editable.attributes.versionString})`);
}

/** Print the live age-rating declaration with each attribute's JSON type (Apple changes this schema). */
async function ageRatingSchema() {
  const infos = await asc(`/v1/apps/${APP}/appInfos?limit=5`);
  for (const info of infos.data) {
    const decl = await asc(`/v1/appInfos/${info.id}/ageRatingDeclaration`).catch((e) => ({ error: e.message }));
    if (decl.error) return log(`age rating (${info.attributes.state ?? info.id}): ${decl.error}`);
    const attrs = decl.data?.attributes ?? {};
    log(`age rating (${info.attributes.state ?? info.id}): ` + Object.entries(attrs).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', '));
  }
}

const missing = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8', 'ASC_APP_ID'].filter((k) => !env(k));
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}`);
  process.exit(1);
}
let failed = 0;
for (const step of [ageRatingSchema, price, availability, reviewContact]) {
  try {
    await step();
  } catch (e) {
    failed++;
    console.error(`[asc-setup] ${step.name} FAILED: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
