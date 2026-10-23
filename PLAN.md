# PLAN.md — PinBoardTV (Ambient Family Hub for Fire TV, Mobile & Alexa)

## 1. Project Overview & Hackathon Alignment
**PinBoardTV** turns any Fire TV into an always-on, interactive household pinboard and screensaver where families manage sticky notes, grocery lists, chores, and polaroid memories.
- **Primary Track:** Fire TV (Web App packaged for Fire OS / Vega Simulator with 10-foot UI & D-pad navigation).
- **Cross-Device Integration:** Alexa Custom Skill (Voice-to-Board) + Mobile Web Companion.
- **Mini-Challenge Qualification:** AWS Builder (100% Serverless AWS Free-Tier Architecture + Amazon Bedrock for natural-language voice/note categorization).
- **Cost Target:** **$0.00** (Strictly AWS Free Tier services + local/free tooling).

---

## 2. Zero-Cost AWS Architecture ($0 Stack)

| Layer | AWS Service (Free Tier) | Purpose | Free Tier Allowance |
| :--- | :--- | :--- | :--- |
| **Frontend Hosting** | **AWS Amplify Hosting** / S3 + CloudFront | Hosts the single monorepo React app serving both the `/tv` Host View and `/mobile` Client View. | 1,000 build mins/mo, 15 GB served/mo |
| **Database** | **Amazon DynamoDB** (On-Demand / Free Tier) | Stores Households, Rotating 6-digit OTPs, Approved Members, and Sticky Notes (`PinBoardTable`). | 25 GB storage + 200M requests/mo (Always Free) |
| **Real-Time Sync** | **Amazon API Gateway WebSockets** / AppSync | Instant real-time push from Mobile/Alexa to the Fire TV board without page reloads. | 1,000,000 messages/mo (12 mo free) |
| **Backend Compute** | **AWS Lambda** (Node.js 20.x) | Handles OTP generation/rotation, Wi-Fi subnet checks, note CRUD, and Alexa Skill webhooks. | 1M requests/mo + 3.2M sec compute (Always Free) |
| **Photo Storage** | **Amazon S3** (with Presigned URLs) | Stores compressed family polaroid photos uploaded from phones. | 5 GB Standard Storage |
| **Voice & AI** | **Alexa Skills Kit (ASK)** + **Amazon Bedrock** (`nova-micro-v1:0` / `claude-3-haiku`) | Parses natural voice commands into structured notes and categorized grocery lists. | Bedrock micro-tier pricing (<$0.01 / mo) |

---

## 3. Core System Mechanics & Security Rules

### 3.1 TV as Host & Magic QR Instant Token Handshake
1. **TV Host Initialization:**
   - On first launch on Fire TV (`/tv`), the app calls `createHousehold` and stores `householdId` + `hostSecret` in `localStorage`.
   - The TV generates a **6-digit rotating Passkey (OTP)** valid for 15 minutes (or rotated manually via TV remote).
   - **Magic QR Code Display:** The TV dynamically renders a QR code encoding `https://<app-url>/join?hh=<householdId>&code=<otpCode>` alongside the human-readable 6-digit code for manual fallback. This avoids requiring any fragile local HTTP server on the TV while enabling zero-typing 1-scan pairing.
2. **One-Scan Mobile Handshake (`/join` -> `/mobile`):**
   - User scans the TV QR code with their phone camera.
   - The `/join` page automatically reads `hh` and `code` from query parameters, **pre-filling and validating the OTP with zero manual typing**.
   - Family member selects their **Display Name** and **Avatar Color**, then taps **"Join PinBoard"**.
   - **Approval Mode:** If `Auto-Approve` is ON (default for families), the backend immediately validates the OTP and issues a persistent `memberToken`. If OFF, a toast pops up on the TV: *"Alex wants to join PinBoardTV — Press [SELECT] to Approve"*.
   - Once approved, the mobile browser receives and saves `{ householdId, memberId, memberToken }` in `localStorage` under `pinboard_household_registry`, auto-redirecting to `/mobile`. **The user is permanently authenticated and never needs to log in again.**
3. **Same-Household / Wi-Fi Presence Verification:**
   - Every API request to AWS Lambda extracts the caller's public IP (`event.requestContext.http.sourceIp`).
   - When the TV Host is active, it periodically registers its `homePublicIp` on the Household record in DynamoDB.
   - Mobile clients hitting the API from the exact same `homePublicIp` are marked **"Home (Verified Wi-Fi)"** on the TV board with a green indicator badge. If a user's IP drifts for >7 days, the system can prompt a quick 1-tap re-verify on the TV.

---

## 4. Data Model (Single-Table DynamoDB Design)

