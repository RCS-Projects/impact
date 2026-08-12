import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getSql } from '@/lib/db';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await getSql()<
    { canonical_slug: string; public_id: string }[]
  >`UPDATE incidents SET status = 'live', published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = ${params.id} AND status = 'draft' RETURNING canonical_slug, public_id`;
  if (!rows[0]) return NextResponse.json({ error: 'Draft incident not found' }, { status: 404 });
  await getSql()`INSERT INTO audit_events (incident_id, actor_type, actor_id, event_type) VALUES (${params.id}, 'admin', ${admin.id}, 'incident_published')`;
  return NextResponse.json({ url: `/map/${rows[0].canonical_slug}-${rows[0].public_id}` });
}
