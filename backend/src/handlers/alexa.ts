import {
  findHouseholdByOtp,
  bindAlexaUser,
  getAlexaHousehold,
  getHousehold,
  putNote,
  updateNotePartial,
  deleteNote,
  updateHouseholdName,
} from '../services/dynamo.js';
import { broadcastToHousehold } from '../services/websocketNotifier.js';
import {
  findListNote,
  findChecklistItem,
  findBestMatchingNote,
  findBestMatchingPhoto,
  findMemberByName,
  cleanVoiceQuery,
  normalizeListName,
} from '../services/fuzzyMatcher.js';
import type { PinNote, NoteColor, NoteType, HouseholdMember } from '../types.js';

interface AlexaRequestEnvelope {
  version: string;
  session: {
    new: boolean;
    sessionId: string;
    application: { applicationId: string };
    user: { userId: string };
  };
  context?: {
    System?: {
      device?: {
        supportedInterfaces?: Record<string, any>;
      };
      user?: {
        userId?: string;
      };
    };
  };
  request: {
    type: string;
    requestId: string;
    timestamp: string;
    locale?: string;
    intent?: {
      name: string;
      confirmationStatus: string;
      slots?: Record<
        string,
        {
          name: string;
          value?: string;
          resolutions?: any;
        }
      >;
    };
  };
}

interface AlexaResponseEnvelope {
  version: string;
  response: {
    outputSpeech?: {
      type: 'PlainText' | 'SSML';
      text?: string;
      ssml?: string;
    };
    card?: {
      type: 'Simple';
      title: string;
      content: string;
    };
    reprompt?: {
      outputSpeech: {
        type: 'PlainText';
        text: string;
      };
    };
    directives?: any[];
    shouldEndSession: boolean;
  };
}

function supportsAPL(event: AlexaRequestEnvelope): boolean {
  return Boolean(
    event.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']
  );
}

function buildLaunchAppDirectives(): any[] {
  const appUrl = 'https://di1gpgdox7pk1.cloudfront.net';
  return [
    {
      type: 'Alexa.Presentation.APL.RenderDocument',
      token: 'pinboardLaunchDocument',
      document: {
        type: 'APL',
        version: '1.4',
        onMount: [
          {
            type: 'OpenURL',
            source: appUrl,
            onFail: [
              {
                type: 'SetValue',
                componentId: 'launchStatusMessage',
                property: 'text',
                value: 'Unable to open app. Please ensure the latest PinBoard TV APK is installed on this Fire TV.',
              },
            ],
          },
        ],
        mainTemplate: {
          parameters: ['payload'],
          items: [
            {
              type: 'Container',
              width: '100vw',
              height: '100vh',
              alignItems: 'center',
              justifyContent: 'center',
              items: [
                {
                  id: 'launchStatusMessage',
                  type: 'Text',
                  text: 'Opening PinBoard TV...',
                  fontSize: '36dp',
                  color: '#ffffff',
                },
              ],
            },
          ],
        },
      },
    },
    {
      type: 'Alexa.Presentation.APL.ExecuteCommands',
      token: 'pinboardLaunchDocument',
      commands: [
        {
          type: 'OpenURL',
          source: appUrl,
        },
      ],
    },
  ];
}

function buildSpeechResponse(
  speechText: string,
  shouldEndSession: boolean = true,
  repromptText?: string,
  directives?: any[]
): AlexaResponseEnvelope {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: speechText,
      },
      card: {
        type: 'Simple',
        title: 'PinBoard TV',
        content: speechText,
      },
      ...(repromptText
        ? {
            reprompt: {
              outputSpeech: {
                type: 'PlainText',
                text: repromptText,
              },
            },
          }
        : {}),
      ...(directives && directives.length > 0 ? { directives } : {}),
      shouldEndSession,
    },
  };
}

export function cleanGroceryItemText(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^(?:please\s+)?(?:add|buy|get|we\s+need|need|put|pick\s+up|pin)\s+/i, '');
  cleaned = cleaned.replace(/\s+(?:to|on|in|into|for)\s+(?:the\s+|my\s+|our\s+)?(?:\w+\s+)?(?:grocery\s+list|groceries\s+list|groceries|grocery|shopping\s+list|store\s+list|list|checklist|board|pinboard)\s*$/i, '');
  cleaned = cleaned.replace(/\s+(?:from|at)\s+(?:the\s+)?(?:store|supermarket|market)\s*$/i, '');
  return cleaned.trim();
}

function parseMultipleItems(rawText: string): string[] {
  const cleaned = cleanGroceryItemText(rawText);
  return cleaned
    .split(/(?:,\s*|\s+and\s+)/i)
    .map((s) => cleanGroceryItemText(s))
    .filter(Boolean);
}

function mapColorSlot(rawColor?: string): NoteColor {
  const c = (rawColor || '').toLowerCase().trim();
  if (['yellow', 'pink', 'blue', 'green', 'orange', 'cream'].includes(c)) {
    return c as NoteColor;
  }
  return 'yellow';
}

