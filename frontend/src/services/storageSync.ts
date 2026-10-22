import type {
  HouseholdState,
  HouseholdMember,
  MemberRole,
  MemberStatus,
  PinNote,
  ChecklistItem,
  SyncEvent,
  MemberSession,
  NoteColor,
} from '../types/pinboard';
import {
  createInitialHouseholdState,
  createDemoHouseholdState,
  createCleanHouseholdState,
} from './seedData';
import { awsCloudDriver } from './awsCloudDriver';

const LOCAL_STORAGE_KEY = 'pinboard_household_state_v4';
const SESSION_STORAGE_KEY = 'pinboard_member_session';
const BROADCAST_CHANNEL_NAME = 'pinboard-tv-sync';

type ChangeSubscriber = (state: HouseholdState, event?: SyncEvent) => void;

class StorageSyncService {
  private channel: BroadcastChannel | null = null;
  private subscribers: Set<ChangeSubscriber> = new Set();
  private currentState: HouseholdState;

  constructor() {
    this.currentState = this.loadFromStorage();
    this.initBroadcastChannel();
    this.initCloudSync();
  }

  private initCloudSync() {
    if (!awsCloudDriver.isConfigured() || typeof window === 'undefined') return;
    try {
      awsCloudDriver.connectWebSocket(this.currentState.householdId, (event) => {
        this.handleRemoteEvent(event);
      });
      awsCloudDriver
        .getHouseholdState(this.currentState.householdId)
        .then((cloudState) => {
          if (cloudState && cloudState.notes) {
            this.currentState = cloudState;
            this.saveToStorage(cloudState);
            this.notifySubscribers({ type: 'STATE_REPLACED', payload: cloudState });
          }
        })
        .catch((e) => console.warn('Could not sync with cloud backend:', e));
    } catch (e) {
      console.warn('Failed to initialize cloud sync:', e);
    }
  }

