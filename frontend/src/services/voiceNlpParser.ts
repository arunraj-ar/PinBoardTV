import type { PinNote } from '../types/pinboard';

export interface ParsedVoiceAction {
  action: 'EDIT_CONTENT' | 'APPEND_CHECKLIST' | 'TOGGLE_ITEM' | 'REASSIGN' | 'CREATE_NOTE' | 'SET_HOUSEHOLD_NAME';
  summary: string;
  noteId?: string;
  newContent?: string;
  newTitle?: string;
  newHouseholdName?: string;
  checklistItems?: string[];
  assignedToName?: string;
  toggleItemText?: string;
  newNote?: {
    type: 'STICKY' | 'GROCERY' | 'CHORE';
    title: string;
    content?: string;
    assignedToName?: string;
    priority?: 'LOW' | 'MED' | 'HIGH';
    items?: string[];
  };
}

export function cleanGroceryItemText(input: string): string {
  let cleaned = input.trim();
  // Strip leading prefixes: "please add", "add", "buy", "get", "we need", "put", "pick up", "pin"
  cleaned = cleaned.replace(/^(?:please\s+)?(?:add|buy|get|we\s+need|need|put|pick\s+up|pin)\s+/i, '');
  // Strip trailing destination phrases: "to groceries", "to grocery list", "to the grocery list", "on the grocery list", "to my grocery list", "on groceries", etc.
  cleaned = cleaned.replace(/\s+(?:to|on|in|into|for)\s+(?:the\s+|my\s+|our\s+)?(?:grocery\s+list|groceries\s+list|groceries|grocery|shopping\s+list|store\s+list|board|pinboard)\s*$/i, '');
  // Strip trailing "from the store", "from store", "at the store"
  cleaned = cleaned.replace(/\s+(?:from|at)\s+(?:the\s+)?(?:store|supermarket|market)\s*$/i, '');
  return cleaned.trim();
}

