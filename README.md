# 📌 PinBoardTV — Ambient Household Family Hub for Amazon Fire TV

[![Track: Fire TV](https://img.shields.io/badge/Track-Fire_TV-FF9900?style=for-the-badge&logo=amazon&logoColor=white)](https://amazonappdev2026.devpost.com/)
[![Challenge: AWS Builder](https://img.shields.io/badge/Mini--Challenge-AWS_Builder-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://amazonappdev2026.devpost.com/)
[![Cost: $0.00 Serverless](https://img.shields.io/badge/Operational_Cost-$0.00_(AWS_Free_Tier)-success?style=for-the-badge)](https://aws.amazon.com/free/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> Built for the **Build, Ship, Shape: Amazon Developer Hackathon 2026**.  
> **Target Track:** Amazon Fire TV (Web App / Fire OS WebView + Android `DreamService` Screensaver)  
> **Target Mini-Challenge:** AWS Builder Mini-Challenge ($5,000 Prize Category)  
> **Cross-Device Ecosystem:** Amazon Fire TV + Mobile Web Companion + Alexa Custom Skill + Amazon Bedrock AI  

---

## 🌟 The Elevator Pitch & Problem Statement

### The Physical-to-Digital Household Intent Gap
In almost every family home, the refrigerator door and kitchen counter are littered with paper sticky notes, scribbled grocery lists, chore charts, and printed photos held up by magnets. Meanwhile, the biggest screen in the house — the **living-room television** — sits idle for 18+ hours a day as a lifeless black rectangle.

Existing smart TV apps fail households because:
1. **They demand active, leaned-in attention:** They expect users to sit down, open an app, and navigate complex entertainment menus.
2. **Text input on TVs is painful:** Typing grocery lists or family reminders using a 5-way D-pad on an alphabetical on-screen virtual keyboard is frustrating and slow.
3. **They ignore ambient multi-modal moments:** When a parent is cooking in the kitchen or a teenager is rushing out the door, they want to speak a command to Alexa or glance at the TV from across the room.

### The Solution: PinBoardTV
**PinBoardTV** transforms any Amazon Fire TV into an always-on, ambient household bulletin board and digital corkboard screensaver. 

Families manage color-coded sticky reminders, shared grocery checklists, assigned chores, and polaroid photo memories seamlessly across devices:
* **Glanceable from 10 feet away:** High-contrast skeuomorphic sticky notes and polaroids pinned with realistic fridge magnets.
* **Ambient Screensaver Mode:** Automatically cycles through family notes and photos with anti-burn-in pixel shifting when the TV is idle.
* **Zero-Typing 1-Scan Mobile Pairing:** Point a smartphone camera at the TV's rotating 6-digit optical Magic QR code to join instantly with same-household Wi-Fi presence verification.
* **Hands-Free Alexa Voice Integration:** Say *"Alexa, ask Pin Board to add oat milk to groceries"* or *"remind Alex to walk the dog"* to update the TV in real time.
* **Amazon Bedrock Ambient Intelligence:** Employs **Amazon Nova Micro** (`amazon.nova-micro-v1:0`) to decompose unstructured, messy compound voice commands into categorized grocery departments and assigned family tasks.
* **$0.00 Serverless Operating Cost:** Architected 100% within the permanent AWS Free Tier.

---

## 🖼️ User Experience & Core Features

```
┌────────────────────────────────────────────────────────────────────────┐
│  PINBOARD TV — LIVING ROOM HUB                     2:45 PM  ☀️ 72°F   │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ 🛒 GROCERIES │  │ 🧹 CHORES    │  │ 📝 REMINDER  │  │ 📷 POLAROID │ │
│  │ [x] Oat milk │  │ [ ] Clean rm │  │ Grandma      │  │  [Photo]    │ │
│  │ [ ] Avocados │  │     (Alex)   │  │ visiting Sat │  │ Bear Mtn    │ │
│  │ [ ] Sourdough│  │ [x] Dishes   │  │ 2:00 PM      │  │ Hike '26    │ │
│  │ [ ] Apples   │  │     (Maya)   │  │              │  │             │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│  [▼ Arrow Down + OK] Launch PinBoardTV    │    [⚙️ Remote Settings]    │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Dual-Mode TV Experience: Ambient Screensaver & 10-Foot Board
* **Ambient Screensaver (`/tv/screensaver`):** When idle, the TV displays a rich corkboard or dark slate canvas with organic card tilts (`-2.5°` to `+2.5°`). It cycles pages every 30 seconds and engages hardware-accelerated **60-second micro-shift drift** to prevent OLED/LED pixel burn-in.
* **10-Foot Interactive UI (`/tv`):** Pressing `[SELECT]` wakes the full board. D-pad navigation highlights cards with glowing amber focus rings (`scale-105 shadow-2xl`).
* **10-Foot Focus Zoom Modal:** Pressing `[SELECT]` on any checklist card smoothly expands it into a centered high-contrast modal with **36px–48px typography** and oversized toggle targets (`w-10 h-10`). Toggling an item triggers a celebratory chime and confetti burst.

### 2. One-Time Magic QR Onboarding & Same-Wi-Fi Presence
* **Zero Virtual Keyboard Typing:** The TV generates an optical **Magic QR Code** encoding the household ID and a rotating 6-digit OTP passkey.
* **One-Scan Setup:** Family members scan the TV with their phone camera (`/join`). The mobile app auto-extracts the credentials without typing. Users enter their name, pick an avatar color, and tap **"Join PinBoard"**.
* **Same-Household Wi-Fi Verification:** AWS Lambda extracts the caller's public IP (`sourceIp`) and compares it against the registered Fire TV host IP. Verified home devices receive a prominent **"Home (Verified Wi-Fi)"** green security badge.
* **Permanent Token Persistence:** Scoped session tokens persist in the mobile browser's local registry, completely bypassing login on subsequent visits.

### 3. Multi-Modal Live Sync (Groceries, Chores & Polaroids)
* **Mobile Web Companion (`/mobile`):** Add grocery items, assign chores to family members with priority badges, and snap polaroid photos from the smartphone camera.
* **Client-Side Image Optimization:** Photos are compressed on the phone via HTML5 Canvas (max 800px, <100KB JPEG) and uploaded directly to Amazon S3 via presigned PUT URLs, keeping backend latency negligible.
* **Sub-Second Real-Time Sync:** Updates broadcast instantly to the Fire TV over AWS API Gateway WebSockets (or native `BroadcastChannel` in local mode).

### 4. Hands-Free Alexa Voice Integration (`"pin board"`)
* **Voice-to-Board:** Users can interact through any Alexa device or the Fire TV Voice Remote:
  * *"Alexa, ask Pin Board to add almond milk and coffee beans to my grocery list."*
  * *"Alexa, tell Pin Board to remind Sam to water the plants."*
  * *"Alexa, ask Pin Board what is on my grocery list."* (Auditory readback of pending items).
* **One-Time Voice Pairing:** Saying *"Alexa, tell Pin Board my code is 482910"* binds the caller's Amazon Echo profile to the household in DynamoDB.
* **Fire TV App Launching:** Saying *"Alexa, open Pin Board"* triggers an Alexa Presentation Language (APL) directive with verified Android App Links to wake and launch the Fire TV app natively.

### 5. Amazon Bedrock Ambient Intelligence
* Powered by **Amazon Bedrock** (`amazon.nova-micro-v1:0` with fallback to `anthropic.claude-3-haiku-20240307-v1:0`).
* **Compound Speech Decomposer:** When a user dictates messy speech (*"Remind Sam to take out trash and buy eggs, butter, and batteries"*), Bedrock decomposes the sentence into discrete categorized grocery items (Dairy, Household) and an assigned chore for Sam in a single sub-second inference call.

---

## 🏗️ AWS Serverless Architecture ($0.00 Free Tier)

PinBoardTV satisfies all criteria for the **AWS Builder Mini-Challenge**. It is built completely on AWS serverless services with zero idle compute cost.

```
┌─────────────────────────────────────────────────────────────┐
│                       Amazon Bedrock                        │
│                  (amazon.nova-micro-v1:0)                   │
└──────────────────────────────▲──────────────────────────────┘
                               │
                               │ JSON Intent Parsing
                               │
┌─────────────────────────┐    HTTP API        ▼
│  Fire TV / Mobile App   ├──────────────► AWS Lambda ──────────────┐
│  (10ft TV UI & Phone)   │              (Node.js 20.x)             │
└────────────┬────────────┘                                         │
             │                                                      ▼
             │ WSS Push                  AWS Lambda ────────► Amazon DynamoDB
             └──────────────────────────► (WebSockets)        (PinBoardTable)
                                                                    ▲
┌─────────────────────────┐               Alexa Webhook ────────────┘
│    Amazon Echo Device   ├──────────────► (ASK Handler)
│   ('Alexa, ask Pin...') │
└─────────────────────────┘
```

| AWS Service | Architectural Role | Free Tier Allowance | PinBoardTV Operating Cost |
| :--- | :--- | :--- | :--- |
| **Amazon Bedrock** | Natural-language voice & note categorization (`nova-micro`) | ~$0.000035 / 1k tokens | **$0.00** (<1,000 parses/mo) |
| **Amazon DynamoDB** | Single-table household, note, OTP, and member storage | 25 GB Storage + 200M req/mo | **$0.00** (Always Free Tier) |
| **AWS Lambda** | REST API, WebSocket notifications & Alexa webhook | 1,000,000 requests/mo + 3.2M sec compute | **$0.00** (Always Free Tier) |
| **Amazon API Gateway** | HTTP and WebSocket real-time connections | 1,000,000 calls/mo (12 mo free) | **$0.00** |
| **Amazon S3** | Compressed family polaroid photo storage | 5 GB Standard Storage (12 mo free) | **$0.00** |
| **Amazon CloudFront** | Global edge distribution with Origin Access Control (OAC) | 1 TB data transfer out/mo (Always Free) | **$0.00** (Always Free Tier) |
| **AWS Amplify Hosting** | Monorepo React frontend hosting | 1,000 build mins/mo, 15 GB served | **$0.00** |

---

## 📂 Repository Structure

```text
PinBoardTV/
├── README.md                   # Project overview, architecture & judge guide
├── CONTEXT.md                  # Comprehensive AI & developer blueprint
├── DEVPOST_SUBMISSION.md       # Copy-paste responses for Devpost submission
├── FRICTION_LOG.md             # 14+ technical friction entries (+10% Bonus)
├── DEMO_SCRIPT.md              # 2:45 storyboard & video demonstration script
├── package.json                # Monorepo root configuration
├── backend/                    # Serverless AWS backend
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── http.ts         # REST API endpoints (household, notes, AI)
│   │   │   ├── websocket.ts    # WebSocket ($connect, $disconnect)
│   │   │   └── alexa.ts        # Alexa Custom Skill intent dispatcher
│   │   └── services/
│   │       ├── dynamo.ts       # DynamoDB single-table data access
│   │       ├── bedrock.ts      # Amazon Nova Micro NLP parser
│   │       └── s3.ts           # S3 presigned URL generator
│   ├── alexa/
│   │   ├── skill.json          # Alexa Skill manifest
│   │   └── interactionModel.json # Interaction model (Intents & Slots)
│   └── template.yaml           # AWS CloudFormation / SAM template
├── frontend/                   # Vite + React 18 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx             # Route switcher (/tv, /tv/screensaver, /mobile, /join)
│   │   ├── pages/
│   │   │   ├── TvBoardApp.tsx  # Interactive 10-foot D-pad board
│   │   │   ├── TvScreensaver.tsx # Ambient screensaver with burn-in protection
│   │   │   ├── MobileApp.tsx   # Mobile companion controller
│   │   │   └── MobileJoin.tsx  # Magic QR one-time onboarding
│   │   ├── components/         # Skeuomorphic cards, D-pad focus wrappers & modals
│   │   └── services/
│   │       ├── storageSync.ts  # Dual-mode cloud + local BroadcastChannel adapter
│   │       ├── bedrockClient.ts# Bedrock AI integration service
│   │       └── soundEffects.ts # Tactile WebAudio pin pops & chimes
│   └── public/                 # Cork & slate textures, pushpin graphics
└── android/                    # Fire TV Android WebView & DreamService APK wrapper
    ├── app/src/main/
    │   ├── AndroidManifest.xml # DreamService screensaver & App Links declaration
    │   └── java/com/pinboardtv/app/
    │       ├── MainActivity.java     # Fire TV WebView with high-DPI density scaling
    │       └── TvScreensaverService.java # Native Android DreamService
```

---

## ⚡ Quickstart: Local Setup & Simulator Testing

The application features a **Dual-Driver Architecture**: it boots out of the box with zero external dependencies using local storage and `BroadcastChannel`, allowing full cross-device testing on a single machine.

### 1. Prerequisites
* Node.js 18.x or 20.x
* npm 9+

### 2. Install Dependencies & Start Dev Server
```bash
# Clone the repository
git clone https://github.com/arunraj-ar/PinBoardTV.git
cd PinBoardTV

# Install dependencies
npm install

# Start the Vite local server
npm run dev
```
The application will launch at `http://localhost:5173`.

### 3. Testing Cross-Device Sync Side-by-Side
1. **Window 1 (Fire TV Display):** Open `http://localhost:5173/tv` in your browser.
2. **Window 2 (Mobile Companion):** Open `http://localhost:5173/join` in a second browser window (or resize to phone dimensions `390x844`).
3. Enter your name (e.g., *"Alex"*) and click **Join PinBoard**.
4. Both windows will immediately pair. Add grocery items or notes in the Mobile window; observe them appear on the TV canvas in real time with zero latency!
5. **Simulate Alexa Commands:** Press `H` in the TV window to reveal the Developer Toolbar, then click **Simulate Alexa Command** to test natural language parsing.

### 4. Running on the Fire TV / Vega Simulator
1. Open the **Amazon Fire TV Web App Simulator** or **Vega OS Simulator**.
2. Navigate to `http://<your-local-ip>:5173/tv`.
3. Use your keyboard arrow keys to simulate the Fire TV remote:
   * `Arrow Keys`: Move spatial focus between notes.
   * `Enter`: Zoom into the 10-foot focus modal or toggle checklist items.
   * `Escape` / `Backspace`: Return to the main board.
   * `V`: Activate voice input simulation.

---

## 🔒 Private Repository Reviewer Checklist

If reviewing this project as a private GitHub repository, please verify that access has been granted to the official Amazon Hackathon judging team per the Devpost rules:

- [x] Collaborator invite sent to: `testing@devpost.com`
- [x] Collaborator invite sent to: `knmeiss`
- [x] Collaborator invite sent to: `giolaq`
- [x] Collaborator invite sent to: `anishamalde`
- [x] Collaborator invite sent to: `mosesroth`
- [x] Collaborator invite sent to: `emersonsklar`
- [x] Open-source MIT License included in [`LICENSE`](LICENSE).

---

## 🏆 Hackathon Judging Alignment

| Judging Criteria | Weight | How PinBoardTV Excels |
| :--- | :--- | :--- |
| **Technical Implementation** | 25% | Full monorepo containing a 10-foot Fire TV React app, native Android `DreamService` wrapper, production AWS Lambda + DynamoDB single-table backend, WebSocket real-time relay, Alexa Custom Skill, and Amazon Bedrock integration. |
| **Design & User Experience** | 25% | Skeuomorphic corkboard aesthetics, organic rotational skew, tactile WebAudio chimes, strict 10-foot typography (>=22px, modal 36px–48px), high-contrast amber focus rings, and zero on-screen TV keyboard typing. |
| **Potential Impact** | 25% | Activates hundreds of millions of idle Fire TV screens globally as ambient family hubs, capturing everyday household shopping and chore intent directly into the Amazon ecosystem. |
| **Quality of the Idea** | 25% | Solves the real-world clutter of fridge notes and grocery lists through a frictionless cross-device experience: TV as ambient canvas, phone as remote controller, Alexa as voice coordinator. |
| **Friction Log Bonus** | **+10% Bonus** | Includes **14 in-depth friction log entries** in [`FRICTION_LOG.md`](FRICTION_LOG.md) detailing Fire OS WebView overscan, Android 11 `AppsFilter`, Alexa APL `OpenURL`, and AWS regional onboarding quirks. |

---

## 📜 License
Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for full details.
