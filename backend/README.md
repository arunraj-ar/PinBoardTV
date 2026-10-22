# PinBoardTV — Serverless AWS Backend

This directory contains the production-ready serverless backend for **PinBoardTV**, built strictly within the **AWS Free Tier** ($0 operational cost).

---

## 🏗️ Architecture

```
                                 ┌───────────────────────────────┐
                                 │     Amazon Bedrock            │
                                 │  (amazon.nova-micro-v1:0)     │
                                 └───────────────▲───────────────┘
                                                 │
                                                 │ NLP Parsing
                                                 │
┌───────────────────────────┐    HTTP API        ▼
│  Fire TV / Mobile Client  │───────────────► PinBoardApiFunction ───┐
│  (10ft TV UI & Phone Web) │                  (REST API)            │
└─────────────▲─────────────┘                                        │
              │                                                      ▼
              │ WSS Real-Time               PinBoardWsFunction  ──► Amazon DynamoDB
              └─────────────────────────────► (WebSockets)          (PinBoardTVTable)
                                                                     ▲
┌───────────────────────────┐                PinBoardAlexaFunction ──┘
│  Amazon Alexa / Echo      │────────────────► (Custom Skill)
│  ("Alexa, ask Pin Board") │
└───────────────────────────┘
```

### Free Tier Safeguards ($0 Cost)
* **Amazon DynamoDB:** Pay-Per-Request with zero minimum cost. Under 25 GB storage and 25 RCU/WCU is 100% free forever.
* **AWS Lambda:** 1,000,000 requests and 3.2M seconds compute free per month.
* **API Gateway HTTP API:** 1,000,000 API calls free per month for 12 months.
* **Amazon S3:** 5 GB storage free for 12 months.
* **Amazon Bedrock:** Amazon Nova Micro costs ~$0.000035 per 1,000 tokens (effectively free for household note parsing).

---

## 📁 Directory Structure

```
backend/
├── src/
│   ├── handlers/
│   │   ├── http.ts         # REST API endpoints (household, notes, photos, AI)
│   │   ├── websocket.ts    # WebSocket ($connect, $disconnect, $default)
│   │   └── alexa.ts        # Alexa Custom Skill request dispatcher
│   ├── services/
│   │   ├── dynamo.ts       # Single-table DynamoDB data access
│   │   ├── bedrock.ts      # Amazon Nova Micro / Claude 3 NLP parser
│   │   ├── s3.ts           # S3 presigned photo upload generator
│   │   └── websocketNotifier.ts # Broadcast events to connected clients
│   └── types.ts            # Shared TypeScript data contracts
├── alexa/
│   ├── skill.json          # Alexa Skill manifest
│   └── interactionModel.json # Alexa Skill interaction model (en-US)
├── scripts/
│   └── deploy.sh           # Automated 1-command deploy script
├── test/
│   └── handlers.test.js    # Unit tests for Lambda handlers
├── template.yaml           # AWS SAM / CloudFormation infrastructure
├── build.js                # Lightning-fast esbuild bundler
└── package.json
```

---

## 🚀 One-Command Deployment

Once your AWS credentials are configured (`aws configure`):

```bash
# From root or backend directory:
npm run deploy --prefix backend
# OR
./backend/scripts/deploy.sh
```

The script builds the TypeScript Lambda functions with esbuild and deploys the CloudFormation stack to AWS in `us-east-1`.

When deployment finishes, it outputs:
```
HttpApiUrl:      https://<api-id>.execute-api.us-east-1.amazonaws.com
WebSocketApiUrl: wss://<ws-id>.execute-api.us-east-1.amazonaws.com/prod
AlexaFunctionArn: arn:aws:lambda:us-east-1:...:function:PinBoardAlexaFunction-prod
```

Copy those values to `frontend/.env`:
```ini
VITE_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com
VITE_WS_URL=wss://<ws-id>.execute-api.us-east-1.amazonaws.com/prod
```

---

## 🎙️ Alexa Skill Setup (Developer Console)

1. Open the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Click **Create Skill**:
   - Skill Name: `PinBoard TV`
   - Default language: `English (US)`
   - Model: **Custom**
   - Hosting: **Provision your own**
3. In the left navigation, go to **Interaction Model** -> **JSON Editor**.
4. Drag and drop or paste the contents of `backend/alexa/interactionModel.json`.
5. Click **Save Model** and **Build Model**.
6. In the left navigation, go to **Endpoint**:
   - Select **AWS Lambda ARN**.
   - Paste the `AlexaFunctionArn` output from your deployment.
   - Click **Save Endpoints**.
7. Test the skill immediately in the **Test** tab by typing:
   - *"open pin board"*
   - *"tell pin board my household code is 123456"*
   - *"ask pin board to add oat milk to groceries"*