  private loadFromStorage(): HouseholdState {
    if (typeof window === 'undefined') return createInitialHouseholdState();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === 'true' || params.get('seed') === 'true') {
        const demoState = createDemoHouseholdState();
        this.saveToStorage(demoState);
        return demoState;
      }
      if (params.get('clean') === 'true' || params.get('reset') === 'true') {
        const cleanState = createCleanHouseholdState();
        this.saveToStorage(cleanState);
        return cleanState;
      }

      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isConfigured === undefined) {
          parsed.isConfigured = Boolean(parsed.members && parsed.members.length > 0);
          this.saveToStorage(parsed);
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load pinboard state from localStorage:', e);
    }
    const initial = createInitialHouseholdState();
    this.saveToStorage(initial);
    return initial;
  }

  private saveToStorage(state: HouseholdState) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save pinboard state to localStorage:', e);
    }
  }

  private initBroadcastChannel() {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncEvent>) => {
        this.handleRemoteEvent(event.data);
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported or failed to initialize:', e);
    }
  }

  private handleRemoteEvent(event: SyncEvent) {
    switch (event.type) {
      case 'STATE_REPLACED':
        this.currentState = event.payload;
        break;
      case 'NOTE_CREATED':
        this.currentState.notes = [event.payload, ...this.currentState.notes];
        break;
      case 'NOTE_UPDATED':
        this.currentState.notes = this.currentState.notes.map((n) =>
          n.id === event.payload.id ? { ...n, ...event.payload.changes } : n
        );
        break;
      case 'NOTE_DELETED':
        this.currentState.notes = this.currentState.notes.filter((n) => n.id !== event.payload.id);
        break;
      case 'MEMBER_JOIN_REQUESTED':
        this.currentState.members = [...this.currentState.members, event.payload.member];
        break;
      case 'MEMBER_APPROVED':
        this.currentState.members = this.currentState.members.map((m) =>
          m.id === event.payload.memberId ? { ...m, status: 'APPROVED' } : m
        );
        break;
      case 'MEMBER_REMOVED':
        this.currentState.members = this.currentState.members.filter((m) => m.id !== event.payload.memberId);
        break;
      case 'OTP_ROTATED':
        this.currentState.currentOtp = event.payload.otpCode;
        this.currentState.otpExpiresAt = event.payload.otpExpiresAt;
        break;
      case 'PRESENCE_UPDATED':
        this.currentState.members = this.currentState.members.map((m) =>
          m.id === event.payload.memberId ? { ...m, isSameWifi: event.payload.isSameWifi } : m
        );
        break;
      case 'HOUSEHOLD_NAME_UPDATED':
        this.currentState.householdName = event.payload.name;
        break;
    }
    this.saveToStorage(this.currentState);
    this.notifySubscribers(event);
  }

  private broadcast(event: SyncEvent) {
    this.saveToStorage(this.currentState);
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (e) {
        console.warn('Failed to broadcast event:', e);
      }
    }
    this.notifySubscribers(event);
  }

  private notifySubscribers(event?: SyncEvent) {
    this.subscribers.forEach((sub) => {
      try {
        sub({ ...this.currentState }, event);
      } catch (e) {
        console.error('Error in subscriber callback:', e);
      }
    });
  }

  // --- Public Read APIs ---

  public getHouseholdState(): HouseholdState {
    return { ...this.currentState };
  }

  public getState(): HouseholdState {
    return this.getHouseholdState();
  }

  public getNotes(): PinNote[] {
    return [...this.currentState.notes];
  }

  public getMembers(): HouseholdMember[] {
    return [...this.currentState.members];
  }

  public getSession(): MemberSession | null {
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(SESSION_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public saveSession(session: MemberSession) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  public clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  public subscribe(callback: ChangeSubscriber): () => void {
    this.subscribers.add(callback);
    callback({ ...this.currentState });
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // --- Mutation APIs ---

  public addNote(note: Omit<PinNote, 'id' | 'householdId' | 'updatedAt'>): PinNote {
    // Autonomous Bedrock AI Organization: Auto-categorize and file into grocery card or chore note
    if (this.currentState.autonomousAiOrganize && note.type === 'STICKY') {
      const text = `${note.title} ${note.content || ''}`.toLowerCase();
      
      const isGrocery = text.includes('milk') || text.includes('eggs') || text.includes('grocery') ||
        text.includes('groceries') || text.includes('bread') || text.includes('avocado') ||
        text.includes('coffee') || text.includes('butter') || text.includes('apples');
        
      if (isGrocery) {
        const groceryCard = this.currentState.notes.find((n) => n.type === 'GROCERY');
        if (groceryCard) {
          const cleanItem = note.title.replace(/^(?:add|buy|get|we need)\s+/i, '');
          this.addChecklistItem(groceryCard.id, cleanItem, 'AI Auto-Filed', 'Bedrock AI');
          return groceryCard;
        }
      }

      const isChore = text.includes('remind') || text.includes('chore') || text.includes('clean') ||
        text.includes('trash') || text.includes('recycling') || text.includes('dishes') || text.includes('mop');
        
      if (isChore) {
        let assignee = 'Family';
        let assigneeId: string | undefined;
        for (const member of this.currentState.members) {
          const firstName = member.name.toLowerCase().split(' ')[0];
          if (text.includes(firstName)) {
            assignee = member.name.split(' ')[0];
            assigneeId = member.id;
            break;
          }
        }
        const cleanTitle = note.title.replace(/^(?:add chore|remind \w+ to|tell \w+ to)\s+/i, '');
        const choreNote: PinNote = {
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          householdId: this.currentState.householdId,
          type: 'CHORE',
          title: `⚡ ${cleanTitle}`,
          color: 'orange',
          magnet: 'red-dot',
          rotationDeg: (Math.random() * 3 - 1.5),
          assignedToMemberId: assigneeId,
          assignedToName: assignee,
          createdByMemberId: note.createdByMemberId,
          pinned: true,
          priority: text.includes('urgent') || text.includes('asap') ? 'HIGH' : 'MED',
          items: [{ id: `item_${Date.now()}`, text: cleanTitle, done: false }],
          updatedAt: new Date().toISOString(),
        };
        this.currentState.notes = [choreNote, ...this.currentState.notes];
        this.broadcast({ type: 'NOTE_CREATED', payload: choreNote });
        return choreNote;
      }
    }

    const newNote: PinNote = {
      ...note,
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      householdId: this.currentState.householdId,
      updatedAt: new Date().toISOString(),
    };

    this.currentState.notes = [newNote, ...this.currentState.notes];
    this.broadcast({ type: 'NOTE_CREATED', payload: newNote });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.createNote(newNote).catch((e) => console.warn('Cloud createNote failed:', e));
    }

    return newNote;
  }

  public updateNote(id: string, changes: Partial<PinNote>): void {
    const updatedNote = this.currentState.notes.find((n) => n.id === id);
    if (!updatedNote) return;

    const modified = { ...changes, updatedAt: new Date().toISOString() };
    this.currentState.notes = this.currentState.notes.map((n) =>
      n.id === id ? { ...n, ...modified } : n
    );

    this.broadcast({ type: 'NOTE_UPDATED', payload: { id, changes: modified } });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.updateNote(this.currentState.householdId, id, modified).catch((e) => console.warn('Cloud updateNote failed:', e));
    }
  }

  public deleteNote(id: string): void {
    this.currentState.notes = this.currentState.notes.filter((n) => n.id !== id);
    this.broadcast({ type: 'NOTE_DELETED', payload: { id } });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.deleteNote(this.currentState.householdId, id).catch((e) => console.warn('Cloud deleteNote failed:', e));
    }
  }

  public toggleChecklistItem(noteId: string, itemId: string): boolean {
    const note = this.currentState.notes.find((n) => n.id === noteId);
    if (!note || !note.items) return false;

    let targetDoneState = false;
    const updatedItems = note.items.map((item) => {
      if (item.id === itemId) {
        targetDoneState = !item.done;
        return { ...item, done: targetDoneState };
      }
      return item;
    });

    this.updateNote(noteId, { items: updatedItems });
    return targetDoneState;
  }

  public addChecklistItem(
    noteId: string,
    text: string,
    category?: string,
    addedBy?: string
  ): ChecklistItem | null {
    const note = this.currentState.notes.find((n) => n.id === noteId);
    if (!note) return null;

    const newItem: ChecklistItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      text: text.trim(),
      done: false,
      category: category || 'General',
      addedBy: addedBy || 'Family',
    };

    const updatedItems = [...(note.items || []), newItem];
    this.updateNote(noteId, { items: updatedItems });
    return newItem;
  }

  public rotateOtp(): { otpCode: string; otpExpiresAt: number } {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = Date.now() + 15 * 60 * 1000;

    this.currentState.currentOtp = otpCode;
    this.currentState.otpExpiresAt = otpExpiresAt;

    this.broadcast({ type: 'OTP_ROTATED', payload: { otpCode, otpExpiresAt } });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.rotateOtp(this.currentState.householdId).catch((e) => console.warn('Cloud rotateOtp failed:', e));
    }

    return { otpCode, otpExpiresAt };
  }

  public joinHousehold(
    householdId: string,
    otpCode: string,
    displayName: string,
    color: NoteColor
  ): { success: boolean; error?: string; member?: HouseholdMember; status?: 'APPROVED' | 'PENDING' } {
    // Validate OTP (allow initial seed or currently active OTP)
    const isOtpValid =
      this.currentState.currentOtp === otpCode ||
      (this.currentState.householdId === householdId && Date.now() < this.currentState.otpExpiresAt);

    if (!isOtpValid) {
      return { success: false, error: 'Invalid or expired 6-digit passkey. Please check the TV screen.' };
    }

    const isFirstMember = this.currentState.members.length === 0 || !this.currentState.isConfigured;
    const role: MemberRole = isFirstMember ? 'HOST' : 'MEMBER';
    const status: MemberStatus = isFirstMember ? 'APPROVED' : (this.currentState.autoApprove ? 'APPROVED' : 'PENDING');

    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const newMember: HouseholdMember = {
      id: memberId,
      householdId: this.currentState.householdId,
      name: displayName.trim(),
      color,
      avatarHex:
        color === 'pink' ? '#E11D48' :
        color === 'blue' ? '#0D9488' :
        color === 'orange' ? '#D97706' :
        color === 'green' ? '#10B981' :
        '#F59E0B',
      role,
      status,
      isSameWifi: true, // Auto-verified in local mode
      joinedAt: new Date().toISOString(),
    };

    if (isFirstMember) {
      this.currentState.isConfigured = true;
    }

    this.currentState.members = [...this.currentState.members, newMember];

    if (newMember.status === 'APPROVED') {
      const session: MemberSession = {
        householdId: this.currentState.householdId,
        memberId: newMember.id,
        memberToken: `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        displayName: newMember.name,
        color: newMember.color,
      };
      this.saveSession(session);
    }

    this.broadcast({ type: 'MEMBER_JOIN_REQUESTED', payload: { member: newMember } });
    return { success: true, member: newMember, status: newMember.status };
  }

  public approveMember(memberId: string): void {
    this.currentState.members = this.currentState.members.map((m) =>
      m.id === memberId ? { ...m, status: 'APPROVED' } : m
    );
    this.broadcast({ type: 'MEMBER_APPROVED', payload: { memberId } });
  }

  public removeMember(memberId: string): void {
    this.currentState.members = this.currentState.members.filter((m) => m.id !== memberId);
    this.broadcast({ type: 'MEMBER_REMOVED', payload: { memberId } });
  }

  public toggleAutoApprove(): boolean {
    this.currentState.autoApprove = !this.currentState.autoApprove;
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
    return this.currentState.autoApprove;
  }

  public toggleAutonomousAiOrganize(): boolean {
    this.currentState.autonomousAiOrganize = !this.currentState.autonomousAiOrganize;
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
    return this.currentState.autonomousAiOrganize;
  }

  public setTheme(theme: 'cork' | 'slate'): void {
    this.currentState.theme = theme;
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }

  public setHouseholdName(name: string): void {
    const cleanName = name.trim();
    if (!cleanName) return;
    this.currentState.householdName = cleanName;
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'HOUSEHOLD_NAME_UPDATED', payload: { name: cleanName } });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.updateHouseholdName(this.currentState.householdId, cleanName).catch((e) => console.warn('Cloud updateHouseholdName failed:', e));
    }
  }

  public setIsConfigured(isConfigured: boolean): void {
    this.currentState.isConfigured = isConfigured;
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }

  public startFreshHouseholdSetup(): void {
    this.currentState = createCleanHouseholdState();
    this.saveToStorage(this.currentState);
    this.clearSession();
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }

  public resetToDefaults(): void {
    this.currentState = createInitialHouseholdState();
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }

  public loadDemoData(): void {
    this.currentState = createDemoHouseholdState();
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }

  public clearAllNotes(): void {
    this.currentState.notes = [];
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'STATE_REPLACED', payload: { ...this.currentState } });
  }
}

export const storageSync = new StorageSyncService();
