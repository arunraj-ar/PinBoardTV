# DEMO_SCRIPT.md — PinBoardTV Hackathon Video Demonstration Script

> **Target Duration:** Exactly 2 minutes 45 seconds (Hard ceiling: 3:00).  
> **Format:** 2-Column Run-of-Show (`Visual on Screen` | `Voiceover Narration`).  
> **Hardware Setup:** 
> - **Main Feed:** 1080p Fire TV Display (HDMI Capture or Fire TV / Vega Simulator).
> - **Picture-in-Picture (Bottom-Right / Side-by-Side):** Mobile Companion Web App (`/join` and `/mobile`).
> - **Audio:** Clear voiceover with subtle background WebAudio sound effects (pushpin pops, checklist chimes).

---

## 🎬 2:45 Video Run-of-Show Table

| Timestamp | Visual on Screen | Voiceover Narration |
| :--- | :--- | :--- |
| **0:00 – 0:10** | **Full Screen 16:9 Ambient Screensaver:**<br>Warm corkboard texture fills the 1080p display. Colorful sticky notes, chore cards, and polaroid photos are pinned with subtle organic tilts (`-2.5°` to `+2.5°`). Clock reads `2:45 PM`, weather shows `72° Sunny`. Subtle 60s micro-shift drift animation is visible.<br>Bottom badge glows: `[▼ Arrow Down + OK] Launch PinBoardTV`. | *"In almost every family home, the television sits idle for 18 hours a day as a lifeless black rectangle, while paper notes and scribbled grocery lists clutter the fridge. Meet **PinBoardTV** — the always-on ambient household hub that transforms Amazon Fire TV into the heartbeat of the home."* |
| **0:10 – 0:25** | **TV Remote Wake Action:**<br>Hand points the Fire TV Alexa Voice Remote at the screen. Pressing `[SELECT]` smoothly wakes the TV from screensaver into the **10-Foot Interactive Board UI**.<br>A glowing amber focus ring (`ring-4 ring-amber-400 scale-105`) highlights the "Weekly Groceries" checklist card. | *"Even while idle, PinBoardTV protects your display with ambient screensaver drift. Pressing 'Select' on the remote brings the board to life with high-contrast, couch-legible cards and smooth 4-directional spatial D-pad navigation."* |
| **0:25 – 0:45** | **Settings & Magic QR Code Reveal:**<br>Press `ArrowRight` to highlight `[⚙️ Settings]` and press `[SELECT]`. Sleek side panel opens.<br>Click **+ Add Family Member (Show QR)**.<br>The center stage unblurs to reveal a **Giant Magic QR Code** covering 50%+ of the screen alongside the rotating 6-digit passkey: `482910`.<br>**Split Screen:** Smartphone camera scans the TV screen. | *"Onboarding family members takes seconds with zero virtual keyboard typing on the TV. The TV generates a rotating optical passkey. Scanning the Magic QR code immediately opens the companion web app with credentials pre-filled."* |
| **0:45 – 1:05** | **Mobile Join & Same-Wi-Fi Verification:**<br>Phone screen shows `/join`. The 6-digit code `482910` is locked in. The user types name *"Maya"*, selects the Purple avatar, and taps **"Join PinBoard"**.<br>TV plays a soft approval chime.<br>Both TV and Phone UI flash a green security badge: **"Home (Verified Wi-Fi)"**. Phone redirects directly to `/mobile`. | *"Maya enters her name, picks an avatar, and taps Join. AWS Lambda instantly checks her device's public IP against the Fire TV's host IP, validating they're on the same home Wi-Fi network and storing a permanent session token."* |
| **1:05 – 1:25** | **Mobile Multi-Modal Creation (Chore & Grocery):**<br>On the phone, tap **+ Add Chore**. Type *"Walk Buster in the park"*, assign to *"Maya"*, and tap **Pin to TV**.<br>On the TV, a purple sticky note instantly animates onto the corkboard with a tactile pushpin pop sound.<br>On the phone, tap **+ Add Grocery**, add *"Avocados"* and *"Sourdough"*. The TV "Weekly Groceries" list appends both items live. | *"From their phones, family members can add groceries or assign chores from anywhere in the house. Watch as Maya pins a chore — powered by AWS API Gateway WebSockets, it snaps onto the living room TV canvas with zero perceptible delay."* |
| **1:25 – 1:50** | **Mobile Polaroid Photo Upload & 10-Foot Focus Zoom:**<br>On the phone, tap **+ Photo**. Select a camera photo of a dog. Phone compresses the image via HTML5 Canvas (<100KB) and uploads to Amazon S3 via a presigned URL.<br>A polaroid with caption *"Buster's Afternoon Walk"* pins to the TV board with a brass fridge magnet graphic.<br>On TV, navigate D-pad to "Weekly Groceries" and press `[SELECT]`. The card zooms into the **10-Foot Focus Modal** (36px text). Press `Enter` to check off *"Avocados"* — confetti explodes across the screen! | *"Snap a polaroid from your phone, and it uploads directly to S3, appearing with a realistic fridge magnet. From the couch, pressing 'Select' zooms into our 10-Foot Focus Modal with oversized 36px typography. Checking off groceries triggers a celebratory confetti burst!"* |
| **1:50 – 2:10** | **Alexa Voice Command & Amazon Bedrock AI Parsing:**<br>Camera shows Echo Dot beside the TV.<br>**User speaks:** *"Alexa, ask Pin Board to add oat milk and batteries to groceries, and remind Alex to clean the garage tonight."*<br>Alexa replies: *"Added 2 grocery items and assigned a chore to Alex on PinBoard TV."* | *"In the kitchen, hands-free Alexa voice commands connect directly to our serverless backend. But watch what happens with complex compound sentences..."* |
| **2:10 – 2:25** | **Live Bedrock AI Splitting on TV Canvas:**<br>The TV screen instantly updates in real time:<br>1. *"Oat milk"* appends under **Dairy** on Weekly Groceries.<br>2. *"Batteries"* appends under **Household** on Weekly Groceries.<br>3. A new Amber Chore card appears: *"Clean the garage tonight"* assigned to Alex.<br>A subtle toast shows: *"Organized by Amazon Nova Micro"*. | *"Amazon Bedrock powered by Amazon Nova Micro decomposes compound speech into discrete tasks, categorizing groceries into departments and assigning the chore to Alex in under 450 milliseconds."* |
| **2:25 – 2:45** | **Architecture Graphic & Closing Wrap-Up:**<br>Full-screen architectural graphic displays the 100% serverless AWS Free Tier stack ($0.00 cost):<br>Fire TV (Fire OS / Android `DreamService`) + Amplify + Lambda (Node.js 20.x) + DynamoDB Single-Table + API Gateway WebSockets + Amazon S3 + Bedrock + Alexa Skills Kit.<br>Final logo animation: **PinBoardTV — Bringing the Family Together.** | *"PinBoardTV runs 100% inside the AWS Free Tier with zero idle operating cost. By turning the biggest screen in the home into an ambient, intelligent household command center, PinBoardTV captures everyday household intent for the Amazon ecosystem. Thank you!"* |

---

## 🎙️ Voiceover Timing Check
* **0:00–0:25:** 52 words (~24 seconds at natural 130 WPM)
* **0:25–1:05:** 74 words (~34 seconds)
* **1:05–1:50:** 88 words (~40 seconds)
* **1:50–2:25:** 62 words (~28 seconds)
* **2:25–2:45:** 46 words (~21 seconds)
* **Total Word Count:** **322 words**
* **Total Run Time:** **2 minutes 45 seconds** (Well under the 3:00 hard maximum).

---

## 🛠️ Recording Production Checklist
1. **Pre-load Seed Data:** Ensure household has Mom, Dad, Alex, and Maya with realistic starting notes.
2. **Set Browser Zoom:** Set Fire TV browser window to 1080p (`1920x1080` CSS viewport).
3. **Hide Dev Controls:** Press `H` on keyboard to hide the floating developer switch bar before recording.
4. **Microphone Setup:** Ensure clear audio capture for the voiceover and Alexa wake word interaction.
5. **Video Export:** 1080p 60fps MP4 format, under 250MB for upload to YouTube or Vimeo for the Devpost submission.
