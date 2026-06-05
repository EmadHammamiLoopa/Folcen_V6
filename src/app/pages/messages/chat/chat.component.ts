import { Location } from '@angular/common';
import { ToastService } from './../../../services/toast.service';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { UploadFileService } from './../../../services/upload-file.service';
import { MessageService } from './../../../services/message.service';
import { User } from 'src/app/models/User';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { UserService } from './../../../services/user.service';
import { Message } from './../../../models/Message';
import { Camera } from '@ionic-native/camera/ngx';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonInfiniteScroll, Platform, AlertController, ModalController } from '@ionic/angular';
import { SocketService } from 'src/app/services/socket.service';
import { ProductService } from 'src/app/services/product.service';
import { environment } from 'src/environments/environment';
import { Product } from 'src/app/models/Product';
import { from, Subject, Observable } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { take, takeUntil, filter } from 'rxjs/operators';
import { File as IonicFile, FileEntry } from '@ionic-native/file/ngx';
import { FilePath } from '@ionic-native/file-path/ngx';
import { NgZone } from '@angular/core';
import { AppEventsService } from 'src/app/services/app-events.service';
import { WebrtcService } from 'src/app/services/webrtc.service';
import { IdService } from 'src/app/services/id.service';
import { ImageModalComponent } from 'src/app/components/image-modal/image-modal.component';
import { SessionStoreService } from 'src/app/services/session-store.service';



interface ImageFileObject {
  file: any;
  imageData: string;
}

// ⬇️  put this just above the class or anywhere in the file ­- it’s private to the module
const waitUntil = (cond: () => boolean, step = 100) =>
  new Promise<void>(res => {
    const t = setInterval(() => cond() && (clearInterval(t), res()), step);
  });

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})



export class ChatComponent implements OnInit {
  readonly features = environment.features;
  private destroy$ = new Subject<void>();
  videoCallDeclined = false;

  page = 0;
  resend: any[] = [];
  product!: Product;
  productId!: string;
inSession = true;
sessionStart = 0;

private loadingMessages = false;

  sentMessages = {};
  index = 0;
  private listenersBound = false;

  private lastLoadedPeerId: string | null = null;
  private relationshipChangedAt = 0;

  image: string | null = null;
  imageFile: ImageFileObject | null = null;
  messageText = "";
  private activityListeners: any[] = [];
  private lastActivityTime = Date.now();

  connected = false;
  @ViewChild('content') private content!: IonContent;
  @ViewChild('infScroll') private infScroll!: IonInfiniteScroll;

  messages: Message[] = [];
    groupedMessages: any[] = []; // For date grouping

  socket: any;
  user!: User;
  authUser!: User;
  pageLoading = false;
  private sendMessageCounter = 0;

  allowToChat = false;
  business = false;
  showMediaOptions: boolean = false;
activeVideoCall: { status: 'pending' | 'accepted' | 'cancelled' | 'rejected' | 'expired' | 'used' | null, messageId?: string } = { status: null };


  
  constructor(private camera: Camera, private userService: UserService, private route: ActivatedRoute,private sanitizer: DomSanitizer,
              private messageService: MessageService, private changeDetection: ChangeDetectorRef,
              private platform: Platform, private uploadFileService: UploadFileService, private webView: WebView,  private file: IonicFile,
              private filePath: FilePath,private zone: NgZone, private badges: AppEventsService,
              private toastService: ToastService, private location: Location, private router: Router, private productService: ProductService, 
              private alertController: AlertController, private modalCtrl: ModalController, private socketService: SocketService,
              private webRTC: WebrtcService, private idService: IdService, private sessionStore: SessionStoreService) {
                // Backwards-compatible alias: some files expect `webrtcService`
                (this as any).webrtcService = this.webRTC;
  }

