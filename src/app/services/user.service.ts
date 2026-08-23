import { devLogger } from "src/app/utils/dev-logger";
import { Injectable, Inject, forwardRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject, of, firstValueFrom, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { catchError, finalize, map, shareReplay, tap, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { User } from '../models/User';
import constants from '../helpers/constants';
import { StorageService } from './storage.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { IdService } from './id.service';
import { SocketService } from './socket.service';
import { AppEventsService } from './app-events.service';
import { SessionAuthStateService } from './session-auth-state.service';
import { SessionCredentialStore } from './session-credential-store.service';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private static instance: UserService | null = null;
  private apiUrl = `${environment.apiUrl}/user`;
  private currentUserSubject: BehaviorSubject<User>;
  public currentUser: Observable<User>;
  public currentUser$: Observable<User>;
  private viewedUserSubject: BehaviorSubject<User>;
  public viewedUser: Observable<User>;
  private inflightCurrentUser$: Observable<User> | null = null;
  private destroy$ = new Subject<void>();
  private startupRestorationPromise: Promise<void> = Promise.resolve();

  // Subject to notify components when friends list changes
  private friendsUpdatedSubject = new Subject<void>();
  public friendsUpdated$ = this.friendsUpdatedSubject.asObservable();
  private friendsRefreshTimeout: any;

  // Cache + instrumentation for profile fetches
  private profileCache = new Map<string, { user: User; expires: number }>();
  private inflightProfiles = new Map<string, Observable<User>>();
  private cacheTTLms = 2 * 60 * 1000; // 2 minutes
  private callCounters = {
    profileRequests: 0,
    profileHits: 0,
    profileMisses: 0,
    initCalls: 0,
  };

  getAnnouncements(): Observable<any> {
    return this.http.get(`${this.apiUrl}/announcements`);
  }

  markAnnouncementSeen(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcements/${id}/seen`, {});
  }

  resetBudget(): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-budget`, {});
  }

  constructor(
    private http: HttpClient,
    private storageService: StorageService,
    private nativeStorage: NativeStorage,
    private appEvents: AppEventsService,
    private router: Router,
    @Inject(forwardRef(() => IdService)) private idService: IdService
  ) {
    UserService.instance = this;
    this.currentUserSubject = new BehaviorSubject<User>(null);
    this.currentUser = this.currentUserSubject.asObservable();
    this.currentUser$ = this.currentUser.pipe(
      shareReplay(1)
    );
  
    this.viewedUserSubject = new BehaviorSubject<User>(null);
    this.viewedUser = this.viewedUserSubject.asObservable();
  
    this.startupRestorationPromise = this.initCurrentUser();
    this.initializeRealtimeOrchestration();
  }

  private initializeRealtimeOrchestration() {
    // 0. Keep canonical user model in sync — badges are owned by TabsPage, NOT here.
    // Only patch the in-memory User object; do NOT call appEvents.set/inc from this service.
    this.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      // intentionally empty — badge state is driven by tabs.page.ts
    });

    // 1. Social/Follow/Requests — patch canonical model only
    SocketService.followUpdate$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      this.handleSocialRealtimeUpdate(payload);
    });

    SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      this.handleSocialRealtimeUpdate(payload);
    });

    // 2. Profile cache invalidation only
    SocketService.userProfileUpdated$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      try {
        if (payload && payload.userId) {
          // Realtime listeners on the active screen decide whether fresh profile
          // data is actually needed. Globally, only invalidate the cached copy;
          // otherwise the same socket event can trigger duplicate profile GETs.
          this.invalidateProfile(payload.userId, { refreshCurrentUser: false });
        }
      } catch (e) { devLogger.warn('Error handling userProfileUpdated payload', e); }
    });
    // NOTE: newMessage$, newFeedPost$, newFriendRequest$, budgetUpdate$ badge increments
    // are intentionally handled ONLY in tabs.page.ts to avoid double-counting.
  }

  private handleSocialRealtimeUpdate(payload: any) {
    const myId =
      String(this.getCurrentUserId() || '');

    const current =
      this.currentUserSubject.value;

    if (!myId || !current || !payload) {
      return;
    }

    const raw =
      current.toObject();

    const normalizeIds = (value: any[]): string[] =>
      (Array.isArray(value) ? value : [])
        .map(item =>
          String(
            typeof item === 'string'
              ? item
              : (
                  item?._id ||
                  item?.id ||
                  ''
                )
          )
        )
        .filter(Boolean);

    const addUnique = (
      arr: any[],
      id: string
    ): string[] => {
      const values =
        normalizeIds(arr);

      if (
        id &&
        !values.includes(id)
      ) {
        values.push(id);
      }

      return values;
    };

    const removeId = (
      arr: any[],
      id: string
    ): string[] =>
      normalizeIds(arr)
        .filter(
          value =>
            value !== id
        );

    let followers =
      normalizeIds(raw.followers);

    let following =
      normalizeIds(raw.following);

    let friends =
      normalizeIds(raw.friends);

    let changed = false;
    let stats: any = null;

    // --------------------------------------------------------
    // Follow events have explicit actor/target relationship IDs.
    // --------------------------------------------------------
    const followerId =
      String(
        payload.followerId || ''
      );

    const followedId =
      String(
        payload.followedId || ''
      );

    if (
      followerId &&
      followedId &&
      (
        myId === followerId ||
        myId === followedId
      )
    ) {
      const status =
        String(payload.status || '');

      if (myId === followerId) {
        stats =
          payload.actorStatistics ||
          stats;

        if (status === 'active') {
          following =
            addUnique(
              following,
              followedId
            );
        }

        if (
          [
            'unfollowed',
            'removed',
            'blocked'
          ].includes(status)
        ) {
          following =
            removeId(
              following,
              followedId
            );
        }
      }

      if (myId === followedId) {
        stats =
          payload.targetStatistics ||
          stats;

        if (status === 'active') {
          followers =
            addUnique(
              followers,
              followerId
            );
        }

        if (
          [
            'unfollowed',
            'removed',
            'blocked'
          ].includes(status)
        ) {
          followers =
            removeId(
              followers,
              followerId
            );
        }
      }

      changed = true;
    }

    // --------------------------------------------------------
    // friend-requests-updated is emitted individually to each
    // user's socket. payload.statistics therefore belongs to ME.
    // payload.userId is the peer, not the current user.
    // --------------------------------------------------------
    if (payload.statistics) {
      stats =
        payload.statistics;

      changed = true;
    }

    const peerId =
      String(
        payload.userId ||
        payload.from ||
        ''
      );

    if (
      peerId &&
      peerId !== myId
    ) {
      if (
        payload.type === 'accepted' ||
        payload.friend === true
      ) {
        friends =
          addUnique(
            friends,
            peerId
          );

        // Friendship and Follow are mutually exclusive.
        followers =
          removeId(
            followers,
            peerId
          );

        following =
          removeId(
            following,
            peerId
          );

        changed = true;
      }

      if (
        payload.type === 'removed' ||
        payload.action === 'unfriend' ||
        payload.friend === false
      ) {
        friends =
          removeId(
            friends,
            peerId
          );

        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    raw.followers =
      followers;

    raw.following =
      following;

    raw.friends =
      friends;

    raw.followersCount =
      stats?.followers !== undefined
        ? Number(stats.followers)
        : followers.length;

    raw.followingCount =
      stats?.following !== undefined
        ? Number(stats.following)
        : following.length;

    raw.friendsCount =
      stats?.friends !== undefined
        ? Number(stats.friends)
        : friends.length;

    raw.pendingFollowRequestsCount =
      stats?.pendingFollowRequests !== undefined
        ? Number(
            stats.pendingFollowRequests
          )
        : current.pendingFollowRequestsCount;

    raw.pendingFriendRequestsCount =
      stats?.pendingFriendRequests !== undefined
        ? Number(
            stats.pendingFriendRequests
          )
        : current.pendingFriendRequestsCount;

    const updatedUser =
      new User()
        .initialize(raw);

    this.currentUserSubject
      .next(updatedUser);

    this.triggerFriendsRefresh();
  }
  
  private async initCurrentUser() {
    this.callCounters.initCalls += 1;
    try {
      // Prefer the new key 'currentUser' in storage, fall back to legacy 'user' for compatibility
      let user: User = null;
      try {
        user = await this.nativeStorage.getItem('currentUser');
      } catch (e) {
        // ignore native storage errors
      }

      if (!user) {
        const localStorageUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
        if (localStorageUser && typeof localStorageUser === 'string') {
          try {
            if (localStorageUser === '[object Object]' || localStorageUser === 'null' || localStorageUser === 'undefined') {
              devLogger.warn('localStorage user data is invalid string:', localStorageUser);
              localStorage.removeItem('currentUser');
              localStorage.removeItem('user');
              user = null;
            } else if (localStorageUser.startsWith('{') || localStorageUser.startsWith('[')) {
              user = JSON.parse(localStorageUser);
            } else {
              devLogger.warn('localStorage user data is not valid JSON string:', localStorageUser);
              user = null;
            }
          } catch (e) {
            devLogger.warn('Failed to parse localStorage user data:', e);
            user = null;
          }
        }
      }

      if (user) {
        try {
          // Normalize buffer-like id fields if present
          if (user._id && typeof user._id !== 'string') {
            const nid = this.idService?.normalizeId ? this.idService.normalizeId(user._id) : null;
            if (nid) user._id = nid;
          }
          if (!user._id && user.id && typeof user.id !== 'string') {
            const nid2 = this.idService?.normalizeId ? this.idService.normalizeId(user.id) : null;
            if (nid2) user._id = nid2;
          }
        } catch (e) { devLogger.warn('Failed to normalize stored user id', e); }

        this.setCurrentUser(user, { force: true });
        setTimeout(() => {
          this.refreshCurrentUser({ forceRefresh: true }).subscribe({
            next: fresh => this.setCurrentUser(fresh, { force: true }),
            error: e => {
              const status = e?.status || e?.error?.status;
              if (status === 401 || status === 403) {
                devLogger.warn('Stored user validation failed; clearing persisted user and token', e);

                // Startup validation rejection is targeted persisted-auth
                // invalidation, not a full application logout. Reuse the
                // shared low-level auth-state owner so local/native state
                // and the synchronous credential fallback stay consistent.
                try {
                  new SessionAuthStateService(
                    this.nativeStorage
                  )
                    .clearStoredAuth(true)
                    .catch(() => {});
                } catch (er) {}

                this.setCurrentUser(null);
              }
            }
          });
        }, 0);
      } else {
        devLogger.warn('⚠️ No user found in any storage');
      }

    } catch (error) {
      devLogger.error('❌ Initialization error:', error);
    }
  }
  public waitForStartupRestoration(): Promise<void> {
    return this.startupRestorationPromise;
  }

  public get currentUserValue(): User {
    return this.currentUserSubject.value;
  }

  public get viewedUserValue(): User {
    return this.viewedUserSubject.value;
  }

  /** Static helper to clear user state from anywhere without injection */
  public static clearUserState() {
    if (UserService.instance) {
      UserService.instance.setCurrentUser(null);
    }
  }

  setCurrentUser(user: any, options: { force?: boolean } = {}) {
    if (!user) {
      this.resetUserCache('setCurrentUser(null)');
      this.currentUserSubject.next(null);
      return;
    }

    // Ensure we have a User instance
    const userObj = user instanceof User ? user : new User().initialize(user);

    // Safety guard: if we already have an authenticated user in memory,
    // don't overwrite it with a different user's profile unless explicitly forced.
    try {
      const existing = this.currentUserSubject && this.currentUserSubject.value;
      if (!options.force && existing && existing._id && userObj._id && existing._id !== userObj._id) {
        console.warn('setCurrentUser: refusing to overwrite existing authenticated user with different id', existing._id, userObj._id);
        return;
      }
    } catch (e) {
      // ignore guard failures
    }

    // Write canonical key and legacy key for compatibility in both storages (native + local)
    const rawData = userObj.toObject ? userObj.toObject() : userObj;
    try {
      if (this.nativeStorage && typeof this.nativeStorage.setItem === 'function') {
        try { this.nativeStorage.setItem('currentUser', rawData).catch(() => {}); } catch (_) {}
        try { this.nativeStorage.setItem('user', rawData).catch(() => {}); } catch (_) {}
      }
    } catch (e) {}

    try { localStorage.setItem('currentUser', JSON.stringify(rawData)); } catch (e) {}
    try { localStorage.setItem('user', JSON.stringify(rawData)); } catch (e) {}

    // Invalidate profile cache for this user to ensure real-time updates across the app
    if (userObj._id) {
      this.profileCache.delete(userObj._id);
      this.profileCache.delete('me');
      this.inflightProfiles.delete(userObj._id);
      this.inflightProfiles.delete('me');
      this.inflightCurrentUser$ = null;
    }

    this.currentUserSubject.next(userObj);

    // Seed the budget display from the profile so it's correct on first load
    // and after any profile refresh, not only after a socket budget-update fires.
    const budget = (userObj as any).missedCallBudget;
    if (budget !== undefined && budget !== null) {
      try { this.appEvents.setBudget(Number(budget) || 0); } catch (e) {}
    }
  }

  setViewedUser(user: User) {
    this.viewedUserSubject.next(user);
  }

  clearViewedUser() {
    this.viewedUserSubject.next(null);
  }

  updateUser(id: string, data: any): Observable<any> {
    console.log('Updating user with ID: ', id);
    return this.http.put(`${this.apiUrl}/${id}`, data).pipe(
      tap((res: any) => {
        if (res && (res.user || res.data)) {
          this.setCurrentUser(res.user || res.data);
        }
      })
    );
  }

  updateProfile(data: any): Observable<any> {
    const userId = this.getCurrentUserId();
    if (!userId) return throwError('No user logged in');
    return this.updateUser(userId, data);
  }

  removeAvatar(userId: string, avatarUrl: string): Observable<any> {
    const encodedAvatarUrl = encodeURIComponent(avatarUrl);
    return this.http.delete(`${constants.DOMAIN_URL}${constants.API_V1}user/remove-avatar/${userId}/${encodedAvatarUrl}`);
  }

  updateAvatar(userId: string, formData: FormData): Observable<any> {
    const url = `${this.apiUrl}/${userId}/avatar`;
    const token = SessionCredentialStore.readLocalTokenRaw();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.put(url, formData, { headers }).pipe(
      map((response: any) => {
        if (response && response.user) {
          return response.user;
        } else {
          throw new Error('Invalid response structure');
        }
      })
    );
  }

  // user.service.ts
getCurrentUserId(): string | null {
  // Prefer in-memory currentUser if available
  if (this.currentUserSubject && this.currentUserSubject.value && this.currentUserSubject.value._id) {
    return this.currentUserSubject.value._id;
  }

  // Fallback to localStorage canonical key then legacy key -- attempt normalization
  try {
    const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return null;

    // if already string id
    if (user._id && typeof user._id === 'string') return user._id;

    // helper to extract numeric-indexed bytes
    const tryExtractBytes = (obj: any): number[] | null => {
      if (!obj) return null;
      if (Array.isArray(obj)) return obj.map(n => Number(n));
      if (obj.data && Array.isArray(obj.data)) return obj.data.map(n => Number(n));
      if (obj.buffer && Array.isArray(obj.buffer.data)) return obj.buffer.data.map(n => Number(n));
      const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      if (keys.length) return keys.map(k => Number(obj[k]));
      return null;
    };

    // try idService normalization first if available
    try {
      if (this.idService && user._id) {
        const n = this.idService.normalizeId(user._id);
        if (n) return n;
      }
      if (this.idService && user.id) {
        const n2 = this.idService.normalizeId(user.id);
        if (n2) return n2;
      }
    } catch (e) { /* ignore */ }

    // try byte extraction
    const bytes = tryExtractBytes(user._id) || tryExtractBytes(user.id) || tryExtractBytes(user) || tryExtractBytes(user.buffer) || tryExtractBytes(user.data);
    if (bytes && bytes.length) {
      // if bytes decode to printable string, return it; else return hex
      try {
        const arr = new Uint8Array(bytes);
        const dec = new TextDecoder().decode(arr);
        if (dec && /^[\x20-\x7E]+$/.test(dec)) return dec;
      } catch (e) {}
      return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
    }

    // last resort: string coercion
    try {
      if (user._id) return String(user._id);
      if (user.id) return String(user.id);
    } catch (e) {}

    return null;
  } catch (e) {
    console.warn('getCurrentUserId: failed to read from localStorage', e);
    return null;
  }
}


  refreshCurrentUser(options: { forceRefresh?: boolean } = {}): Observable<User> {
    const userId = this.getCurrentUserId();
    if (!userId) return throwError(() => new Error('No user logged in'));

    const forceRefresh = !!options.forceRefresh;

    if (!forceRefresh && this.inflightCurrentUser$) {
      return this.inflightCurrentUser$;
    }

    // Performance monitoring
    if (typeof (window as any).__perfMonitor !== 'undefined') {
      (window as any).__perfMonitor.incrementUserFetch();
    }

    const request$ = this.http.get<any>(`${this.apiUrl}/profile/${encodeURIComponent(userId)}`).pipe(
      map((response: any) => {
        if (response && response.data) {
          const userData = response.data;
          console.log('[UserService:refreshCurrentUser] raw API response — friends:', userData?.friends?.length, 'followers:', userData?.followers?.length, 'following:', userData?.following?.length, 'raw friends:', userData?.friends, 'raw followers:', userData?.followers);
          const fresh = new User().initialize(userData);
          // Merge with existing in-memory user to avoid overwriting transient fields
          const existing = this.currentUserSubject?.value;
          if (existing && existing._id && existing._id === fresh._id) {
            // Merge arrays and scalar values when fresh response lacks them
            try {
              // CRITICAL: Ensure we don't overwrite fresh avatar metadata with old existing metadata
              const mergedData = { 
                ...existing.toObject(), 
                ...userData,
                // Explicitly prefer fresh avatar fields
                avatarStyle: userData.avatarStyle || fresh.avatarStyle,
                avatarSeed: userData.avatarSeed || fresh.avatarSeed,
                avatarVariant: userData.avatarVariant || fresh.avatarVariant,
                avatarOverrides: userData.avatarOverrides || fresh.avatarOverrides
              };
              const merged = new User().initialize(mergedData);
              // prefer server-provided values but fall back to existing where empty
              if ((!merged.followers || merged.followers.length === 0) && existing.followers && existing.followers.length > 0) merged.followers = existing.followers;
              if ((!merged.following || merged.following.length === 0) && existing.following && existing.following.length > 0) merged.following = existing.following;
              if ((!merged.friends || merged.friends.length === 0) && existing.friends && existing.friends.length > 0) merged.friends = existing.friends;
              if ((!merged.followedChannels || merged.followedChannels.length === 0) && existing.followedChannels && existing.followedChannels.length) merged.followedChannels = existing.followedChannels;
              if ((!merged.avatar || merged.avatar.length === 0) && existing.avatar) merged.avatar = existing.avatar || [];
              
              const hasFreshMainAvatar = typeof userData.mainAvatar === 'string'
                && !!userData.mainAvatar.trim()
                && userData.mainAvatar !== 'undefined'
                && userData.mainAvatar !== 'null'
                && userData.mainAvatar !== '[object Object]';
              if (!hasFreshMainAvatar && existing.mainAvatarPath) {
                merged.mainAvatar = existing.mainAvatarPath;
              }
              
              // preserve missedCallBudget and peerId if not returned
              if ((merged as any).missedCallBudget === undefined && (existing as any).missedCallBudget !== undefined) (merged as any).missedCallBudget = (existing as any).missedCallBudget;
              if (!(merged as any).peerId && (existing as any).peerId) (merged as any).peerId = (existing as any).peerId;
              console.log('[UserService:refreshCurrentUser] MERGED — friends:', merged.friends?.length, 'followers:', merged.followers?.length, 'following:', merged.following?.length);
              this.setCurrentUser(merged, { force: true });
              console.log('✅ Current user refreshed and merged from server:', merged);
              return merged;
            } catch (e) {
              console.warn('Failed to merge refreshed user with existing user, using fresh:', e);
            }
          }

          this.setCurrentUser(fresh, { force: true });
          console.log('✅ Current user refreshed from server:', fresh);
          return fresh;
        } else {
          throw new Error('Invalid response data');
        }
      }),
      catchError((error) => {
        console.error('Error refreshing current user:', error);
        return throwError(() => error);
      }),
      finalize(() => {
        this.inflightCurrentUser$ = null;
      }),
      shareReplay(1)
    );

    this.inflightCurrentUser$ = request$;
    return request$;
  }

  getUserProfile(userId: any, options: { forceRefresh?: boolean; ttlMs?: number } = {}): Observable<User> {
    const ttl = options.ttlMs ?? this.cacheTTLms;
    const forceRefresh = !!options.forceRefresh;
    // Use IdService to normalize any incoming id-like value
    let id: string | null = null;
    try {
      if (userId === 'me') {
        id = 'me';
      } else {
        // Prefer normalization for objects/buffers
        id = this.idService.normalizeId(userId as any) || (typeof userId === 'string' ? userId : (userId != null ? String(userId) : null));
      }
    } catch (e) {
      id = String(userId || '');
    }

    // Attempt to decode URL-safe base64 transport IDs (defensive)
    try {
      if (id && id !== 'me') {
        // If looks like percent-encoded, decode first
        if (/%[0-9A-Fa-f]{2}/.test(id)) {
          try { id = decodeURIComponent(id); } catch (e) {}
        }

        const decoded = this.idService.decodeFromTransport(id);
        if (decoded) {
          id = decoded;
          console.log('Decoded transport id to:', id);
        }
      }
    } catch (e) {
      // ignore decode failures and continue with original id
    }

    // Defensive cleanup: if id contains replacement chars or non-printable, try to extract a hex ObjectId
    if (id && id !== 'me') {
      if (id.indexOf('\uFFFD') !== -1 || /[^\x20-\x7E]/.test(id)) {
        // attempt to extract hex substring
        const hex = (id.match(/[a-fA-F0-9]{24}/) || [null])[0];
        if (hex) {
          console.warn('Normalized messy id to hex:', id, '->', hex);
          id = hex;
        }
      }

      // final sanity: if id looks like an object coercion, reject early
      if (id === '[object Object]' || !id) {
        console.warn('getUserProfile: refusing to request backend with invalid id:', id, 'original:', userId);
        return new Observable((observer) => { observer.error(new Error('Invalid user id')); });
      }
    }

    // If asking for the authenticated user's profile, return current user subject if initialized
    // BUT only if we are not forcing a refresh
    if (!forceRefresh && (id === 'me' || (this.currentUserSubject && this.currentUserSubject.value && this.currentUserSubject.value._id === id))) {
      return new Observable((observer) => {
        observer.next(this.currentUserSubject.value);
        observer.complete();
      });
    }

    if (!id) {
      console.error('getUserProfile called with invalid id:', userId);
      return new Observable((observer) => { observer.error(new Error('Invalid user id')); });
    }

    // Cache + in-flight dedupe
    const now = Date.now();
    const cached = this.profileCache.get(id);
    if (!forceRefresh && cached && cached.expires > now) {
      this.callCounters.profileHits += 1;
      return of(cached.user);
    }

    if (!forceRefresh && this.inflightProfiles.has(id)) {
      this.callCounters.profileHits += 1; // treat reuse as a hit
      return this.inflightProfiles.get(id);
    }

    this.callCounters.profileRequests += 1;
    console.log(`📡 getUserProfile -> ${id} (force:${forceRefresh})`);

    const request$ = this.http.get<any>(`${this.apiUrl}/profile/${encodeURIComponent(id)}`).pipe(
      map((response: any) => {
        if (response && response.data) {
          const userData = response.data;
          console.log("userData:", userData);
          console.log("response userData:", response);
          console.log("response.data userData:", response.data);

          userData.avatar = Array.isArray(userData.avatar) ? userData.avatar : [];
          userData.birthDate = userData.birthDate ? new Date(userData.birthDate) : null;
          userData.gender = userData.gender || 'Not specified';
          const user = new User().initialize(userData);
          this.storageService.setItem(`user-profile-${userId}`, userData);
          console.log('User data fetched and stored:', userData);
          this.callCounters.profileMisses += 1;
          this.profileCache.set(id, { user, expires: Date.now() + ttl });
          return user;
        } else {
          throw new Error('Invalid response data');
        }
      }),
      finalize(() => {
        this.inflightProfiles.delete(id);
        (window as any).__userProfileCounters = this.getDiagnostics();
      }),
      shareReplay(1),
      catchError((error: any) => {
        // If the profile is missing (404), return a lightweight placeholder user
        try {
          if (error && error.status === 404) {
            console.warn('User profile not found (404), returning placeholder for', id);
            const placeholder = new User().initialize({ _id: id, firstName: 'User', lastName: '' });
            // Cache placeholder to avoid repeated 404 network calls
            try { this.profileCache.set(id, { user: placeholder, expires: Date.now() + ttl }); } catch (e) {}
            return of(placeholder);
          }
        } catch (e) {}
        console.error('Error fetching user profile:', error);
        return throwError(() => new Error('Error fetching user profile'));
      })
    );

    this.inflightProfiles.set(id, request$);
    return request$;
  }

  /** Clears caches and inflight maps; call on logout or user switch. */
  resetUserCache(reason = 'manual') {
    console.log(`🧹 Clearing user cache (${reason})`);
    this.profileCache.clear();
    this.inflightProfiles.clear();
  }

  /** Invalidate a single user's cached profile and optionally refresh current user */
  invalidateProfile(
    id: string,
    options: { refreshCurrentUser?: boolean } = {}
  ) {
    if (!id) return;
    try {
      this.profileCache.delete(id);
      this.inflightProfiles.delete(id);

      const shouldRefreshCurrentUser =
        options.refreshCurrentUser !== false;

      // Preserve existing behavior for explicit invalidation callers.
      // Realtime cache-only invalidation can opt out to avoid duplicate GETs.
      const cu = this.currentUserSubject && this.currentUserSubject.value;
      if (
        shouldRefreshCurrentUser &&
        cu &&
        (cu._id === id || cu.id === id)
      ) {
        this.getUserProfile(id, { forceRefresh: true }).subscribe({
          next: (u) => { if (u) this.setCurrentUser(u); },
          error: () => { /* ignore */ }
        });
      }
    } catch (e) { console.warn('invalidateProfile error', e); }
  }

  /** Return a cached profile synchronously if available and not expired. */
  getCachedProfile(id: string): User | null {
    if (!id) return null;
    try {
      const entry = this.profileCache.get(id);
      if (!entry) return null;
      if (entry.expires && Date.now() > entry.expires) {
        this.profileCache.delete(id);
        return null;
      }
      return entry.user instanceof User ? entry.user : new User().initialize(entry.user as any);
    } catch (e) {
      console.warn('getCachedProfile error', e);
      return null;
    }
  }

  getDiagnostics() {
    return {
      ...this.callCounters,
      cacheSize: this.profileCache.size,
      inflight: this.inflightProfiles.size,
    };
  }

  uploadAvatar(userId: string, formData: FormData): Observable<any> {
    return this.http.put(`${constants.DOMAIN_URL}${constants.API_V1}user/${userId}/avatar`, formData);
  }

  updateMainAvatar(userId: string, avatarUrl: string): Observable<any> {
    return this.http.put(`${constants.DOMAIN_URL}${constants.API_V1}user/update-main-avatar/${userId}`, { avatarUrl });
  }

  getUsers(page: number, options: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/users`, { params: { page: page.toString(), ...options } });
  }

  refreshFriendsList(): Promise<any> { // Add this method to refresh friends list
    this.friendsUpdatedSubject.next();
    return this.http.get(`${this.apiUrl}/friends`).toPromise();
  }

  /**
   * Trigger a full refresh of the current user and notify friends list listeners
   */
  triggerFriendsRefresh() {
    if (this.friendsRefreshTimeout) {
      clearTimeout(this.friendsRefreshTimeout);
    }

    this.friendsRefreshTimeout = setTimeout(() => {
      console.log('🔄 Triggering friends refresh (debounced)...');
      
      // Emit immediately so the UI can start fetching the new friends list
      this.friendsUpdatedSubject.next();

      // Also refresh the current user profile in the background to keep the local state in sync
      this.refreshCurrentUser({ forceRefresh: true }).subscribe({
        next: () => {
          console.log('✅ Current user refreshed after friend update');
        },
        error: (err) => console.error('Failed to refresh user after friend update:', err)
      });
    }, 500);
  }

  getPartnerPeerId(
    userId: string,
    wake = false,
    callMeta?: { callId?: string; callType?: string; videoRequestId?: string }
  ): Observable<string | null> {
    const params = new URLSearchParams();
    if (wake) params.set('wake', '1');
    if (callMeta?.callId) params.set('callId', callMeta.callId);
    if (callMeta?.callType) params.set('callType', callMeta.callType);
    if (callMeta?.videoRequestId) params.set('videoRequestId', callMeta.videoRequestId);
    const query = params.toString();

    return this.http.get<{ success: boolean; peerId?: string; message: string }>(
      `${this.apiUrl}/${userId}/peer${query ? `?${query}` : ''}`
    ).pipe(
      map(response => {
        return response.success && response.peerId ? response.peerId : null;
      }),
      catchError(error => {
        console.error('❌ Peer lookup error:', error);
        return throwError(() => new Error('Error fetching partner peer ID'));
      })
    );
  }
  
  heartbeatPeer(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.patch(`${this.apiUrl}/${userId}/peer/heartbeat`, {}, {
        headers: { 'Content-Type': 'application/json' }
      }).subscribe(
        ()  => resolve(),
        err => reject(err)
      );
    });
  }
  
  sendPeerIdToBackend(userId: string, peerId: string): Promise<void> {
    console.log("peerIdpeerIdpeerIdpeerId to backend:", peerId);

    return new Promise((resolve, reject) => {
        this.http.post(`${this.apiUrl}/${userId}/peer`, { peerId }, {
            headers: { 'Content-Type': 'application/json' }
        }).subscribe(
            response => {
                console.log("✅ Peer ID successfully sent to backend:", response);
                resolve();
            },
            error => {
                console.error("❌ Error sending Peer ID to backend:", error);
                reject(error);
            }
        );
    });
}


  getFriends(page: number): Observable<any> {
    const token = SessionCredentialStore.readLocalTokenRaw(); // or wherever you store your token
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    console.log(`Fetching friends for page: ${page}`);
    return this.http.get(`${this.apiUrl}/friends`, { // ✅ Ensure the correct URL
      headers: headers,
      params: { page: page.toString() } 
    });
  }


  removeFriendship(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/friends/remove/${id}`, {});
  }

  report(id: string, reportData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/report`, reportData);
  }

  updateEmail(id: string, email: string, current_password?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/email`, { email, current_password });
  }

  updatePassword(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/password`, data);
  }


  updateRandomVisibility(userId: string, visible: boolean): Observable<any> {
    console.log('Updating visibility to:', visible);
    return this.http.put(`${this.apiUrl}/randomVisibility`, { userId, visible });
}




  updateAgeVisibility(visible: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/ageVisibility`, { visible });
  }

  updateNonFriendVideoRequests(allowed: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/nonFriendVideoRequests`, { allowed }).pipe(
      tap((resp: any) => {
        const user = resp?.data || resp?.user;
        if (user) {
          user.allowVideoRequestsFromNonFriends = allowed;
          this.setCurrentUser(user, { force: true });
        }
      })
    );
  }

  updatePrivacy(isPrivate: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/privacy`, { isPrivate });
  }

  deleteAccount(): Observable<any> {
    return this.http.delete(this.apiUrl);
  }

  restoreAccount(): Observable<any> {
    return this.http.post(`${this.apiUrl}/me/restore`, {});
  }

  profileVisited(): Observable<any> {
    return this.http.get(`${this.apiUrl}/profile-visited`, { headers: { 'Cache-Control': 'no-cache' } });
  }

  follow(userId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/follow/${userId}`, {});
  }

  unfollow(userId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/follow/${userId}`);
  }

  removeFollower(userId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/follow/follower/${userId}`);
  }

  block(userId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/follow/block/${userId}`, {});
  }

  unblock(userId: string): Observable<any> {
    // Backend exposes unblock as POST /api/v1/user/:userId/unblock
    return this.http.post(`${this.apiUrl}/${userId}/unblock`, {});
  }

  getFollowers(userId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/follow/followers/${userId}`);
  }

  getFollowing(userId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/follow/following/${userId}`);
  }

  getFollowRequests(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/follow/requests`);
  }

  respondToFollowRequest(requestId: string, status: 'active' | 'rejected'): Observable<any> {
    return this.http.put(`${environment.apiUrl}/follow/request/${requestId}`, { status });
  }

  getAuthUser(): Promise<User> {
    return new Promise(async (resolve, reject) => {
      // If in-memory current user is available return it
      if (this.currentUserSubject && this.currentUserSubject.value) {
        return resolve(this.currentUserSubject.value);
      }

      // Try NativeStorage 'currentUser' then legacy 'user', then localStorage
      try {
        let u = null;
        try { u = await this.nativeStorage.getItem('currentUser'); } catch (e) { /* ignore */ }
        if (!u) { try { u = await this.nativeStorage.getItem('user'); } catch (e2) { /* ignore */ } }
        if (!u) {
          const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
          u = raw ? JSON.parse(raw) : null;
        }

        if (u) {
          return resolve(new User().initialize(u));
        }
        return reject(new Error('No auth user found'));
      } catch (err) {
        return reject(err);
      }
    });
  }

}
