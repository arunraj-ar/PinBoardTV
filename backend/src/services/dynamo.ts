import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  HouseholdState,
  HouseholdMember,
  PinNote,
  ChecklistItem,
} from '../types.js';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME || 'PinBoardTVTable';

// -----------------------------------------------------------------------------
// Household Operations
// -----------------------------------------------------------------------------

export async function createHousehold(
  householdId: string,
  householdName: string,
  hostSecret: string,
  otpCode: string,
  otpExpiresAt: number,
  hostPublicIp?: string
): Promise<HouseholdState> {
  const now = new Date().toISOString();
  const householdItem = {
    PK: `HOUSEHOLD#${householdId}`,
    SK: 'METADATA',
    householdId,
    householdName,
    hostSecret,
    currentOtp: otpCode,
    otpExpiresAt,
    autoApprove: true,
    screensaverEnabled: true,
    autonomousAiOrganize: true,
    theme: 'cork' as const,
    hostPublicIp: hostPublicIp || '',
    isConfigured: false,
    createdAt: now,
    updatedAt: now,
  };

  const otpLookupItem = {
    PK: `OTP#${otpCode}`,
    SK: 'LOOKUP',
    GSI1PK: `OTP#${otpCode}`,
    GSI1SK: `EXPIRES#${otpExpiresAt}`,
    householdId,
    otpCode,
    expiresAt: otpExpiresAt,
    ttl: Math.floor(otpExpiresAt / 1000) + 3600, // keep for 1 hour after expiry for audit
  };

  await docClient.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: [
          { PutRequest: { Item: householdItem } },
          { PutRequest: { Item: otpLookupItem } },
        ],
      },
    })
  );

  return {
    householdId,
    householdName,
    hostSecret,
    currentOtp: otpCode,
    otpExpiresAt,
    autoApprove: true,
    screensaverEnabled: true,
    autonomousAiOrganize: true,
    theme: 'cork',
    hostPublicIp,
    members: [],
    notes: [],
    isConfigured: false,
  };
}

export async function getHousehold(householdId: string): Promise<HouseholdState | null> {
  // Query all items for this household partition (METADATA, MEMBER#*, NOTE#*)
  const res = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `HOUSEHOLD#${householdId}`,
      },
    })
  );

  if (!res.Items || res.Items.length === 0) return null;

  const metadata = res.Items.find((item) => item.SK === 'METADATA');
  if (!metadata) return null;

  const members: HouseholdMember[] = res.Items
    .filter((item) => item.SK.startsWith('MEMBER#'))
    .map((item) => ({
      id: item.id,
      householdId: item.householdId,
      name: item.name,
      color: item.color,
      role: item.role,
      status: item.status,
      lastSeenIp: item.lastSeenIp,
      isSameWifi: Boolean(item.isSameWifi),
      joinedAt: item.joinedAt,
    }));

  const notes: PinNote[] = res.Items
    .filter((item) => item.SK.startsWith('NOTE#'))
    .map((item) => ({
      id: item.id,
      householdId: item.householdId,
      type: item.type,
      title: item.title,
      content: item.content,
      items: item.items,
      imageUrl: item.imageUrl,
      color: item.color,
      magnet: item.magnet,
      rotationDeg: item.rotationDeg,
      assignedToMemberId: item.assignedToMemberId,
      createdByMemberId: item.createdByMemberId,
      pinned: Boolean(item.pinned),
      updatedAt: item.updatedAt,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    householdId: metadata.householdId,
    householdName: metadata.householdName,
    currentOtp: metadata.currentOtp,
    otpExpiresAt: metadata.otpExpiresAt,
    hostSecret: metadata.hostSecret,
    autoApprove: Boolean(metadata.autoApprove),
    screensaverEnabled: Boolean(metadata.screensaverEnabled),
    autonomousAiOrganize: Boolean(metadata.autonomousAiOrganize),
    theme: metadata.theme || 'cork',
    hostPublicIp: metadata.hostPublicIp,
    members,
    notes,
    isConfigured: Boolean(metadata.isConfigured),
  };
}

export async function rotateOtp(
  householdId: string,
  newOtp: string,
  expiresAt: number
): Promise<{ otpCode: string; otpExpiresAt: number }> {
  // Update household metadata and create new OTP lookup item
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET currentOtp = :otp, otpExpiresAt = :exp, updatedAt = :now',
      ExpressionAttributeValues: {
        ':otp': newOtp,
        ':exp': expiresAt,
        ':now': new Date().toISOString(),
      },
    })
  );

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `OTP#${newOtp}`,
        SK: 'LOOKUP',
        GSI1PK: `OTP#${newOtp}`,
        GSI1SK: `EXPIRES#${expiresAt}`,
        householdId,
        otpCode: newOtp,
        expiresAt,
        ttl: Math.floor(expiresAt / 1000) + 3600,
      },
    })
  );

  return { otpCode: newOtp, otpExpiresAt: expiresAt };
}