**Table Name:** `PinBoardTable` (or `PinBoardTVTable`)
- **Partition Key (`PK`):** `STRING`
- **Sort Key (`SK`):** `STRING`
- **GSI1 (`GSI1PK` / `GSI1SK`):** Used for fast 6-digit OTP lookup and WebSocket connection discovery.
- **TTL Attribute (`ttl`):** Automatic epoch timestamp cleanup.

| Entity | `PK` | `SK` | Key Attributes |
| :--- | :--- | :--- | :--- |
| **Household** | `HOUSEHOLD#<householdId>` | `METADATA` | `name`, `currentOtp`, `otpExpiresAt`, `autoApprove` (bool), `homeIp`, `theme`, `createdAt` |
| **OTP Lookup (GSI1)** | `OTP#<6DigitCode>` | `LOOKUP` | `GSI1PK = OTP#<code>`, `GSI1SK = EXPIRES#<time>`, `householdId`, `ttl` |
| **Member** | `HOUSEHOLD#<householdId>` | `MEMBER#<memberId>` | `name`, `color`, `role` (`HOST`\|`MEMBER`), `status` (`PENDING`\|`APPROVED`), `lastSeenIp`, `isSameWifi` (bool) |
| **Sticky Note / List** | `HOUSEHOLD#<householdId>` | `NOTE#<noteId>` | `type` (`STICKY`\|`GROCERY`\|`CHORE`\|`POLAROID`), `title`, `items` (array of `{id, text, done, category}`), `assignedTo`, `color`, `rotationDeg`, `imageUrl`, `pinned`, `updatedAt` |
| **WebSocket Connection** | `WS#<connectionId>` | `CONN` | `GSI1PK = HOUSEHOLD#<householdId>`, `GSI1SK = WS#<connectionId>`, `ttl` |
| **Alexa User Binding** | `ALEXA#<alexaUserId>` | `BINDING` | `alexaUserId`, `householdId`, `boundAt` |

---

## 5. Directory & Repository Structure

```text
PinBoardTV/
├── README.md                     # Judge-ready documentation, architecture & quickstart
├── CONTEXT.md                    # Comprehensive AI & developer system blueprint
├── DEVPOST_SUBMISSION.md         # Copy-paste responses for Devpost submission portal
├── FRICTION_LOG.md               # 7+ structured friction entries with all 6 required fields (+10% Bonus)
├── DEMO_SCRIPT.md                # 2:45 video run-of-show script in 2-column table format
├── PLAN.md                       # Master roadmap and architectural plan
├── package.json                  # Root monorepo workspace configuration
├── backend/                      # Production serverless AWS backend
│   ├── src/
│   │   ├── handlers/             # HTTP REST, WebSocket and Alexa Custom Skill handlers
│   │   └── services/             # DynamoDB single-table, Bedrock AI and S3 presigned utilities
│   ├── alexa/                   # Alexa Skill manifest and interaction model
│   └── template.yaml             # AWS CloudFormation / SAM template
├── frontend/                     # Vite + React 18 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx               # Route switcher: /tv, /tv/screensaver, /mobile, /join
│   │   ├── pages/
│   │   │   ├── TvScreensaver.tsx # Always-on Ambient Pinboard + Clock + Weather + Burn-in Shift
│   │   │   ├── TvBoardApp.tsx    # Interactive 10-foot D-pad Board (Edit/Filter/Settings)
│   │   │   ├── MobileJoin.tsx    # One-time Magic QR 6-digit OTP onboarding screen
│   │   │   └── MobileApp.tsx     # Persistent mobile companion for notes, groceries, and photos
│   │   ├── components/           # Skeuomorphic cards, D-pad focus rings & 10-foot zoom modal
│   │   └── services/             # Hybrid AWS WebSocket + local BroadcastChannel data adapter
└── android/                      # Fire TV Android WebView wrapper + DreamService (Screensaver)
    └── app/src/main/
        ├── AndroidManifest.xml   # DreamService screensaver and Android App Links declaration
        └── java/com/pinboardtv/app/
            ├── MainActivity.java # Fire TV WebView with high-DPI scaling & overscan margins
            └── TvScreensaverService.java # Native Android DreamService
```

---

## 6. Phased Implementation Plan (Antigravity Execution Status)

### Phase 1: Project Scaffold & Local-First Real-Time Mock (Hours 1–3)
- [x] **Step 1.1:** Initialize Vite + React + TypeScript + Tailwind CSS in `frontend/`.
- [x] **Step 1.2:** Build a unified data layer (`src/services/storageSync.ts`) that supports **AWS AppSync / API Gateway** in production AND falls back to `BroadcastChannel` + `localStorage` for instant zero-latency local testing.
- [x] **Step 1.3:** Implement realistic seed data (Grocery list, Chores assigned to family members, Reminder sticky notes, and 2 Polaroid photos) so the board looks rich immediately.

