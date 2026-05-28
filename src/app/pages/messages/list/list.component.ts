import { MessageService } from './../../../services/message.service';
import { User } from './../../../models/User';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { AlertButton, AlertController, ModalController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { WebrtcService } from 'src/app/services/webrtc.service';
import { Router } from '@angular/router';
import { AppEventsService } from 'src/app/services/app-events.service';
import { Message } from 'src/app/models/Message';
import { SocketService } from 'src/app/services/socket.service';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

interface ListUser extends User {
  hasUnread?: boolean;
}

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})



export class ListComponent implements OnInit, OnDestroy {
  page = 0;
  pageLoading = false;
  users: ListUser[] = [];   // ✅ now template knows hasUnread exists
  missedCalls: any[] = [];
  public missedMap: { [userId: string]: number } = {};
  private missedSub: Subscription | null = null;
  public missedMap$!: Observable<{ [userId: string]: number }>;
  // Latest snapshot for template-friendly access
  public missedMapLatest: { [userId: string]: number } = {};
  private socket: any;
  private destroy$ = new Subject<void>();
  private authId: string | null = null;  
  private static READ_KEY = 'chatLastReadAt';
  private lastReadAt: Record<string, number> = {};
  private prevMissedCount = 0;
  private listRefreshTimer: any;

  constructor(
    private messageService: MessageService,
    private alertController: AlertController,
    private userService: UserService,
    private webrtcService: WebrtcService,
    private router: Router,
  public badges: AppEventsService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
    , private modalCtrl: ModalController
  ) {}

  // Fallback time formatter (short hh:mm) when pipe returns empty
  public formatShortTime(date: any): string {
    if (!date) return '—';
    try {
      const d = (date instanceof Date) ? date : new Date(date);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  isAdmin(user: User): boolean {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }

  // Robust parser for various timestamp shapes we sometimes receive from backend
  public getMessageDate(msg: any): Date | null {
    if (!msg) return null;
    let v: any = msg.createdAt ?? msg.created_at ?? msg.ts ?? msg.time ?? null;
    if (!v) return null;
    try {
      // If it's already a Date
      if (v instanceof Date) return v;

      // If it's a number (ms or seconds)
      if (typeof v === 'number') {
        // Heuristic: if > 1e12 assume ms, else seconds
        return new Date(v > 1e12 ? v : v * 1000);
      }

      // If it's a numeric string
      if (typeof v === 'string') {
        // plain numeric string
        if (/^\d+$/.test(v)) {
          const n = Number(v);
          return new Date(n > 1e12 ? n : n * 1000);
        }
        // ISO or RFC date string
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime())) return parsed;

        // attempt to JSON parse objects encoded as strings
        try { v = JSON.parse(v); } catch(e) { v = v; }
      }

      // If it's an object, try common shapes
      if (typeof v === 'object') {
        if (v.$date) return new Date(v.$date);
        if (v.$numberLong) { const n = Number(v.$numberLong); return new Date(n > 1e12 ? n : n * 1000); }
        if (v.seconds && v.nanoseconds) return new Date(Number(v.seconds) * 1000 + Math.floor(Number(v.nanoseconds) / 1e6));
        if (v.seconds) return new Date(Number(v.seconds) * 1000);
        if (v.ms) return new Date(Number(v.ms));
        if (v.timestamp) return new Date(Number(v.timestamp));
      }
    } catch (e) {
      // ignore and fall through
    }
    return null;
  }

  // helper returning numeric ms for sorting
  private getTimeFromMessage(msg: any): number {
    try {
      const d = this.getMessageDate(msg);
      return d ? d.getTime() : 0;
    } catch (e) { return 0; }
  }

  private extractSocketMessage(raw: any): any {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    return parsed?.message || parsed?.data?.message || parsed?.data || parsed;
  }

