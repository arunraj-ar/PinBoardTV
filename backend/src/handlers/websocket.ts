import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { registerWsConnection, removeWsConnection } from '../services/dynamo.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const routeKey = event.requestContext.routeKey;
  const connectionId = event.requestContext.connectionId!;

  try {
    switch (routeKey) {
      case '$connect': {
        const householdId =
          event.queryStringParameters?.householdId ||
          event.headers?.['x-household-id'] ||
          'default';

        await registerWsConnection(connectionId, householdId);
        return { statusCode: 200, body: 'Connected' };
      }

      case '$disconnect': {
        await removeWsConnection(connectionId);
        return { statusCode: 200, body: 'Disconnected' };
      }

      case '$default':
      default: {
        return { statusCode: 200, body: 'OK' };
      }
    }
  } catch (error) {
    console.error(`WebSocket error on route ${routeKey}:`, error);
    return { statusCode: 500, body: 'Internal server error' };
  }
}