### Phase 2: The Pure Ambient Pinboard & Voice-Only TV Experience (Hours 4–10)
- [x] **Step 2.1: Pure Ambient Pinboard Canvas (16:9 Full Widescreen)**
  - Full-width 16:9 TV canvas spanning edge-to-edge with safe overscan margins (no narrow max-w-7xl restriction).
  - Procedural Warm Cork and Brushed Slate textures with vignette depth and 60-second micro-shift burn-in protection.
  - Full-size sticky notes: cards display full items and content naturally; collapse with `+N more items...` only when exceeding capacity (>6-7 items).
  - Screensaver parity: screensaver renders the identical pinboard canvas (omitting title bar) with a bottom wake hint: `[▼ Arrow Down + OK] Launch PinBoardTV`. Pressing Arrow Down highlights the button with high-contrast TV focus; pressing OK/Enter wakes/launches the board app.
- [x] **Step 2.2: 10-Foot Focus Modal (100% D-Pad Navigable)**
  - Pressing `[SELECT]` / `Enter` on any card smoothly expands it into a centered, full-screen **10-Foot Focus Modal**:
    - Typography scales up to **36px–48px** and icons to `w-10 h-10` for effortless 10-foot legibility.
    - Full D-pad item-by-item spatial navigation:
      - `ArrowUp` / `ArrowDown` highlights individual checklist items with high-contrast amber focus glow (`ring-4 ring-amber-400 bg-black/10`).
      - Navigating down reaches `[🎙️ Voice Edit Note]` button and `[✓ Done]` button.
    - Pressing `[SELECT]` / `Enter` toggles focused checklist item with chime and celebratory confetti.
    - Pressing `[BACK]` or `[ESCAPE]` shrinks the card back to its spot on the board.
- [x] **Step 2.3: Voice-Only Remote Add & In-Place Conversational Edit**
  - **Zero On-Screen Virtual Keyboards on TV.**
  - Microphone trigger on TV Voice Remote / Focus Modal / keyboard shortcut 'V':
    - User selects note and speaks: *"Edit this to: Pick up Grandma at 3 PM"* or *"Add organic oat milk"*.
    - Context-aware Bedrock NLP parser extracts intent and applies changes in-place without typing.
    - Global voice pin: User clicks `[+ Voice Pin]` or remote Mic to dictate new notes directly to the board.
- [x] **Step 2.4: Settings Side Panel with 50%+ Giant Magic QR & D-Pad Navigation**
  - Settings opens as a sleek side drawer (480px) rather than a tiny centered modal.
  - Giant Magic QR Code covering **50%+ of screen width/height** in the center stage for effortless 10ft phone scanning.
  - 100% D-pad navigable settings controls with vertical focus flow (`ArrowUp`/`ArrowDown`/`Enter`):
    - Rotate Passkey / Refresh QR
    - Autonomous AI Organize toggle (ON/OFF with animated switch)
    - Texture Theme selector (Warm Cork vs Dark Slate)
    - Member management (view & remove with 10-foot confirmation modal)
    - Return to Board button

### Phase 3: Mobile Companion Web App & One-Time Auth (Hours 11–16)
- [x] **Step 3.1: Magic QR One-Scan Join Flow (`/join`)**
  - Mobile UI that auto-reads `?hh=...&code=...` from the Magic QR scan, pre-filling and verifying the 6-digit passkey with zero manual typing required.
  - Graceful manual input fallback: if user opens `/join` directly without QR parameters, allows manual 6-digit OTP entry.
  - Display Name input & Avatar Color picker with instant preview.
  - Real-time approval listener: if `autoApprove` is false, show a live "Waiting for approval on TV..." spinner that auto-transitions the moment the TV Host clicks Approve on the remote.
  - Save long-lived `householdId`, `memberId`, and `memberToken` in `localStorage` under scoped Household Registry, auto-transitioning to `/mobile`.
- [x] **Step 3.2: Mobile Controller (`/mobile`)**
  - Automatically bypasses login on return visits using scoped session tokens.
  - Displays **"Connected to Living Room TV (Same Wi-Fi Verified)"** banner.
  - Quick-action bottom sheets:
    - **+ Grocery Item(s):** Fast multi-line entry that appends directly to the active TV Grocery List.
    - **+ Sticky Note / Chore:** Pick note color, assign to a household member, set priority magnet.
    - **+ Polaroid Photo:** Compress photo client-side via `<canvas>` (max 800px JPEG, <100KB) and upload to S3 / board state with a handwritten-style caption.

