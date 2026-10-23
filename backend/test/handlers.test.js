import test from 'node:test';
import assert from 'node:assert';
import { handler as httpHandler } from '../dist/http.js';
import { handler as alexaHandler } from '../dist/alexa.js';

test('HTTP Handler returns 200 for CORS preflight OPTIONS', async () => {
  const event = {
    rawPath: '/household/init',
    requestContext: {
      http: {
        method: 'OPTIONS',
        path: '/household/init',
        sourceIp: '127.0.0.1',
      },
    },
  };

  const res = await httpHandler(event);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['Access-Control-Allow-Origin'], 'https://di1gpgdox7pk1.cloudfront.net');
});

test('HTTP Handler returns 404 for unknown route', async () => {
  const event = {
    rawPath: '/unknown-route',
    requestContext: {
      http: {
        method: 'GET',
        path: '/unknown-route',
        sourceIp: '127.0.0.1',
      },
    },
  };

  const res = await httpHandler(event);
  assert.strictEqual(res.statusCode, 404);
});

test('Alexa Handler handles AMAZON.StopIntent cleanly', async () => {
  const event = {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'test-session',
      application: { applicationId: 'amzn1.ask.skill.123' },
      user: { userId: 'amzn1.ask.account.456' },
    },
    request: {
      type: 'IntentRequest',
      requestId: 'test-req',
      timestamp: new Date().toISOString(),
      intent: {
        name: 'AMAZON.StopIntent',
        confirmationStatus: 'NONE',
      },
    },
  };

  const res = await alexaHandler(event);
  assert.strictEqual(res.version, '1.0');
  assert.strictEqual(res.response.outputSpeech.text, 'Goodbye!');
  assert.strictEqual(res.response.shouldEndSession, true);
});

test('Alexa Handler handles AMAZON.HelpIntent cleanly', async () => {
  const event = {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'test-session',
      application: { applicationId: 'amzn1.ask.skill.123' },
      user: { userId: 'amzn1.ask.account.456' },
    },
    request: {
      type: 'IntentRequest',
      requestId: 'test-req',
      timestamp: new Date().toISOString(),
      intent: {
        name: 'AMAZON.HelpIntent',
        confirmationStatus: 'NONE',
      },
    },
  };

  const res = await alexaHandler(event);
  assert.strictEqual(res.response.shouldEndSession, false);
  assert(res.response.outputSpeech.text.includes('PinBoard TV'));
});

test('HTTP Handler routes POST /alexa correctly to Alexa Handler', async () => {
  const event = {
    rawPath: '/alexa',
    requestContext: {
      http: {
        method: 'POST',
        path: '/alexa',
        sourceIp: '127.0.0.1',
      },
    },
    body: JSON.stringify({
      version: '1.0',
      session: {
        new: false,
        sessionId: 'test-session',
        application: { applicationId: 'amzn1.ask.skill.123' },
        user: { userId: 'amzn1.ask.account.456' },
      },
      request: {
        type: 'IntentRequest',
        requestId: 'test-req',
        timestamp: new Date().toISOString(),
        intent: {
          name: 'AMAZON.StopIntent',
          confirmationStatus: 'NONE',
        },
      },
    }),
  };

  const res = await httpHandler(event);
  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  assert.strictEqual(parsed.response.outputSpeech.text, 'Goodbye!');
});

test('HTTP Handler validates POST /voice/process parameters', async () => {
  const event = {
    rawPath: '/voice/process',
    requestContext: {
      http: {
        method: 'POST',
        path: '/voice/process',
        sourceIp: '127.0.0.1',
      },
    },
    body: JSON.stringify({
      text: '',
    }),
  };

  const res = await httpHandler(event);
  assert.strictEqual(res.statusCode, 400);
  const parsed = JSON.parse(res.body);
  assert(parsed.error.includes('Missing text or householdId'));
});

