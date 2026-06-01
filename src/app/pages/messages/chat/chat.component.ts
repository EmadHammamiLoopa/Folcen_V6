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
  resend = [];
  product: Product;
  productId: string;
inSession = true;
sessionStart = 0;

private loadingMessages = false;

  sentMessages = {};
  index = 0;
  private listenersBound = false;

  private lastLoadedPeerId: string | null = null;

  image: string = null;
  imageFile: ImageFileObject = null;
  messageText = "";
  private activityListeners: any[] = [];
  private lastActivityTime = Date.now();

  connected = false;
  @ViewChild('content') private content: IonContent;
  @ViewChild('infScroll') private infScroll: IonInfiniteScroll;

  messages: Message[] = [];
    groupedMessages: any[] = []; // For date grouping

  socket: any;
  user: User;
  authUser: User;
  pageLoading = false;
  private sendMessageCounter = 0;

  allowToChat = false;
  business = false;
  showMediaOptions: boolean = false;
activeVideoCall: { status: 'pending' | 'accepted' | 'cancelled' | null, messageId?: string } = { status: null };


  
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
  // tell server to cancel any pendings in this thread
  if (this.socket?.connected && this.user?.id) {
    this.socket.emit('leave-chat', { withUser: this.user.id });
  }
  this.teardownCallSession();
}


private teardownCallSession() {
  this.inSession = false;
  this.sessionStart = 0;
  this.activeVideoCall = { status: null, messageId: undefined };

  // cancel any still-pending requests (UI + notify peer)
  const pendings = this.messages.filter(m => m.type === 'video-call-request' && m.status === 'pending');
  for (const m of pendings) {
    const realId = (m as any)._id || m.id;
    const other = m.from === this.authUser.id ? m.to : m.from;
    if (this.socket && realId) {
      // notify server/chat thread that the request was cancelled
      this.socket.emit('video-call-cancelled', {
        from: this.authUser.id,
        to: other,
        messageId: realId,
        status: 'cancelled'
      });

      // also emit the signaling/call cancellation events so any open
      // incoming call UI (video.component) reacts immediately and
      // missed-call handling (receiver only) can run in real time.
        try {
          const payload = { from: this.authUser.id, to: other, messageId: realId, reason: 'cancel', at: Date.now() };
          // Legacy shorthand (server keeps supporting it) — but prefer structured payloads
          try { this.socket.emit('cancel-video', payload); } catch(e) {}
          this.socket.emit('video-canceled', payload);
        } catch (e) {
          // best-effort: server may not expect both events; ignore errors
          console.warn('emit cancel-video/video-canceled failed', e);
        }
    }
    (m as any).busy = false;
    m.status = 'cancelled';
  }

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

        this.getUserProfile(normalized);
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
  if (this.socket?.connected && this.user?.id) {
    this.socket.emit('leave-chat', { withUser: this.user.id });
  }
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
      this.getUserProfile(this.user.id);
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
    // ✅ clear only this peer's missed calls and update the global badge
    try { this.webRTC.removeMissedCallsFor(this.user.id); } catch(e) {}
    try {
      const remaining = (this.badges.getMissedCalls && typeof this.badges.getMissedCalls === 'function') ? this.badges.getMissedCalls() : this.webRTC.getMissedCalls();
      const count = Array.isArray(remaining) ? remaining.length : 0;
      if (this.badges && typeof this.badges.set === 'function') this.badges.set('messages', count);
    } catch(e) {
      try { if (this.badges && typeof this.badges.set === 'function') this.badges.set('messages', (this.webRTC.getMissedCalls() || []).length || 0); } catch(_) {}
    }
  }

  getProductDetails(productId: string, event?) {
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
  message['busy'] = true;
  const realId = await this.ensureRealId(message);
  if (!realId) { message['busy'] = false; return this.toastService.presentErrorToastr('Still preparing… try again'); }

  const other = message.from === this.authUser.id ? message.to : message.from;
  this.socket.emit('video-call-accepted', {
    from: this.authUser.id,
    to: other,
    messageId: realId,
    status: 'accepted'
  });
}

