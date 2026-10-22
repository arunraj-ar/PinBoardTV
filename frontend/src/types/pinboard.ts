export type MemberRole = 'HOST' | 'MEMBER';
export type MemberStatus = 'APPROVED' | 'PENDING';

export type NoteType = 'STICKY' | 'GROCERY' | 'CHORE' | 'POLAROID';
export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'cream';
export type MagnetStyle = 'red-dot' | 'blue-star' | 'brass-pin' | 'washi-tape';

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  color: NoteColor;
  avatarHex?: string;
  role: MemberRole;
  status: MemberStatus;
  lastSeenIp?: string;
  isSameWifi: boolean; // True when client public IP matches TV Host public IP
  joinedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  category?: string; // e.g., "Produce", "Dairy", "Household" (populated by Bedrock AI)
  addedBy?: string;
}

export interface PinNote {
  id: string;
  householdId: string;
  type: NoteType;
  title: string;
  content?: string;          // Used for STICKY notes & POLAROID captions
  items?: ChecklistItem[];   // Used for GROCERY and CHORE checklist items
  imageUrl?: string;         // Base64 data URL or S3 URL for POLAROID photos
  color: NoteColor;
  magnet: MagnetStyle;
  rotationDeg: number;       // Random organic tilt between -2.5 and +2.5 degrees
  assignedToMemberId?: string;
  assignedToName?: string;
  createdByMemberId: string;
  pinned: boolean;
  priority?: 'LOW' | 'MED' | 'HIGH';
  updatedAt: string;
}

export interface HouseholdState {
  householdId: string;
  householdName: string;
  hostSecret: string;
  currentOtp: string;        // 6-digit numeric string, e.g., "482910"
  otpExpiresAt: number;      // Unix timestamp (ms)
  autoApprove: boolean;
  screensaverEnabled: boolean;
  autonomousAiOrganize: boolean;
  theme: 'cork' | 'slate';
  hostPublicIp?: string;
  members: HouseholdMember[];
  notes: PinNote[];
  seedVersion?: number;
  isConfigured?: boolean;
}

export interface MemberSession {
  householdId: string;
  memberId: string;
  memberToken: string;
  displayName: string;
  color: NoteColor;
}

export type SyncEvent =
  | { type: 'STATE_REPLACED'; payload: HouseholdState }
  | { type: 'NOTE_CREATED'; payload: PinNote }
  | { type: 'NOTE_UPDATED'; payload: { id: string; changes: Partial<PinNote> } }
  | { type: 'NOTE_DELETED'; payload: { id: string } }
  | { type: 'MEMBER_JOIN_REQUESTED'; payload: { member: HouseholdMember } }
  | { type: 'MEMBER_APPROVED'; payload: { memberId: string } }
  | { type: 'MEMBER_REMOVED'; payload: { memberId: string } }
  | { type: 'OTP_ROTATED'; payload: { otpCode: string; otpExpiresAt: number } }
  | { type: 'PRESENCE_UPDATED'; payload: { memberId: string; isSameWifi: boolean } }
  | { type: 'HOUSEHOLD_NAME_UPDATED'; payload: { name: string } };