export function parseConversationalVoice(
  rawTranscript: string,
  selectedNote: PinNote | null,
  availableMemberNames: string[] = ['Mom', 'Dad', 'Alex', 'Maya'],
  existingNotes: PinNote[] = []
): ParsedVoiceAction {
  const text = rawTranscript.trim();
  const lower = text.toLowerCase();

  // --- Context-Aware Editing on a Selected Note ---
  if (selectedNote) {
    // 1. Edit Content / Title: "edit this to...", "change to...", "update note to..."
    const editMatch = text.match(/^(?:edit(?:\s+this)?(?:\s+to)?|change(?:\s+this)?(?:\s+to)?|update(?:\s+to)?)\s+(.+)/i);
    if (editMatch) {
      const updatedBody = editMatch[1].trim();
      return {
        action: 'EDIT_CONTENT',
        noteId: selectedNote.id,
        newContent: updatedBody,
        newTitle: selectedNote.type === 'STICKY' ? updatedBody : selectedNote.title,
        summary: `Updated note to: "${updatedBody}"`,
      };
    }

    // 2. Cross off / Check item: "cross off [item]", "mark [item] done", "check off [item]"
    const checkMatch = text.match(/(?:cross(?:\s+off)?|mark(?:\s+as)?\s+done|check(?:\s+off)?)\s+(.+)/i);
    if (checkMatch && selectedNote.items && selectedNote.items.length > 0) {
      const targetQuery = checkMatch[1].trim().toLowerCase();
      const matchedItem = selectedNote.items.find((item) =>
        item.text.toLowerCase().includes(targetQuery) || targetQuery.includes(item.text.toLowerCase())
      );
      if (matchedItem) {
        return {
          action: 'TOGGLE_ITEM',
          noteId: selectedNote.id,
          toggleItemText: matchedItem.id,
          summary: `Toggled "${matchedItem.text}" as completed`,
        };
      }
    }

    // 3. Append checklist items to active card: "add [item]", "put [item] on list"
    const addToListMatch = text.match(/(?:add|include|put)\s+(.+?)(?:\s+(?:to|on)\s+(?:the\s+)?(?:list|card|board))?$/i);
    if (addToListMatch && (selectedNote.type === 'GROCERY' || selectedNote.type === 'CHORE')) {
      const itemsString = cleanGroceryItemText(addToListMatch[1]);
      const items = itemsString
        .split(/(?:,\s*|\s+and\s+)/i)
        .map((s) => cleanGroceryItemText(s))
        .filter(Boolean);

      return {
        action: 'APPEND_CHECKLIST',
        noteId: selectedNote.id,
        checklistItems: items,
        summary: `Added ${items.length} item(s) to ${selectedNote.title}`,
      };
    }

    // 4. Reassign chore: "assign to [name]", "give to [name]"
    const assignMatch = text.match(/(?:assign(?:\s+this)?\s+to|give(?:\s+this)?\s+to|make(?:\s+this)?\s+for)\s+([A-Za-z]+)/i);
    if (assignMatch) {
      const targetName = assignMatch[1].trim();
      const matchedMember = availableMemberNames.find(
        (m) => m.toLowerCase() === targetName.toLowerCase()
      ) || targetName;

      return {
        action: 'REASSIGN',
        noteId: selectedNote.id,
        assignedToName: matchedMember,
        summary: `Reassigned "${selectedNote.title}" to ${matchedMember}`,
      };
    }
  }

  // --- Global Voice Actions (New Note / Fallback / Household Name) ---
  // 0. Rename / Change Household Name: "change household name to...", "set household name to...", "rename board to..."
  const nameMatch = text.match(/(?:change|set|rename)(?:\s+(?:the|our))?\s+(?:household|board|hub|pinboard)?\s*(?:name)?\s+(?:to|as)\s+(.+)/i);
  if (nameMatch) {
    const newName = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    return {
      action: 'SET_HOUSEHOLD_NAME',
      newHouseholdName: newName,
      summary: `Set household name to: "${newName}"`,
    };
  }

  const isChore =
    lower.includes('chore') ||
    lower.includes('remind') ||
    lower.includes('clean') ||
    lower.includes('trash') ||
    lower.includes('mop') ||
    lower.includes('wash');

  const isGrocery =
    lower.includes('grocery') ||
    lower.includes('groceries') ||
    lower.includes('buy') ||
    lower.includes('milk') ||
    lower.includes('eggs') ||
    lower.includes('bread') ||
    lower.includes('apples');

  if (isGrocery) {
    const cleaned = cleanGroceryItemText(text);
    const items = cleaned
      .split(/(?:,\s*|\s+and\s+)/i)
      .map((s) => cleanGroceryItemText(s))
      .filter(Boolean);

    // If an existing grocery card is already on the board, append to it!
    const existingGrocery = existingNotes.find((n) => n.type === 'GROCERY');
    if (existingGrocery) {
      return {
        action: 'APPEND_CHECKLIST',
        noteId: existingGrocery.id,
        checklistItems: items,
        summary: `Added ${items.join(', ')} to ${existingGrocery.title}`,
      };
    }

    return {
      action: 'CREATE_NOTE',
      summary: `Created grocery item(s): ${items.join(', ')}`,
      newNote: {
        type: 'GROCERY',
        title: '🛒 Groceries',
        items,
      },
    };
  }

  if (isChore) {
    let assignee = 'Family';
    for (const name of availableMemberNames) {
      if (lower.includes(name.toLowerCase())) {
        assignee = name;
        break;
      }
    }
    const cleanTitle = text
      .replace(/^(?:please\s+)?(?:add\s+chore|remind\s+\w+\s+to|tell\s+\w+\s+to|pin\s+a\s+chore\s+for\s+\w+\s+to|assign\s+\w+\s+to)\s+/i, '')
      .replace(/\s+(?:to|on)\s+(?:the\s+)?(?:chore\s+list|board|pinboard)\s*$/i, '')
      .trim();

    return {
      action: 'CREATE_NOTE',
      summary: `Assigned chore "${cleanTitle}" to ${assignee}`,
      newNote: {
        type: 'CHORE',
        title: `⚡ ${cleanTitle}`,
        assignedToName: assignee,
        priority: lower.includes('urgent') || lower.includes('asap') ? 'HIGH' : 'MED',
        items: [cleanTitle],
      },
    };
  }

  // Default: Yellow Sticky Note
  return {
    action: 'CREATE_NOTE',
    summary: `Created sticky note: "${text}"`,
    newNote: {
      type: 'STICKY',
      title: text.length > 35 ? text.slice(0, 35) + '...' : text,
      content: text,
      priority: 'MED',
    },
  };
}