async cancelVideoCallRequest(message: Message) {
  message['busy'] = true;
  const realId = await this.ensureRealId(message);
  if (!realId) { message['busy'] = false; return this.toastService.presentErrorToastr('Still preparing… try again'); }

  const other = message.from === this.authUser.id ? message.to : message.from;
  this.socket.emit('video-call-cancelled', {
    from: this.authUser.id,
    to: other,
    messageId: realId,
    status: 'cancelled'
  });

  // signal the active call UI to tear down immediately on the other side
  try {
    this.socket.emit('cancel-video', { from: this.authUser.id, to: other, messageId: realId, reason: 'cancel' });
    this.socket.emit('video-canceled', { from: this.authUser.id, to: other, messageId: realId, reason: 'cancel' });
  } catch(e) {
    console.warn('Failed to emit cancel-video/video-canceled', e);
  }
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


getUserProfile(userId: string) {
  if (!userId) { this.pageLoading = false; return; }

  // Avoid duplicate fetches for the same peer during a single view session
  if (this.lastLoadedPeerId === userId && this.user?.id === userId) {
    this.pageLoading = false;
    return;
  }
  this.lastLoadedPeerId = userId;

  console.log('Fetching profile for user ID:', userId);
  this.userService.getUserProfile(userId).subscribe(
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

      this.user = new User().initialize(raw);
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
  const grouped = [];
  let currentDate = null;
  let currentGroup = null;

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

async getMessages(event?) {
  if (this.loadingMessages) {
    event?.target?.complete?.();
    return;
  }

  this.loadingMessages = true;
  if (!event) this.pageLoading = true;

  try {
    if (!this.socket) {
      if (this.user?.id) await this.initializeSocket();
      else throw new Error('Socket not ready and no user id yet');
    }

    const resp: any = await this.messageService.indexMessages(this.user?.id || this.productId, this.page++);

    if (resp?.data?.messages?.length) {
      const newMessages = (resp?.data?.messages || []).map(m => {
        if (m.image && typeof m.image === 'object' && m.image.path) m.image = m.image.path;
        return new Message().initialize(m);
      });

      const seen = new Set(this.messages.map(m => m.id));
      newMessages.forEach(m => { if (!seen.has(m.id)) this.messages.unshift(m); });

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
    .filter(m => m.type === 'video-call-request')
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .pop();

  if (!last) {
    this.activeVideoCall = { status: null, messageId: undefined };
    return;
  }

  const lastTs = +new Date(last.createdAt);
  const isThisSession = !!this.sessionStart && lastTs >= this.sessionStart;

  this.activeVideoCall = isThisSession
    ? { status: (last.status as any) ?? 'pending', messageId: last.id }
    : { status: null, messageId: undefined };
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

  checkMessageExisting(message) {
    return this.messages.find(msg => msg.id == message._id) ? true : false;
  }

  initSocketListeners() {
    if (!this.socket) {
      console.error("❌ WebSocket not initialized.");
      return;
    }
    if (this.listenersBound) return;  // already bound once, don't rebind
    this.listenersBound = true;
  
    // helper to normalize any message payload
const normalize = (m: any): Message => {
  const copy: any = { ...m };
  copy.id = copy.id || copy._id || `${copy.from}-${copy.to}-${copy.createdAt || Date.now()}`;
  copy.tempId = copy.tempId ?? m.tempId;     // ⬅️ keep tempId for replacement
  // Do not default to `new Date()` here — leave undefined/null so Message.initialize
  // can derive a proper timestamp (e.g. from ObjectId) instead of showing 'now'
  copy.createdAt = copy.createdAt ? new Date(copy.createdAt) : null;
  if (copy.image && typeof copy.image === 'object' && copy.image.path) {
    copy.image = copy.image.path;
  }

    if (copy.type !== 'video-call-request') {
    copy.status = null;
  }

  return new Message().initialize(copy);
};


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

  
this.socket.on('new-message', (raw: any) => {
  this.zone.run(() => {
    try {
      if (typeof raw === 'string') raw = JSON.parse(raw);
      const msg = normalize(raw);

      // ── Only process messages that belong to THIS conversation ──
      // The backend emits new-message to ALL sockets of the recipient, so
      // messages from other conversations may arrive here too.
      const fromStr  = String(msg.from  || '');
      const toStr    = String(msg.to    || '');
      const peerId   = String(this.user?._id  || this.user?.id  || '');
      const selfId   = String(this.authUser?._id || this.authUser?.id || '');
      const relevant = (fromStr === peerId && toStr === selfId)
                    || (fromStr === selfId && toStr === peerId);
      if (!relevant) return;

      if (this.user && relevant) {
        this.markThreadRead();
        // ✅ Clear REST cache for this thread since we just received a live update
        this.messageService.clearCacheForThread(this.user.id);
      }
      if (this.messages.some(m => m.id === msg.id)) return;

      this.messages.push(msg);
      // Normalize timestamps in-case msg was stamped with local 'now' earlier
      try { this.normalizeMessagesTimestamps(); } catch(_) {}
      if (msg.type === 'video-call-request') this.recomputeActiveCall(); // <— add
      this.groupMessagesByDate();
      this.scrollToBottom();
    } catch (e) {
      console.error('Failed to process incoming message:', e, raw);
    }
  });
});

  
this.socket.on('message-sent', (saved: any) => {
  this.zone.run(() => {
    const msg = normalize({
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

    if (msg.type === 'video-call-request') this.recomputeActiveCall(); // <— add

    // Normalize timestamps in case server-sent object lacked createdAt and
    // a previous local placeholder used current time.
    try { this.normalizeMessagesTimestamps(); } catch(_) {}

    this.groupMessagesByDate();
    this.changeDetection.detectChanges();
  });
});




// in accepted/cancelled listeners:
this.socket.on('video-call-accepted', (data) => {
  this.zone.run(() => {
    const msg = this.messages.find(m => m.id === data.messageId || m.tempId === data.messageId);
    if (msg) {
      msg.status = 'accepted';
      msg['busy'] = false;
      this.recomputeActiveCall();
      this.groupMessagesByDate();
      this.recomputeActiveCall(); // <— add here too

      this.changeDetection.detectChanges();
    }
  });
});

this.socket.on('video-call-cancelled', (data) => {
  this.zone.run(() => {
    const msg = this.messages.find(m => m.id === data.messageId || m.tempId === data.messageId);
    if (msg) {
      msg.status = 'cancelled';
      msg['busy'] = false;
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
  return calls[calls.length - 1].status; // last call's status
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

  // non-friends:
  if (this.activeVideoCall.status === 'accepted') {
    // already accepted -> jump to call UI
    return this.router.navigateByUrl('/messages/video/' + this.user.id);
  }

  if (this.activeVideoCall.status === 'pending') {
    return this.toastService.presentSuccessToastr('Waiting for a response…');
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

   
  

  resendMessage(message) {
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
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
  });
}

private async uploadImageAndGetUrl(): Promise<string> {
  try {
    if (!this.imageFile?.file) return null;

    const uploadResponse = await this.uploadFileService.upload(this.imageFile.file, this.authUser.id)
      .pipe(take(1))
      .toPromise();

    return uploadResponse?.fileUrl || null;
  } catch (error) {
    console.error('Image upload failed:', error);
    this.toastService.presentErrorToastr('Failed to upload image');
    return null;
  }
}



private dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
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
  const mime = arr[0].match(/:(.*?);/)[1];
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
  // Build final payload (trust message.image which was uploaded in addMessage)
  const payload = {
    id: message.id,
    tempId: message.tempId,  
    from: this.authUser.id,
    to: this.user.id,
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

  // Queue-safe emit (works even if socket reconnects)
  SocketService.emit('send-message', payload);
  
  // ✅ Clear REST cache for this thread so subsequent loads (or re-entry) get the new message
  this.messageService.clearCacheForThread(this.user.id);

  // Fallback: if `message-sent` never arrives (e.g. a transient socket disconnect
  // races with delivery), optimistically resolve the message to 'sent' after 8s
  // so the sender is never permanently stuck looking at the "sending" indicator.
  const fallbackTempId = payload.tempId;
  setTimeout(() => {
    const i = this.messages.findIndex(
      m => (m.tempId === fallbackTempId || m.id === fallbackTempId) && (m as any).state === 'sending'
    );
    if (i !== -1) {
      (this.messages[i] as any).state = 'sent';
      this.groupMessagesByDate();
      try { this.changeDetection.detectChanges(); } catch (_) {}
    }
  }, 8000);

  return true;
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
    await this.getChatPermission();

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
    if (err) this.router.navigate(['/tabs/subscription']);
  }
}


removeImage() {
  this.image = null;
  this.imageFile = null;
}


async pickMedia(mediaType: 'image' | 'video') {
  try {
    if (this.platform.is('cordova')) {
      const sourceType = this.camera.PictureSourceType.CAMERA;
      const mediaTypeValue = mediaType === 'image' ? this.camera.MediaType.PICTURE : this.camera.MediaType.VIDEO;

      const options = {
        quality: 75,
        destinationType: this.camera.DestinationType.FILE_URI,
        mediaType: mediaTypeValue,
        sourceType: sourceType,
        saveToPhotoAlbum: false,
        correctOrientation: true,
      };

      const fileUri = await this.camera.getPicture(options);
      const nativePath = await this.filePath.resolveNativePath(fileUri);
      const fileEntry = await this.file.resolveLocalFilesystemUrl(nativePath) as FileEntry;

      fileEntry.file(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const blob = new Blob([reader.result], { type: file.type });
          const newFile = new File([blob], file.name, { type: file.type });
          this.imageFile = { file: newFile, imageData: nativePath };
          this.image = this.webView.convertFileSrc(nativePath);
        };
        reader.readAsArrayBuffer(file);
      });

    } else {
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = mediaType === 'image' ? 'image/*' : 'video/*';
      input.onchange = () => {
        const file = input.files[0];
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
  const mime = arr[0].match(/:(.*?);/)[1];
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
    // Reply-first rule for non-friends:
    // - Friends: always allowed
    // - Non-friends: allow the very first outgoing message (so guest can start),
    //   but after that require at least one incoming reply before sending again.
    if (this.user && this.user.isFriend) return true;

    if (!this.messages || this.messages.length === 0) return true; // no history -> allowed to send

    // Count outgoing (mine) and incoming (their) messages
    const outgoing = this.messages.filter(m => m.isMine(this.authUser.id)).length;
    const incoming = this.messages.filter(m => !m.isMine(this.authUser.id)).length;

    // Allow if no outgoing messages yet (first message), or recipient has replied (incoming >= outgoing)
    if (outgoing === 0) return true;
    return incoming >= outgoing;
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
      return product.photos[0].url; // Return the URL of the first photo
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
    // Ensure conversation is started and the user can still send messages (if non-friend)
    if (!this.conversationStarted() || !this.nonFriendsChatEnabled()) {
      console.log("Cannot request video call: conversation not started or message limit reached.");
      this.toastService.presentErrorToastr('Please start a conversation first');
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
      message: `Do you want to request a video call with ${this.user.fullName}?`,
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
    messageId: tempId
  };

  // 3️⃣ Emit to server
  if (this.socket?.connected) {
    this.socket.emit('video-call-request', payload, (ack) => {
      if (!ack?.success) {
        // fallback: mark as failed
        const i = this.messages.findIndex(m => m.id === tempId);
        if (i !== -1) this.messages[i].state = 'failed';
      }
    });
  } else {
    SocketService.emit('video-call-request', payload);
  }
}



  
  
canRequestVideoCall(): boolean {
  if (!this.user) return false;
  if (this.user.isFriend) return true;  // Always allow friends
  if (this.videoCallDeclined) return false;  // Block after declined
  return true;  // Allow if not declined
}

  
  
  
}
