import type { PinNote, ChecklistItem, HouseholdMember, NoteType } from '../types.js';

/**
 * Normalizes speech text by lowercasing and stripping punctuation and filler words.
 */
export function cleanVoiceQuery(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes and strips list-related words (e.g. "the grocery list" -> "groceries").
 */
export function normalizeListName(input?: string): string {
  if (!input) return 'groceries';
  const cleaned = cleanVoiceQuery(input)
    .replace(/^(?:the|my|our|a)\s+/i, '')
    .replace(/\s+(?:list|checklist|items|card)$/i, '')
    .trim();

  if (!cleaned || /grocery|groceries|shopping|supermarket|food|store/i.test(cleaned)) {
    return 'groceries';
  }
  return cleaned;
}

/**
 * Calculates a token overlap score (0 to 1) between query and candidate text.
 */
function tokenSimilarityScore(query: string, target: string): number {
  const qTokens = query.split(/\s+/).filter((t) => t.length > 1);
  if (qTokens.length === 0) return 0;

  const targetClean = target.toLowerCase();
  let matches = 0;
  for (const token of qTokens) {
    if (targetClean.includes(token)) {
      matches++;
    }
  }
  return matches / qTokens.length;
}

/**
 * Finds the list note that best matches a requested list name.
 * If listName is groceries or empty, prefers type === 'GROCERY'.
 * Otherwise matches note title against listName.
 */
export function findListNote(notes: PinNote[], rawListName?: string): PinNote | null {
  const normalized = normalizeListName(rawListName);

  if (normalized === 'groceries') {
    const groceryNote = notes.find((n) => n.type === 'GROCERY');
    if (groceryNote) return groceryNote;
  }

  // Look for any note whose title matches the requested list name
  const exact = notes.find((n) => {
    const titleClean = cleanVoiceQuery(n.title).replace(/\s+(?:list|checklist)$/i, '');
    return titleClean === normalized || titleClean.includes(normalized) || normalized.includes(titleClean);
  });
  if (exact) return exact;

  // If asking for "chores", look for chore note or notes
  if (normalized === 'chores') {
    const choreNote = notes.find((n) => n.type === 'CHORE' && n.items && n.items.length > 0);
    if (choreNote) return choreNote;
  }

  // Fuzzy match on any note with items
  const notesWithItems = notes.filter((n) => n.items && n.items.length > 0);
  let bestNote: PinNote | null = null;
  let bestScore = 0;

  for (const note of notesWithItems) {
    const score = tokenSimilarityScore(normalized, note.title);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestNote = note;
    }
  }

  return bestNote;
}

/**
 * Finds an item within a checklist note by matching query text.
 */
export function findChecklistItem(
  note: PinNote,
  itemQuery: string
): { item: ChecklistItem; index: number } | null {
  if (!note.items || note.items.length === 0) return null;
  const q = cleanVoiceQuery(itemQuery);
  if (!q) return null;

  // 1. Exact match on clean item text
  const exactIndex = note.items.findIndex((i) => cleanVoiceQuery(i.text) === q);
  if (exactIndex !== -1) {
    return { item: note.items[exactIndex], index: exactIndex };
  }

  // 2. Substring match
  const subIndex = note.items.findIndex((i) => {
    const t = cleanVoiceQuery(i.text);
    return t.includes(q) || q.includes(t);
  });
  if (subIndex !== -1) {
    return { item: note.items[subIndex], index: subIndex };
  }

  // 3. Token similarity
  let bestIndex = -1;
  let bestScore = 0;
  note.items.forEach((item, idx) => {
    const score = tokenSimilarityScore(q, item.text);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestIndex = idx;
    }
  });

  if (bestIndex !== -1) {
    return { item: note.items[bestIndex], index: bestIndex };
  }

  return null;
}

/**
 * Finds the best matching note (sticky, chore, etc.) based on natural language query.
 */
export function findBestMatchingNote(
  notes: PinNote[],
  query: string,
  typeFilter?: NoteType | NoteType[]
): PinNote | null {
  const q = cleanVoiceQuery(query);
  if (!q) return null;

  const allowedTypes = typeFilter
    ? Array.isArray(typeFilter)
      ? typeFilter
      : [typeFilter]
    : null;

  const candidates = allowedTypes
    ? notes.filter((n) => allowedTypes.includes(n.type))
    : notes;

  if (candidates.length === 0) return null;

  // 1. Substring match on title
  const titleMatch = candidates.find((n) => {
    const t = cleanVoiceQuery(n.title);
    return t.includes(q) || q.includes(t);
  });
  if (titleMatch) return titleMatch;

  // 2. Substring match on content
  const contentMatch = candidates.find((n) => {
    if (!n.content) return false;
    const c = cleanVoiceQuery(n.content);
    return c.includes(q) || q.includes(c);
  });
  if (contentMatch) return contentMatch;

  // 3. Token similarity
  let bestCandidate: PinNote | null = null;
  let bestScore = 0;

  for (const n of candidates) {
    const fullText = `${n.title} ${n.content || ''}`;
    const score = tokenSimilarityScore(q, fullText);
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestCandidate = n;
    }
  }

  return bestCandidate;
}

/**
 * Finds a Polaroid photo note based on query/caption or returns the most recent photo.
 */
export function findBestMatchingPhoto(notes: PinNote[], query?: string): PinNote | null {
  const polaroids = notes
    .filter((n) => n.type === 'POLAROID')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (polaroids.length === 0) return null;

  if (!query) {
    // If no query specified or user said "last photo" / "latest picture", return the most recent
    return polaroids[0];
  }

  const q = cleanVoiceQuery(query);
  if (
    !q ||
    /^(?:the\s+)?(?:last|latest|recent)(?:\s+(?:photo|picture|image|one))?$/i.test(q)
  ) {
    return polaroids[0];
  }

  // Match caption/title
  return findBestMatchingNote(polaroids, q, 'POLAROID');
}

/**
 * Finds a household member by spoken first name or nickname.
 */
export function findMemberByName(
  members: HouseholdMember[],
  nameQuery: string
): HouseholdMember | null {
  const q = cleanVoiceQuery(nameQuery);
  if (!q) return null;

  return (
    members.find((m) => {
      const name = cleanVoiceQuery(m.name);
      return name === q || name.includes(q) || q.includes(name);
    }) || null
  );
}