  ngOnInit() {
    // Load authId early so mapping logic can derive the other party correctly
    try {
      const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
      this.authId = raw ? (JSON.parse(raw)?._id || JSON.parse(raw)?.id) : null;
    } catch {}
    this.loadLastReadMap();

    // Reset budget when viewing messages/missed calls
    this.userService.resetBudget().subscribe({
      next: () => console.log('Budget reset on messages view'),
      error: (err) => console.warn('Failed to reset budget', err)
    });

    // Prefer centralized stream from AppEventsService to avoid duplicate subscriptions
    // Use async pipe for missed calls mapping and OnPush change detection
    const source$ = this.badges && this.badges.missedCalls$ ? this.badges.missedCalls$ : this.webrtcService.missedCalls$;
    this.missedMap$ = source$.pipe(
      map((calls: any[]) => {
        // Fallback: if stream is empty but service has buffered items, use them
        if ((!calls || calls.length === 0)) {
          try {
            const buf = this.badges.getMissedCalls ? this.badges.getMissedCalls() : this.webrtcService.getMissedCalls();
            if (Array.isArray(buf) && buf.length) {
              calls = buf;
            }
          } catch {}
        }
        // local side-effect: present alert only for new missed calls
        try {
          const count = (calls || []).length;
          if (count > this.prevMissedCount) {
            const m = calls[0];
            // Present alert inside zone
            this.zone.run(() => this.presentMissedCallAlert(m.userId, m.userName, m.timestamp));
          }
          this.prevMissedCount = count;
        } catch (e) {}

        // Build normalized per-user missed map
        const map: { [k: string]: number } = {};
        const arr = Array.isArray(calls) ? calls : [];
        for (const c of arr) {
          try {
            // Accept multiple payload shapes: {userId}, {peerId}, {from,to}
            const maybePeer = (c.peerId || c.userId || c.from || c.to);
            let key = this.keyOf(maybePeer);
            // If we have from/to, prefer "other" party relative to authId
            if (c.from && c.to && this.authId) {
              const other = (String(c.from) === String(this.authId)) ? c.to : c.from;
              key = this.keyOf(other);
            }
            // Guard: ignore self keys accidentally emitted
            if (this.authId && String(key) === String(this.authId)) {
              continue;
            }
            map[key] = (map[key] || 0) + 1;
          } catch (_) {
            const k = String(c.userId || c.peerId || c.from || c.to || '');
            if (!k) continue;
            map[k] = (map[k] || 0) + 1;
          }
        }
        // keep a latest snapshot for template use
        this.missedMapLatest = map;
        // Update badges from computed total
        const total = Object.values(map).reduce((sum, n) => sum + (Number(n) || 0), 0);
        this.prevMissedCount = total;
        try { this.badges.set('messages', total); } catch(e) {}

        this.cdr.markForCheck();
        return map;
      })
    );

    // subscribe to maintain missedMapLatest in case template avoids async pipe
    try {
      this.missedSub = this.missedMap$.subscribe(m => {
        this.missedMapLatest = m || {};
        this.cdr.markForCheck();
      });
    } catch (_) {}

    // Ensure missed-call socket handlers are bound so the BehaviorSubject updates in real-time
    try {
      this.webrtcService.bindMissedCallSocketHandlers();
    } catch (e) {
      console.warn('Failed to bind missed-call socket handlers from list view', e);
    }

    // ✅ socket live updates for list — reconnect-safe via Observable
    this.initSocket();

    SocketService.newMessage$.pipe(takeUntil(this.destroy$)).subscribe((raw: any) => {
      this.zone.run(() => {
        try {
          const msg = this.extractSocketMessage(raw);

          const normalized = new Message().initialize({
            id: msg.id || msg._id,
            from: msg.from,
            to: msg.to,
            text: msg.text ?? '',
            image: msg.image ?? null,
            type: msg.type ?? 'friend',
            productId: msg.productId ?? null,
            createdAt: this.getMessageDate(msg),
            state: msg.state ?? 'sent',
          });

          const peerId = (this.authId && normalized.from === this.authId)
            ? normalized.to
            : normalized.from;

          const peerKey = this.keyOf(peerId);
          const isIncoming = !this.authId || normalized.from !== this.authId;
          const shouldHighlight = this.isUnread(peerKey, normalized, isIncoming);

          const existingIdx = this.users.findIndex(u => this.keyOf(u) === peerKey);
          if (existingIdx !== -1) {
            const user = this.users[existingIdx];
            user.messages = [normalized, ...(user.messages || [])];
            user.hasUnread = shouldHighlight;
            const [moved] = this.users.splice(existingIdx, 1);
            this.users.unshift(moved);
            this.sortUsersByLatestMessage();
            this.cdr.markForCheck();
            this.scheduleListRefresh();
            return;
          }

          this.userService.getUserProfile(peerId).subscribe((profile: any) => {
            const idx2 = this.users.findIndex(u => this.keyOf(u) === peerKey);
            if (idx2 !== -1) {
              const user = this.users[idx2];
              user.messages = [normalized, ...(user.messages || [])];
              user.hasUnread = shouldHighlight;
              const [moved] = this.users.splice(idx2, 1);
              this.users.unshift(moved);
            } else {
              const user = new User().initialize({
                ...profile,
                _id: peerKey,
                id: peerKey,
                messages: [normalized],
              }) as ListUser;
              user.hasUnread = shouldHighlight;
              this.users.unshift(user);
            }
            this.sortUsersByLatestMessage();
            this.cdr.markForCheck();
            this.scheduleListRefresh();
          });
        } catch (e) {
          console.error('list/new-message error', e, raw);
        }
      });
    });

    // ✅ messageSent$ — update SENDER's conversation list when they send a message.
    // This mirrors the newMessage$ logic but always treats the recipient (msg.to) as the peer
    // and never marks it as unread (since it's our own outbound message).
    SocketService.messageSent$.pipe(takeUntil(this.destroy$)).subscribe((raw: any) => {
      this.zone.run(() => {
        try {
          const msg = this.extractSocketMessage(raw);

          const normalized = new Message().initialize({
            id: msg._id || msg.id,
            from: msg.from,
            to: msg.to,
            text: msg.text ?? '',
            image: msg.image ?? null,
            type: msg.type ?? 'friend',
            productId: msg.productId ?? null,
            createdAt: this.getMessageDate(msg),
            state: msg.state ?? 'sent',
          });

          // Prefer recipient for sent messages; fallback to the "other" id when payload shape varies.
          const fallbackPeer = this.authId
            ? (String(normalized.from) === String(this.authId) ? normalized.to : normalized.from)
            : (normalized.to || normalized.from);
          const peerKey = this.keyOf(fallbackPeer);

          const existingIdx = this.users.findIndex(u => this.keyOf(u) === peerKey);
          if (existingIdx !== -1) {
            const user = this.users[existingIdx];
            // Replace optimistic message or prepend confirmed one
            const tmpIdx = (user.messages || []).findIndex((m: any) =>
              m.id === (msg.tempId || normalized.id) || m.tempId === msg.tempId
            );
            if (tmpIdx !== -1) {
              user.messages[tmpIdx] = normalized;
            } else {
              user.messages = [normalized, ...(user.messages || [])];
            }
            user.hasUnread = false; // our own sent msg never marks unread
            const [moved] = this.users.splice(existingIdx, 1);
            this.users.unshift(moved);
            this.sortUsersByLatestMessage();
            this.cdr.markForCheck();
          } else {
            this.userService.getUserProfile(peerKey).subscribe((profile: any) => {
              const idx2 = this.users.findIndex(u => this.keyOf(u) === peerKey);
              if (idx2 !== -1) {
                const user = this.users[idx2];
                user.messages = [normalized, ...(user.messages || [])];
                user.hasUnread = false;
                const [moved] = this.users.splice(idx2, 1);
                this.users.unshift(moved);
              } else {
                const user = new User().initialize({
                  ...profile,
                  _id: peerKey,
                  id: peerKey,
                  messages: [normalized],
                }) as ListUser;
                user.hasUnread = false;
                this.users.unshift(user);
              }
              this.sortUsersByLatestMessage();
              this.cdr.markForCheck();
            });
          }
          this.scheduleListRefresh();
        } catch (e) {
          console.error('list/message-sent error', e, raw);
        }
      });
    });

    // Refresh cached user profiles when server notifies updates
    try {
      SocketService.userProfileUpdated$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
        try {
          const uid = payload?.userId;
          if (!uid) return;
          const idx = this.users.findIndex(u => this.keyOf(u) === String(uid));
          if (idx !== -1) {
            this.userService.getUserProfile(uid, { forceRefresh: true }).subscribe((p: any) => {
              if (p && p._id) {
                this.users[idx] = { ...(this.users[idx] as any), ...p } as ListUser;
                this.cdr.markForCheck();
              }
            }, () => {});
          }
        } catch (e) { console.warn('list component profile update handler', e); }
      });
    } catch (e) {}

    // Proactively refresh missed calls from service in case the stream hasn't emitted yet
    try {
      this.refreshMissedFromService();
    } catch (e) { console.warn('refreshMissedFromService failed', e); }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    try { this.missedSub?.unsubscribe(); } catch(e) {}
    try { if (this.listRefreshTimer) clearTimeout(this.listRefreshTimer); } catch (e) {}
  }

  private scheduleListRefresh() {
    try {
      if (this.listRefreshTimer) clearTimeout(this.listRefreshTimer);
      this.listRefreshTimer = setTimeout(() => {
        this.page = 0;
        this.getUsersMessages(null, true);
      }, 650);
    } catch (e) {}
  }

  private keyOf = (idOrUser: any) =>
    String(typeof idOrUser === 'object' ? (idOrUser._id || idOrUser.id) : idOrUser);

  // Template-friendly key getter
  public getKey(idOrUser: any) {
    return this.keyOf(idOrUser);
  }

  // Template helper to get missed count for a given user id/object
  public getMissedCountFor(idOrUser: any): number {
    const key = this.keyOf(idOrUser);
    return Number(this.missedMapLatest?.[key] || 0);
  }

  
  async initSocket() {
    await SocketService.initializeSocket();
    this.socket = await SocketService.getSocket();
    // new-message is now bound via SocketService.newMessage$ Observable (reconnect-safe)
  }

  private bindSocketListeners() { /* replaced by SocketService.newMessage$ Observable in ngOnInit */ }
  
  
  ionViewWillEnter() {
    // keep messages badge synchronized with current missed-calls count
    try {
      const missed = this.badges.getMissedCalls ? this.badges.getMissedCalls() : [];
      this.badges.set('messages', missed.length);
    } catch (e) {
      try { this.badges.set('messages', this.missedCalls?.length || 0); } catch(_) {}
    }
    this.page = 0;
    this.getUsersMessages(null, true);  // ✅ refresh = true

    // sync missed calls again when view appears
    try { this.refreshMissedFromService(); } catch(e) {}
  }

  // Ensure UI has a synchronous snapshot of missed calls (service-backed)
  private refreshMissedFromService() {
    try {
      const calls = this.badges.getMissedCalls ? this.badges.getMissedCalls() : this.webrtcService.getMissedCalls();
      const map: { [k: string]: number } = {};
      (calls || []).forEach((c: any) => {
        const id = String(c.userId || c.peerId || c.from || c.to || '');
        if (!id) return;
        // ignore self
        if (this.authId && id === String(this.authId)) return;
        map[this.keyOf(id)] = (map[this.keyOf(id)] || 0) + 1;
      });
      this.missedMapLatest = map;
      const total = Object.values(map).reduce((s, n) => s + Number(n || 0), 0);
      try { this.badges.set('messages', total); } catch(e) {}
      this.cdr.markForCheck();
    } catch (e) { console.warn('refreshMissedFromService error', e); }
  }

  trackByUserId = (_: number, u: ListUser) => (u._id || u.id);


  private loadLastReadMap() {
  try {
    this.lastReadAt = JSON.parse(localStorage.getItem(ListComponent.READ_KEY) || '{}');
  } catch {
    this.lastReadAt = {};
  }
}


