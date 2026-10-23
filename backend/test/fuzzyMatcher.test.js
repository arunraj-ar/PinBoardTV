import test from 'node:test';
import assert from 'node:assert';
import {
  cleanVoiceQuery,
  normalizeListName,
  findListNote,
  findChecklistItem,
  findBestMatchingNote,
  findBestMatchingPhoto,
  findMemberByName,
} from '../dist/services/fuzzyMatcher.js';

test('cleanVoiceQuery normalizes punctuation and whitespace', () => {
  assert.strictEqual(cleanVoiceQuery('  Please, clean the kitchen!  '), 'please clean the kitchen');
  assert.strictEqual(cleanVoiceQuery('Grandma\'s birthday...'), 'grandma s birthday');
});

test('normalizeListName resolves standard synonyms to "groceries"', () => {
  assert.strictEqual(normalizeListName('the grocery list'), 'groceries');
  assert.strictEqual(normalizeListName('my shopping list'), 'groceries');
  assert.strictEqual(normalizeListName('supermarket'), 'groceries');
  assert.strictEqual(normalizeListName('camping list'), 'camping');
  assert.strictEqual(normalizeListName('packing checklist'), 'packing');
});

test('findListNote matches grocery and custom lists', () => {
  const notes = [
    {
      id: 'n1',
      householdId: 'hh1',
      type: 'GROCERY',
      title: 'Weekly Groceries',
      items: [{ id: 'i1', text: 'Milk', done: false }],
      color: 'green',
      magnet: 'brass-pin',
      rotationDeg: 0,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'n2',
      householdId: 'hh1',
      type: 'GROCERY',
      title: 'Camping Gear',
      items: [{ id: 'i2', text: 'Tent', done: false }],
      color: 'blue',
      magnet: 'blue-star',
      rotationDeg: 0,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T10:00:00Z',
    },
  ];

  const grocery = findListNote(notes, 'groceries');
  assert.strictEqual(grocery?.id, 'n1');

  const camping = findListNote(notes, 'camping list');
  assert.strictEqual(camping?.id, 'n2');
});

test('findChecklistItem identifies exact and partial matches', () => {
  const note = {
    id: 'n1',
    householdId: 'hh1',
    type: 'GROCERY',
    title: 'Weekly Groceries',
    items: [
      { id: 'i1', text: 'Organic Oat Milk', done: false },
      { id: 'i2', text: 'Brown Eggs', done: false },
      { id: 'i3', text: 'Fresh Bananas', done: true },
    ],
    color: 'green',
    magnet: 'brass-pin',
    rotationDeg: 0,
    createdByMemberId: 'alexa',
    pinned: true,
    updatedAt: '2026-10-23T10:00:00Z',
  };

  const match1 = findChecklistItem(note, 'oat milk');
  assert.strictEqual(match1?.item.id, 'i1');

  const match2 = findChecklistItem(note, 'eggs');
  assert.strictEqual(match2?.item.id, 'i2');

  const match3 = findChecklistItem(note, 'bananas');
  assert.strictEqual(match3?.item.id, 'i3');

  const noMatch = findChecklistItem(note, 'chocolate cake');
  assert.strictEqual(noMatch, null);
});

test('findBestMatchingNote finds sticky notes and chores', () => {
  const notes = [
    {
      id: 'n1',
      householdId: 'hh1',
      type: 'STICKY',
      title: 'Plumber arriving Friday 8am',
      color: 'yellow',
      magnet: 'brass-pin',
      rotationDeg: 1,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'n2',
      householdId: 'hh1',
      type: 'CHORE',
      title: 'Take out the recycling bins',
      color: 'blue',
      magnet: 'blue-star',
      rotationDeg: -1,
      assignedToMemberId: 'mem1',
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T10:00:00Z',
    },
  ];

  const plumber = findBestMatchingNote(notes, 'plumber');
  assert.strictEqual(plumber?.id, 'n1');

  const recycling = findBestMatchingNote(notes, 'recycling');
  assert.strictEqual(recycling?.id, 'n2');

  const none = findBestMatchingNote(notes, 'space rocket');
  assert.strictEqual(none, null);
});

test('findBestMatchingPhoto finds polaroid photos by caption or recency', () => {
  const notes = [
    {
      id: 'p1',
      householdId: 'hh1',
      type: 'POLAROID',
      title: 'Summer hike at Bear Mountain',
      imageUrl: 'https://example.com/bear.jpg',
      color: 'cream',
      magnet: 'blue-star',
      rotationDeg: 1,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T08:00:00Z',
    },
    {
      id: 'p2',
      householdId: 'hh1',
      type: 'POLAROID',
      title: 'Buster birthday party',
      imageUrl: 'https://example.com/dog.jpg',
      color: 'cream',
      magnet: 'blue-star',
      rotationDeg: -1,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: '2026-10-23T09:00:00Z',
    },
  ];

  // Specific caption match
  const bearPhoto = findBestMatchingPhoto(notes, 'Bear Mountain');
  assert.strictEqual(bearPhoto?.id, 'p1');

  const dogPhoto = findBestMatchingPhoto(notes, 'Buster party');
  assert.strictEqual(dogPhoto?.id, 'p2');

  // "last photo" gets the most recent (p2)
  const lastPhoto = findBestMatchingPhoto(notes, 'last photo');
  assert.strictEqual(lastPhoto?.id, 'p2');

  const emptyRecent = findBestMatchingPhoto(notes);
  assert.strictEqual(emptyRecent?.id, 'p2');
});

test('findMemberByName finds household members accurately', () => {
  const members = [
    { id: 'm1', householdId: 'hh1', name: 'Mom', color: 'pink', role: 'HOST', status: 'APPROVED', isSameWifi: true, joinedAt: '2026-10-01' },
    { id: 'm2', householdId: 'hh1', name: 'Alex', color: 'orange', role: 'MEMBER', status: 'APPROVED', isSameWifi: true, joinedAt: '2026-10-01' },
    { id: 'm3', householdId: 'hh1', name: 'Maya', color: 'blue', role: 'MEMBER', status: 'APPROVED', isSameWifi: true, joinedAt: '2026-10-01' },
  ];

  assert.strictEqual(findMemberByName(members, 'Alex')?.id, 'm2');
  assert.strictEqual(findMemberByName(members, 'maya')?.id, 'm3');
  assert.strictEqual(findMemberByName(members, 'Unknown'), null);
});
