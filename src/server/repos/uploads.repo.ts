import type postgres from 'postgres';

export interface UploadRow {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  reportId: string | null;
}

export function findForClaim(
  db: postgres.Sql,
  ids: string[],
  claimHash: string,
  reportId?: string,
) {
  return db<UploadRow[]>`
    SELECT id, filename, mime_type AS "mimeType", width, height, report_id AS "reportId"
    FROM uploads
    WHERE id = ANY(${ids}::uuid[])
      AND claim_hash = ${claimHash}
      AND (expires_at IS NULL OR expires_at > now())
      AND (report_id IS NULL OR report_id = ${reportId ?? null})
  `;
}

export function findForReport(db: postgres.Sql, ids: string[], reportId: string) {
  return db<UploadRow[]>`
    SELECT id, filename, mime_type AS "mimeType", width, height, report_id AS "reportId"
    FROM uploads
    WHERE id = ANY(${ids}::uuid[]) AND report_id = ${reportId}
  `;
}

export function claim(
  db: postgres.Sql,
  ids: string[],
  claimHash: string,
  reportId: string,
) {
  return db<{ id: string }[]>`
    UPDATE uploads
    SET report_id = ${reportId}, expires_at = NULL
    WHERE id = ANY(${ids}::uuid[])
      AND (
        report_id = ${reportId}
        OR (
          report_id IS NULL
          AND claim_hash = ${claimHash}
          AND (expires_at IS NULL OR expires_at > now())
        )
      )
    RETURNING id
  `;
}

export function insert(
  db: postgres.Sql,
  upload: {
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    claimHash: string;
    expiresAt: Date;
  },
) {
  return db<{ id: string }[]>`
    INSERT INTO uploads
      (filename, original_name, mime_type, size_bytes, width, height, claim_hash, expires_at)
    VALUES
      (${upload.filename}, ${upload.originalName}, ${upload.mimeType}, ${upload.sizeBytes},
       ${upload.width}, ${upload.height}, ${upload.claimHash}, ${upload.expiresAt})
    RETURNING id
  `.then((rows) => rows[0]?.id ?? null);
}