private async presentMissedCallAlert(callerId: string, callerName: string, atISO: string) {
  let displayName = callerName;
  // If incoming payload didn't include a name, try to resolve it from the profile service
  if (!displayName || displayName === 'Unknown') {
    try {
      // userService.getUserProfile returns an Observable — convert to promise
      const profile: any = await this.userService.getUserProfile(callerId).toPromise();
      if (profile) {
        // prefer fullName or first+last
        displayName = profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || displayName;
      }
    } catch (e) {
      // ignore and fall back to callerName/Unknown
    }
  }

  const alert = await this.alertController.create({
    header: 'Missed call',
    message: `${displayName || 'Unknown'} tried to call you ${this.formatTimeAgo(atISO)}.`,
    buttons: [
      { text: 'Call back', handler: () => this.callBack(callerId) },
      { text: 'Dismiss', role: 'cancel' }
    ]
  });
  await alert.present();
}

private markLocallyRead(peerKey: string) {
  this.lastReadAt[peerKey] = Date.now();
  localStorage.setItem(ListComponent.READ_KEY, JSON.stringify(this.lastReadAt));
}

private isUnread(peerKey: string, lastMsg: Message, isIncoming: boolean): boolean {
  if (!lastMsg) return false;
  // If server gives unreadCount, prefer it (handled below). Otherwise use local last-read.
  const lastTs = new Date(lastMsg.createdAt).getTime();
  const readTs = this.lastReadAt[peerKey] || 0;
  return isIncoming && lastTs > readTs;
}
  
  /** ✅ Show Missed Calls */
