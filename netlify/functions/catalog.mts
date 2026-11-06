import type { Config } from '@netlify/functions';
import { createHash, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { catalogEdits, catalogState } from '../../db/schema.js';

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function authorized(request: Request) {
  const supplied = createHash('sha256').update(request.headers.get('X-Ailton-Password') || '').digest();
  return timingSafeEqual(supplied, Buffer.from('73a2af8864fc500fa49048bf3003776c19938f360e56bd03663866fb3087884a', 'hex'));
}
function validProduct(p: any) {
  return p && Number.isSafeInteger(p.id) && p.id > 0 && p.id <= 2147483647
    && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 300
    && typeof p.brand === 'string' && p.brand.length <= 100
    && ['tela', 'bateria', 'flex'].includes(p.category)
    && ['original', 'vivid', 'nacional', 'compativel'].includes(p.quality)
    && ['tech_price', 'customer_price', 'labor_price'].every(k => p[k] == null || (typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0))
    && (p.custom_image == null || p.custom_image === '' || (typeof p.custom_image === 'string' && p.custom_image.length <= 4096 && /^https:\/\//i.test(p.custom_image)));
}
export default async function handler(request: Request) {
  if (!['GET', 'POST'].includes(request.method)) return reply({ ok: false }, 405);
  let edits: any[] = [];
  if (request.method === 'POST') {
    if (!authorized(request)) return reply({ ok: false, error: 'Acesso não autorizado.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ ok: false }, 403);
    try {
      const body = await request.text();
      if (body.length > 2000000) return reply({ ok: false }, 413);
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.edits) || !payload.edits.length || payload.edits.length > 5000 || !payload.edits.every(validProduct)) return reply({ ok: false, error: 'Dados inválidos.' }, 400);
      edits = [...new Map(payload.edits.map((p: any) => [p.id, p])).values()] as any[];
    } catch { return reply({ ok: false, error: 'Dados inválidos.' }, 400); }
  }
  try {
    const db = database();
    const result = await db.transaction(async tx => {
      if (request.method === 'POST') {
        await tx.insert(catalogState).values({ id: 1, revision: 0 }).onConflictDoNothing();
        // Serialize writers so the revision and returned products describe one committed catalog.
        await tx.update(catalogState).set({ revision: sql`${catalogState.revision} + 1` }).where(eq(catalogState.id, 1));
        for (const p of edits) {
          await tx.insert(catalogEdits).values({ id: p.id, product: p })
            .onConflictDoUpdate({ target: catalogEdits.id, set: { product: p } });
        }
      }
      const [state] = await tx.select().from(catalogState).where(eq(catalogState.id, 1));
      const rows = await tx.select().from(catalogEdits);
      return { ok: true, revision: state?.revision ?? 0, edits: Object.fromEntries(rows.map(row => [row.id, row.product])) };
    }, request.method === 'GET' ? { isolationLevel: 'repeatable read' } : undefined);
    return reply(result);
  } catch {
    return reply({ ok: false, error: 'Sincronização indisponível. Tente novamente.' }, 503);
  }
}
export const config: Config = { path: '/api/catalog' };