export async function handler(event: AlexaRequestEnvelope): Promise<AlexaResponseEnvelope> {
  const requestType = event.request.type;
  const userId = event.session.user.userId;

  try {
    if (requestType === 'LaunchRequest') {
      const householdId = await getAlexaHousehold(userId);
      if (!householdId) {
        return buildSpeechResponse(
          'Welcome to PinBoard TV! To connect your living room TV, say: my household code is, followed by the 6-digit code shown on your TV.',
          false,
          'What is the 6-digit code shown on your TV screen?'
        );
      }

      await broadcastToHousehold(householdId, {
        type: 'WAKE_BOARD',
        payload: { action: 'OPEN_APP' },
      });

      const aplDirectives = supportsAPL(event) ? buildLaunchAppDirectives() : undefined;
      return buildSpeechResponse(
        'Opening PinBoard TV on your screen!',
        true,
        undefined,
        aplDirectives
      );
    }

    if (requestType === 'IntentRequest' && event.request.intent) {
      const intentName = event.request.intent.name;
      const slots = event.request.intent.slots || {};

      // Handle standard built-in intents first without needing DB access
      if (intentName === 'AMAZON.HelpIntent') {
        return buildSpeechResponse(
          'You can add or cross off list items, pin sticky notes, assign chores, edit notes, or delete photos from PinBoard TV.',
          false
        );
      }

      if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
        return buildSpeechResponse('Goodbye!');
      }

      // 1. LinkHouseholdIntent
      if (intentName === 'LinkHouseholdIntent') {
        const rawPin = slots.sixDigitPin?.value || slots.pin?.value || slots.code?.value || '';
        const wordMap: Record<string, string> = {
          zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
          five: '5', six: '6', seven: '7', eight: '8', nine: '9',
        };
        let cleaned = rawPin.toLowerCase();
        for (const [w, d] of Object.entries(wordMap)) {
          cleaned = cleaned.replace(new RegExp(`\\b${w}\\b`, 'g'), d);
        }
        const pinCode = cleaned.replace(/[^0-9]/g, '');
        if (!pinCode || pinCode.length < 5) {
          return buildSpeechResponse('Please tell me the 6-digit code shown on your TV screen.', false);
        }

        const householdId = await findHouseholdByOtp(pinCode);
        if (!householdId) {
          return buildSpeechResponse(
            `I could not find an active household with code ${pinCode.split('').join(' ')}. Please check your TV screen and try again.`
          );
        }

        await bindAlexaUser(userId, householdId);
        const state = await getHousehold(householdId);
        const name = state?.householdName || 'your TV PinBoard';

        return buildSpeechResponse(
          `Success! Your Alexa is now connected to ${name}. You can say: add milk to my grocery list, or pin a note.`
        );
      }

      // Check household linkage for all other intents
      const householdId = await getAlexaHousehold(userId);
      if (!householdId) {
        return buildSpeechResponse(
          'Your Alexa is not connected to a TV yet. Please say: my household code is, followed by the 6-digit code on your TV screen.',
          false
        );
      }

      const state = await getHousehold(householdId);
      if (!state) {
        return buildSpeechResponse('I could not find your household data. Please re-link with your TV code.');
      }

      const aplDirectives = supportsAPL(event) ? buildLaunchAppDirectives() : undefined;

      // =======================================================================
      // LIST INTENTS: Add, Complete, Uncheck, Remove, Clear, Create, Delete, Read
      // =======================================================================

      // 2. AddGroceryIntent & AddToListIntent
      if (intentName === 'AddGroceryIntent' || intentName === 'AddToListIntent') {
        const rawItemText = (slots.item?.value || '').trim();
        const rawListName = slots.listName?.value?.trim();

        if (!rawItemText) {
          return buildSpeechResponse('What item would you like to add?', false);
        }

        const itemNames = parseMultipleItems(rawItemText);
        if (itemNames.length === 0) {
          return buildSpeechResponse('What item would you like to add?', false);
        }

        let targetList = findListNote(state.notes, rawListName);
        const newItems = itemNames.map((text) => ({
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          text,
          done: false,
          category: 'Produce',
        }));

        if (targetList) {
          const updatedItems = [...(targetList.items || []), ...newItems];
          await updateNotePartial(householdId, targetList.id, { items: updatedItems });
          await broadcastToHousehold(householdId, {
            type: 'NOTE_UPDATED',
            payload: { id: targetList.id, changes: { items: updatedItems } },
          });
        } else {
          // Create new list
          const title = rawListName ? rawListName.charAt(0).toUpperCase() + rawListName.slice(1) : 'Weekly Groceries';
          targetList = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            householdId,
            type: 'GROCERY',
            title,
            items: newItems,
            color: 'green',
            magnet: 'brass-pin',
            rotationDeg: 0,
            createdByMemberId: 'alexa',
            pinned: true,
            updatedAt: new Date().toISOString(),
          };
          await putNote(targetList);
          await broadcastToHousehold(householdId, {
            type: 'NOTE_CREATED',
            payload: targetList,
          });
        }

        await broadcastToHousehold(householdId, {
          type: 'WAKE_BOARD',
          payload: { action: 'OPEN_APP', target: targetList.id },
        });

        const listLabel = targetList.title || 'the list';
        return buildSpeechResponse(
          `Added ${itemNames.join(', ')} to ${listLabel} on the TV.`,
          true,
          undefined,
          aplDirectives
        );
      }

      // 3. CompleteItemIntent (Mark item done / Cross off)
      if (intentName === 'CompleteItemIntent') {
        const rawItemText = (slots.item?.value || '').trim();
        const rawListName = slots.listName?.value?.trim();

        if (!rawItemText) {
          return buildSpeechResponse('What item would you like to mark as completed?', false);
        }

        const targetList = findListNote(state.notes, rawListName);
        if (!targetList || !targetList.items || targetList.items.length === 0) {
          return buildSpeechResponse(`I could not find an active list to complete "${rawItemText}" from.`);
        }

        const matched = findChecklistItem(targetList, rawItemText);
        if (!matched) {
          return buildSpeechResponse(`I could not find "${rawItemText}" on ${targetList.title}.`);
        }

        const updatedItems = targetList.items.map((it, idx) =>
          idx === matched.index ? { ...it, done: true } : it
        );

        await updateNotePartial(householdId, targetList.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: updatedItems } },
        });

        return buildSpeechResponse(
          `Checked off "${matched.item.text}" on ${targetList.title}.`,
          true,
          undefined,
          aplDirectives
        );
      }

      // 4. UncheckItemIntent (Reopen item)
      if (intentName === 'UncheckItemIntent') {
        const rawItemText = (slots.item?.value || '').trim();
        const rawListName = slots.listName?.value?.trim();

        if (!rawItemText) {
          return buildSpeechResponse('What item would you like to uncheck?', false);
        }

        const targetList = findListNote(state.notes, rawListName);
        if (!targetList || !targetList.items) {
          return buildSpeechResponse('I could not find that list.');
        }

        const matched = findChecklistItem(targetList, rawItemText);
        if (!matched) {
          return buildSpeechResponse(`I could not find "${rawItemText}" on ${targetList.title}.`);
        }

        const updatedItems = targetList.items.map((it, idx) =>
          idx === matched.index ? { ...it, done: false } : it
        );

        await updateNotePartial(householdId, targetList.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: updatedItems } },
        });

        return buildSpeechResponse(`Unchecked "${matched.item.text}" on ${targetList.title}.`);
      }

      // 5. RemoveFromListIntent (Delete single item from list)
      if (intentName === 'RemoveFromListIntent') {
        const rawItemText = (slots.item?.value || '').trim();
        const rawListName = slots.listName?.value?.trim();

        if (!rawItemText) {
          return buildSpeechResponse('What item would you like to remove?', false);
        }

        const targetList = findListNote(state.notes, rawListName);
        if (!targetList || !targetList.items || targetList.items.length === 0) {
          return buildSpeechResponse(`I could not find that list.`);
        }

        const matched = findChecklistItem(targetList, rawItemText);
        if (!matched) {
          return buildSpeechResponse(`I could not find "${rawItemText}" on ${targetList.title}.`);
        }

        const updatedItems = targetList.items.filter((_, idx) => idx !== matched.index);
        await updateNotePartial(householdId, targetList.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: updatedItems } },
        });

        return buildSpeechResponse(`Removed "${matched.item.text}" from ${targetList.title}.`);
      }

      // 6. ClearCompletedIntent (Wipe checked items)
      if (intentName === 'ClearCompletedIntent') {
        const rawListName = slots.listName?.value?.trim();
        const targetList = findListNote(state.notes, rawListName);

        if (!targetList || !targetList.items) {
          return buildSpeechResponse('I could not find that list.');
        }

        const completedCount = targetList.items.filter((i) => i.done).length;
        if (completedCount === 0) {
          return buildSpeechResponse(`There are no completed items to clear on ${targetList.title}.`);
        }

        const openItems = targetList.items.filter((i) => !i.done);
        await updateNotePartial(householdId, targetList.id, { items: openItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: openItems } },
        });

        return buildSpeechResponse(`Cleared ${completedCount} completed item(s) from ${targetList.title}.`);
      }

      // 7. CreateListIntent (Start a brand new checklist)
      if (intentName === 'CreateListIntent') {
        const rawListName = (slots.listName?.value || '').trim();
        if (!rawListName) {
          return buildSpeechResponse('What would you like to name your new list?', false);
        }

        const title = rawListName.charAt(0).toUpperCase() + rawListName.slice(1);
        const newList: PinNote = {
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          householdId,
          type: 'GROCERY',
          title,
          items: [],
          color: 'green',
          magnet: 'brass-pin',
          rotationDeg: (Math.random() * 2 - 1),
          createdByMemberId: 'alexa',
          pinned: true,
          updatedAt: new Date().toISOString(),
        };

        await putNote(newList);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_CREATED',
          payload: newList,
        });

        return buildSpeechResponse(`Created a new list called "${title}" on your TV.`);
      }

      // 8. DeleteListIntent (Remove entire checklist card)
      if (intentName === 'DeleteListIntent') {
        const rawListName = (slots.listName?.value || '').trim();
        if (!rawListName) {
          return buildSpeechResponse('Which list would you like to delete?', false);
        }

        const targetList = findListNote(state.notes, rawListName);
        if (!targetList) {
          return buildSpeechResponse(`I could not find a list named "${rawListName}".`);
        }

        await deleteNote(householdId, targetList.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: targetList.id },
        });

        return buildSpeechResponse(`Deleted the list "${targetList.title}" from your TV.`);
      }

      // 9. ReadGroceryListIntent & ReadListIntent
      if (intentName === 'ReadGroceryListIntent' || intentName === 'ReadListIntent') {
        const rawListName = slots.listName?.value?.trim();
        const targetList = findListNote(state.notes, rawListName);

        if (!targetList) {
          return buildSpeechResponse('I could not find that list.');
        }

        const openItems = (targetList.items || []).filter((i) => !i.done).map((i) => i.text);

        if (openItems.length === 0) {
          return buildSpeechResponse(`Your ${targetList.title} is empty. All items are finished!`);
        }

        if (openItems.length === 1) {
          return buildSpeechResponse(`You have one item left on ${targetList.title}: ${openItems[0]}.`);
        }

        const listSpoken = openItems.slice(0, 5).join(', ');
        const extra = openItems.length > 5 ? `, and ${openItems.length - 5} more items.` : '.';
        return buildSpeechResponse(`You have ${openItems.length} items on ${targetList.title}: ${listSpoken}${extra}`);
      }

      // =======================================================================
      // NOTE & CHORE INTENTS: Add, Edit, Delete, Reassign, Read
      // =======================================================================

      // 10. AddNoteIntent
      if (intentName === 'AddNoteIntent') {
        const memberName = slots.member?.value?.trim();
        const rawTaskText = slots.task?.value?.trim() || 'Check with family';
        const color = mapColorSlot(slots.color?.value);

        // Check if task is actually a grocery item spoken without explicitly specifying AddGroceryIntent
        const isGroceryTask = !memberName && /grocery|groceries|buy|milk|eggs|bread|produce|supermarket/i.test(rawTaskText);
        if (isGroceryTask) {
          const itemNames = parseMultipleItems(rawTaskText);
          if (itemNames.length > 0) {
            let groceryNote = state.notes.find((n) => n.type === 'GROCERY');
            const newItems = itemNames.map((text) => ({
              id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              text,
              done: false,
              category: 'Produce',
            }));

            if (groceryNote) {
              const updatedItems = [...(groceryNote.items || []), ...newItems];
              await updateNotePartial(householdId, groceryNote.id, { items: updatedItems });
              await broadcastToHousehold(householdId, {
                type: 'NOTE_UPDATED',
                payload: { id: groceryNote.id, changes: { items: updatedItems } },
              });
            } else {
              groceryNote = {
                id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                householdId,
                type: 'GROCERY',
                title: 'Weekly Groceries',
                items: newItems,
                color: 'green',
                magnet: 'brass-pin',
                rotationDeg: 0,
                createdByMemberId: 'alexa',
                pinned: true,
                updatedAt: new Date().toISOString(),
              };
              await putNote(groceryNote);
              await broadcastToHousehold(householdId, {
                type: 'NOTE_CREATED',
                payload: groceryNote,
              });
            }

            await broadcastToHousehold(householdId, {
              type: 'WAKE_BOARD',
              payload: { action: 'OPEN_APP', target: 'GROCERY' },
            });

            return buildSpeechResponse(
              `Added ${itemNames.join(', ')} to your grocery list on the TV.`,
              true,
              undefined,
              aplDirectives
            );
          }
        }

        if (memberName) {
          const matchedMember = findMemberByName(state.members, memberName);

          const choreNote: PinNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            householdId,
            type: 'CHORE',
            title: rawTaskText,
            color: color || 'blue',
            magnet: 'blue-star',
            rotationDeg: -1.0,
            assignedToMemberId: matchedMember?.id,
            createdByMemberId: 'alexa',
            pinned: true,
            updatedAt: new Date().toISOString(),
          };

          await putNote(choreNote);
          await broadcastToHousehold(householdId, {
            type: 'NOTE_CREATED',
            payload: choreNote,
          });
          await broadcastToHousehold(householdId, {
            type: 'WAKE_BOARD',
            payload: { action: 'OPEN_APP', target: 'CHORE' },
          });

          const displayName = matchedMember?.name || memberName;
          return buildSpeechResponse(
            `Pinned a chore on the TV for ${displayName}: ${rawTaskText}.`,
            true,
            undefined,
            aplDirectives
          );
        } else {
          const stickyNote: PinNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            householdId,
            type: 'STICKY',
            title: rawTaskText,
            color: color || 'yellow',
            magnet: 'brass-pin',
            rotationDeg: (Math.random() * 2 - 1),
            createdByMemberId: 'alexa',
            pinned: true,
            updatedAt: new Date().toISOString(),
          };

          await putNote(stickyNote);
          await broadcastToHousehold(householdId, {
            type: 'NOTE_CREATED',
            payload: stickyNote,
          });
          await broadcastToHousehold(householdId, {
            type: 'WAKE_BOARD',
            payload: { action: 'OPEN_APP', target: 'STICKY' },
          });

          return buildSpeechResponse(
            `Pinned a note to the board: ${rawTaskText}.`,
            true,
            undefined,
            aplDirectives
          );
        }
      }

      // 11. EditNoteIntent (Update note content, title, or color)
      if (intentName === 'EditNoteIntent') {
        const targetQuery = (slots.targetQuery?.value || '').trim();
        const newContent = slots.newContent?.value?.trim();
        const newColor = slots.newColor?.value ? mapColorSlot(slots.newColor.value) : undefined;

        if (!targetQuery) {
          return buildSpeechResponse('Which note would you like to edit?', false);
        }

        const matchedNote = findBestMatchingNote(state.notes, targetQuery, ['STICKY', 'CHORE']);
        if (!matchedNote) {
          return buildSpeechResponse(`I could not find a note matching "${targetQuery}".`);
        }

        const changes: Partial<PinNote> = {};
        if (newContent) {
          changes.title = newContent;
          if (matchedNote.content) changes.content = newContent;
        }
        if (newColor) {
          changes.color = newColor;
        }

        await updateNotePartial(householdId, matchedNote.id, changes);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: matchedNote.id, changes },
        });

        const updatedDesc = newContent ? `to "${newContent}"` : `to ${newColor}`;
        return buildSpeechResponse(`Updated note ${updatedDesc} on your TV.`);
      }

      // 12. DeleteNoteIntent (Remove note or chore)
      if (intentName === 'DeleteNoteIntent') {
        const targetQuery = (slots.targetQuery?.value || '').trim();
        if (!targetQuery) {
          return buildSpeechResponse('Which note would you like to delete?', false);
        }

        const matchedNote = findBestMatchingNote(state.notes, targetQuery, ['STICKY', 'CHORE']);
        if (!matchedNote) {
          return buildSpeechResponse(`I could not find a note matching "${targetQuery}".`);
        }

        await deleteNote(householdId, matchedNote.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: matchedNote.id },
        });

        return buildSpeechResponse(`Deleted note "${matchedNote.title}" from your TV.`);
      }

      // 13. ReassignChoreIntent
      if (intentName === 'ReassignChoreIntent') {
        const task = (slots.task?.value || '').trim();
        const memberName = (slots.member?.value || '').trim();

        if (!task || !memberName) {
          return buildSpeechResponse('Which chore would you like to reassign and to whom?', false);
        }

        const choreNote = findBestMatchingNote(state.notes, task, 'CHORE');
        if (!choreNote) {
          return buildSpeechResponse(`I could not find a chore matching "${task}".`);
        }

        const member = findMemberByName(state.members, memberName);
        const memberId = member?.id || undefined;
        const displayName = member?.name || memberName;

        await updateNotePartial(householdId, choreNote.id, { assignedToMemberId: memberId });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: choreNote.id, changes: { assignedToMemberId: memberId } },
        });

        return buildSpeechResponse(`Reassigned "${choreNote.title}" to ${displayName}.`);
      }

      // 14. ReadBoardNotesIntent
      if (intentName === 'ReadBoardNotesIntent') {
        const memberName = slots.member?.value?.trim();

        if (memberName) {
          const member = findMemberByName(state.members, memberName);
          const memberId = member?.id;
          const chores = state.notes.filter(
            (n) => n.type === 'CHORE' && (memberId ? n.assignedToMemberId === memberId : n.title.toLowerCase().includes(memberName.toLowerCase()))
          );

          if (chores.length === 0) {
            return buildSpeechResponse(`${member?.name || memberName} has no assigned chores right now.`);
          }
          const choreList = chores.map((c) => c.title).join(', ');
          return buildSpeechResponse(`${member?.name || memberName} has ${chores.length} chore(s): ${choreList}.`);
        }

        // General overview
        const stickies = state.notes.filter((n) => n.type === 'STICKY');
        const chores = state.notes.filter((n) => n.type === 'CHORE');
        const polaroids = state.notes.filter((n) => n.type === 'POLAROID');

        const parts: string[] = [];
        if (stickies.length > 0) parts.push(`${stickies.length} reminder note(s)`);
        if (chores.length > 0) parts.push(`${chores.length} chore(s)`);
        if (polaroids.length > 0) parts.push(`${polaroids.length} photo(s)`);

        if (parts.length === 0) {
          return buildSpeechResponse('Your PinBoard is currently empty.');
        }

        return buildSpeechResponse(`You have ${parts.join(', ')} pinned on your TV board.`);
      }

      // =======================================================================
      // PICTURE / POLAROID INTENTS: Delete Photo, Edit Caption
      // =======================================================================

      // 15. DeletePictureIntent
      if (intentName === 'DeletePictureIntent') {
        const caption = slots.caption?.value?.trim();
        const photo = findBestMatchingPhoto(state.notes, caption);

        if (!photo) {
          return buildSpeechResponse('I could not find any photos matching that description on your board.');
        }

        await deleteNote(householdId, photo.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: photo.id },
        });

        const captionLabel = photo.title ? `"${photo.title}"` : 'the photo';
        return buildSpeechResponse(`Removed photo ${captionLabel} from your TV.`);
      }

      // 16. EditPictureCaptionIntent
      if (intentName === 'EditPictureCaptionIntent') {
        const targetQuery = slots.photoTarget?.value?.trim() || slots.targetQuery?.value?.trim();
        const newCaption = slots.newCaption?.value?.trim();

        if (!newCaption) {
          return buildSpeechResponse('What would you like the new photo caption to be?', false);
        }

        const photo = findBestMatchingPhoto(state.notes, targetQuery);
        if (!photo) {
          return buildSpeechResponse('I could not find that photo on your board.');
        }

        await updateNotePartial(householdId, photo.id, {
          title: newCaption,
          content: newCaption,
        });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: photo.id, changes: { title: newCaption, content: newCaption } },
        });

        return buildSpeechResponse(`Updated photo caption to "${newCaption}" on your TV.`);
      }

      // 17. SetHouseholdNameIntent / RenameHouseholdIntent
      if (intentName === 'SetHouseholdNameIntent' || intentName === 'RenameHouseholdIntent') {
        const rawName = slots.name?.value?.trim() || slots.householdName?.value?.trim() || '';
        const cleanedName = rawName
          .replace(/^(?:the\s+)?(?:household\s+|board\s+|pinboard\s+)?(?:name\s+)?(?:to\s+|as\s+)/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();

        if (!cleanedName) {
          return buildSpeechResponse('What would you like to set your household name to?', false);
        }

        await updateHouseholdName(householdId, cleanedName);
        await broadcastToHousehold(householdId, {
          type: 'HOUSEHOLD_NAME_UPDATED',
          payload: { name: cleanedName },
        });

        return buildSpeechResponse(`Updated household name to ${cleanedName} on your TV.`);
      }

      // 18. FallbackIntent
      if (intentName === 'AMAZON.FallbackIntent') {
        return buildSpeechResponse(
          'PinBoard TV can add or cross off items on lists, pin sticky notes, assign chores, edit notes, or delete photos. What would you like to do?',
          false
        );
      }
    }

    if (requestType === 'SessionEndedRequest') {
      return buildSpeechResponse('Goodbye!');
    }

    return buildSpeechResponse('Sorry, I did not understand that command for PinBoard TV.');
  } catch (error) {
    console.error('Alexa handler error:', error);
    return buildSpeechResponse('Sorry, an error occurred while updating PinBoard TV.');
  }
}