// Update the showMissedCalls method in list.component.ts
async showMissedCalls() {
  const rawMissed = this.badges.getMissedCalls ? this.badges.getMissedCalls() : this.webrtcService.getMissedCalls();
  const missedCalls = await this.normalizeMissedCallsForModal(rawMissed || []);
  if (!missedCalls || missedCalls.length === 0) {
    const alert = await this.alertController.create({ header: 'No Missed Calls', message: 'You have no missed video calls.', buttons: ['OK'] });
    await alert.present();
    return;
  }

  const modal = await this.modalCtrl.create({
    component: (window as any).customElements && (window as any).customElements['app-missed-calls-modal'] ? 'app-missed-calls-modal' : (await import('./missed-calls-modal.component')).MissedCallsModalComponent,
    componentProps: { calls: missedCalls }
  });

  await modal.present();
  const { data } = await modal.onWillDismiss();
  if (data?.action === 'callback' && data.userId) {
    this.callBack(data.userId);
  } else if (data?.action === 'clearAll') {
    try { this.webrtcService.clearMissedCalls(); this.badges.reset('messages'); } catch(e) { this.webrtcService.clearMissedCalls(); }
  }

  }

  // Normalize different missed-call payload shapes into a consistent shape
  // used by the modal: { userId, userName, userAvatar, timestamp }
  private async normalizeMissedCallsForModal(calls: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const c of (calls || [])) {
      try {
        const userId = String(c.userId || c.peerId || c.from || c.to || '');
        if (!userId) continue;
        // ignore self
        if (this.authId && String(userId) === String(this.authId)) continue;

        let userName = c.userName || c.userName || c.name || c.user?.fullName || c.user?.firstName || c.user?.username;
        let userAvatar = c.userAvatar || c.avatar || c.user?.mainAvatar || c.user?.avatar;

        // If name missing, attempt to resolve synchronously via userService
        if (!userName || userName === 'Unknown') {
          try {
            const prof: any = await this.userService.getUserProfile(userId).toPromise();
            if (prof) {
              userName = prof.fullName || `${prof.firstName || ''} ${prof.lastName || ''}`.trim() || userName;
              userAvatar = userAvatar || prof.mainAvatar || prof.avatar;
            }
          } catch (e) { /* ignore */ }
        }

        out.push({
          userId,
          userName: userName || (`User ${userId.slice ? userId.slice(0,6) : userId}`),
          userAvatar: userAvatar || 'assets/images/default-avatar.png',
          timestamp: c.timestamp || c.at || new Date().toISOString()
        });
      } catch (e) { /* continue */ }
    }
    return out;
  }


