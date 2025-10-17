// Repo para cache/staging externo (cinegestion.external_titles)
import { query } from '../../config/db.js';

const schema = process.env.PGSCHEMA || 'cinegestion';

/** Upsert de UNA película mapeada desde TMDB */
export async function upsertExternalTmdb(m) {
  const sql = `
    INSERT INTO ${schema}.external_titles
      (source, external_id, title, original_title, original_language,
       overview, release_date, poster_url, backdrop_url, payload, last_synced_at)
    VALUES ('TMDB', $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
    ON CONFLICT (source, external_id) DO UPDATE SET
      title = EXCLUDED.title,
      overview = EXCLUDED.overview,
      poster_url = EXCLUDED.poster_url,
      backdrop_url = EXCLUDED.backdrop_url,
      payload = EXCLUDED.payload,
      last_synced_at = now(),
      updated_at = now()
    RETURNING *;
  `;
  const params = [
    String(m.external_id),
    m.title ?? null,
    m.original_title ?? null,
    m.original_language ?? null,
    m.synopsis ?? null,
    m.release_date ?? null,
    m.poster_url ?? null,
    m.backdrop_url ?? null,
    JSON.stringify(m),
  ];
  const { rows } = await query(sql, params);
  
  return rows[0];
}

/**Helper: cachear VARIAS películas (silencioso, paralelo) */
export async function cacheFromTmdb(list = []) {
  const subset = list.slice(0, 20);
  await Promise.allSettled(subset.map(upsertExternalTmdb));
}

/** (Futuro) promover un external al catálogo oficial */
export async function promoteToMovie(externalId, curated) {
  const sql = `
    INSERT INTO ${schema}.movies (
      title, synopsis, year, duration_min, classification,
      poster_url, trailer_url, producer,
      external_source, external_id, original_title, original_language,
      metadata, last_synced_at
    )
    SELECT
      $1, $2, $3, $4, $5,
      COALESCE(et.poster_url, $6), $7, $8,
      'TMDB', et.external_id, et.original_title, et.original_language,
      $9::jsonb, now()
    FROM cinegestion.external_titles et
    WHERE et.source='TMDB' AND et.external_id=$10
    ON CONFLICT (external_source, external_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      synopsis = EXCLUDED.synopsis,
      year = EXCLUDED.year,
      poster_url = EXCLUDED.poster_url,
      metadata = EXCLUDED.metadata,
      last_synced_at = now()
    RETURNING *;
  `;
  const params = [
    curated.title,
    curated.synopsis,
    curated.year,
    curated.duration_min,
    curated.classification,
    curated.poster_url ?? null,
    curated.trailer_url ?? null,
    curated.producer,
    JSON.stringify(curated.metadata ?? {}),
    String(externalId),
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