### Phase 4: Serverless AWS Backend & Alexa Skill Integration (Hours 17–24)
- [x] **Step 4.1: AWS Lambda + DynamoDB Backend**
  - Deploy `PinBoardTable` (DynamoDB) and single Node.js 20 Lambda functions handling:
    - `POST /household/init` (creates household & rotates 6-digit OTP every 15 mins).
    - `POST /household/join` (validates 6-digit OTP, records client IP against TV Host IP).
    - `GET/POST/PATCH/DELETE /notes` (CRUD + triggers real-time broadcast to TV).
    - `POST /ai/parse` (uses **Amazon Bedrock `amazon.nova-micro-v1:0`** to turn unstructured text/voice into structured grocery items and assigned chores).
    - Deployed live CloudFormation stack to AWS Account `391464502100` (`ap-southeast-2`) with private S3 + CloudFront OAC.
- [x] **Step 4.2: Alexa Custom Skill (`alexaWebhook`)**
  - Configure an Alexa Skill in the Alexa Developer Console (Free) with invocation name **"pin board"**.
  - Define Intents:
    - `AddGroceryIntent`: *"Alexa, ask Pin Board to add {item} to the grocery list."*
    - `AddNoteIntent`: *"Alexa, tell Pin Board to remind {member} to {task}."*
    - `ReadGroceryListIntent`: *"Alexa, ask Pin Board what is on my grocery list."*
    - `LinkHouseholdIntent`: *"Alexa, tell Pin Board my household code is {sixDigitPin}."* (Links that Alexa `userId` to the household in DynamoDB—one-time setup!).
    - `SetHouseholdNameIntent`: *"Alexa, ask Pin Board to name this household {name}."*
  - Point the Alexa Skill endpoint to the deployed HTTPS Webhook URL (`/alexa`).

### Phase 5: Fire TV Packaging & Submission Assets (Hours 25–30)
- [x] **Step 5.1:** Wrap the hosted `/tv` URL in a lightweight Fire OS Android WebView APK (including an Android `DreamService` class so it registers natively in Fire TV's system Screensaver settings).
- [x] **Step 5.2:** Complete `FRICTION_LOG.md` documenting technical friction points encountered across Fire OS WebView, Android 11 AppsFilter, Alexa APL, and AWS setup (+10% bonus qualification).
- [x] **Step 5.3:** Comprehensive storyboard & scene-by-scene script (<3 mins) created in `DEMO_SCRIPT.md`.

### Phase 6: Hardware Testing, Fire OS Hardening & Production Alexa Verification (Hours 31–36)
- [x] **Step 6.1: High-DPI TV Scaling & Overscan Margin:** Integrated physical display metrics query (`display.getRealMetrics()`) and hardware scaling `(94% / density)` in `MainActivity.java` with 3% overscan safe zones.
- [x] **Step 6.2: Multi-Household Mobile Session Security:** Structured multi-household registry + scoped cookie/session auth preventing cross-household state bleed when one smartphone pairs with multiple TVs.
- [x] **Step 6.3: Anti-Burn-in Coordinate Drift Scope:** Removed all coordinate jitter from the interactive board (`TvBoardApp.tsx`), restricting drift exclusively to ambient screensaver mode (`TvScreensaver.tsx`).
- [x] **Step 6.4: Fire TV Remote Back Interception:** Intercepted native `KEYCODE_BACK` in `MainActivity.java`, replaced on-screen exit buttons with a 10-foot confirmation modal, and implemented clean exit via `TVMetricsBridge.exitApp()`.
- [x] **Step 6.5: Alexa APL App Launching via Android App Links:** Solved Fire OS 8 `AppsFilter` blocking private URI schemes by registering verified Android App Links for `https://di1gpgdox7pk1.cloudfront.net`, paired with real-time WebSocket `WAKE_BOARD` broadcasts.
- [x] **Step 6.6: Live Hardware Verification:** Successfully compiled debug APK, deployed CloudFormation backend to AWS, and verified end-to-end launching on physical Fire TV via ADB.

---

## 7. Acceptance Criteria & Definition of Done
1. **Zero Dummy Data Lock-In:** Every note, grocery item, member approval, and polaroid shown in the demo is created dynamically via the Mobile App, TV Remote, or Alexa Voice.
2. **10-Foot UI Compliance:** All TV text is `>= 22px` at 1080p equivalent, high contrast, with unmistakable D-pad focus states (`scale-105` + glowing border) and zero text-input keyboards required on the TV.
3. **One-Time Auth Persistence:** Refreshing or closing the mobile browser retains household membership automatically while verifying same-Wi-Fi IP status.
4. **100% Free Tier:** Runs entirely within AWS Free Tier limits with zero paid third-party subscriptions ($0.00 operational cost).