// Add this helper method
private formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const callTime = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - callTime.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
}
  
  
  
  // ✅ Helper method to show remaining missed calls
  async showRemainingMissedCalls(remainingCalls: any[]) {
    const buttons: any[] = remainingCalls.map(call => ({
      text: `📞  ${call.userId} (${new Date(call.timestamp).toLocaleTimeString()})`,
      handler: () => {
        this.callBack(call.userId);
      }
    }));
  
    buttons.push({
      text: "Close",
      role: "cancel",
      handler: () => {
        this.webrtcService.clearMissedCalls();
      }
    });
  
    const alertElement = await this.alertController.create({
      header: "📞 More Missed Calls",
      message: `You have ${remainingCalls.length} more missed calls.`,
      buttons: buttons
    });
  
    await alertElement.present();
  }
  
  

  getUsersMessages(event?: any, refresh: boolean = false) {
    if (!event) this.pageLoading = true;
    if (refresh) this.page = 0;

    this.messageService.usersMessages(this.page++).then(
      (resp: any) => {
        this.pageLoading = false;
        if (refresh) this.users = [];

  (resp?.data?.users || []).forEach((usr: any) => {
          if (usr.messages && usr.messages.length > 0) {
            this.userService.getUserProfile(usr._id).subscribe((userProfile) => {
              const messages = usr.messages.map((message: any) =>
                new Message().initialize({
                  ...message,
                  createdAt: this.getMessageDate(message),
                  productId: message.type === 'product' ? message.productId : message.productId ?? null,
                })
              );
            
              const uid = this.keyOf(usr._id);
              const user = new User().initialize({
                ...userProfile,
                _id: uid,
                id: uid,
                messages,
                firstName: userProfile.firstName || usr.firstName,
                lastName: userProfile.lastName || usr.lastName,
                mainAvatar: userProfile.mainAvatar || usr.mainAvatar,
                avatar: userProfile.avatar?.length ? userProfile.avatar : usr.avatar,
              }) as ListUser;
            
              const last = messages?.[0];
              const isIncoming = !!last && !!this.authId && last.from !== this.authId;
              const hasServerUnread = Number.isFinite(usr.unreadCount);
              
              // ✅ prefer server unreadCount if provided, else fallback to local last-read logic
              user.hasUnread = hasServerUnread
                ? (usr.unreadCount > 0)
                : this.isUnread(uid, last, isIncoming);
                
              // ✅ replace-or-insert (dedupe)
              const idx = this.users.findIndex(u => this.keyOf(u) === uid);
              if (idx !== -1) {
                this.users[idx] = user;
                const [moved] = this.users.splice(idx, 1);
                this.users.unshift(moved);
              } else {
                this.users.unshift(user);
              }
            
              this.sortUsersByLatestMessage();
              this.cdr.markForCheck();
            });
            
          }
        });

        if (event) {
          event.target.complete();
          if (!resp?.data?.more && !refresh) event.target.disabled = true;
        }
        // ensure ordering once asynchronous profile fetches settle
        try {
          setTimeout(() => { this.sortUsersByLatestMessage(); try { this.cdr.markForCheck(); } catch(e){} }, 60);
        } catch (e) { try { this.cdr.markForCheck(); } catch(_) {} }
      },
      (err) => {
        this.pageLoading = false;
        if (event) event.target.complete();
        console.log(err);
        try { this.cdr.markForCheck(); } catch (e) {}
      }
    );
  }

  private isValidObjectId(id: string) { return /^[a-f\d]{24}$/i.test(id); }

  callBack(userId: string) {
    if (!this.isValidObjectId(userId)) {
      console.warn('Invalid userId for callback:', userId);
      return;
    }
    // Make sure no stale caller remains from a previous ring
    localStorage.removeItem('partnerId');
    this.router.navigate(['/messages/video', userId], { queryParams: { answer: false } });
  }
  