export async function findHouseholdByOtp(otp: string): Promise<string | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `OTP#${otp}`,
        SK: 'LOOKUP',
      },
    })
  );

  if (!res.Item) return null;
  if (res.Item.expiresAt && res.Item.expiresAt < Date.now()) return null;
  return res.Item.householdId || null;
}

export async function updateHouseholdName(householdId: string, name: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET householdName = :name, updatedAt = :now',
      ExpressionAttributeValues: {
        ':name': name,
        ':now': new Date().toISOString(),
      },
    })
  );
}

export async function setHouseholdConfigured(householdId: string, isConfigured: boolean): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET isConfigured = :c, updatedAt = :now',
      ExpressionAttributeValues: {
        ':c': isConfigured,
        ':now': new Date().toISOString(),
      },
    })
  );
}

// -----------------------------------------------------------------------------
// Member Operations
// -----------------------------------------------------------------------------

export async function putMember(member: HouseholdMember): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `HOUSEHOLD#${member.householdId}`,
        SK: `MEMBER#${member.id}`,
        ...member,
      },
    })
  );
}

export async function getMember(householdId: string, memberId: string): Promise<HouseholdMember | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: `MEMBER#${memberId}`,
      },
    })
  );
  return (res.Item as HouseholdMember) || null;
}

export async function deleteMember(householdId: string, memberId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: `MEMBER#${memberId}`,
      },
    })
  );
}

// -----------------------------------------------------------------------------
// Notes Operations
// -----------------------------------------------------------------------------

export async function putNote(note: PinNote): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `HOUSEHOLD#${note.householdId}`,
        SK: `NOTE#${note.id}`,
        ...note,
      },
    })
  );
}

export async function getNote(householdId: string, noteId: string): Promise<PinNote | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: `NOTE#${noteId}`,
      },
    })
  );
  return (res.Item as PinNote) || null;
}

export async function updateNotePartial(
  householdId: string,
  noteId: string,
  changes: Partial<PinNote>
): Promise<PinNote | null> {
  const existing = await getNote(householdId, noteId);
  if (!existing) return null;

  const updated: PinNote = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString(),
  };

  await putNote(updated);
  return updated;
}

export async function deleteNote(householdId: string, noteId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `HOUSEHOLD#${householdId}`,
        SK: `NOTE#${noteId}`,
      },
    })
  );
}

// -----------------------------------------------------------------------------
// WebSocket Connection Management
// -----------------------------------------------------------------------------

export async function registerWsConnection(connectionId: string, householdId: string): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `WS#${connectionId}`,
        SK: 'CONN',
        GSI1PK: `HOUSEHOLD#${householdId}`,
        GSI1SK: `WS#${connectionId}`,
        connectionId,
        householdId,
        connectedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 86400, // 24-hr TTL
      },
    })
  );
}

export async function removeWsConnection(connectionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `WS#${connectionId}`,
        SK: 'CONN',
      },
    })
  );
}

export async function getHouseholdWsConnections(householdId: string): Promise<string[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :prefix)',
      ExpressionAttributeValues: {
        ':gsi1pk': `HOUSEHOLD#${householdId}`,
        ':prefix': 'WS#',
      },
    })
  );

  return (res.Items || []).map((item) => item.connectionId);
}

// -----------------------------------------------------------------------------
// Alexa User to Household Binding
// -----------------------------------------------------------------------------

export async function bindAlexaUser(alexaUserId: string, householdId: string): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ALEXA#${alexaUserId}`,
        SK: 'BINDING',
        alexaUserId,
        householdId,
        boundAt: new Date().toISOString(),
      },
    })
  );
}

export async function getAlexaHousehold(alexaUserId: string): Promise<string | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ALEXA#${alexaUserId}`,
        SK: 'BINDING',
      },
    })
  );

  return res.Item?.householdId || null;
}
