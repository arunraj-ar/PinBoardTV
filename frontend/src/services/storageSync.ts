import type {
  HouseholdState,
  HouseholdMember,
  MemberRole,
  MemberStatus,
  PinNote,
  ChecklistItem,
  SyncEvent,
  MemberSession,
  SavedHouseholdSession,
  HouseholdRegistry,
  NoteColor,
} from '../types/pinboard';
import {
  createInitialHouseholdState,
  createDemoHouseholdState,
  createCleanHouseholdState,
} from './seedData';
import { awsCloudDriver } from './awsCloudDriver';
import { cleanGroceryItemText } from './voiceNlpParser';

const LEGACY_STORAGE_KEY = 'pinboard_household_state_v4';
const LEGACY_SESSION_KEY = 'pinboard_member_session';
const REGISTRY_STORAGE_KEY = 'pinboard_household_registry_v1';
const STATE_STORAGE_PREFIX = 'pinboard_state_';
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
        .getHouseholdState(
          this.currentState.householdId,
          this.currentState.currentOtp,
          this.currentState.householdName
        )
        .then((cloudState) => {
          if (cloudState) {
            const cleanMembers = cloudState.members && cloudState.members.length > 0
              ? Array.from(new Map(cloudState.members.map((m) => [m.id, m])).values())
              : this.currentState.members;
            const cleanNotes = cloudState.notes && cloudState.notes.length > 0
              ? Array.from(new Map(cloudState.notes.map((n) => [n.id, n])).values())
              : this.currentState.notes;

            const isCloudOtpValid = Boolean(cloudState.otpExpiresAt && Date.now() < cloudState.otpExpiresAt - 5000);

            this.currentState = {
              ...this.currentState,
              ...cloudState,
              currentOtp: isCloudOtpValid ? cloudState.currentOtp : this.currentState.currentOtp,
              otpExpiresAt: isCloudOtpValid ? cloudState.otpExpiresAt : this.currentState.otpExpiresAt,
              members: cleanMembers,
              notes: cleanNotes,
            };
            this.saveToStorage(this.currentState);
            this.notifySubscribers({ type: 'STATE_REPLACED', payload: this.currentState });
          }
        })
        .catch((e) => console.warn('Could not sync with cloud backend:', e));
    } catch (e) {
      console.warn('Failed to initialize cloud sync:', e);
    }
  }

  public loadStateForHousehold(householdId: string): HouseholdState {
    if (typeof window === 'undefined') return createInitialHouseholdState();
    try {
      const saved = localStorage.getItem(`${STATE_STORAGE_PREFIX}${householdId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.householdId === householdId) {
          if (parsed.isConfigured === undefined) {
            parsed.isConfigured = Boolean(parsed.members && parsed.members.length > 0);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`Failed to load state for household ${householdId}:`, e);
    }
    const clean = createCleanHouseholdState();
    clean.householdId = householdId;
    return clean;
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

      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const hashParams = new URLSearchParams(hashQuery);
      const targetHh = params.get('hh') || params.get('householdId') || hashParams.get('hh') || hashParams.get('householdId');

      if (targetHh) {
        const hhState = this.loadStateForHousehold(targetHh);
        this.saveToStorage(hhState);
        return hhState;
      }

      const registry = this.getRegistry();
      if (registry.activeHouseholdId) {
        const hhState = this.loadStateForHousehold(registry.activeHouseholdId);
        this.saveToStorage(hhState);
        return hhState;
      }

      const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isConfigured === undefined) {
          parsed.isConfigured = Boolean(parsed.members && parsed.members.length > 0);
        }
        // Auto-refresh expired OTP if the household is not yet configured or if passkey has expired
        if (!parsed.isConfigured && (!parsed.currentOtp || !parsed.otpExpiresAt || Date.now() >= parsed.otpExpiresAt - 60000)) {
          parsed.currentOtp = Math.floor(100000 + Math.random() * 900000).toString();
          parsed.otpExpiresAt = Date.now() + 15 * 60 * 1000;
        }
        this.saveToStorage(parsed);
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
      localStorage.setItem(`${STATE_STORAGE_PREFIX}${state.householdId}`, JSON.stringify(state));
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
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
      case 'NOTE_CREATED': {
        const note = event.payload;
        if (!this.currentState.notes.some((n) => n.id === note.id)) {
          this.currentState.notes = [note, ...this.currentState.notes];
        } else {
          this.currentState.notes = this.currentState.notes.map((n) =>
            n.id === note.id ? { ...n, ...note } : n
          );
        }
        break;
      }
      case 'NOTE_UPDATED':
        this.currentState.notes = this.currentState.notes.map((n) =>
          n.id === event.payload.id ? { ...n, ...event.payload.changes } : n
        );
        break;
      case 'NOTE_DELETED':
        this.currentState.notes = this.currentState.notes.filter((n) => n.id !== event.payload.id);
        break;
      case 'MEMBER_JOIN_REQUESTED': {
        const member = event.payload.member;
        if (!this.currentState.members.some((m) => m.id === member.id)) {
          this.currentState.members = [...this.currentState.members, member];
        } else {
          this.currentState.members = this.currentState.members.map((m) =>
            m.id === member.id ? { ...m, ...member } : m
          );
        }
        break;
      }
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
      case 'WAKE_BOARD':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pinboard:wake', { detail: event.payload }));
        }
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

  private getLegacySession(): MemberSession | null {
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(LEGACY_SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public getRegistry(): HouseholdRegistry {
    if (typeof window === 'undefined') {
      return { activeHouseholdId: null, households: {} };
    }
    try {
      const data = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to parse household registry:', e);
    }

    // Migrate from legacy session key if present
    const legacySession = this.getLegacySession();
    const registry: HouseholdRegistry = {
      activeHouseholdId: legacySession ? legacySession.householdId : null,
      lastDisplayName: legacySession ? legacySession.displayName : undefined,
      households: {},
    };
    if (legacySession) {
      registry.households[legacySession.householdId] = {
        householdId: legacySession.householdId,
        householdName: legacySession.householdName || 'My Family PinBoard',
        memberId: legacySession.memberId,
        memberToken: legacySession.memberToken,
        displayName: legacySession.displayName,
        color: legacySession.color,
        role: legacySession.role || 'MEMBER',
        lastVisitedAt: Date.now(),
      };
      this.saveRegistry(registry);
    }
    return registry;
  }

  public saveRegistry(registry: HouseholdRegistry): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
    } catch (e) {
      console.warn('Failed to save household registry:', e);
    }
  }

  public getSession(): MemberSession | null {
    if (typeof window === 'undefined') return null;
    const registry = this.getRegistry();
    const activeHhId = registry.activeHouseholdId || this.currentState.householdId;
    if (activeHhId && registry.households[activeHhId]) {
      const saved = registry.households[activeHhId];
      return {
        householdId: saved.householdId,
        householdName: saved.householdName,
        memberId: saved.memberId,
        memberToken: saved.memberToken,
        displayName: saved.displayName,
        color: saved.color,
        role: saved.role,
      };
    }
    return this.getLegacySession();
  }

  public getSessionForHousehold(householdId: string): MemberSession | null {
    if (typeof window === 'undefined') return null;
    const registry = this.getRegistry();
    if (registry.households[householdId]) {
      const saved = registry.households[householdId];
      return {
        householdId: saved.householdId,
        householdName: saved.householdName,
        memberId: saved.memberId,
        memberToken: saved.memberToken,
        displayName: saved.displayName,
        color: saved.color,
        role: saved.role,
      };
    }
    return null;
  }

  public saveSession(session: MemberSession, householdName?: string) {
    if (typeof window === 'undefined') return;
    const registry = this.getRegistry();
    const hhName = householdName || session.householdName || this.currentState.householdName || 'My Family PinBoard';
    registry.activeHouseholdId = session.householdId;
    registry.lastDisplayName = session.displayName;
    registry.households[session.householdId] = {
      householdId: session.householdId,
      householdName: hhName,
      memberId: session.memberId,
      memberToken: session.memberToken,
      displayName: session.displayName,
      color: session.color,
      role: session.role || 'MEMBER',
      lastVisitedAt: Date.now(),
    };
    this.saveRegistry(registry);
    try {
      localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify({ ...session, householdName: hhName }));
    } catch {}
  }

  public clearSession(householdId?: string) {
    if (typeof window === 'undefined') return;
    const registry = this.getRegistry();
    const targetHhId = householdId || registry.activeHouseholdId || this.currentState.householdId;
    if (targetHhId && registry.households[targetHhId]) {
      delete registry.households[targetHhId];
    }
    if (registry.activeHouseholdId === targetHhId) {
      const remainingIds = Object.keys(registry.households);
      registry.activeHouseholdId = remainingIds.length > 0 ? remainingIds[0] : null;
    }
    this.saveRegistry(registry);
    if (!registry.activeHouseholdId) {
      try {
        localStorage.removeItem(LEGACY_SESSION_KEY);
      } catch {}
    } else {
      const newActive = registry.households[registry.activeHouseholdId];
      if (newActive) {
        try {
          localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(newActive));
        } catch {}
      }
    }
  }

  public getLastDisplayName(): string {
    const registry = this.getRegistry();
    if (registry.lastDisplayName) return registry.lastDisplayName;
    const session = this.getSession();
    return session ? session.displayName : '';
  }

  public getSavedHouseholds(): SavedHouseholdSession[] {
    const registry = this.getRegistry();
    return Object.values(registry.households).sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
  }

  public switchHousehold(householdId: string): void {
    if (this.currentState.householdId === householdId) return;

    this.saveToStorage(this.currentState);

    const registry = this.getRegistry();
    registry.activeHouseholdId = householdId;
    if (registry.households[householdId]) {
      registry.households[householdId].lastVisitedAt = Date.now();
    }
    this.saveRegistry(registry);

    this.currentState = this.loadStateForHousehold(householdId);
    this.saveToStorage(this.currentState);

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.disconnectWebSocket();
      awsCloudDriver.connectWebSocket(householdId, (event) => {
        this.handleRemoteEvent(event);
      });
      awsCloudDriver
        .getHouseholdState(householdId, this.currentState.currentOtp, this.currentState.householdName)
        .then((cloudState) => {
          if (cloudState) {
            this.currentState = { ...this.currentState, ...cloudState };
            this.saveToStorage(this.currentState);
            this.notifySubscribers({ type: 'STATE_REPLACED', payload: this.currentState });
          }
        })
        .catch((e) => console.warn('Could not sync switched household with cloud backend:', e));
    }

    this.notifySubscribers({ type: 'STATE_REPLACED', payload: this.currentState });
  }

  public prepareTargetHousehold(householdId: string): void {
    if (this.currentState.householdId !== householdId) {
      this.currentState = this.loadStateForHousehold(householdId);
      this.saveToStorage(this.currentState);
      if (awsCloudDriver.isConfigured()) {
        awsCloudDriver.disconnectWebSocket();
        awsCloudDriver.connectWebSocket(householdId, (event) => {
          this.handleRemoteEvent(event);
        });
      }
      this.notifySubscribers({ type: 'STATE_REPLACED', payload: this.currentState });
    }
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
          const cleanItem = cleanGroceryItemText(note.title);
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
        const cleanTitle = note.title
          .replace(/^(?:please\s+)?(?:add\s+chore|remind\s+\w+\s+to|tell\s+\w+\s+to|pin\s+a\s+chore\s+for\s+\w+\s+to|assign\s+\w+\s+to)\s+/i, '')
          .replace(/\s+(?:to|on)\s+(?:the\s+)?(?:chore\s+list|board|pinboard)\s*$/i, '')
          .trim();
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

    if (!this.currentState.notes.some((n) => n.id === newNote.id)) {
      this.currentState.notes = [newNote, ...this.currentState.notes];
    }
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

  public async joinHousehold(
    householdId: string,
    otpCode: string,
    displayName: string,
    color: NoteColor
  ): Promise<{ success: boolean; error?: string; member?: HouseholdMember; status?: 'APPROVED' | 'PENDING'; isReturningMember?: boolean }> {
    // If live AWS Cloud Backend is configured, join via cloud REST API
    if (awsCloudDriver.isConfigured()) {
      try {
        const res = await awsCloudDriver.joinHousehold({
          householdId: householdId || this.currentState.householdId,
          otpCode,
          displayName: displayName.trim(),
          color,
        });

        const effectiveHhId = res.householdId || householdId || this.currentState.householdId;
        const effectiveHhName = res.householdName || this.currentState.householdName;

        // If joining a different household than currently loaded, switch state context
        if (effectiveHhId !== this.currentState.householdId) {
          this.currentState = this.loadStateForHousehold(effectiveHhId);
          this.currentState.householdId = effectiveHhId;
          if (effectiveHhName) {
            this.currentState.householdName = effectiveHhName;
          }
          awsCloudDriver.disconnectWebSocket();
          awsCloudDriver.connectWebSocket(effectiveHhId, (event) => {
            this.handleRemoteEvent(event);
          });
          awsCloudDriver.getHouseholdState(effectiveHhId, otpCode, effectiveHhName).then((cloudState) => {
            if (cloudState) {
              this.currentState = { ...this.currentState, ...cloudState };
              this.saveToStorage(this.currentState);
              this.notifySubscribers({ type: 'STATE_REPLACED', payload: this.currentState });
            }
          }).catch((e) => console.warn('Could not sync cloud state after join:', e));
        }

        const newMember: HouseholdMember = {
          id: res.memberId,
          householdId: effectiveHhId,
          name: displayName.trim(),
          color,
          avatarHex:
            color === 'pink' ? '#E11D48' :
            color === 'blue' ? '#0D9488' :
            color === 'orange' ? '#D97706' :
            color === 'green' ? '#10B981' :
            '#F59E0B',
          role: res.role || 'MEMBER',
          status: res.status || 'APPROVED',
          isSameWifi: Boolean(res.isSameWifi),
          joinedAt: new Date().toISOString(),
        };

        if (res.status === 'APPROVED' || res.role === 'HOST') {
          const session: MemberSession = {
            householdId: effectiveHhId,
            householdName: effectiveHhName,
            memberId: res.memberId,
            memberToken: res.memberToken,
            displayName: newMember.name,
            color: newMember.color,
            role: (res.role || 'MEMBER') as MemberRole,
          };
          this.saveSession(session, effectiveHhName);
        }

        if (res.householdName) {
          this.currentState.householdName = res.householdName;
        }
        if (res.role === 'HOST') {
          this.currentState.isConfigured = true;
        }
        if (!this.currentState.members.some((m) => m.id === newMember.id)) {
          this.currentState.members = [...this.currentState.members, newMember];
        } else {
          this.currentState.members = this.currentState.members.map((m) =>
            m.id === newMember.id ? { ...m, ...newMember } : m
          );
        }

        this.saveToStorage(this.currentState);
        this.notifySubscribers({ type: 'MEMBER_JOIN_REQUESTED', payload: { member: newMember } });
        return { success: true, member: newMember, status: res.status, isReturningMember: Boolean(res.isReturningMember) };
      } catch (err: any) {
        return { success: false, error: err.message || 'Failed to join household.' };
      }
    }

    // Local validation fallback (offline or unconfigured dev mode)
    const isOtpValid =
      this.currentState.currentOtp === otpCode ||
      (this.currentState.householdId === householdId && Date.now() < this.currentState.otpExpiresAt);

    if (!isOtpValid) {
      return { success: false, error: 'Invalid or expired 6-digit passkey. Please check the TV screen.' };
    }

    const normalizedName = displayName.trim().toLowerCase();
    const existingMember = this.currentState.members.find(
      (m) => m.name.trim().toLowerCase() === normalizedName
    );

    if (existingMember) {
      existingMember.color = color;
      existingMember.status = 'APPROVED';
      const session: MemberSession = {
        householdId: this.currentState.householdId,
        householdName: this.currentState.householdName,
        memberId: existingMember.id,
        memberToken: `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        displayName: existingMember.name,
        color: existingMember.color,
        role: existingMember.role,
      };
      this.saveSession(session, this.currentState.householdName);
      this.saveToStorage(this.currentState);
      this.broadcast({ type: 'PRESENCE_UPDATED', payload: { memberId: existingMember.id, isSameWifi: true } });
      return { success: true, member: existingMember, status: existingMember.status, isReturningMember: true };
    }

    const hasHost = this.currentState.members.some((m) => m.role === 'HOST');
    const isFirstMember = this.currentState.members.length === 0 || !this.currentState.isConfigured || !hasHost;
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
        householdName: this.currentState.householdName,
        memberId: newMember.id,
        memberToken: `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        displayName: newMember.name,
        color: newMember.color,
        role: newMember.role,
      };
      this.saveSession(session, this.currentState.householdName);
    }

    this.broadcast({ type: 'MEMBER_JOIN_REQUESTED', payload: { member: newMember } });
    return { success: true, member: newMember, status: newMember.status, isReturningMember: false };
  }

  public approveMember(memberId: string): void {
    this.currentState.members = this.currentState.members.map((m) =>
      m.id === memberId ? { ...m, status: 'APPROVED' } : m
    );
    this.broadcast({ type: 'MEMBER_APPROVED', payload: { memberId } });
  }

  public removeMember(memberId: string): void {
    this.currentState.members = this.currentState.members.filter((m) => m.id !== memberId);
    this.saveToStorage(this.currentState);
    this.broadcast({ type: 'MEMBER_REMOVED', payload: { memberId } });

    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.removeMember(this.currentState.householdId, memberId).catch((e) => console.warn('Cloud removeMember failed:', e));
    }
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
    if (awsCloudDriver.isConfigured()) {
      awsCloudDriver.initHousehold({
        householdId: this.currentState.householdId,
        householdName: this.currentState.householdName,
        hostSecret: this.currentState.hostSecret,
        otpCode: this.currentState.currentOtp,
        otpExpiresAt: this.currentState.otpExpiresAt,
      }).catch((e) => console.warn('Cloud initHousehold failed:', e));
    }
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
