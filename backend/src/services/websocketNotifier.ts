import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { getHouseholdWsConnections, removeWsConnection } from './dynamo.js';
import type { SyncEvent } from '../types.js';

let apigwClient: ApiGatewayManagementApiClient | null = null;

function getApiGatewayClient(): ApiGatewayManagementApiClient | null {
  const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
  if (!endpoint) return null;
  if (!apigwClient) {
    apigwClient = new ApiGatewayManagementApiClient({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return apigwClient;
}

export async function broadcastToHousehold(householdId: string, event: SyncEvent): Promise<void> {
  const client = getApiGatewayClient();
  if (!client) {
    // If running offline or without WebSocket endpoint, skip without error
    return;
  }

  const connectionIds = await getHouseholdWsConnections(householdId);
  if (connectionIds.length === 0) return;

  const data = Buffer.from(JSON.stringify(event));

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      try {
        await client.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: data,
          })
        );
      } catch (err: any) {
        // If 410 Gone, connection is stale: clean it up
        if (err.statusCode === 410 || err.$metadata?.httpStatusCode === 410) {
          await removeWsConnection(connectionId).catch(() => {});
        } else {
          console.warn(`Failed to push to WS connection ${connectionId}:`, err);
        }
      }
    })
  );
}
