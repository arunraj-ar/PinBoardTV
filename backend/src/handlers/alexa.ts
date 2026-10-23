import {
  findHouseholdByOtp,
  bindAlexaUser,
  getAlexaHousehold,
  getHousehold,
  putNote,
  updateNotePartial,
  updateHouseholdName,
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

function cleanGroceryItemText(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^(?:please\s+)?(?:add|buy|get|we\s+need|need|put|pick\s+up|pin)\s+/i, '');
  cleaned = cleaned.replace(/\s+(?:to|on|in|into|for)\s+(?:the\s+|my\s+|our\s+)?(?:grocery\s+list|groceries\s+list|groceries|grocery|shopping\s+list|store\s+list|board|pinboard)\s*$/i, '');
  cleaned = cleaned.replace(/\s+(?:from|at)\s+(?:the\s+)?(?:store|supermarket|market)\s*$/i, '');
  return cleaned.trim();
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

      // 1. Wake up TV screen and transition to active interactive board via WebSocket
      await broadcastToHousehold(householdId, {
        type: 'WAKE_BOARD',
        payload: { action: 'OPEN_APP' },
      });

      // 2. If device is Fire TV with APL support, fire deep-link OpenURL directive to launch APK
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
          'You can ask PinBoard TV to add items to your grocery list, pin a chore for someone, or read back what is on the board.',
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

        // Wake up TV screen to show newly updated groceries list!
        await broadcastToHousehold(householdId, {
          type: 'WAKE_BOARD',
          payload: { action: 'OPEN_APP', target: 'GROCERY' },
        });

        const aplDirectives = supportsAPL(event) ? buildLaunchAppDirectives() : undefined;

        return buildSpeechResponse(
          `Added ${itemNames.join(', ')} to your grocery list on the TV.`,
          true,
          undefined,
          aplDirectives
        );
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

            await broadcastToHousehold(householdId, {
              type: 'WAKE_BOARD',
              payload: { action: 'OPEN_APP', target: 'GROCERY' },
            });

            const aplDirectives = supportsAPL(event) ? buildLaunchAppDirectives() : undefined;

            return buildSpeechResponse(
              `Added ${itemNames.join(', ')} to your grocery list on the TV.`,
              true,
              undefined,
              aplDirectives
            );
          }
        }

        const aplDirectives = supportsAPL(event) ? buildLaunchAppDirectives() : undefined;

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
          await broadcastToHousehold(householdId, {
            type: 'WAKE_BOARD',
            payload: { action: 'OPEN_APP', target: 'CHORE' },
          });

          return buildSpeechResponse(
            `Pinned a chore on the TV for ${memberName}: ${rawTaskText}.`,
            true,
            undefined,
            aplDirectives
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

      // 4. SetHouseholdNameIntent / RenameHouseholdIntent
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

      // 5. ReadGroceryListIntent
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

  // 1. Rename Household: "rename household to...", "set board name to...", "change name to..."
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

  // 2. Groceries intent: "add milk and eggs to groceries", "buy apples", "need avocados"
  const isGrocery = /(?:grocery|groceries|shopping\s+list|supermarket|buy|milk|eggs|bread|produce|apples|bananas|butter|coffee)/i.test(text);
  if (isGrocery) {
    const cleaned = cleanGroceryItemText(text);
    const itemNames = cleaned
      .split(/(?:,\s*|\s+and\s+)/i)
      .map((s: string) => cleanGroceryItemText(s))
      .filter(Boolean);

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

  // 3. Chore Assignment intent: "assign Alex to take out trash", "chore for Mom clean counter"
  const choreMatch = text.match(/(?:assign(?:\s+to)?|chore\s+for|task\s+for|note\s+for)\s+([A-Za-z]+)\s+(?:to\s+)?(.+)/i);
  if (choreMatch) {
    const targetMemberName = choreMatch[1].trim();
    const taskText = choreMatch[2].trim();

    const matchedMember = state.members.find(
      (m) => m.name.toLowerCase() === targetMemberName.toLowerCase()
    );

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
      summary: `Assigned chore to ${targetMemberName}: "${taskText}"`,
      payload: choreNote,
    };
  }

  // 4. Default: Sticky Note Reminder
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
