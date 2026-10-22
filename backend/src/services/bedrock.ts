import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';

export interface ParsedHouseholdIntent {
  groceryItems?: Array<{ text: string; category?: string }>;
  chores?: Array<{ title: string; assignedToName?: string; priority?: 'LOW' | 'MED' | 'HIGH' }>;
  stickyNotes?: Array<{ title: string; content?: string; color?: string }>;
}

const SYSTEM_PROMPT = `You are the household intelligence engine for PinBoardTV.
Parse raw, unstructured household voice commands, notes, or spoken sentences into structured JSON containing categorized grocery items, assigned family chores, and general reminder sticky notes.
Always respond ONLY with valid JSON matching this exact structure:
{
  "groceryItems": [
    { "text": "item name", "category": "Produce" | "Dairy" | "Bakery" | "Meat" | "Pantry" | "Household" | "Beverages" }
  ],
  "chores": [
    { "title": "chore title", "assignedToName": "Name or empty string", "priority": "LOW" | "MED" | "HIGH" }
  ],
  "stickyNotes": [
    { "title": "note title", "content": "optional details", "color": "yellow" | "pink" | "blue" | "green" | "orange" | "cream" }
  ]
}
Do not include markdown fences, code blocks, or explanations outside the JSON object.`;

export async function parseWithBedrock(userInput: string): Promise<ParsedHouseholdIntent> {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;

  let requestBody: any;
  if (modelId.startsWith('amazon.nova')) {
    requestBody = {
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [{ text: userInput }],
        },
      ],
      inferenceConfig: {
        max_new_tokens: 1000,
        temperature: 0.1,
      },
    };
  } else if (modelId.startsWith('anthropic.claude')) {
    requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userInput,
        },
      ],
      temperature: 0.1,
    };
  } else {
    // Generic fallback prompt
    requestBody = {
      prompt: `\n\nHuman: ${SYSTEM_PROMPT}\n\nUser input: ${userInput}\n\nAssistant:`,
      max_tokens_to_sample: 1000,
      temperature: 0.1,
    };
  }

  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: Buffer.from(JSON.stringify(requestBody)),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    let responseText = '';
    if (responseBody.output?.message?.content?.[0]?.text) {
      // Nova format
      responseText = responseBody.output.message.content[0].text;
    } else if (responseBody.content?.[0]?.text) {
      // Claude 3 format
      responseText = responseBody.content[0].text;
    } else if (responseBody.completion) {
      responseText = responseBody.completion;
    }

    // Clean any accidental markdown code fences
    const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as ParsedHouseholdIntent;
  } catch (error) {
    console.error('Bedrock parse failed, using rule-based fallback:', error);
    return fallbackRuleBasedParser(userInput);
  }
}

function fallbackRuleBasedParser(input: string): ParsedHouseholdIntent {
  const lower = input.toLowerCase();
  if (lower.includes('milk') || lower.includes('egg') || lower.includes('bread') || lower.includes('grocery') || lower.includes('buy')) {
    const cleanItem = input
      .replace(/add /i, '')
      .replace(/to (the )?grocery( list)?/i, '')
      .replace(/please/i, '')
      .trim();
    return {
      groceryItems: [{ text: cleanItem || 'Groceries', category: 'Pantry' }],
    };
  }

  if (lower.includes('chore') || lower.includes('clean') || lower.includes('wash') || lower.includes('take out') || lower.includes('walk')) {
    return {
      chores: [{ title: input.trim(), priority: 'MED' }],
    };
  }

  return {
    stickyNotes: [{ title: input.trim(), color: 'yellow' }],
  };
}
