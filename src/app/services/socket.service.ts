import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';
import { Subject, Observable } from 'rxjs';

type UserStatus = { userId: string; online: boolean };

@Injectable({ providedIn: 'root' })
export class SocketService {
  private static socketInstance: Socket | null = null;
  private static initializationPromise: Promise<void> | null = null;
  private static reconnectionInProgress = false;

  // The ONLY id we bind to (derived from JWT)
  private static ownerId: string | null = null;

  // Offline emit queue (flushed on connect)
  private static emitQueue: Array<{ event: string; data: any }> = [];

  // Observables for app-wide consumption
  private static connectionSubject = new Subject<'connected' | 'disconnected' | 'error'>();
  static connection$: Observable<'connected' | 'disconnected' | 'error'> =
    SocketService.connectionSubject.asObservable();

  private static userStatusSubject = new Subject<UserStatus>();
  static userStatus$: Observable<UserStatus> = SocketService.userStatusSubject.asObservable();

  // Emits when server notifies that a user's profile changed (e.g. avatar/fields)
  private static userProfileUpdatedSubject = new Subject<{ userId: string; fields?: any }>();
  static userProfileUpdated$ = SocketService.userProfileUpdatedSubject.asObservable();

  // Emits when server notifies about follow/unfollow/block changes
  private static followUpdateSubject = new Subject<any>();
  static followUpdate$ = SocketService.followUpdateSubject.asObservable();
  
  // Emits when friend-requests or friend list changes (used by users list)
  private static friendRequestsUpdatedSubject = new Subject<any>();
  static friendRequestsUpdated$ = SocketService.friendRequestsUpdatedSubject.asObservable();

  // Emits when a new message arrives
  private static newMessageSubject = new Subject<any>();
  static newMessage$ = SocketService.newMessageSubject.asObservable();

  // Emits when budget is updated (for call credits)
  private static budgetUpdateSubject = new Subject<any>();
  static budgetUpdate$ = SocketService.budgetUpdateSubject.asObservable();

  // Emits when a new friend request arrives
  private static newFriendRequestSubject = new Subject<any>();
  static newFriendRequest$ = SocketService.newFriendRequestSubject.asObservable();

  // Emits when a push/in-app notification is received
  private static notificationReceivedSubject = new Subject<any>();
  static notificationReceived$ = SocketService.notificationReceivedSubject.asObservable();

  // Emits when all notifications have been marked as read (server confirmation)
  private static notificationsReadSubject = new Subject<any>();
  static notificationsRead$ = SocketService.notificationsReadSubject.asObservable();

  // Emits when a message-sent confirmation arrives (for UI optimistic reconcile)
  private static messageSentSubject = new Subject<any>();
  static messageSent$ = SocketService.messageSentSubject.asObservable();

  private static sendMessageErrorSubject = new Subject<any>();
  static sendMessageError$ = SocketService.sendMessageErrorSubject.asObservable();

  // Emits when a new post lands in the current user's feed
  private static newFeedPostSubject = new Subject<any>();
  static newFeedPost$ = SocketService.newFeedPostSubject.asObservable();

  // Emits when admin broadcasts a new announcement to all connected clients
  private static newAnnouncementSubject = new Subject<any>();
  static newAnnouncement$ = SocketService.newAnnouncementSubject.asObservable();

