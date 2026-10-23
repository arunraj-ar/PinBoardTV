import type { HouseholdState, PinNote, SyncEvent } from '../types/pinboard';

export class AwsCloudDriver {
  private apiUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private onEventCallback: ((event: SyncEvent) => void) | null = null;
  private reconnectTimer: any = null;

  constructor(apiUrl: string, wsUrl?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.wsUrl = wsUrl ? wsUrl.replace(/\/$/, '') : '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiUrl);
  }

  // ---------------------------------------------------------------------------
  // REST API Methods
  // ---------------------------------------------------------------------------

  public async initHousehold(params: string | {
    householdId?: string;
    householdName?: string;
    hostSecret?: string;
    otpCode?: string;
    otpExpiresAt?: number;
  }): Promise<any> {
    const body = typeof params === 'string' ? { householdName: params } : params;
    const res = await fetch(`${this.apiUrl}/household/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed to initialize household: ${res.statusText}`);
    return res.json();
  }

  public async rotateOtp(householdId: string): Promise<{ otpCode: string; otpExpiresAt: number; qrUrl: string }> {
    const res = await fetch(`${this.apiUrl}/household/rotate-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': householdId,
      },
      body: JSON.stringify({ householdId }),
    });
    if (!res.ok) throw new Error(`Failed to rotate OTP: ${res.statusText}`);
    return res.json();
  }

  public async joinHousehold(params: {
    householdId?: string;
    otpCode: string;
    displayName: string;
    color: string;
  }): Promise<any> {
    const res = await fetch(`${this.apiUrl}/household/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to join household: ${res.statusText}`);
    return res.json();
  }

  public async updateHouseholdName(householdId: string, name: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/household/update-name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': householdId,
      },
      body: JSON.stringify({ householdId, householdName: name }),
    });
    if (!res.ok) throw new Error(`Failed to update household name: ${res.statusText}`);
  }

  public async removeMember(householdId: string, memberId: string): Promise<void> {
    const res = await fetch(
      `${this.apiUrl}/household/members/${encodeURIComponent(memberId)}?householdId=${encodeURIComponent(householdId)}`,
      {
        method: 'DELETE',
      }
    );
    if (!res.ok) throw new Error(`Failed to remove member: ${res.statusText}`);
  }

  public async getHouseholdState(householdId: string, otpCode?: string, name?: string): Promise<HouseholdState | null> {
    const query = new URLSearchParams({ householdId });
    if (otpCode) query.set('otp', otpCode);
    if (name) query.set('name', name);

    // Use standard query parameters without custom headers to avoid triggering browser CORS OPTIONS preflight
    const res = await fetch(`${this.apiUrl}/household/state?${query.toString()}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch household state: ${res.statusText}`);
    return res.json();
  }

  public async getNotes(householdId: string): Promise<PinNote[]> {
    const res = await fetch(`${this.apiUrl}/notes?householdId=${encodeURIComponent(householdId)}`);
    if (!res.ok) throw new Error(`Failed to fetch notes: ${res.statusText}`);
    return res.json();
  }

  public async createNote(note: PinNote): Promise<PinNote> {
    const res = await fetch(`${this.apiUrl}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': note.householdId,
      },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw new Error(`Failed to create note: ${res.statusText}`);
    return res.json();
  }

  public async updateNote(householdId: string, noteId: string, changes: Partial<PinNote>): Promise<PinNote> {
    const res = await fetch(`${this.apiUrl}/notes/${noteId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': householdId,
      },
      body: JSON.stringify({ householdId, changes }),
    });
    if (!res.ok) throw new Error(`Failed to update note: ${res.statusText}`);
    return res.json();
  }

  public async deleteNote(householdId: string, noteId: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/notes/${noteId}?householdId=${householdId}`, {
      method: 'DELETE',
      headers: { 'X-Household-Id': householdId },
    });
    if (!res.ok) throw new Error(`Failed to delete note: ${res.statusText}`);
  }

  public async getPresignedPhotoUpload(
    householdId: string,
    contentType: string = 'image/jpeg'
  ): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
    const res = await fetch(`${this.apiUrl}/photos/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': householdId,
      },
      body: JSON.stringify({ householdId, contentType }),
    });
    if (!res.ok) throw new Error(`Failed to generate presigned upload URL: ${res.statusText}`);
    return res.json();
  }

  public async parseVoiceWithBedrock(text: string): Promise<any> {
    const res = await fetch(`${this.apiUrl}/ai/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) throw new Error(`Bedrock parse failed: ${res.statusText}`);
    return res.json();
  }

  public async processVoiceWithAlexaNLP(
    householdId: string,
    text: string
  ): Promise<{ success: boolean; action: string; summary: string; payload?: any }> {
    const res = await fetch(`${this.apiUrl}/voice/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-Id': householdId,
      },
      body: JSON.stringify({ householdId, text }),
    });
    if (!res.ok) throw new Error(`Voice process failed: ${res.statusText}`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // WebSocket Real-Time Connection
  // ---------------------------------------------------------------------------

  public connectWebSocket(householdId: string, onEvent: (event: SyncEvent) => void): void {
    if (!this.wsUrl || typeof window === 'undefined' || !('WebSocket' in window)) return;
    this.onEventCallback = onEvent;

    try {
      const url = `${this.wsUrl}?householdId=${encodeURIComponent(householdId)}`;
      this.ws = new WebSocket(url);

      this.ws.onmessage = (messageEvent) => {
        try {
          const syncEvent = JSON.parse(messageEvent.data) as SyncEvent;
          if (syncEvent && syncEvent.type) {
            this.onEventCallback?.(syncEvent);
          }
        } catch (e) {
          console.warn('Failed to parse incoming WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        // Attempt reconnect after 5s
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket(householdId, onEvent);
          }, 5000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (e) {
      console.warn('Failed to establish WebSocket connection:', e);
    }
  }

  public disconnectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const awsCloudDriver = new AwsCloudDriver(
  import.meta.env.VITE_API_URL || '',
  import.meta.env.VITE_WS_URL || ''
);