openThread(user: User) {
  (user as any).hasUnread = false;
  const peerKey = String(user._id || user.id);
  this.markLocallyRead(peerKey);  

  // Clear missed calls for this user
  try { this.webrtcService.removeMissedCallsFor(peerKey); } catch(e) {}

  // notify backend (optional, aligns with your ChatComponent)
  try {
    if (this.socket) {
      this.socket.emit('mark-thread-read', { peerId: user._id || user.id });
    }
  } catch {}

  const last = user.messages?.[0];
  const productId = last?.type === 'product' ? last?.productId : null;

  this.router.navigate(['/messages/chat', user.id], {
    queryParams: { productId }
  });
}

  // Sort users by the latest message timestamp (newest first)
  sortUsersByLatestMessage() {
    this.users.sort((a, b) => {
      const aTs = a.messages?.length ? this.getTimeFromMessage(a.messages[0]) : 0;
      const bTs = b.messages?.length ? this.getTimeFromMessage(b.messages[0]) : 0;
      return bTs - aTs;
    });
  }

  // Navigate to profile view (used by template CTA)
  public navigateToProfile() {
    try {
      this.router.navigate(['/tabs/profile']);
    } catch (e) {
      console.warn('navigateToProfile failed', e);
    }
  }


  // Remove a user and their messages
  async removeUser(user: User) {
    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: `Are you sure you want to delete the conversation with ${user.fullName}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          handler: () => {
            // Delete all messages for the user
            user.messages.forEach((message) => {
              this.messageService.deleteMessage(message.id).then(() => {
                console.log('Message deleted:', message.id);
              });
            });

            // Remove the user from the local list
            this.users = this.users.filter((u) => u._id !== user._id);
          },
        },
      ],
    });

    await alert.present();
  }
}