  async openImage(url: string) {
    if (!url) return;
    try {
      const modal = await this.modalCtrl.create({
        component: ImageModalComponent,
        componentProps: { image: url },
        cssClass: 'image-fullscreen-modal'
      });
      await modal.present();
    } catch (e) {
      // fallback: open in new tab/window
      try { window.open(url, '_blank'); } catch (_) {}
    }
  }

ionViewWillLeave() {
  // Reset so re-entering this conversation always reloads messages from the server
  this.lastLoadedPeerId = null;
  this.teardownCallSession();
}


private teardownCallSession() {
  this.inSession = false;
  this.sessionStart = 0;
  this.activeVideoCall = { status: null, messageId: undefined };
  this.recomputeActiveCall();
  this.changeDetection.detectChanges();
}
isActionableCall(m: Message): boolean {
  return this.inSession
      && m.type === 'video-call-request'
      && m.status === 'pending'
      && this.isLatestCall(m);
}

isLatestCall(message: Message): boolean {
  const last = [...this.messages].filter(m => m.type === 'video-call-request').pop();
  return !!last && (last.id === message.id || (last as any)._id === (message as any)._id);
}
  ngOnInit() {
    console.log("ngOnInit called");
    
    this.userService.currentUser$
      .pipe(
        takeUntil(this.destroy$),
        filter(user => !!user)
      )
      .subscribe((user: User) => {
        this.authUser = user;
        this.applyFriendshipState();
        console.log('✅ Authenticated user (stream):', this.authUser);
        this.initializeSocket();
      });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params: ParamMap) => {
      let userIdRaw = params.get('id');
      if (userIdRaw) {
        try { userIdRaw = decodeURIComponent(userIdRaw); } catch(e) {}
        const normalized = this.idService.normalizeId(userIdRaw) || userIdRaw;
        console.log("User ID detected (raw/normalized):", userIdRaw, normalized);
        
        // ✅ Reset state for new user thread
        if (this.user?.id !== normalized) {
          this.messages = [];
          this.groupedMessages = [];
          this.page = 0;
          if (this.infScroll) this.infScroll.disabled = false;
        }

        this.getUserProfile(normalized, true);
        this.videoCallDeclined = false;
      }
    });
  
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      const productId = queryParams['productId'];
      if (productId) {
        console.log("Product ID detected:", productId);
        this.productId = productId;
        this.getProductDetails(productId);
      }
    });
    this.setupActivityTracking();

    // Refresh peer/auth profiles when notified by server
    try {
      // Re-bind socket listeners whenever SocketService reconnects.
      SocketService.connection$.pipe(takeUntil(this.destroy$)).subscribe(status => {
        try {
          if (status === 'connected' && (this.user?.id || this.authUser?.id)) {
            this.initializeSocket();
          }
        } catch (e) { console.warn('chat reconnect handler error', e); }
      });

      // Reconnect-safe message streams (bound once, survive socket-instance swaps).
      SocketService.newMessage$.pipe(takeUntil(this.destroy$)).subscribe((raw: any) => {
        this.zone.run(() => this.handleIncomingMessage(raw));
      });
      SocketService.messageSent$.pipe(takeUntil(this.destroy$)).subscribe((saved: any) => {
        this.zone.run(() => this.handleMessageSent(saved));
      });
      SocketService.messageRead$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
        this.zone.run(() => this.handleMessageRead(payload));
      });

      SocketService.sendMessageError$.pipe(takeUntil(this.destroy$)).subscribe((errPayload: any) => {
        this.zone.run(() => {
          const reason = errPayload?.reason || 'unknown';
          const map: Record<string, string> = {
            not_authenticated: 'Reconnecting… please try again.',
            invalid_format: 'Message is empty or malformed.',
            invalid_recipient_id: 'Unable to identify recipient.',
            user_not_found: 'Recipient account is unavailable.',
            blocked: 'You can no longer message this user.',
            privacy_blocked: 'You cannot message this private account yet.',
            rate_limited: 'You are sending too fast. Please wait a moment.',
            save_failed: 'Message could not be saved. Please try again.',
          };
          this.toastService.presentErrorToastr(map[reason] || `Send failed (${reason})`);
          // Mark the optimistic message as failed so user can retry.
          const tid = errPayload?.tempId;
          if (tid) {
            const i = this.messages.findIndex(m => m.tempId === tid || m.id === tid);
            if (i !== -1) {
              (this.messages[i] as any).state = 'failed';
              this.groupMessagesByDate();
              try { this.changeDetection.detectChanges(); } catch (_) {}
            }
          }
        });
      });

      SocketService.userProfileUpdated$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
        try {
          const uid = payload?.userId;
          if (!uid) return;
          // if it's the chat peer or the auth user, refresh
          const peerId = this.user && (this.user._id || this.user.id || this.user.id);
          const authId = this.authUser && (this.authUser._id || this.authUser.id);
          if (String(uid) === String(peerId)) {
            this.userService.getUserProfile(uid, { forceRefresh: true }).pipe(takeUntil(this.destroy$)).subscribe(u => {
              if (u && u._id) { this.user = u; this.changeDetection.detectChanges(); }
            }, () => {});
          }
          if (String(uid) === String(authId)) {
            // refresh current user observable
            this.userService.getUserProfile(uid, { forceRefresh: true }).pipe(takeUntil(this.destroy$)).subscribe(u => {
              if (u && u._id) this.userService.setCurrentUser(u);
            }, () => {});
          }
        } catch (e) { console.warn('chat profile update handler error', e); }
      });

      SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
        const peerId = String((this.user as any)?._id || this.user?.id || '');
        const changedUserId = String(payload?.userId || payload?.from || payload?.to || '');
        if (!peerId || (changedUserId && changedUserId !== peerId)) return;

        this.lastLoadedPeerId = null;
        this.relationshipChangedAt = Date.now();
        this.activeVideoCall = { status: null, messageId: undefined };
        if (this.authUser?.id) {
          this.userService.getUserProfile(this.authUser.id, { forceRefresh: true })
            .pipe(takeUntil(this.destroy$))
            .subscribe(u => {
              if (u && u._id) {
                this.userService.setCurrentUser(u, { force: true });
                this.authUser = u;
                this.applyFriendshipState();
              }
            }, () => {});
        }
        if (this.user?.id) this.getUserProfile(this.user.id, true);
      });
    } catch (e) {}
  }
  
  private async ensureRealId(m: Message, timeout = 5000): Promise<string|null> {
  if ((m as any)._id) return (m as any)._id;
  const start = Date.now();
  return new Promise(resolve => {
    const iv = setInterval(() => {
      const cur = this.messages.find(x => x.tempId === m.tempId || x.id === m.id);
      if (cur && (cur as any)._id) { clearInterval(iv); return resolve((cur as any)._id); }
      if (Date.now() - start > timeout) { clearInterval(iv); return resolve(null); }
    }, 100);
  });
}

  private setupActivityTracking() {
    // Remove any existing listeners first
    this.removeActivityListeners();
  
    // Track various user interactions
    const events = ['mousemove', 'scroll', 'click', 'keydown', 'touchstart'];
    
    events.forEach(event => {
      const handler = () => this.handleUserActivity();
      window.addEventListener(event, handler);
      this.activityListeners.push({ event, handler });
    });
  }
  
  private handleUserActivity() {
    this.lastActivityTime = Date.now();
    if (this.socket && this.socket.connected && this.user?.id) {
      this.socket.emit('user-activity', this.user.id);
    }
  }
  
  private removeActivityListeners() {
    this.activityListeners.forEach(({ event, handler }) => {
      window.removeEventListener(event, handler);
    });
    this.activityListeners = [];
  }
  
ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
  this.teardownCallSession();
  this.removeActivityListeners();
}

  ionViewWillEnter() {
    this.inSession = true;
    this.sessionStart = Date.now();
    this.activeVideoCall = { status: null, messageId: undefined }
    
    // Reload messages every time the view becomes active so the user always sees
    // the latest conversation state (handles messages sent while they were away).
    if (this.user?.id) {
      this.page = 0;
      this.messages = [];
      this.groupedMessages = [];
      this.getUserProfile(this.user.id, true);
    }

    console.log("ionViewWillEnter called");
    // Do not reset global messages badge when entering a chat thread —
    // clearing should be handled by markThreadRead() so we only clear per-user counts.
  }
  
  toggleMediaOptions() {
    this.showMediaOptions = !this.showMediaOptions;
  }

  private markThreadRead() {
    // Only clear badges when user is actively viewing this chat.
    // If they navigated away (inSession=false), the socket listener is still
    // alive but should not touch the tab badge — tabs.page.ts owns that.
    if (!this.inSession) return;

    if (this.socket?.connected && this.user?.id) {
      this.socket.emit('mark-thread-read', { peerId: this.user.id });
    }
    // Keep missed calls visible in the calls/missed-call UI until the user clears them there.
    try {
      const remaining = (this.badges.getMissedCalls && typeof this.badges.getMissedCalls === 'function') ? this.badges.getMissedCalls() : this.webRTC.getMissedCalls();
      const count = Array.isArray(remaining) ? remaining.length : 0;
      if (this.badges && typeof this.badges.set === 'function') this.badges.set('messages', count);
    } catch(e) {
      try { if (this.badges && typeof this.badges.set === 'function') this.badges.set('messages', (this.webRTC.getMissedCalls() || []).length || 0); } catch(_) {}
    }
  }

  getProductDetails(productId: string, event?: any) {
    if (!event) this.pageLoading = true;
    this.productService.get(productId).then(
      (resp: any) => {
        this.pageLoading = false;
        // Use safe fallback in case API returns raw object or wrapped in { data }
        this.product = new Product().initialize(resp?.data ?? resp);
        if (event) event.target.complete();
      },
      err => {
        this.pageLoading = false;
        if (event) event.target.complete();
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  goBack() {
    this.location.back();
  }

  isAdminChat(): boolean {
    if (!this.user) return false;
    const role = (this.user.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }
  
  openMenu() {
    console.log('Menu opened'); // You can implement real menu later if needed
  }

  
async acceptVideoCall(message: Message) {
  (message as any)['busy'] = true;
  const realId = await this.ensureRealId(message);
  if (!realId) { (message as any)['busy'] = false; return this.toastService.presentErrorToastr('Still preparing… try again'); }

  const other = message.from === this.authUser.id ? message.to : message.from;
  this.socket.emit('video-call-accepted', {
    from: this.authUser.id,
    to: other,
    messageId: realId,
    status: 'accepted'
  });
}

async cancelVideoCallRequest(message: Message) {
  (message as any)['busy'] = true;
  const realId = await this.ensureRealId(message);
  if (!realId) { (message as any)['busy'] = false; return this.toastService.presentErrorToastr('Still preparing… try again'); }

  const other = message.from === this.authUser.id ? message.to : message.from;
  const status = message.from === this.authUser.id ? 'cancelled' : 'rejected';
  const reason = status === 'rejected' ? 'rejected' : 'cancel';
  this.socket.emit('video-call-cancelled', {
    from: this.authUser.id,
    to: other,
    messageId: realId,
    status,
    reason
  });

  // This is a chat/video-request state change only. Do not emit real-call
  // cleanup events here; those create missed-call entries for request rejects.
}


  
  formatLastSeen(lastActive: Date): string {
    if (!lastActive) return 'unknown';
    const now = new Date();
    const diffMs = now.getTime() - new Date(lastActive).getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  }

  getAuthUser() {
    this.pageLoading = true;
    (async () => {
      try {
        const user = await this.sessionStore.init();
        if (user) {
          this.authUser = user;
          console.log('✅ Authenticated user (session store):', this.authUser);
          // Initialize socket; route paramMap subscription will load the recipient profile
          this.initializeSocket();
          return;
        }
        console.error('❌ No authenticated user available');
        this.handleUserInitError();
      } catch (err) {
        console.error('❌ Failed to initialize auth user from session store', err);
        this.handleUserInitError();
      }
    })();
  }
  


  handleUserInitError() {
    this.pageLoading = false;
    this.router.navigate(['/auth/signin']);
  }


getUserProfile(userId: string, forceRefresh = false) {
  if (!userId) { this.pageLoading = false; return; }

  // Avoid duplicate fetches for the same peer during a single view session
  if (!forceRefresh && this.lastLoadedPeerId === userId && this.user?.id === userId) {
    this.pageLoading = false;
    return;
  }
  this.lastLoadedPeerId = userId;

  console.log('Fetching profile for user ID:', userId);
  this.userService.getUserProfile(userId, { forceRefresh }).subscribe(
    async (resp: any) => {
      const raw = resp?.data ?? resp;

      // 🚫 Guard: backend accidentally returned self
      if (raw?.id === this.authUser?.id && userId !== this.authUser.id) {
        console.warn('⚠️ Backend returned self instead of friend, skipping.');
        this.pageLoading = false;
        this.toastService.presentErrorToastr('Sorry, this user is not available');
        return this.location.back();
      }

      if (!raw) {
        this.pageLoading = false;
        this.toastService.presentErrorToastr('Sorry, this user is not available');
        return this.location.back();
      }

      const freshUser = new User().initialize(raw);
      const wasFriend = !!this.user?.isFriend;
      this.user = freshUser;
      this.applyFriendshipState();
      if (wasFriend && !this.user.isFriend) {
        this.activeVideoCall = { status: null, messageId: undefined };
      }
      console.log('Recipient stored:', this.user);

      await waitUntil(() => !!this.authUser?.id);

      // ✅ Always fetch messages to ensure history is loaded, but clear cache first
      // to avoid showing stale data if a message was just sent from another view.
      this.messageService.clearCacheForThread(this.user.id);
      await this.getMessages();
    },
    err => {
      this.pageLoading = false;

      if (err.status === 403 || err.status === 404) {
        this.toastService.presentErrorToastr('This user is not available anymore');
        return this.location.back();
      }

      this.toastService.presentErrorToastr('Error loading user profile');
      this.location.back();
    }
  );
}


  
  
  
async initializeSocket() {
  try {
    await SocketService.initializeSocket();
    this.socket = await SocketService.getSocket();

    // (Optional but safe/idempotent) ensure the server binds this socket to the JWT user
    SocketService.bindToAuthUser();

    // Force re-bind on every (re)connect — the underlying socket instance may have
    // been replaced by SocketService after a reconnect, leaving stale listeners.
    this.listenersBound = false;
    this.initSocketListeners();
  } catch (error) {
    console.error("❌ Socket initialization failed:", error);
    setTimeout(() => this.initializeSocket(), 5000);
  }
}
  
  


  getUser(id: string) {
    this.getUserProfile(id);
  }


// Group messages by date
groupMessagesByDate() {
  const grouped: any[] = [];
  let currentDate: string | null = null;
  let currentGroup: any = null;

  // Sort messages by date (oldest first)
  const sortedMessages = [...this.messages].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  sortedMessages.forEach(message => {
    const messageDate = this.formatMessageDate(message.createdAt);
    
    if (messageDate !== currentDate) {
      currentGroup = {
        date: messageDate,
        messages: []
      };
      grouped.push(currentGroup);
      currentDate = messageDate;
    }
    
    currentGroup.messages.push(message);
  });

  this.groupedMessages = grouped;
  this.changeDetection.detectChanges();
}

// Format date for grouping
formatMessageDate(date: Date | string): string {
  if (!date) return 'Unknown Date';
  const messageDate = new Date(date);
  if (isNaN(messageDate.getTime())) return 'Unknown Date';
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Reset time parts for comparison
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);
  messageDate.setHours(0, 0, 0, 0);

  if (messageDate.getTime() === today.getTime()) {
    return 'Today';
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    return messageDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
}

// Format time for display
formatMessageTime(date: Date | string): string {
  if (!date) return '—';
  // Accept Date objects, ISO strings, or numeric timestamps
  let d: Date;
  try {
    if (date instanceof Date) d = date as Date;
    else if (!isNaN(Number(date))) d = new Date(Number(date));
    else d = new Date(String(date));
  } catch (e) {
    return '—';
  }
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Derive a date from a Mongo ObjectId string (first 8 hex chars are seconds)
private dateFromObjectId(id: string): Date | null {
  try {
    if (!id || typeof id !== 'string') return null;
    if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
    const secs = parseInt(id.slice(0, 8), 16);
    if (isNaN(secs)) return null;
    return new Date(secs * 1000);
  } catch (e) { return null; }
}

// Normalize messages: if a message has a createdAt very close to 'now' (likely set locally),
// but the message id encodes an older timestamp, replace createdAt with the id-derived time.
private normalizeMessagesTimestamps(): void {
  try {
    const now = Date.now();
    for (const m of this.messages) {
      try {
        const id = (m as any).id || (m as any)._id;
        const created = m.createdAt instanceof Date ? m.createdAt.getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : 0);
        // if createdAt is within 5s of now, it's probably a local placeholder
        if (created && Math.abs(now - created) < 5000 && id) {
          const derived = this.dateFromObjectId(String(id));
          if (derived) {
            m.createdAt = derived;
          }
        }
      } catch (_) {}
    }
  } catch (e) { console.warn('normalizeMessagesTimestamps failed', e); }
}

  // Scroll to bottom when new messages arrive
  scrollToBottom() {
    setTimeout(() => {
      this.content.scrollToBottom(300);
    }, 100);
  }

async getMessages(event?: any) {
  if (this.loadingMessages) {
    event?.target?.complete?.();
    return;
  }

  this.loadingMessages = true;
  if (!event) this.pageLoading = true;

  try {
    if (!this.socket && this.user?.id) {
      this.initializeSocket().catch(e => console.warn('Socket warmup failed while loading messages', e));
    }

    const resp: any = await this.messageService.indexMessages(this.user?.id || this.productId, this.page++);

    if (resp?.data?.messages?.length) {
      const newMessages = (resp?.data?.messages || []).map((m: any) => {
        if (m.image && typeof m.image === 'object' && m.image.path) m.image = m.image.path;
        return new Message().initialize(m);
      });

      const seen = new Set(this.messages.map(m => m.id));
      newMessages.forEach((m: any) => { if (!seen.has(m.id)) this.messages.unshift(m); });

      if (this.page === 1) this.markThreadRead();
      // Normalize timestamps derived from ObjectIds for messages that lacked createdAt
      try { this.normalizeMessagesTimestamps(); } catch(_) {}
      this.groupMessagesByDate();
      this.recomputeActiveCall();
  if (!resp?.data?.more && this.infScroll) this.infScroll.disabled = true;
    }
  } catch (err) {
    console.error('❌ getMessages error:', err);
    this.toastService.presentErrorToastr('Failed to load messages');
  } finally {
    this.loadingMessages = false;   // ✅ always release lock
    this.pageLoading = false;       // ✅ always hide overlay
    event?.target?.complete?.();
    // Ensure the UI updates immediately (clears loader / refreshes groupedMessages)
    try { this.changeDetection.detectChanges(); } catch (e) { /* ignore */ }
  }
}

  
  
  
  
  
  isProductMessage(message: Message): boolean {
    return message.type === 'product';
  }
  


// helper: recompute the header state, but ignore calls from earlier sessions
private recomputeActiveCall() {
  const last = [...this.messages]
    .filter(m => {
      if (m.type !== 'video-call-request') return false;
      const status = String(m.status || 'pending');
      if (!['pending', 'accepted'].includes(status)) return false;
      if (status === 'accepted') {
        const created = m.createdAt ? +new Date(m.createdAt) : 0;
        if (created && Date.now() - created > 15 * 60 * 1000) return false;
      }
      if (!this.user?.isFriend && this.relationshipChangedAt) {
        const created = m.createdAt ? +new Date(m.createdAt) : 0;
        if (created && created < this.relationshipChangedAt) return false;
      }
      return true;
    })
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .pop();

  if (!last) {
    this.activeVideoCall = { status: null, messageId: undefined };
    return;
  }

  this.activeVideoCall = {
    status: (last.status as any) ?? 'pending',
    messageId: last.id
  };
}

private applyFriendshipState() {
  if (!this.user) return;
  const peerId = this.idOf(this.user);
  const authId = this.idOf(this.authUser);
  if (!peerId || !authId) return;

  const myFriends = Array.isArray(this.authUser?.friends) ? this.authUser.friends : null;
  const localSaysFriend = myFriends
    ? myFriends.some((friend: any) => String(this.idOf(friend)) === String(peerId))
    : undefined;

  const resolved = localSaysFriend === undefined ? !!this.user.isFriend : !!localSaysFriend;
  this.user.isFriend = resolved;
  this.user.friend = resolved;
  if (!resolved) {
    this.activeVideoCall = { status: null, messageId: undefined };
  }
}

private idOf(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value._id || value.id || '');
}




  

  private normalizeMessagePayload = (m: any): Message => {
    const copy: any = { ...m };
    copy.id = copy.id || copy._id || `${copy.from}-${copy.to}-${copy.createdAt || Date.now()}`;
    copy.tempId = copy.tempId ?? m.tempId;
    copy.createdAt = copy.createdAt ? new Date(copy.createdAt) : null;
    if (copy.image && typeof copy.image === 'object' && copy.image.path) {
      copy.image = copy.image.path;
    }
    if (copy.type !== 'video-call-request') copy.status = null;
    return new Message().initialize(copy);
  };

  private handleIncomingMessage(raw: any) {
    try {
      if (typeof raw === 'string') raw = JSON.parse(raw);
      const msg = this.normalizeMessagePayload(raw);
      const fromStr = String(msg.from || '');
      const toStr   = String(msg.to   || '');
      const peerId  = String((this.user as any)?._id || this.user?.id || '');
      const selfId  = String((this.authUser as any)?._id || this.authUser?.id || '');
      const relevant = (fromStr === peerId && toStr === selfId)
                    || (fromStr === selfId && toStr === peerId);
      if (!relevant) return;
      if (this.user) {
        this.markThreadRead();
        this.messageService.clearCacheForThread(this.user.id);
      }
      if (this.messages.some(m => m.id === msg.id)) return;
      this.messages.push(msg);
      try { this.normalizeMessagesTimestamps(); } catch (_) {}
      if (msg.type === 'video-call-request') this.recomputeActiveCall();
      this.groupMessagesByDate();
      this.scrollToBottom();
    } catch (e) {
      console.error('Failed to process incoming message:', e, raw);
    }
  }

  private handleMessageSent(saved: any) {
    try {
      const fromStr = String(saved?.from || '');
      const toStr   = String(saved?.to   || '');
      const peerId  = String((this.user as any)?._id || this.user?.id || '');
      const selfId  = String((this.authUser as any)?._id || this.authUser?.id || '');
      const relevant = (fromStr === peerId && toStr === selfId)
                    || (fromStr === selfId && toStr === peerId);
      if (!relevant) return;
      const msg = this.normalizeMessagePayload({
        ...saved,
        id: saved._id || saved.id,
        _id: saved._id || saved.id,
        state: 'sent'
      });
      if (saved.tempId) {
        const i = this.messages.findIndex(m => m.id === saved.tempId || m.tempId === saved.tempId);
        if (i !== -1) this.messages[i] = msg; else this.messages.push(msg);
      } else {
        const idx = this.messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) this.messages[idx] = msg; else this.messages.push(msg);
      }
      if (msg.type === 'video-call-request') this.recomputeActiveCall();
      try { this.normalizeMessagesTimestamps(); } catch (_) {}
      this.groupMessagesByDate();
      this.changeDetection.detectChanges();
    } catch (e) {
      console.error('Failed to process message-sent:', e, saved);
    }
  }

  private handleMessageRead(payload: any) {
    try {
      const readerId = String(payload?.readerId || '');
      const selfId = String((this.authUser as any)?._id || this.authUser?.id || '');
      const peerId = String((this.user as any)?._id || this.user?.id || '');
      if (!readerId || readerId !== peerId) return;

      let changed = false;
      this.messages.forEach((m: any) => {
        if (String(m.from || '') === selfId && String(m.to || '') === readerId && m.state === 'sent') {
          m.state = 'seen';
          changed = true;
        }
      });

      if (changed) {
        this.groupMessagesByDate();
        this.changeDetection.detectChanges();
      }
    } catch (e) {
      console.error('Failed to process message-read:', e, payload);
    }
  }

  getFriendInfo(friendId: string) {
    this.userService.getUserProfile(friendId)
      .subscribe(
        (resp: any) => {
          // Process friend info here
          console.log('Friend info:', resp);
        },
        err => {
          this.toastService.presentErrorToastr('Error fetching friend info');
        }
      );
  }

  checkMessageExisting(message: any) {
    return this.messages.find(msg => msg.id == message._id) ? true : false;
  }

  initSocketListeners() {
    if (!this.socket) {
      console.error("❌ WebSocket not initialized.");
      return;
    }
    if (this.listenersBound) return;  // already bound on this socket instance
    this.listenersBound = true;

    // Only re-bind video-* listeners (new-message/message-sent are handled by
    // SocketService.newMessage$/messageSent$ in ngOnInit). We must NOT call
    // socket.off('new-message') here — it would kill the SocketService bridge.
    try {
      this.socket.off('video-session-reset');
      this.socket.off('video-call-accepted');
      this.socket.off('video-call-used');
      this.socket.off('video-call-cancelled');
    } catch (_) {}

    const normalize = this.normalizeMessagePayload;


  this.socket.on('video-session-reset', () => {
    this.zone.run(() => {
      this.messages.forEach(m => {
        if (m.type === 'video-call-request' && m.status === 'pending') {
          m.status = 'cancelled';
          (m as any).busy = false;
        }
      });
      this.recomputeActiveCall();
      this.changeDetection.detectChanges();
    });
  });



// in accepted/cancelled listeners:
this.socket.on('video-call-accepted', (data: any) => {
  this.zone.run(() => {
    const msg = this.messages.find(m => m.id === data.messageId || m.tempId === data.messageId);
    if (msg) {
      msg.status = 'accepted';
      (msg as any)['busy'] = false;
      this.recomputeActiveCall();
      this.groupMessagesByDate();
      this.recomputeActiveCall(); // <— add here too

      this.changeDetection.detectChanges();
    }
  });
});

this.socket.on('video-call-used', (data: any) => {
  this.zone.run(() => {
    const msg = this.messages.find(m => m.id === data.messageId || m.tempId === data.messageId);
    if (msg) {
      msg.status = 'used';
      (msg as any)['busy'] = false;
      this.recomputeActiveCall();
      this.groupMessagesByDate();
      this.changeDetection.detectChanges();
    }
  });
});

this.socket.on('video-call-cancelled', (data: any) => {
  this.zone.run(() => {
    const msg = this.messages.find(m => m.id === data.messageId || m.tempId === data.messageId);
    if (msg) {
      msg.status = 'cancelled';
      (msg as any)['busy'] = false;
      this.recomputeActiveCall();
      this.groupMessagesByDate();
      this.changeDetection.detectChanges();
    }
  });
});

  // Canonical/legacy cancel events: ensure UI updates immediately
  const handleCanceledEvent = (data: any) => {
    this.zone.run(() => {
      try {
        // normalize: payload can be simple id or object
        const messageId = data?.messageId || data?.id || data;
        const from = data?.from || data?.callerId || null;

        // find the message and mark cancelled if pending
        const msg = this.messages.find(m => m.id === messageId || m.tempId === messageId || (m.type === 'video-call-request' && ((m as any).from === from || (m as any).to === from) && m.status === 'pending'));
        if (msg) {
          msg.status = 'cancelled';
          (msg as any).busy = false;
          this.recomputeActiveCall();
          this.groupMessagesByDate();
          this.changeDetection.detectChanges();

          // If I'm the callee and this is a cancel/timeout, register missed call immediately
          const toId = data?.to || data?.calleeId || null;
          const reason = data?.reason || data?.type || null;
          if (toId && this.authUser && toId === this.authUser.id && (reason === 'cancel' || reason === 'timeout' || reason === 'video-canceled')) {
            try { this.webRTC.addMissedCallFromSignaling(data, this.authUser.id); } catch(e) { console.warn('missed-call registration failed', e); }
          }

          return;
        }

        // No matching message found: as a fallback, if the last call is pending, cancel it
        const lastCall = [...this.messages].filter(m => m.type === 'video-call-request').pop();
        if (lastCall && lastCall.status === 'pending') {
          lastCall.status = 'cancelled';
          (lastCall as any).busy = false;
          this.recomputeActiveCall();
          this.groupMessagesByDate();
          this.changeDetection.detectChanges();

          const toId = data?.to || data?.calleeId || null;
          const reason = data?.reason || data?.type || null;
          if (toId && this.authUser && toId === this.authUser.id && (reason === 'cancel' || reason === 'timeout' || reason === 'video-canceled')) {
            try { this.webRTC.addMissedCallFromSignaling(data, this.authUser.id); } catch(e) { console.warn('missed-call registration failed', e); }
          }
        }
      } catch (e) {
        console.warn('handleCanceledEvent failed', e, data);
      }
    });
  };

  this.socket.on('video-canceled', handleCanceledEvent);
  this.socket.on('cancel-video', handleCanceledEvent);






  
    this.socket.on('user-status-changed', (data: any) => {
      this.zone.run(() => {
        const userId = data?.userId ?? data?.user?.id ?? data?.id;
        if (userId && this.user?.id === userId) {
          this.user.online = !!data.online;
          // reassign to trigger change detection in some templates
          this.user = Object.assign(new User(), this.user);
          this.changeDetection.detectChanges();
        }
      });
    });
  


  }

getLatestVideoCallStatus(): string | null {
  const calls = this.messages.filter(m => m.type === 'video-call-request');
  if (!calls.length) return null;
  return calls[calls.length - 1].status ?? null; // last call's status
}

hasAcceptedCall(): boolean {
  return this.getLatestVideoCallStatus() === 'accepted';
}

hasPendingCall(): boolean {
  return this.getLatestVideoCallStatus() === 'pending';
}

hasCancelledCall(): boolean {
  return this.getLatestVideoCallStatus() === 'cancelled';
}



onVideoButtonPressed() {
  // friends go straight to call UI
  if (this.user?.isFriend) {
    return this.router.navigateByUrl('/messages/video/' + this.user.id);
  }

  if (this.user?.allowVideoRequestsFromNonFriends === false) {
    return this.toastService.presentErrorToastr(`${this.user?.fullName || 'This user'} is not accepting video requests from non-friends.`);
  }

  // non-friends:
  if (this.activeVideoCall.status === 'accepted') {
    // already accepted -> consume the one-time approval and jump to call UI
    if (this.activeVideoCall.messageId && this.socket?.connected) {
      this.socket.emit('video-call-used', { messageId: this.activeVideoCall.messageId });
      const msg = this.messages.find(m => m.id === this.activeVideoCall.messageId || m.tempId === this.activeVideoCall.messageId);
      if (msg) {
        msg.status = 'used';
        this.recomputeActiveCall();
        this.groupMessagesByDate();
      }
    }
    return this.router.navigate(['/messages/video', this.user.id], {
      queryParams: { videoRequestId: this.activeVideoCall.messageId }
    });
  }

  if (this.activeVideoCall.status === 'pending') {
    return this.toastService.presentSuccessToastr(`Waiting for ${this.user?.fullName || 'this user'} to accept your one-time video request.`);
  }

  // no active request -> open confirm and send a request
  this.requestVideoCall();
}

private handleIncomingVideoCall(message: Message) {
  if (message.from === this.authUser.id) return; // ignore my own

  // Already pushed by server? don’t duplicate
  if (!this.messages.some(m => m.id === message.id || m.tempId === message.id)) {
    this.messages.push(message);
  }

  this.groupMessagesByDate();
  this.scrollToBottom();
}

   
  

  resendMessage(message: any) {
    this.resend.push(message.id);
    this.sendMessage(message);
  }

  getChatPermission() {
    return new Promise((resolve, reject) => {
      this.messageService.getPermission(this.user.id)
        .then(
          (resp: any) => {
            if (resp?.data) {
              resolve(true); // Permission granted
            } else {
              // Assuming the response includes details about how many chats have been used and the daily limit
              const usedChats = resp?.data?.usedChats || 0;
              const totalChats = resp?.data?.totalChats || 3; // Assuming 3 is the daily free chat limit
              this.showSubscriptionAlert(usedChats, totalChats); // Show the alert with details
              reject(false);
            }
          },
          err => {
            this.toastService.presentErrorToastr(err);
            reject(false);
          }
        );
    });
}


async showSubscriptionAlert(usedChats = 0, totalChats = 3) {
  const remainingChats = totalChats - usedChats;
  const alert = await this.alertController.create({
    header: 'Free Chat Limit Reached',
    message: `You have used ${usedChats} out of ${totalChats} free chats today. Subscribe for unlimited chats.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Subscribe Now',
        cssClass: 'text-danger',
        handler: () => this.router.navigateByUrl('/tabs/subscription'),
      }
    ]
  });

  await alert.present();
}


private async compressImage(base64Image: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
  });
}

private async uploadImageAndGetUrl(): Promise<string | null> {
  try {
    if (!this.imageFile?.file) return null;

    const uploadResponse = await this.uploadFileService.upload(this.imageFile.file, this.authUser.id)
      .pipe(take(1))
      .toPromise();

    let fileUrl = uploadResponse?.fileUrl || null;
    // Ensure HTTPS — Railway terminates SSL at the proxy; internal req.protocol may be 'http'
    if (fileUrl && fileUrl.startsWith('http://')) {
      fileUrl = fileUrl.replace('http://', 'https://');
    }
    return fileUrl;
  } catch (error) {
    console.error('Image upload failed:', error);
    this.toastService.presentErrorToastr('Failed to upload image');
    return null;
  }
}



private dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

private dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

sanitizeImageUrl(url: string): SafeUrl {
  return this.sanitizer.bypassSecurityTrustUrl(url);
}


async sendMessage(message: any /*, ind?: number */): Promise<boolean> {
  // Resolve canonical recipient ObjectId hex. Backend rejects non-ObjectId silently,
  // so a Base64-encoded route id would otherwise drop the message with no feedback.
  const objectIdHex = /^[a-f0-9]{24}$/i;
  const rawTo = (this.user as any)?._id || this.user?.id;
  const rawFrom = (this.authUser as any)?._id || this.authUser?.id;
  const toId = objectIdHex.test(String(rawTo)) ? String(rawTo) : (this.idService.normalizeId(String(rawTo)) || String(rawTo));
  const fromId = objectIdHex.test(String(rawFrom)) ? String(rawFrom) : (this.idService.normalizeId(String(rawFrom)) || String(rawFrom));
  if (!objectIdHex.test(toId) || !objectIdHex.test(fromId)) {
    console.error('[chat.sendMessage] Invalid ObjectId(s)', { rawFrom, rawTo, fromId, toId });
    this.toastService.presentErrorToastr('Unable to send: invalid recipient id.');
    return false;
  }

  // Build final payload (trust message.image which was uploaded in addMessage)
  const payload = {
    id: message.id,
    tempId: message.tempId,
    from: fromId,
    to: toId,
    text: message.text ?? '',
    state: 'sending',
    image: message.image ?? null,
    type: message.type || (this.productId ? 'product' : 'friend'),
    productId: message.productId ?? this.productId ?? null,
    createdAt: message.createdAt ?? null,
  };

  // Update local temp message immediately
  const idx = this.messages.findIndex(m => m.id === message.id);
  if (idx !== -1) {
    this.messages[idx] = new Message().initialize(payload);
    this.groupMessagesByDate();
  }

  // Persist first; realtime delivery is handled by the backend after save.
  try {
    const resp: any = await this.messageService.sendMessage(payload);
    const saved = resp?.data ?? resp;
    this.handleMessageSent({ ...saved, tempId: payload.tempId });
    this.messageService.clearCacheForThread(this.user.id);
    return true;
  } catch (err: any) {
    const i = this.messages.findIndex(m => m.tempId === payload.tempId || m.id === payload.tempId);
    if (i !== -1) {
      (this.messages[i] as any).state = 'failed';
      this.groupMessagesByDate();
      try { this.changeDetection.detectChanges(); } catch (_) {}
    }
    this.toastService.presentErrorToastr(err?.error?.message || err?.message || 'Message could not be saved. Please try again.');
    return false;
  }
}






async addMessage() {
  if (!this.messageText && !this.image) return;

  // Enforce "reply-first" for non-friends: allow the first outgoing message, but
  // require the recipient to reply before sending further messages.
  if (!this.conversationStarted()) {
    // Provide user feedback instead of silently clearing the input
    const name = this.user?.fullName || 'the user';
    this.toastService.presentErrorToastr(`Please wait for ${name} to reply before sending more messages.`);
    return;
  }

  try {
    if (this.features.premiumTier) {
      await this.getChatPermission();
    }

    const tempId = Date.now().toString();
    
    // ✅ STEP 1: Upload the image FIRST
    let imageUrl = null;
    if (this.imageFile?.file) {
      imageUrl = await this.uploadImageAndGetUrl();
      if (!imageUrl) return;
    }

    // ✅ STEP 2: Create final message with real image URL
    const message = {
      id: tempId,
      tempId,
      from: this.authUser.id,
      to: this.user.id,
      text: this.messageText,
      state: 'sending',
      image: imageUrl,  // Now it’s a string URL, not SafeUrl
      type: this.productId ? 'product' : 'friend',
      productId: this.productId || null,
      createdAt: new Date()
    };

    // ✅ STEP 3: Show message immediately in chat
    this.messages.push(new Message().initialize(message));
    this.groupMessagesByDate();
    this.scrollToBottom();

    // ✅ STEP 4: Send message via socket
    const sendSuccess = await this.sendMessage({ ...message, tempId });
    if (sendSuccess) {
      // ✅ STEP 5: Clear form
      this.messageText = "";
      this.image = null;
      this.imageFile = null;
    }

  } catch (err) {
    if (err && this.features.premiumTier) this.router.navigate(['/tabs/subscription']);
  }
}


removeImage() {
  this.image = null;
  this.imageFile = null;
}


async pickMedia(mediaType: 'image' | 'video') {
  try {
    if (this.platform.is('cordova')) {
      // Use takePicture (handles fetch + File-plugin fallback + proper MIME type)
      const resp = await this.uploadFileService.takePicture(
        this.camera.PictureSourceType.PHOTOLIBRARY,
        mediaType
      );
      if (!resp?.file) {
        this.toastService.presentErrorToastr('Could not read the selected file. Please try again.');
        return;
      }
      const previewUrl = this.webView.convertFileSrc(resp.imageData);
      this.imageFile = { file: resp.file, imageData: resp.imageData };
      this.image = this.sanitizeImageUrl(previewUrl) as string;
      this.changeDetection.detectChanges();

    } else {
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = mediaType === 'image' ? 'image/*' : 'video/*';
      input.onchange = () => {
        const file = input.files![0];
        if (file) {
          const objectUrl = URL.createObjectURL(file);
          this.imageFile = { file, imageData: objectUrl };
          this.image = this.sanitizeImageUrl(objectUrl) as string;
          
        }
      };
      input.click();
    }

  } catch (err) {
    console.error('Error capturing media:', err);
    this.toastService.presentErrorToastr('Failed to capture media');
  }
}




// Helper function to convert base64 into File object
private convertBase64ToFile(base64String: string, filename: string): File {
  const arr = base64String.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new File([u8arr], filename, { type: mime });
}



allowToShowDate(ind: number): boolean {
  if (ind === 0) return true;

  const toYMD = (d: any) => {
    const dt = new Date(d);
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${dt.getFullYear()}-${m}-${day}`;
  };

  return toYMD(this.messages[ind].createdAt) !== toYMD(this.messages[ind - 1].createdAt);
}


  conversationStarted() {
    if (this.user && this.user.isFriend) return true;

    if (!this.messages || this.messages.length === 0) return true;

    const normalMessages = this.messages
      .filter(m => m.type !== 'video-call-request')
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

    if (!normalMessages.length) return true;

    const last = normalMessages[normalMessages.length - 1];
    return !last.isMine(this.authUser.id);
  }

// Modify ProfileEnabled to always return true
ProfileEnabled() {
  return true;  // Allow profile viewing without restrictions
}

showUserProfile() {
  // Since ProfileEnabled now always returns true, you don't need the else case anymore
  this.router.navigateByUrl('/tabs/profile/display/' + this.user.id);
}

showUproduct() {
  // Since ProfileEnabled now always returns true, you don't need the else case anymore
  this.router.navigateByUrl('/tabs/buy-and-sell/product/' + this.productId);
}





  async lockedProfileAlert() {
    const alert = await this.alertController.create({
      header: 'Not Allowed',
      message: 'You can only access the profile after ' + this.user.fullName + ' respond to your messages',
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  getProductImage(product: Product): string {
    if (product.photos && product.photos.length > 0) {
      console.log("imageeeeerrrrrrrrrrrrrrrrreeeeee",product.photos[0].url);
      return product.photos[0]?.url ?? ''; // Return the URL of the first photo
    } else {
      return 'assets/imgs/no-image.png'; // Placeholder image if no photos exist
    }
  }

  videoCall() {
    if (this.authUser  && this.user) {
      this.router.navigateByUrl('/messages/video/' + this.user.id);
    } else this.videoCallSubAlert();
  }
  
  async videoCallSubAlert() {
    const message = !this.user.friend ? ('You can only call friends, how about sending a friend request to ' + this.user.fullName) : ('You must subscribe to call ' + this.user.fullName);
    const alert = await this.alertController.create({
      header: 'You can\'t call ' + this.user.fullName,
      message: message,
      buttons: [
        {
          text: 'cancel',
          role: 'cancel'
        },
        {
          text: 'Subscribe',
          cssClass: 'text-danger',
          handler: () => {
            this.router.navigateByUrl('/tabs/subscription');
          }
        }
      ]
    });
    await alert.present();
  }

  nonFriendsChatEnabled() {
   // console.log('Friend status:', this.user?.isFriend);
   // console.log('Messages count:', this.messages.length);
  
    if (this.user && this.user.isFriend) {
      return true; // No limit for friends
    }
    
    return this.messages.length < 10; // Limit for non-friends
  }
  
  async requestVideoCall() {
    if (!this.nonFriendsChatEnabled()) {
      console.log("Cannot request video call: message limit reached.");
      this.toastService.presentErrorToastr('You have reached the message limit for non-friends.');
      return;
    }
  
    if (!this.authUser || !this.user) {
      console.log("Missing user information.");
      return;
    }
  
    // Ensure the socket is initialized
    if (!this.socket) {
      console.warn("⚠️ WebSocket is not ready. Trying to reinitialize...");
      if (this.user?.id) {
        await this.initializeSocket();
      } else {
        console.error("❌ Cannot reinitialize WebSocket: User ID missing.");
        return;
      }
    }
  
    const alert = await this.alertController.create({
      header: 'Request Video Call',
      message: `Send a one-time video call request to ${this.user.fullName}? If accepted, you can start one call. After that, request again if needed.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Request',
          handler: () => this.sendVideoCallRequest()
        }
      ]
    });
  
    await alert.present();
  }
  
private async sendVideoCallRequest() {
  const tempId = `temp-${Date.now()}`;

  // 1️⃣ Create optimistic temp message
  const tempMessage = new Message().initialize({
    id: tempId,
    tempId,
    from: this.authUser.id,
    to: this.user.id,
    text: `${this.authUser.fullName} has requested a video call.`,
    state: 'sending',
    createdAt: new Date(),
    type: 'video-call-request',
    status: 'pending'
  });

  this.messages.push(tempMessage);
  this.groupMessagesByDate();
  this.recomputeActiveCall();   
  this.scrollToBottom();

  // 2️⃣ Build payload for backend
  const payload = {
    from: this.authUser.id,
    to: this.user.id,
    text: tempMessage.text,
    messageId: tempId,
    requestOnly: true
  };

  // 3️⃣ Emit to server
  const markFailed = (message = 'Video call request could not be sent. Please try again.') => {
    const i = this.messages.findIndex(m => m.id === tempId || m.tempId === tempId);
    if (i !== -1) {
      this.messages[i].state = 'failed';
      this.groupMessagesByDate();
      this.changeDetection.detectChanges();
    }
    this.toastService.presentErrorToastr(message);
  };

  try {
    if (!this.socket?.connected) {
      await SocketService.initializeSocket();
      SocketService.bindToAuthUser();
      this.socket = await SocketService.getSocket();
      await SocketService.ensureConnected();
    }
  } catch (e) {
    console.warn('Video request socket connect failed:', e);
  }

  if (this.socket?.connected) {
    const timedSocket = this.socket.timeout ? this.socket.timeout(12000) : null;
    const emitWithAck = timedSocket ? timedSocket.emit.bind(timedSocket) : this.socket.emit.bind(this.socket);
    emitWithAck('video-call-request', payload, (errOrAck: any, maybeAck?: any) => {
      const ack = maybeAck === undefined ? errOrAck : maybeAck;
      const err = maybeAck === undefined ? null : errOrAck;
      if (err) {
        markFailed('Video call request timed out. Please try again.');
        return;
      }
      if (!ack?.success) {
        const errorMap: any = {
          video_requests_disabled: `${this.user?.fullName || 'This user'} is not accepting video requests from non-friends.`,
          recipient_not_found: 'This user is not available anymore.',
          invalid_recipient: 'Unable to identify this user.'
        };
        markFailed(errorMap[ack?.error] || ack?.error || 'Video call request could not be sent. Please try again.');
        return;
      }

      const realId = String(ack.messageId || '');
      const i = this.messages.findIndex(m => m.id === tempId || m.tempId === tempId);
      if (i !== -1) {
        const existing: any = this.messages[i];
        existing._id = realId || existing._id || existing.id;
        existing.id = realId || existing.id;
        existing.state = 'sent';
        existing.status = 'pending';
        existing.tempId = tempId;
        this.messages[i] = existing;
        this.recomputeActiveCall();
        this.groupMessagesByDate();
        this.changeDetection.detectChanges();
      }
    });
  } else {
    markFailed('Video call request needs a live connection. Please try again.');
  }
}



  
  
canRequestVideoCall(): boolean {
  if (!this.user) return false;
  if (this.user.isFriend) return true;  // Always allow friends
  if (this.user.allowVideoRequestsFromNonFriends === false) return false;
  if (this.activeVideoCall.status === 'pending' || this.activeVideoCall.status === 'accepted') return true;
  if (this.videoCallDeclined) return false;  // Block after declined
  return true;  // Allow a fresh request when there is no accepted one-time approval
}

  
  
  
}
