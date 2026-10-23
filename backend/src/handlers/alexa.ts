import {
  findHouseholdByOtp,
  bindAlexaUser,
  getAlexaHousehold,
  getHousehold,
  putNote,
  updateNotePartial,
} from '../services/dynamo.js';
import { broadcastToHousehold } from '../services/websocketNotifier.js';
import type { PinNote } from '../types.js';

interface AlexaRequestEnvelope {
  version: string;
  session: {
    new: boolean;
    sessionId: string;
    application: { applicationId: string };
    user: { userId: string };
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
    shouldEndSession: boolean;
  };
}

function buildSpeechResponse(speechText: string, shouldEndSession: boolean = true, repromptText?: string): AlexaResponseEnvelope {
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
      shouldEndSession,
    },
  };
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
      return buildSpeechResponse(
        'Welcome back to PinBoard TV! You can say: add milk to groceries, or ask: what is on my grocery list?',
        false,
        'What would you like to pin or check on the board?'
      );
    }

    if (requestType === 'IntentRequest' && event.request.intent) {
      const intentName = event.request.intent.name;
      const slots = event.request.intent.slots || {};

      // Handle standard built-in intents first without needing DB access
      if (intentName === 'AMAZON.HelpIntent') {
        return buildSpeechResponse(
          'You can ask PinBoard TV to add items to your grocery list, pin a chore for someone, or read back what is on the board.',
          false
        );
      }

      if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
        return buildSpeechResponse('Goodbye!');
      }

      // 1. LinkHouseholdIntent
      if (intentName === 'LinkHouseholdIntent') {
        const pinCode = slots.sixDigitPin?.value?.replace(/\s+/g, '') || '';
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
          `Success! Your Alexa is now connected to ${name}. You can now say: add eggs to my grocery list.`
        );
      }

      // Check household linkage for other intents
      let householdId = await getAlexaHousehold(userId);
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

function cleanGroceryItemText(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^(?:please\s+)?(?:add|buy|get|we\s+need|need|put|pick\s+up|pin)\s+/i, '');
  cleaned = cleaned.replace(/\s+(?:to|on|in|into|for)\s+(?:the\s+|my\s+|our\s+)?(?:grocery\s+list|groceries\s+list|groceries|grocery|shopping\s+list|store\s+list|board|pinboard)\s*$/i, '');
  cleaned = cleaned.replace(/\s+(?:from|at)\s+(?:the\s+)?(?:store|supermarket|market)\s*$/i, '');
  return cleaned.trim();
}

      // 2. AddGroceryIntent
      if (intentName === 'AddGroceryIntent') {
        const rawItemText = (slots.item?.value || '').trim();
        if (!rawItemText) {
          return buildSpeechResponse('What item would you like to add to your grocery list?', false);
        }

        const cleaned = cleanGroceryItemText(rawItemText);
        const itemNames = cleaned
          .split(/(?:,\s*|\s+and\s+)/i)
          .map((s) => cleanGroceryItemText(s))
          .filter(Boolean);

        if (itemNames.length === 0) {
          return buildSpeechResponse('What item would you like to add to your grocery list?', false);
        }

        // Find existing GROCERY note or create one
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

        return buildSpeechResponse(`Added ${itemNames.join(', ')} to your grocery list on the TV.`);
      }

      // 3. AddNoteIntent
      if (intentName === 'AddNoteIntent') {
        const memberName = slots.member?.value?.trim();
        const rawTaskText = slots.task?.value?.trim() || 'Check with family';

        // Check if task is actually a grocery item spoken without explicitly specifying AddGroceryIntent
        const isGroceryTask = !memberName && /grocery|groceries|buy|milk|eggs|bread|produce|supermarket/i.test(rawTaskText);

        if (isGroceryTask) {
          const cleaned = cleanGroceryItemText(rawTaskText);
          const itemNames = cleaned
            .split(/(?:,\s*|\s+and\s+)/i)
            .map((s) => cleanGroceryItemText(s))
            .filter(Boolean);

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

            return buildSpeechResponse(`Added ${itemNames.join(', ')} to your grocery list on the TV.`);
          }
        }

        if (memberName) {
          // Assign as chore
          const matchedMember = state.members.find(
            (m) => m.name.toLowerCase() === memberName.toLowerCase()
          );

          const choreNote: PinNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            householdId,
            type: 'CHORE',
            title: rawTaskText,
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

          return buildSpeechResponse(
            `Pinned a chore on the TV for ${memberName}: ${rawTaskText}.`
          );
        } else {
          // General sticky note
          const stickyNote: PinNote = {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            householdId,
            type: 'STICKY',
            title: rawTaskText,
            color: 'yellow',
            magnet: 'brass-pin',
            rotationDeg: 1.5,
            createdByMemberId: 'alexa',
            pinned: true,
            updatedAt: new Date().toISOString(),
          };

          await putNote(stickyNote);
          await broadcastToHousehold(householdId, {
            type: 'NOTE_CREATED',
            payload: stickyNote,
          });

          return buildSpeechResponse(`Pinned a note to the board: ${rawTaskText}.`);
        }
      }

      // 4. ReadGroceryListIntent
      if (intentName === 'ReadGroceryListIntent') {
        const groceryNote = state.notes.find((n) => n.type === 'GROCERY');
        const openItems = (groceryNote?.items || []).filter((i) => !i.done).map((i) => i.text);

        if (openItems.length === 0) {
          return buildSpeechResponse('Your grocery list is empty. Everything has been picked up!');
        }

        if (openItems.length === 1) {
          return buildSpeechResponse(`You have one item left on your grocery list: ${openItems[0]}.`);
        }

        const listSpoken = openItems.slice(0, 5).join(', ');
        const extra = openItems.length > 5 ? `, and ${openItems.length - 5} more items.` : '.';
        return buildSpeechResponse(`You have ${openItems.length} items on your grocery list: ${listSpoken}${extra}`);
      }

      // Built-in standard intents
      if (intentName === 'AMAZON.HelpIntent') {
        return buildSpeechResponse(
          'You can ask PinBoard TV to add items to your grocery list, pin a chore for someone, or read back what is on the board.',
          false
        );
      }

      if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
        return buildSpeechResponse('Goodbye!');
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