  /** Base64url-safe decoder (for JWT payload). */
  private static base64UrlDecode(b64url: string): string {
    const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
    const b64 = pad(b64url.replace(/-/g, '+').replace(/_/g, '/'));
    try {
      return decodeURIComponent(
        atob(b64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch {
      // Fallback if unicode decode fails
      return atob(b64);
    }
  }

  /** Safely decode JWT (no crypto validation; server validates). */
  private static extractUserIdFromToken(token: string | null): string | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      const json = this.base64UrlDecode(parts[1]);
      const payload = JSON.parse(json);
      return payload?.id || payload?.userId || payload?._id || null;
    } catch {
      return null;
    }
  }

  /** Synchronous fallback token cache, populated from NativeStorage at app boot. */
  private static tokenCache: string | null = null;
  static setTokenCache(token: string | null): void {
    SocketService.tokenCache = token || null;
  }
  private static readToken(): string | null {
    try {
      const t = localStorage.getItem('token');
      if (t) return t;
    } catch {}
    return SocketService.tokenCache;
  }

  /** Read current auth token & compute owner id. */
  private static resolveOwnerId(): string | null {
    return SocketService.extractUserIdFromToken(SocketService.readToken());
  }

  /** Public getter for the socket owner id. */
  static getOwnerId(): string | null {
    return SocketService.ownerId ?? SocketService.resolveOwnerId();
  }

  static isConnected(): boolean {
    return !!SocketService.socketInstance?.connected;
  }

  /** Bind the service to the authenticated user (from JWT). */
  static bindToAuthUser(): void {
    const authId = SocketService.resolveOwnerId();
    if (!authId) {
      console.warn('⚠️ No auth token / owner id; not binding socket user.');
      return;
    }
    if (SocketService.ownerId && SocketService.ownerId !== authId) {
      console.warn(
        `⚠️ Attempt to switch socket owner (${SocketService.ownerId} → ${authId}) ignored. ` +
          `Call logout() or refreshAuth() if user actually changed.`
      );
      return;
    }
    SocketService.ownerId = authId;

    // If connected, tell backend which user this socket belongs to.
    // Your server already reads JWT in handshake, but chat.js also listens to 'connect-user'.
    if (SocketService.socketInstance?.connected) {
      SocketService.socketInstance.emit('connect-user', authId);
    }
  }

  /** If token rotates (refresh), call this. */
  static async refreshAuth(): Promise<void> {
    const newAuthId = SocketService.resolveOwnerId();

    // If same user, just update socket auth payload and reconnect if needed
    if (newAuthId && newAuthId === SocketService.ownerId) {
      const token = SocketService.readToken();
      if (SocketService.socketInstance && token) {
        // Update auth for next handshake
        (SocketService.socketInstance as any).auth = { token };
        if (!SocketService.socketInstance.connected) {
          SocketService.socketInstance.connect();
        }
      }
      return;
    }

    // Different user or no user → full reset
    SocketService.ownerId = newAuthId ?? null;
    if (SocketService.socketInstance) {
      try { SocketService.socketInstance.removeAllListeners(); } catch {}
      try { SocketService.socketInstance.disconnect(); } catch {}
      SocketService.socketInstance = null;
    }
    SocketService.initializationPromise = null;
    SocketService.reconnectionInProgress = false;

    if (newAuthId) {
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      SocketService.socketInstance!.emit('connect-user', newAuthId);
    }
  }

  /** Wait until actually connected. */
  static ensureConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = SocketService.socketInstance;
      // If no socket instance exists (e.g. in test env or unauthenticated),
      // treat as "not required" and resolve immediately rather than rejecting.
      if (!s) return resolve();
      if (s.connected) return resolve();
      const onConnect = () => { s.off('connect_error', onError); resolve(); };
      const onError   = (err: any) => { s.off('connect', onConnect); reject(err); };
      s.once('connect', onConnect);
      s.once('connect_error', onError);
    });
  }

  /** Initialize the socket (idempotent, robust). */
  static async initializeSocket(): Promise<void> {
    if (SocketService.socketInstance?.connected) return Promise.resolve();
    if (SocketService.reconnectionInProgress) {
      return SocketService.initializationPromise || Promise.reject(new Error('Connection in progress'));
    }
    SocketService.reconnectionInProgress = true;

    SocketService.initializationPromise = new Promise(async (resolve, reject) => {
      console.log('🔵 Initializing WebSocket connection...');

      // Clean any stale instance
      if (SocketService.socketInstance) {
        try { SocketService.socketInstance.removeAllListeners(); } catch {}
        try { SocketService.socketInstance.disconnect(); } catch {}
      }

      const currentPath = window.location.pathname || '';
        if (currentPath.includes('signup')) {
          console.log('➡️ Signup route detected, skipping token check');
          SocketService.reconnectionInProgress = false;
          return resolve(); // skip silently
        }
      // Auth pre-check: if there's no token (user not signed-in yet),
      // skip WebSocket initialization silently instead of rejecting.
      // Server-side will still enforce auth for protected socket events.
      const token = SocketService.readToken();
      if (!token) {
        console.log('ℹ️ No auth token found — skipping WebSocket initialization.');
        SocketService.reconnectionInProgress = false;
        return resolve();
      }
      const authId = SocketService.resolveOwnerId();
      if (!authId) {
        console.warn('⚠️ Token present but no user id found — skipping WebSocket initialization.');
        SocketService.reconnectionInProgress = false;
        return resolve();
      }
      SocketService.ownerId = authId;

      // Create socket
      SocketService.socketInstance = io(environment.socketUrl, {
        path: environment.socketPath || '/socket.io',
        // Prefer websocket on mobile; keep polling fallback for restrictive proxies.
        transports: [ 'websocket', 'polling' ],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        // gentle backoff window
        reconnectionDelay: 800,
        reconnectionDelayMax: 6000,
        timeout: 25000,
        auth: { token },
      });

      // Respond to backend custom heartbeat so the server does not forcibly
      // disconnect sockets that fail to reply within the 30-second window.
      SocketService.socketInstance.on('ping', () => {
        SocketService.socketInstance?.emit('pong');
      });

      const onConnect = () => {
        SocketService.reconnectionInProgress = false;
        console.log('✅ WebSocket Connected:', SocketService.socketInstance?.id);
        SocketService.connectionSubject.next('connected');

        // Tell backend (for chat.js) which user this socket belongs to.
        SocketService.socketInstance!.emit('connect-user', authId);

        // Flush any queued emits
        if (SocketService.emitQueue.length) {
          const q = [...SocketService.emitQueue];
          SocketService.emitQueue.length = 0;
          q.forEach(({ event, data }) => {
            try { SocketService.socketInstance!.emit(event, data); } catch {}
          });
        }

        resolve();
      };

      const onConnectError = (error: any) => {
        console.error('⚠️ WebSocket Connection Error:', error);
        SocketService.connectionSubject.next('error');
      };

      const onDisconnect = (reason: string) => {
        console.warn('🔄 WebSocket disconnected:', reason);
        SocketService.connectionSubject.next('disconnected');
        // Server forced disconnect → try immediate reconnect
        if (reason === 'io server disconnect') {
          SocketService.socketInstance?.connect();
        }
      };

      // Guard: give up this particular init attempt after 30s,
      // but auto-reconnect continues in the background.
      const failTimer = setTimeout(() => {
        // Don't flip flags if we already connected
        if (!SocketService.socketInstance?.connected) {
          SocketService.reconnectionInProgress = false;
          reject(new Error('Connection timeout'));
        }
      }, 30000);

      SocketService.socketInstance.on('connect', () => {
        clearTimeout(failTimer);
        onConnect();
      });
      SocketService.socketInstance.on('connect_error', onConnectError);
      SocketService.socketInstance.on('disconnect', onDisconnect);

      // ✅ Safe listener for presence updates from the server
      SocketService.socketInstance.on('user-status-changed', (payload: any) => {
        // Server emits: { userId, online }
        // Be defensive to avoid "cannot read id of undefined"
        const userId: string | undefined =
          payload?.userId ?? payload?.user?.id ?? payload?.id;
        const online: boolean = !!payload?.online;

        if (!userId) {
          console.warn('⚠️ Bad user-status-changed payload:', payload);
          return;
        }

        console.log('📡 User status changed:', { userId, online });
        SocketService.userStatusSubject.next({ userId, online });
      });

      // ✅ Safe listener for profile updates from the server
      SocketService.socketInstance.on('user-profile-updated', (payload: any) => {
        const userId: string | undefined = payload?.userId ?? payload?.id ?? payload?.user?._id;
        if (!userId) {
          console.warn('⚠️ Bad user-profile-updated payload:', payload);
          return;
        }
        console.log('📣 User profile updated:', { userId, fields: payload?.fields });
        SocketService.userProfileUpdatedSubject.next({ userId, fields: payload?.fields });
      });

      // Listen for follow/unfollow/block events so UI can refresh lists in real-time
      SocketService.socketInstance.on('follow-update', (payload: any) => {
        try {
          console.log('📣 follow-update received:', payload);
          SocketService.followUpdateSubject.next(payload);
        } catch (e) { console.warn('Error handling follow-update payload', e); }
      });

      // Friend-requests or friend list updates (emitted by helpers.emitFriendRequestsUpdated)
      SocketService.socketInstance.on('friend-requests-updated', (payload: any) => {
        try {
          console.log('📣 friend-requests-updated received:', payload);
          SocketService.friendRequestsUpdatedSubject.next(payload);
        } catch (e) { console.warn('Error handling friend-requests-updated payload', e); }
      });

      // New message notification
      SocketService.socketInstance.on('new-message', (payload: any) => {
        try {
          console.log('📣 new-message received:', payload);
          SocketService.newMessageSubject.next(payload);
        } catch (e) { console.warn('Error handling new-message payload', e); }
      });

      // Budget update notification (for call credits)
      SocketService.socketInstance.on('budget-update', (payload: any) => {
        try {
          console.log('📣 budget-update received:', payload);
          SocketService.budgetUpdateSubject.next(payload);
        } catch (e) { console.warn('Error handling budget-update payload', e); }
      });

      // New friend request notification
      SocketService.socketInstance.on('new-friend-request', (payload: any) => {
        try {
          console.log('📣 new-friend-request received:', payload);
          SocketService.newFriendRequestSubject.next(payload);
          // Also fire friendRequestsUpdated so all subscribers stay in sync
          SocketService.friendRequestsUpdatedSubject.next(payload);
        } catch (e) { console.warn('Error handling new-friend-request payload', e); }
      });

      // In-app notification (e.g. likes, comments, mentions)
      SocketService.socketInstance.on('notification-received', (payload: any) => {
        try {
          SocketService.notificationReceivedSubject.next(payload);
        } catch (e) { console.warn('Error handling notification-received payload', e); }
      });

      // Server confirms all notifications have been marked read
      SocketService.socketInstance.on('notifications-read', (payload: any) => {
        try {
          SocketService.notificationsReadSubject.next(payload);
        } catch (e) { console.warn('Error handling notifications-read payload', e); }
      });

      // Sender-side message confirmation (optimistic UI reconcile)
      SocketService.socketInstance.on('message-sent', (payload: any) => {
        try {
          SocketService.messageSentSubject.next(payload);
        } catch (e) { console.warn('Error handling message-sent payload', e); }
      });

      // Backend rejected a send-message (auth, invalid id, blocked, etc.)
      SocketService.socketInstance.on('send-message-error', (payload: any) => {
        try {
          console.warn('⚠️ send-message-error:', payload);
          SocketService.sendMessageErrorSubject.next(payload);
        } catch (e) { console.warn('Error handling send-message-error payload', e); }
      });

      // New post in feed (recipients of a channel/follower post)
      SocketService.socketInstance.on('new_feed_post', (payload: any) => {
        try {
          SocketService.newFeedPostSubject.next(payload);
        } catch (e) { console.warn('Error handling new_feed_post payload', e); }
      });

      // Admin broadcast: new announcement for all users
      SocketService.socketInstance.on('new_announcement', (payload: any) => {
        try {
          SocketService.newAnnouncementSubject.next(payload);
        } catch (e) { console.warn('Error handling new_announcement payload', e); }
      });

      // Server-initiated forced logout (e.g. account deleted or token revoked)
      SocketService.socketInstance.on('force-logout', (payload: any) => {
        try {
          console.warn('🔒 Received force-logout from server:', payload);
          // Dispatch a global event so the Angular app can run proper logout (clears NativeStorage)
          try {
            const ev = new CustomEvent('force-logout', { detail: payload });
            window.dispatchEvent(ev as any);
          } catch (e) {
            // fallback to window.postMessage
            try { window.postMessage({ type: 'force-logout', payload }, '*'); } catch (e2) {}
          }

          // best-effort: disconnect socket and reset static state
          SocketService.logout().catch(() => {});
        } catch (e) { console.warn('Error handling force-logout', e); }
      });
    });

    return SocketService.initializationPromise;
  }

  /** Get the live socket instance (awaits initialization if needed). */
  static async getSocket(): Promise<Socket | null> {
    // ✅ Skip WebSocket when on signup route
    const currentPath = window.location.pathname || '';
    if (currentPath.includes('signup')) {
      console.log('➡️ Signup route detected, skipping socket init.');
      return null; // just return null silently
    }
  
    if (SocketService.socketInstance) return SocketService.socketInstance;
    // If initialization has not been started, don't throw — return null so
    // callers (and tests) can handle absence of a socket gracefully.
    if (!SocketService.initializationPromise) {
      return null;
    }
    try {
      await SocketService.initializationPromise;
    } catch {
      // initialization failed — return null instead of throwing so tests
      // and non-critical components don't crash.
      return null;
    }
    return SocketService.socketInstance ?? null;
  }
  

  /** Safe emit (queues while offline). */
  static emit(event: string, data: any): void {
    if (SocketService.socketInstance?.connected) {
      SocketService.socketInstance.emit(event, data);
    } else {
      // Queue and try to (re)connect in background
      SocketService.emitQueue.push({ event, data });
      if (!SocketService.reconnectionInProgress) {
        SocketService.initializeSocket().catch(() => void 0);
      }
      console.warn(`ℹ️ Queued '${event}' — WebSocket not connected.`);
    }
  }
  

  /** Call on real logout (or when switching accounts). */
  static async logout(): Promise<void> {
    localStorage.removeItem('token');
    SocketService.ownerId = null;
    SocketService.emitQueue.length = 0;

    if (SocketService.socketInstance) {
      try { SocketService.socketInstance.removeAllListeners(); } catch {}
      try { SocketService.socketInstance.disconnect(); } catch {}
      SocketService.socketInstance = null;
    }
    SocketService.initializationPromise = null;
    SocketService.reconnectionInProgress = false;
    SocketService.connectionSubject.next('disconnected');
  }
}
