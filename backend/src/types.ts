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
  role: MemberRole;
  status: MemberStatus;
  usernameHash?: string;
  memberToken?: string;
  lastSeenIp?: string;
  isSameWifi: boolean;
  joinedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  category?: string;
}

export interface PinNote {
  id: string;
  householdId: string;
  type: NoteType;
  title: string;
  content?: string;
  items?: ChecklistItem[];
  imageUrl?: string;
  color: NoteColor;
  magnet: MagnetStyle;
  rotationDeg: number;
  assignedToMemberId?: string;
  createdByMemberId: string;
  pinned: boolean;
  updatedAt: string;
}

export interface HouseholdState {
  householdId: string;
  householdName: string;
  currentOtp: string;
  otpExpiresAt: number;
  hostSecret?: string;
  autoApprove: boolean;
  screensaverEnabled: boolean;
  autonomousAiOrganize: boolean;
  theme?: 'cork' | 'slate';
  hostPublicIp?: string;
  members: HouseholdMember[];
  notes: PinNote[];
  isConfigured?: boolean;
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
  | { type: 'HOUSEHOLD_NAME_UPDATED'; payload: { name: string } }
  | { type: 'WAKE_BOARD'; payload?: { action: string } };
