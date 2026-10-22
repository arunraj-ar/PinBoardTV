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
import { handler as alexaHandler } from './alexa.js';
import type { HouseholdMember, PinNote } from '../types.js';

function jsonResponse(statusCode: number, body: any): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Household-Id,X-Member-Token',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
      const householdId = `hh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const hostSecret = `sec_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = Date.now() + 15 * 60 * 1000;
      const householdName = body.householdName || 'Living Room PinBoard';

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
      const otpCode = body.otpCode;
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
        return jsonResponse(404, { error: 'Invalid or expired OTP code' });
      }

      const state = await getHousehold(householdId);
      if (!state) {
        return jsonResponse(404, { error: 'Household not found' });
      }

      const isFirstMember = state.members.length === 0;
      const isSameWifi = Boolean(state.hostPublicIp && clientIp && state.hostPublicIp === clientIp);
      const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const memberToken = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;

      const newMember: HouseholdMember = {
        id: memberId,
        householdId,
        name: displayName,
        color,
        role: isFirstMember ? 'HOST' : 'MEMBER',
        status: state.autoApprove || isFirstMember ? 'APPROVED' : 'PENDING',
        lastSeenIp: clientIp,
        isSameWifi,
        joinedAt: new Date().toISOString(),
      };

      await putMember(newMember);

      if (isFirstMember) {
        await setHouseholdConfigured(householdId, true);
      }

      await broadcastToHousehold(householdId, {
        type: 'MEMBER_JOIN_REQUESTED',
        payload: { member: newMember },
      });

      return jsonResponse(200, {
        status: newMember.status,
        householdId,
        householdName: state.householdName,
        memberId,
        memberToken,
        role: newMember.role,
        isSameWifi,
      });
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

      const state = await getHousehold(householdId);
      if (!state) {
        return jsonResponse(404, { error: 'Household not found' });
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