/**
 * Unified Voice NLP Engine using Alexa's natural language understanding patterns.
 * Allows remote mic, Fire TV speech intent, and web voice to execute with the exact same intelligence.
 */
export async function processVoiceTextWithAlexaNLP(
  rawText: string,
  householdId: string
): Promise<{ success: boolean; action: string; summary: string; payload?: any }> {
  const text = (rawText || '').trim();
  if (!text) {
    return { success: false, action: 'EMPTY', summary: 'No speech detected.' };
  }

  const state = await getHousehold(householdId);
  if (!state) {
    return { success: false, action: 'ERROR', summary: 'Household not found.' };
  }

  // 1. Rename Household: "rename household to...", "set board name to..."
  const renameMatch = text.match(/^(?:set|change|rename)(?:\s+(?:the|our))?\s*(?:household|board|pinboard)?\s*(?:name)?\s+(?:to|as)\s+(.+)/i);
  if (renameMatch) {
    const newName = renameMatch[1].replace(/^["']|["']$/g, '').trim();
    if (newName) {
      await updateHouseholdName(householdId, newName);
      await broadcastToHousehold(householdId, {
        type: 'HOUSEHOLD_NAME_UPDATED',
        payload: { name: newName },
      });
      return {
        success: true,
        action: 'SET_HOUSEHOLD_NAME',
        summary: `Updated household name to "${newName}"`,
        payload: { name: newName },
      };
    }
  }

  // 2. Cross off / Complete Item: "cross off milk", "mark eggs as done", "check off bananas"
  const checkMatch = text.match(/^(?:please\s+)?(?:cross\s+off|check\s+off|mark\s+as\s+done|mark\s+done|finished|we\s+got)\s+(.+?)(?:\s+(?:from|on|in)\s+(?:the\s+|my\s+|our\s+)?(.+))?$/i);
  if (checkMatch) {
    const itemQuery = checkMatch[1].trim();
    const listQuery = checkMatch[2]?.trim();
    const targetList = findListNote(state.notes, listQuery);

    if (targetList) {
      const matchedItem = findChecklistItem(targetList, itemQuery);
      if (matchedItem) {
        const updatedItems = targetList.items!.map((it, idx) =>
          idx === matchedItem.index ? { ...it, done: true } : it
        );
        await updateNotePartial(householdId, targetList.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: updatedItems } },
        });
        return {
          success: true,
          action: 'COMPLETE_ITEM',
          summary: `Checked off "${matchedItem.item.text}" on ${targetList.title}`,
          payload: { noteId: targetList.id, itemId: matchedItem.item.id },
        };
      }
    }
  }

  // 3. Clear Completed Items: "clear completed groceries", "clear completed items"
  const clearMatch = text.match(/^(?:please\s+)?(?:clear|clean\s+up|delete)\s+(?:completed|checked|finished)(?:\s+items)?(?:\s+(?:from|on)\s+(.+))?$/i);
  if (clearMatch) {
    const listQuery = clearMatch[1]?.trim();
    const targetList = findListNote(state.notes, listQuery);
    if (targetList && targetList.items) {
      const remaining = targetList.items.filter((i) => !i.done);
      await updateNotePartial(householdId, targetList.id, { items: remaining });
      await broadcastToHousehold(householdId, {
        type: 'NOTE_UPDATED',
        payload: { id: targetList.id, changes: { items: remaining } },
      });
      return {
        success: true,
        action: 'CLEAR_COMPLETED',
        summary: `Cleared completed items from ${targetList.title}`,
        payload: { noteId: targetList.id },
      };
    }
  }

  // 4. Remove Item from list: "remove milk from groceries", "delete apples from list"
  const removeItemMatch = text.match(/^(?:please\s+)?(?:remove|delete|take\s+off)\s+(.+?)\s+(?:from|off)\s+(?:the\s+|my\s+|our\s+)?(.+)$/i);
  if (removeItemMatch) {
    const itemQuery = removeItemMatch[1].trim();
    const listQuery = removeItemMatch[2].trim();
    const targetList = findListNote(state.notes, listQuery);
    if (targetList && targetList.items) {
      const matchedItem = findChecklistItem(targetList, itemQuery);
      if (matchedItem) {
        const updatedItems = targetList.items.filter((_, idx) => idx !== matchedItem.index);
        await updateNotePartial(householdId, targetList.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: targetList.id, changes: { items: updatedItems } },
        });
        return {
          success: true,
          action: 'REMOVE_ITEM',
          summary: `Removed "${matchedItem.item.text}" from ${targetList.title}`,
          payload: { noteId: targetList.id, itemId: matchedItem.item.id },
        };
      }
    }
  }

  // 5. Delete Note / Chore / Photo: "delete note plumber", "remove chore clean room", "delete photo of sunset"
  const deleteMatch = text.match(/^(?:please\s+)?(?:delete|remove)\s+(?:the\s+)?(note|chore|photo|picture|list)?(?:\s+about|\s+of|\s+called)?\s+(.+)$/i);
  if (deleteMatch) {
    const explicitType = (deleteMatch[1] || '').toLowerCase();
    const targetQuery = deleteMatch[2].trim();

    if (explicitType === 'photo' || explicitType === 'picture') {
      const photo = findBestMatchingPhoto(state.notes, targetQuery);
      if (photo) {
        await deleteNote(householdId, photo.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: photo.id },
        });
        return {
          success: true,
          action: 'DELETE_PHOTO',
          summary: `Removed photo "${photo.title}"`,
          payload: { id: photo.id },
        };
      }
    } else if (explicitType === 'list') {
      const listNote = findListNote(state.notes, targetQuery);
      if (listNote) {
        await deleteNote(householdId, listNote.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: listNote.id },
        });
        return {
          success: true,
          action: 'DELETE_LIST',
          summary: `Deleted list "${listNote.title}"`,
          payload: { id: listNote.id },
        };
      }
    } else {
      const note = findBestMatchingNote(state.notes, targetQuery);
      if (note) {
        await deleteNote(householdId, note.id);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_DELETED',
          payload: { id: note.id },
        });
        return {
          success: true,
          action: 'DELETE_NOTE',
          summary: `Deleted note "${note.title}"`,
          payload: { id: note.id },
        };
      }
    }
  }

  // 6. Edit Photo Caption: "change photo caption to Summer Trip", "update caption of dog to Buddy"
  const photoCaptionMatch = text.match(/^(?:please\s+)?(?:change|update|edit)(?:\s+the)?\s+(?:photo|picture)?\s*caption(?:\s+of\s+(.+?))?\s+(?:to|as)\s+(.+)$/i);
  if (photoCaptionMatch) {
    const targetPhotoQuery = photoCaptionMatch[1]?.trim();
    const newCaption = photoCaptionMatch[2]?.trim();
    if (newCaption) {
      const photo = findBestMatchingPhoto(state.notes, targetPhotoQuery);
      if (photo) {
        await updateNotePartial(householdId, photo.id, {
          title: newCaption,
          content: newCaption,
        });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: photo.id, changes: { title: newCaption, content: newCaption } },
        });
        return {
          success: true,
          action: 'EDIT_PHOTO_CAPTION',
          summary: `Updated photo caption to "${newCaption}"`,
          payload: { id: photo.id, caption: newCaption },
        };
      }
    }
  }

  // 7. Edit Note: "edit note plumber to 9am", "change note dentist to 4pm"
  const editNoteMatch = text.match(/^(?:please\s+)?(?:edit|update|change)\s+(?:the\s+)?note(?:\s+about)?\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (editNoteMatch) {
    const targetQuery = editNoteMatch[1].trim();
    const newBody = editNoteMatch[2].trim();
    const note = findBestMatchingNote(state.notes, targetQuery, ['STICKY', 'CHORE']);
    if (note) {
      await updateNotePartial(householdId, note.id, { title: newBody, content: newBody });
      await broadcastToHousehold(householdId, {
        type: 'NOTE_UPDATED',
        payload: { id: note.id, changes: { title: newBody, content: newBody } },
      });
      return {
        success: true,
        action: 'EDIT_NOTE',
        summary: `Updated note to "${newBody}"`,
        payload: { id: note.id, title: newBody },
      };
    }
  }

  // 8. Reassign Chore: "reassign chore wash dishes to Maya", "give chore laundry to Alex"
  const reassignMatch = text.match(/^(?:please\s+)?(?:reassign|give)\s+(?:chore\s+)?(.+?)\s+to\s+([A-Za-z]+)$/i);
  if (reassignMatch) {
    const taskQuery = reassignMatch[1].trim();
    const targetMember = reassignMatch[2].trim();
    const chore = findBestMatchingNote(state.notes, taskQuery, 'CHORE');
    const member = findMemberByName(state.members, targetMember);

    if (chore && member) {
      await updateNotePartial(householdId, chore.id, { assignedToMemberId: member.id });
      await broadcastToHousehold(householdId, {
        type: 'NOTE_UPDATED',
        payload: { id: chore.id, changes: { assignedToMemberId: member.id } },
      });
      return {
        success: true,
        action: 'REASSIGN_CHORE',
        summary: `Reassigned "${chore.title}" to ${member.name}`,
        payload: { choreId: chore.id, memberId: member.id },
      };
    }
  }

  // 9. Groceries / Lists intent: "add milk and eggs to groceries", "buy apples"
  const isGrocery = /(?:grocery|groceries|shopping\s+list|supermarket|buy|milk|eggs|bread|produce|apples|bananas|butter|coffee)/i.test(text);
  if (isGrocery) {
    const cleaned = cleanGroceryItemText(text);
    const itemNames = parseMultipleItems(cleaned);

    if (itemNames.length > 0) {
      let groceryNote = state.notes.find((n) => n.type === 'GROCERY');
      const newItems = itemNames.map((itemText: string) => ({
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        text: itemText,
        done: false,
        category: 'Produce',
      }));

      if (groceryNote) {
        const updatedItems = [...(groceryNote.items || []), ...newItems];
        await updateNotePartial(householdId, groceryNote.id, { items: updatedItems });
        await broadcastToHousehold(householdId, {
          type: 'NOTE_UPDATED',
          payload: { id: groceryNote.id, changes: { items: updatedItems } },
        });
      } else {
        groceryNote = {
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          householdId,
          type: 'GROCERY',
          title: 'Weekly Groceries',
          items: newItems,
          color: 'green',
          magnet: 'brass-pin',
          rotationDeg: 0,
          createdByMemberId: 'alexa',
          pinned: true,
          updatedAt: new Date().toISOString(),
        };
        await putNote(groceryNote);
        await broadcastToHousehold(householdId, {
          type: 'NOTE_CREATED',
          payload: groceryNote,
        });
      }

      return {
        success: true,
        action: 'ADD_GROCERY',
        summary: `Added ${itemNames.join(', ')} to groceries`,
        payload: { items: itemNames },
      };
    }
  }

  // 10. Chore Assignment: "assign Alex to take out trash", "chore for Mom clean counter"
  const choreMatch = text.match(/(?:assign(?:\s+to)?|chore\s+for|task\s+for|note\s+for)\s+([A-Za-z]+)\s+(?:to\s+)?(.+)/i);
  if (choreMatch) {
    const targetMemberName = choreMatch[1].trim();
    const taskText = choreMatch[2].trim();

    const matchedMember = findMemberByName(state.members, targetMemberName);

    const choreNote: PinNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      householdId,
      type: 'CHORE',
      title: taskText,
      color: 'blue',
      magnet: 'blue-star',
      rotationDeg: -1.0,
      assignedToMemberId: matchedMember?.id,
      createdByMemberId: 'alexa',
      pinned: true,
      updatedAt: new Date().toISOString(),
    };

    await putNote(choreNote);
    await broadcastToHousehold(householdId, {
      type: 'NOTE_CREATED',
      payload: choreNote,
    });

    return {
      success: true,
      action: 'ADD_CHORE',
      summary: `Assigned chore to ${matchedMember?.name || targetMemberName}: "${taskText}"`,
      payload: choreNote,
    };
  }

  // 11. Default: Sticky Note Reminder
  const cleanBody = text
    .replace(/^(?:please\s+)?(?:create\s+note|add\s+note|sticky\s+note|reminder|pin\s+note|pin)\s*:?\s*/i, '')
    .trim();

  const stickyNote: PinNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    householdId,
    type: 'STICKY',
    title: cleanBody || text,
    color: 'yellow',
    magnet: 'brass-pin',
    rotationDeg: (Math.random() * 2 - 1),
    createdByMemberId: 'alexa',
    pinned: true,
    updatedAt: new Date().toISOString(),
  };

  await putNote(stickyNote);
  await broadcastToHousehold(householdId, {
    type: 'NOTE_CREATED',
    payload: stickyNote,
  });

  return {
    success: true,
    action: 'ADD_STICKY',
    summary: `Pinned note: "${stickyNote.title}"`,
    payload: stickyNote,
  };
}
