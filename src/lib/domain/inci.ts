import { ACTIVES } from './actives';
import type { Active, InciMatch, ParsedInci } from './types';

/** Ingredients this close to the top of the list are present in a meaningful amount. */
export const LEADING_COUNT = 5;

interface AliasEntry {
  alias: string;
  /** Comparison form: hyphens read as spaces, so "alpha arbutin" meets "alpha-arbutin". */
  key: string;
  active: Active;
}

const keyOf = (s: string) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

// Longest alias first, so "3-o-ethyl ascorbic acid" wins over "ascorbic acid".
const ALIASES: AliasEntry[] = ACTIVES.flatMap((active) =>
  active.aliases.map((alias) => ({ alias, key: keyOf(alias), active })),
).sort((a, b) => b.key.length - a.key.length);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-')
    .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/[*†‡.:]+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits an ingredient list into normalized entries. Each entry keeps its position and every way
 * of reading it: the name without brackets plus anything written inside brackets, since labels
 * write both "Centella Asiatica (Gotu Kola) Extract" and "CI 77891 (Titanium Dioxide)".
 */
export function splitInci(text: string): { index: number; candidates: string[] }[] {
  const pieces = text
    .replace(/\(\s*and\s*\)/gi, ',')
    .split(/[,;\n\r•·|/]+|\s•\s/);
  const out: { index: number; candidates: string[] }[] = [];
  for (const raw of pieces) {
    const inner = [...raw.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => normalize(m[1]));
    const outer = normalize(raw.replace(/[([][^)\]]*[)\]]/g, ' '));
    const candidates = [outer, ...inner].filter((c) => c.length > 1);
    if (candidates.length === 0) continue;
    out.push({ index: out.length, candidates: [...new Set(candidates)] });
  }
  return out;
}

function matchesAlias(token: string, alias: string): boolean {
  if (token === alias) return true;
  if (!token.startsWith(alias)) return false;
  // "salicylic acid" must not match "salicylic acidic…"; next char has to end the word.
  return !/[a-z0-9]/.test(token.charAt(alias.length));
}

function findAlias(token: string): AliasEntry | undefined {
  const key = keyOf(token);
  return ALIASES.find((e) => matchesAlias(key, e.key));
}

/**
 * Finds known actives in an INCI list. Rules on top of alias matching:
 * - aliases listed in `leadingOnly` (glycerin) count only within the first 5 ingredients;
 * - sunscreen filters count when there are two or more different filters, or one filter within
 *   the first 5 ingredients. A single filter near the end (ethylhexyl salicylate in a serum)
 *   is a minor helper, not an SPF.
 */
export function parseInci(text: string): ParsedInci {
  const entries = splitInci(text ?? '');
  const hits: (InciMatch & { index: number; alias: string })[] = [];
  for (const entry of entries) {
    for (const token of entry.candidates) {
      const found = findAlias(token);
      if (!found) continue;
      if (found.active.leadingOnly?.includes(found.alias) && entry.index >= LEADING_COUNT) continue;
      hits.push({ activeId: found.active.id, token, index: entry.index, alias: found.alias });
      break;
    }
  }

  const kept = hits.filter((h) => {
    if (h.activeId !== 'sunscreen') return true;
    const filters = new Set(hits.filter((x) => x.activeId === 'sunscreen').map((x) => x.alias));
    if (filters.size >= 2) return true;
    return h.index < LEADING_COUNT;
  });

  const actives: string[] = [];
  for (const h of kept) if (!actives.includes(h.activeId)) actives.push(h.activeId);
  return { actives, matched: kept.map(({ activeId, token }) => ({ activeId, token })) };
}
