import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  createHousehold,
  getHousehold,
  rotateOtp,
  findHouseholdByOtp,
  putMember,
  getMember,
  deleteMember,
  updateHouseholdName,
  setHouseholdConfigured,
  putNote,
  getNote,
  updateNotePartial,
  deleteNote,
} from '../services/dynamo.js';
import { parseWithBedrock } from '../services/bedrock.js';
import { createPresignedPhotoUploadUrl } from '../services/s3.js';
import { broadcastToHousehold } from '../services/websocketNotifier.js';
import { handler as alexaHandler, processVoiceTextWithAlexaNLP } from './alexa.js';
import type { HouseholdMember, PinNote } from '../types.js';
import crypto from 'crypto';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/di1gpgdox7pk1\.cloudfront\.net$/,
  /^https:\/\/[a-z0-9]+\.cloudfront\.net$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/localho\.st(:\d+)?$/,
];

let currentRequestOrigin: string | undefined;

function getCorsOrigin(origin?: string): string {
  if (!origin) return 'https://di1gpgdox7pk1.cloudfront.net';
  const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
  return isAllowed ? origin : 'https://di1gpgdox7pk1.cloudfront.net';
}

function jsonResponse(statusCode: number, body: any): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getCorsOrigin(currentRequestOrigin),
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Household-Id,X-Member-Token,X-Otp-Code',
      'Vary': 'Origin',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  currentRequestOrigin = event.headers?.['origin'] || event.headers?.['Origin'];
  const method = event.requestContext.http.method.toUpperCase();
  let rawPath = event.rawPath || event.requestContext.http.path || '/';
  if (rawPath.startsWith('/prod/')) {
    rawPath = rawPath.replace('/prod', '');
  } else if (rawPath === '/prod') {
    rawPath = '/';
  }

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  const clientIp = event.requestContext.http.sourceIp;
  let body: any = {};
  if (event.body) {
    try {
      body = event.isBase64Encoded
        ? JSON.parse(Buffer.from(event.body, 'base64').toString())
        : JSON.parse(event.body);
    } catch {
      body = {};
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Household Endpoints
    // -------------------------------------------------------------------------
    if (rawPath === '/household/init' && method === 'POST') {
      const householdId = body.householdId || `hh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const hostSecret = body.hostSecret || `sec_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const otpCode = body.otpCode || Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = body.otpExpiresAt || Date.now() + 15 * 60 * 1000;
      const householdName = body.householdName || 'My Family PinBoard';

      const state = await createHousehold(
        householdId,
        householdName,
        hostSecret,
        otpCode,
        otpExpiresAt,
        clientIp
      );

      return jsonResponse(200, {
        householdId,
        hostSecret,
        otpCode,
        otpExpiresAt,
        householdName: state.householdName,
        qrUrl: `https://pinboard.tv/join?hh=${householdId}&code=${otpCode}`,
      });
    }

    if (rawPath === '/household/rotate-otp' && method === 'POST') {
      const householdId = body.householdId || event.headers['x-household-id'];
      if (!householdId) {
        return jsonResponse(400, { error: 'Missing householdId' });
      }

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = Date.now() + 15 * 60 * 1000;
      await rotateOtp(householdId, newOtp, otpExpiresAt);

      await broadcastToHousehold(householdId, {
        type: 'OTP_ROTATED',
        payload: { otpCode: newOtp, otpExpiresAt },
      });

      return jsonResponse(200, {
        otpCode: newOtp,
        otpExpiresAt,
        qrUrl: `https://pinboard.tv/join?hh=${householdId}&code=${newOtp}`,
      });
    }

    if (rawPath === '/household/join' && method === 'POST') {
      let householdId = body.householdId;
      const otpCode = (body.otpCode || '').trim();
      const displayName = (body.displayName || 'Family Member').trim();
      const color = body.color || 'yellow';

      if (!otpCode) {
        return jsonResponse(400, { error: 'Missing otpCode' });
      }

      // If householdId not provided, look it up by active OTP
      if (!householdId) {
        householdId = await findHouseholdByOtp(otpCode);
      }

      if (!householdId) {
        return jsonResponse(404, { error: 'Invalid or expired 6-digit passkey. Please check the TV screen.' });
      }

      const state = await getHousehold(householdId);
      if (!state) {
        return jsonResponse(404, { error: 'Household not found' });
      }

      // Validate OTP and expiration
      if (state.currentOtp !== otpCode || (state.otpExpiresAt && state.otpExpiresAt < Date.now())) {
        return jsonResponse(400, { error: 'Invalid or expired 6-digit passkey. Please check the TV screen.' });
      }

      const isSameWifi = Boolean(state.hostPublicIp && clientIp && state.hostPublicIp === clientIp);
      const normalizedName = displayName.trim().toLowerCase();
      const userHash = crypto.createHash('sha256').update(normalizedName).digest('hex').substring(0, 10);

      // Check if this member already exists in this household (by name or usernameHash)
      const existingMember = state.members.find(
        (m) => m.name.trim().toLowerCase() === normalizedName || (m as any).usernameHash === userHash
      );

      const memberToken = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
      let finalMember: HouseholdMember;

      if (existingMember) {
        // Returning user logging back in with the same username
        finalMember = {
          ...existingMember,
          color: color || existingMember.color,
          status: 'APPROVED', // Verified with active TV passkey
          lastSeenIp: clientIp,
          isSameWifi,
          usernameHash: userHash,
          memberToken,
        };

        await putMember(finalMember);

        await broadcastToHousehold(householdId, {
          type: 'PRESENCE_UPDATED',
          payload: { memberId: finalMember.id, isSameWifi },
        });

        return jsonResponse(200, {
          status: finalMember.status,
          householdId,
          householdName: state.householdName,
          memberId: finalMember.id,
          memberToken,
          role: finalMember.role,
          isSameWifi,
          isReturningMember: true,
        });
      }

      // Brand new member
      const hasHost = state.members.some((m) => m.role === 'HOST');
      const isFirstMember = state.members.length === 0 || !hasHost;
      const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      finalMember = {
        id: memberId,
        householdId,
        name: displayName,
        color,
        role: isFirstMember ? 'HOST' : 'MEMBER',
        status: state.autoApprove || isFirstMember ? 'APPROVED' : 'PENDING',
        lastSeenIp: clientIp,
        isSameWifi,
        joinedAt: new Date().toISOString(),
        usernameHash: userHash,
        memberToken,
      };

      await putMember(finalMember);

      if (isFirstMember) {
        await setHouseholdConfigured(householdId, true);
      }

      await broadcastToHousehold(householdId, {
        type: 'MEMBER_JOIN_REQUESTED',
        payload: { member: finalMember },
      });

      return jsonResponse(200, {
        status: finalMember.status,
        householdId,
        householdName: state.householdName,
        memberId: finalMember.id,
        memberToken,
        role: finalMember.role,
        isSameWifi,
        isReturningMember: false,
      });
    }

    if (rawPath.startsWith('/household/members/') && method === 'DELETE') {
      const memberId = rawPath.replace('/household/members/', '').trim();
      const householdId = event.queryStringParameters?.householdId || event.headers['x-household-id'] || body.householdId;
      if (!householdId || !memberId) {
        return jsonResponse(400, { error: 'Missing householdId or memberId' });
      }

      await deleteMember(householdId, memberId);
      await broadcastToHousehold(householdId, {
        type: 'MEMBER_REMOVED',
        payload: { memberId },
      });

      return jsonResponse(200, { success: true, memberId });
    }

    if (rawPath === '/household/update-name' && method === 'POST') {
      const householdId = body.householdId || event.headers['x-household-id'];
      const householdName = (body.householdName || '').trim();
      if (!householdId || !householdName) {
        return jsonResponse(400, { error: 'Missing householdId or householdName' });
      }

      await updateHouseholdName(householdId, householdName);
      await broadcastToHousehold(householdId, {
        type: 'HOUSEHOLD_NAME_UPDATED',
        payload: { name: householdName },
      });

      return jsonResponse(200, { success: true, householdName });
    }

    if (rawPath === '/household/state' && method === 'GET') {
      const householdId = event.queryStringParameters?.householdId || event.headers['x-household-id'];
      if (!householdId) {
        return jsonResponse(400, { error: 'Missing householdId' });
      }

      let state = await getHousehold(householdId);
      if (!state) {
        // Auto-provision brand new household on first touch so TV QR setup never 404s
        const otpCode = event.queryStringParameters?.otp || event.headers['x-otp-code'] || Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = Date.now() + 15 * 60 * 1000;
        const hostSecret = `sec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const householdName = event.queryStringParameters?.name || 'My Family PinBoard';

        state = await createHousehold(
          householdId,
          householdName,
          hostSecret,
          otpCode,
          otpExpiresAt,
          clientIp
        );
      } else if (!state.isConfigured && (!state.otpExpiresAt || state.otpExpiresAt < Date.now())) {
        // If household is awaiting setup and OTP is expired, auto-rotate to a fresh 15-minute OTP
        const newOtp = event.queryStringParameters?.otp || Math.floor(100000 + Math.random() * 900000).toString();
        const newExpiresAt = Date.now() + 15 * 60 * 1000;
        await rotateOtp(householdId, newOtp, newExpiresAt);
        state.currentOtp = newOtp;
        state.otpExpiresAt = newExpiresAt;
      }

      // Hide hostSecret from public response
      const { hostSecret, ...safeState } = state;
      return jsonResponse(200, safeState);
    }

    // -------------------------------------------------------------------------
    // 2. Notes CRUD Endpoints
    // -------------------------------------------------------------------------
    if (rawPath === '/notes' && method === 'GET') {
      const householdId = event.queryStringParameters?.householdId || event.headers['x-household-id'];
      if (!householdId) {
        return jsonResponse(400, { error: 'Missing householdId' });
      }

      const state = await getHousehold(householdId);
      return jsonResponse(200, state ? state.notes : []);
    }

    if (rawPath === '/notes' && method === 'POST') {
      const householdId = body.householdId || event.headers['x-household-id'];
      if (!householdId) {
        return jsonResponse(400, { error: 'Missing householdId' });
      }

      const note: PinNote = {
        id: body.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        householdId,
        type: body.type || 'STICKY',
        title: body.title || 'Untitled Note',
        content: body.content,
        items: body.items,
        imageUrl: body.imageUrl,
        color: body.color || 'yellow',
        magnet: body.magnet || 'brass-pin',
        rotationDeg: typeof body.rotationDeg === 'number' ? body.rotationDeg : (Math.random() * 4 - 2),
        assignedToMemberId: body.assignedToMemberId,
        createdByMemberId: body.createdByMemberId || 'anon',
        pinned: Boolean(body.pinned),
        updatedAt: new Date().toISOString(),
      };

      await putNote(note);
      await broadcastToHousehold(householdId, {
        type: 'NOTE_CREATED',
        payload: note,
      });

      return jsonResponse(201, note);
    }

    if (rawPath.startsWith('/notes/') && method === 'PATCH') {
      const noteId = rawPath.replace('/notes/', '').trim();
      const householdId = body.householdId || event.headers['x-household-id'];
      if (!noteId || !householdId) {
        return jsonResponse(400, { error: 'Missing noteId or householdId' });
      }

      const updated = await updateNotePartial(householdId, noteId, body.changes || body);
      if (!updated) {
        return jsonResponse(404, { error: 'Note not found' });
      }

      await broadcastToHousehold(householdId, {
        type: 'NOTE_UPDATED',
        payload: { id: noteId, changes: body.changes || body },
      });

      return jsonResponse(200, updated);
    }

    if (rawPath.startsWith('/notes/') && method === 'DELETE') {
      const noteId = rawPath.replace('/notes/', '').trim();
      const householdId = event.queryStringParameters?.householdId || event.headers['x-household-id'] || body.householdId;
      if (!noteId || !householdId) {
        return jsonResponse(400, { error: 'Missing noteId or householdId' });
      }

      await deleteNote(householdId, noteId);
      await broadcastToHousehold(householdId, {
        type: 'NOTE_DELETED',
        payload: { id: noteId },
      });

      return jsonResponse(200, { success: true, id: noteId });
    }

    // -------------------------------------------------------------------------
    // 3. S3 Presigned Photo Upload Endpoint
    // -------------------------------------------------------------------------
    if (rawPath === '/photos/presign' && method === 'POST') {
      const householdId = body.householdId || event.headers['x-household-id'] || 'general';
      const contentType = body.contentType || 'image/jpeg';

      const presign = await createPresignedPhotoUploadUrl(householdId, contentType);
      return jsonResponse(200, presign);
    }

    // -------------------------------------------------------------------------
    // 4. Bedrock NLP Endpoint (/ai/parse)
    // -------------------------------------------------------------------------
    if (rawPath === '/ai/parse' && method === 'POST') {
      const input = body.input || body.transcript || body.text;
      if (!input) {
        return jsonResponse(400, { error: 'Missing input text' });
      }

      const parsed = await parseWithBedrock(input);
      return jsonResponse(200, parsed);
    }

    if (rawPath === '/voice/process' && method === 'POST') {
      const text = body.text || body.input || body.transcript;
      const householdId = body.householdId || event.headers?.['x-household-id'] || event.headers?.['X-Household-Id'];
      if (!text || !householdId) {
        return jsonResponse(400, { error: 'Missing text or householdId' });
      }

      const result = await processVoiceTextWithAlexaNLP(text, householdId);
      return jsonResponse(200, result);
    }

    // -------------------------------------------------------------------------
    // 5. Alexa HTTPS Webhook Endpoint (/alexa)
    // Allows Alexa skill to link via HTTPS endpoint from ANY region (including Sydney)
    // -------------------------------------------------------------------------
    if (rawPath === '/alexa' && method === 'POST') {
      const alexaResponse = await alexaHandler(body);
      return jsonResponse(200, alexaResponse);
    }

    return jsonResponse(404, { error: 'Route not found', path: rawPath, method });
  } catch (err: any) {
    console.error('API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal server error' });
  }
}
