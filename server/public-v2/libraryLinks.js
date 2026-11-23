import { createHash } from 'node:crypto';
import { getAllLibraries } from '../services/directory.js';
import historical from '../../data/library-selection-aliases.json' with { type: 'json' };

export function libraryNameSlug(name) {
  return [...String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')].slice(0, 140).join('').replace(/-+$/g, '');
}

export function createLibraryLinkIndex(entries, aliases = {}) {
  const rows = [...new Map(entries.filter(entry => entry?.id && entry?.name).map(entry => [entry.id, entry])).values()];
  const groups = Map.groupBy(rows, entry => libraryNameSlug(entry.name) || 'library');
  const bySlug = new Map(), paths = new Map();
  for (const [base, group] of groups) {
    for (const entry of group) {
      const place = [...libraryNameSlug(entry.city || entry.region || entry.country)].slice(0, 40).join('').replace(/-+$/g, '');
      // Double hyphens reserve a namespace that normalized names cannot occupy.
      // Never pick the first directory result when more than one name matches.
      const suffix = createHash('sha256').update(entry.id).digest('hex').slice(0, 16);
      let slug = group.length === 1 ? base : `${base}${place ? `-${place}` : ''}--${suffix}`;
      if (aliases[slug] && aliases[slug] !== entry.id) slug = `${slug}--${suffix}`;
      if (bySlug.has(slug)) throw new Error('Library selection link collision');
      bySlug.set(slug, entry.id);
      paths.set(entry.id, `/select/${encodeURIComponent(slug)}`);
    }
  }
  const ids = new Set(rows.map(entry => entry.id));
  for (const [slug, id] of Object.entries(aliases)) {
    if (!ids.has(id)) throw new Error('Missing historical library selection target');
    if (bySlug.has(slug) && bySlug.get(slug) !== id) throw new Error('Historical library selection collision');
    bySlug.set(slug, id);
  }
  return Object.freeze({
    pathFor: id => paths.get(id),
    resolve: slug => bySlug.get(slug) || null,
  });
}

export const libraryLinks = createLibraryLinkIndex(getAllLibraries(), historical);
