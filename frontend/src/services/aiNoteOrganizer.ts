import type { PinNote } from '../types/pinboard';

export interface ScoredNote {
  note: PinNote;
  score: number;
}

/**
 * Natural language urgency detection
 */
const URGENT_KEYWORDS = [
  'urgent',
  'asap',
  'today',
  'tonight',
  'tomorrow',
  'important',
  'priority',
  'critical',
  'emergency',
  'deadline',
  'due',
];

/**
 * Score a note based on priority, pinned status, recency, and natural language urgency
 */
export function scoreNote(note: PinNote): number {
  let score = 0;

  // 1. Pinned status
  if (note.pinned) score += 200;

  // 2. Explicit priority
  if (note.priority === 'HIGH') score += 120;
  else if (note.priority === 'MED') score += 60;
  else score += 10;

  // 3. Natural language urgency keywords in title & content
  const text = `${note.title} ${note.content || ''}`.toLowerCase();
  for (const kw of URGENT_KEYWORDS) {
    if (text.includes(kw)) {
      score += 100;
      break;
    }
  }

  // 4. Recency bonus (more recent = higher score)
  const time = Date.parse(note.updatedAt || '');
  if (!isNaN(time)) {
    const ageHours = Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
    // Decay score gently over 7 days
    const recencyBonus = Math.max(0, 100 - ageHours * 0.5);
    score += recencyBonus;
  }

  return score;
}

/**
 * Organizes notes into heterogeneous pages (15 items per page).
 *
 * Rules:
 * 1. Prioritize according to recentness, priority, and natural language urgency.
 * 2. Guaranteed Heterogeneity: NEVER keep one type of note per page.
 *    Each page must include at least:
 *    - 1 Photo (POLAROID)
 *    - 1 Sticky note (STICKY)
 *    - 1 List (GROCERY or CHORE)
 *    (as long as notes of that type are available).
 */
export function organizeNotesIntoPages(
  notes: PinNote[],
  pageSize = 15
): PinNote[][] {
  if (!notes || notes.length === 0) return [[]];

  // Score and rank all notes descending
  const scoredNotes = notes
    .map((n) => ({ note: n, score: scoreNote(n) }))
    .sort((a, b) => b.score - a.score);

  // Pool buckets by category
  const polaroids: PinNote[] = [];
  const stickies: PinNote[] = [];
  const lists: PinNote[] = [];

  scoredNotes.forEach(({ note }) => {
    if (note.type === 'POLAROID') polaroids.push(note);
    else if (note.type === 'STICKY') stickies.push(note);
    else lists.push(note); // GROCERY or CHORE
  });

  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  const pages: PinNote[][] = [];

  for (let p = 0; p < totalPages; p++) {
    const page: PinNote[] = [];
    const usedIds = new Set<string>();

    const addNote = (note: PinNote | undefined) => {
      if (!note || usedIds.has(note.id)) return;
      page.push(note);
      usedIds.add(note.id);
    };

    // 1. Guaranteed: At least 1 photo per page (if available)
    if (polaroids.length > 0) {
      addNote(polaroids.shift());
    }

    // 2. Guaranteed: At least 1 sticky note per page (if available)
    if (stickies.length > 0) {
      addNote(stickies.shift());
    }

    // 3. Guaranteed: At least 1 list (chore or grocery) per page (if available)
    if (lists.length > 0) {
      addNote(lists.shift());
    }

    // 4. Fill remaining slots of the page with highest ranked remaining notes
    while (page.length < pageSize && (polaroids.length > 0 || stickies.length > 0 || lists.length > 0)) {
      // Find highest scoring available note across remaining pools
      const candidates: PinNote[] = [polaroids[0], stickies[0], lists[0]].filter(Boolean);
      if (candidates.length === 0) break;

      candidates.sort((a, b) => scoreNote(b) - scoreNote(a));
      const chosen = candidates[0];

      // Remove from its pool
      if (polaroids[0]?.id === chosen.id) polaroids.shift();
      else if (stickies[0]?.id === chosen.id) stickies.shift();
      else if (lists[0]?.id === chosen.id) lists.shift();

      addNote(chosen);
    }

    if (page.length > 0) {
      pages.push(page);
    }
  }

  return pages.length > 0 ? pages : [[]];
}
