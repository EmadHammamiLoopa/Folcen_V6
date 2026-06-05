import { ChangeDetectorRef, Component, NgZone, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Platform, ModalController } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { JsonService } from './services/json.service';
import { Router } from '@angular/router';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { Network } from '@ionic-native/network/ngx';
import { OneSignalService } from './services/one-signal.service';
import { WebrtcService } from './services/webrtc.service';
import { MessengerService } from './pages/messenger.service';
import { AdMobFeeService } from './services/admobfree.service';
import { BackgroundMode } from '@ionic-native/background-mode/ngx';
import { User } from './models/User';
import { SocketService } from './services/socket.service';
import { ListSearchComponent } from '../app/pages/list-search/list-search.component';
import { ToastService } from './services/toast.service';
import { RequestService } from './services/request.service';
import { Socket } from 'socket.io-client';
import { UserService } from './services/user.service';
import { ThemeService } from './services/theme.service';
import { AppEventsService } from './services/app-events.service';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { SessionStoreService } from './services/session-store.service';
import { DataService } from './services/data.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';

import { AnnouncementModalComponent } from './components/announcement-modal/announcement-modal.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnDestroy {
  socket: Socket | null = null; // Use the Socket type from socket.io-client
  user: User;
  audio: HTMLAudioElement;
  newRequestsCount: number = 0;
  showSplash = true;
  myEl?: HTMLVideoElement;
  partnerEl?: HTMLVideoElement;

  countries = [];
  currencies = {};
  educations = [];
  professions = [];
  interests = [];

  selectedCountry: any;
  selectedCity: any;
  selectedProfession: any;
  selectedInterests: any;

  public connectionStatus = {
    online: true,
    peerConnected: false,
    socketConnected: false,
  };

  private activityHandlers: { type: string; handler: any }[] = [];
  private connectionMonitorInterval: any;
  private wasOnline = true;

  private userSub: Subscription | null = null;
  private forceLogoutHandler: any = null;
  private forceLogoutMessageHandler: any = null;
  private announcementTapHandler: any = null;
  private incomingCallHandler: any = null;
  private destroy$ = new Subject<void>();
  private incomingCallKeys = new Set<string>();
  private pendingIncomingCallUrl: string | null = null;

  constructor(
    private platform: Platform,
    private nativeStorage: NativeStorage,
    private jsonService: JsonService,
    private oneSignalService: OneSignalService,
    private webrtcService: WebrtcService,
    private statusBar: StatusBar,
    private splashScreen: SplashScreen,
    private network: Network,
    private router: Router,
    private messengerService: MessengerService,
    private adMobFreeService: AdMobFeeService,
    private backgroundMode: BackgroundMode,
    private modalCtrl: ModalController,
    private changeDetectorRef: ChangeDetectorRef,
    private zone: NgZone,
    private toastService: ToastService,
    private requestService: RequestService,
    private socketService: SocketService,
    private userService: UserService,
    private themeService: ThemeService,
    private appEvents: AppEventsService,
    private sessionStore: SessionStoreService,
    private dataService: DataService,
    public webRTC: WebrtcService,
    private perfMonitor: PerformanceMonitorService
  ) {
    // Expose performance monitor globally for debugging
    (window as any).__perfMonitor = this.perfMonitor;
    console.log('📊 Performance monitor initialized. Use window.__perfMonitor.logSummary() to see stats');
    
    this.initializeApp();
    this.setupSocketListeners(); // Call this in constructor
    // Listen for global forced-logout events dispatched by SocketService
    try {
      this.forceLogoutHandler = async (ev: any) => {
        try {
          console.warn('AppComponent: handling global force-logout event', ev?.detail || ev);
          try { await this.dataService.logout(); } catch (e) { console.warn('Error during forced DataService.logout', e); }
        } catch (e) { console.warn('Error handling force-logout event', e); }
      };
      window.addEventListener('force-logout', this.forceLogoutHandler as any);

      // also support postMessage fallback
      this.forceLogoutMessageHandler = async (m: any) => {
        try {
          if (m?.data && m.data.type === 'force-logout') {
            console.warn('AppComponent: handling force-logout via postMessage', m.data.payload);
            try { await this.dataService.logout(); } catch (e) { console.warn('Error during forced DataService.logout', e); }
          }
        } catch (e) {}
      };
      window.addEventListener('message', this.forceLogoutMessageHandler as any);

      this.announcementTapHandler = () => {
        // Delay slightly so auth/session restoration can finish after app wakeup.
        setTimeout(() => {
          if (this.user?.id) {
            this.checkAnnouncements();
          }
        }, 300);
      };
      window.addEventListener('announcement-notification-tapped', this.announcementTapHandler as any);

      this.incomingCallHandler = (ev: any) => {
        const detail = ev?.detail || ev;
        if (typeof detail === 'string') {
          this.handleIncomingCallUrl(detail);
        } else if (detail?.url) {
          this.handleIncomingCallUrl(detail.url);
        } else {
          this.handleIncomingCallInvite(detail);
        }
      };
      window.addEventListener('folcen-incoming-call', this.incomingCallHandler as any);
    } catch (e) {}
    // Subscribe to central user store so this.user stays in sync across pages
    try {
      this.userSub = this.userService.currentUser.subscribe((u) => {
        if (u) {
          this.user = u;
          this.checkAnnouncements();
          if (this.requestsLoadedForUser !== u.id) {
            this.requestsLoadedForUser = u.id;
            this.loadRequests();
          }
          this.changeDetectorRef.detectChanges();
        } else {
          this.user = null;
          this.shownAnnouncements.clear();
        }
      });
    } catch (e) {}

    // --- Observable-based socket subscriptions (reconnect-safe) ---
    // follow-update: patch local user stats without a full API round-trip
    SocketService.followUpdate$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      try {
        if (!this.user?.id) return;
        if (payload.followerId !== this.user.id && payload.followedId !== this.user.id) return;
        const isActor = payload.followerId === this.user.id;
        const stats = isActor ? payload.actorStatistics : payload.targetStatistics;
        if (stats) {
          if (stats.followers !== undefined) this.user.followers = Array(stats.followers).fill('');
          if (stats.following !== undefined) this.user.following = Array(stats.following).fill('');
          if (stats.friends   !== undefined) this.user.friends   = Array(stats.friends).fill('');
          this.userService.setCurrentUser(this.user);
          this.changeDetectorRef.detectChanges();
        }
      } catch (e) {}
    });

    // user-profile-updated: patch local user if the update concerns us
    SocketService.userProfileUpdated$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      try {
        if (!this.user?.id || !payload?.userId) return;
        if (String(payload.userId) !== String(this.user.id)) return;
        const fields = payload.fields || {};
        if (fields.firstName)  this.user.firstName  = fields.firstName;
        if (fields.lastName)   this.user.lastName   = fields.lastName;
        if (fields.avatar)     this.user.avatar     = fields.avatar;
        if (fields.allowVideoRequestsFromNonFriends !== undefined) {
          this.user.allowVideoRequestsFromNonFriends = fields.allowVideoRequestsFromNonFriends !== false;
        }
        this.userService.setCurrentUser(this.user);
        this.changeDetectorRef.detectChanges();
      } catch (e) {}
    });

    // budget-update: keep call budget in sync (already in AppEventsService but
    // we also need to update this.user.missedCallBudget for the local view)
    SocketService.budgetUpdate$.pipe(takeUntil(this.destroy$)).subscribe((budget: number) => {
      try {
        if (this.user) {
          this.user.missedCallBudget = budget;
          this.userService.setCurrentUser(this.user);
          this.changeDetectorRef.detectChanges();
        }
      } catch (e) {}
    });

    // friend-requests-updated / new-friend-request: keep newRequestsCount badge live
    SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      try {
        const stats = payload?.statistics;
        if (stats?.pendingFriendRequests !== undefined) {
          this.newRequestsCount = stats.pendingFriendRequests;
          this.changeDetectorRef.detectChanges();
        }
      } catch (e) {}
    });

    SocketService.newFriendRequest$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      try {
        this.newRequestsCount = (this.newRequestsCount || 0) + 1;
        this.changeDetectorRef.detectChanges();
      } catch (e) {}
    });

    // Real-time announcement: admin broadcast while user is online
    SocketService.newAnnouncement$.pipe(takeUntil(this.destroy$)).subscribe((announcement: any) => {
      try {
        if (!this.user || !announcement?._id) return;
        // Ignore announcements created before this user signed up
        const userCreated = this.user.createdAt ? new Date(this.user.createdAt).getTime() : 0;
        const annCreated = announcement.createdAt ? new Date(announcement.createdAt).getTime() : Date.now();
        if (userCreated && annCreated < userCreated) return;
        if (!this.shownAnnouncements.has(announcement._id)) {
          // Run inside Angular zone — ModalController requires it to render the overlay correctly
          this.zone.run(() => this.showAnnouncement(announcement));
        }
      } catch (e) {}
    });
  }

  

  ngOnInit() {
  }

  private shownAnnouncements = new Set<string>();
  private checkingAnnouncements = false;
  private lastAnnouncementCheckAt = 0;
  private requestsLoadedForUser: string | null = null;

  checkAnnouncements() {
    if (!this.user) return;
    const now = Date.now();
    if (this.checkingAnnouncements || (now - this.lastAnnouncementCheckAt < 60000 && this.shownAnnouncements.size === 0)) return;
    this.checkingAnnouncements = true;
    this.lastAnnouncementCheckAt = now;
    
    this.userService.getAnnouncements().subscribe((resp: any) => {
      this.checkingAnnouncements = false;
      if (resp && resp.data && resp.data.length > 0) {
        // Show only the first unseen; after it's dismissed+marked-seen we come back for the next
        const announcement = resp.data.find((a: any) => !this.shownAnnouncements.has(a._id));
        if (announcement) {
          this.showAnnouncement(announcement);
        }
      }
    }, () => {
      this.checkingAnnouncements = false;
    });
  }

  async showAnnouncement(announcement: any) {
    this.shownAnnouncements.add(announcement._id);
    const modal = await this.modalCtrl.create({
      component: AnnouncementModalComponent,
      componentProps: { announcement },
      cssClass: 'announcement-modal',
      backdropDismiss: false // Force user to click "Understood"
    });
    
    modal.onDidDismiss().then(() => {
      // Mark as seen in backend, then check if there are more unseen announcements
      this.userService.markAnnouncementSeen(announcement._id).subscribe({
        next: () => {
          console.log('Announcement marked as seen');
          this.checkAnnouncements(); // Show next unread announcement if any
        },
        error: (err) => {
          console.error('Failed to mark announcement as seen', err);
          this.shownAnnouncements.delete(announcement._id); // Allow retry if failed
        }
      });
    });
    
    return await modal.present();
  }

  ngOnDestroy(): void {
    try { this.destroy$.next(); this.destroy$.complete(); } catch (e) {}
    try { if (this.userSub) this.userSub.unsubscribe(); } catch (e) {}
    try {
      this.activityHandlers.forEach(({ type, handler }) => {
        document.removeEventListener(type, handler);
      });
    } catch (e) {}
    try { if (this.forceLogoutHandler) window.removeEventListener('force-logout', this.forceLogoutHandler); } catch (e) {}
    try { if (this.forceLogoutMessageHandler) window.removeEventListener('message', this.forceLogoutMessageHandler); } catch (e) {}
    try { if (this.announcementTapHandler) window.removeEventListener('announcement-notification-tapped', this.announcementTapHandler); } catch (e) {}
    try { if (this.incomingCallHandler) window.removeEventListener('folcen-incoming-call', this.incomingCallHandler); } catch (e) {}
    try { if (this.connectionMonitorInterval) { clearInterval(this.connectionMonitorInterval); this.connectionMonitorInterval = null; } } catch (e) {}
  }

  private async setupSocketListeners() {
    try {
      await SocketService.initializeSocket();
      // If no token present, socket init resolves but no socket was created.
      // Only attempt to get the live socket if a token exists.
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('ℹ️ No auth token — skipping socket listener setup until sign-in.');
        return; // do not schedule a retry here; listeners will be set after sign-in
      }

      const socket = await SocketService.getSocket();
      this.socket = socket; // ✅ keep a reference

      socket.on('ping', () => {
        socket.emit('pong');
        console.log('❤️ Responded to server ping');
      });

      // Track user activity globally
      const activityHandler = () => this.trackUserActivity();
      document.addEventListener('mousemove', activityHandler);
      document.addEventListener('keydown', activityHandler);

      // Store for cleanup
      this.activityHandlers = [
        { type: 'mousemove', handler: activityHandler },
        { type: 'keydown', handler: activityHandler },
      ];
    } catch (error) {
      console.error('Failed to setup socket listeners:', error);
      // Only retry if the user likely has a token (transient init error).
      const token = localStorage.getItem('token');
      if (token) {
        setTimeout(() => this.setupSocketListeners(), 5000);
      } else {
        // If no token, avoid tight retry loop; listeners will be initialized after login.
        console.log('ℹ️ Not retrying socket listener setup because no auth token is present.');
      }
    }
  }

  private trackUserActivity() {
    if (this.user?.id) {
      SocketService.emit('user-activity', this.user.id);
    }
  }

  initializeApp() {
    console.log('🚀 AppComponent: initializeApp starting...');
    this.platform.ready().then(async () => {
      console.log('📱 Platform ready');
      // Initialize Theme
      this.themeService.initializeTheme();

      // Backfill localStorage from NativeStorage so SocketService (which reads
      // localStorage only) can authenticate the WebSocket on Android. Also
      // populate SocketService.tokenCache as a synchronous fallback in case
      // localStorage.setItem is unreliable under Capacitor.
      try {
        let tok: any = null;
        try { tok = localStorage.getItem('token'); } catch {}
        if (!tok) {
          tok = await this.nativeStorage.getItem('token').catch(() => null);
          if (tok) {
            const tokStr = typeof tok === 'string' ? tok : String(tok);
            try { localStorage.setItem('token', tokStr); } catch {}
            SocketService.setTokenCache(tokStr);
            console.log('🔑 Token backfilled from NativeStorage to localStorage+cache');
          }
        } else {
          SocketService.setTokenCache(typeof tok === 'string' ? tok : String(tok));
        }
        if (!localStorage.getItem('currentUser')) {
          const u = await this.nativeStorage.getItem('currentUser').catch(() => null);
          if (u) {
            try { localStorage.setItem('currentUser', typeof u === 'string' ? u : JSON.stringify(u)); } catch {}
          }
        }
        // Force socket re-init now that token cache is populated
        if (tok) {
          try { await SocketService.refreshAuth(); } catch (e) { console.warn('socket refreshAuth failed', e); }
        }
      } catch (e) { /* ignore */ }

      // Initialize session/user once per app boot (deduped)
      console.log('⏳ Initializing session store...');
      try {
        this.sessionStore.init().catch(e => console.warn('Session store init failed', e));
        console.log('✅ Session store initialized');
      } catch (e) {
        console.warn('⚠️ Session store init failed', e);
      }

      // ✅ Ask notification permission
      console.log('⏳ Requesting notification permissions...');
      try {
        LocalNotifications.requestPermissions().catch(e => console.warn('Notification permissions failed', e));
        console.log('✅ Notification permissions handled');
      } catch (e) {
        console.warn('⚠️ Notification permissions failed', e);
      }

      SocketService.initializeSocket();

      // ✅ Handle notification click when app is in background
      LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (notification) => {
          const extra: any = notification.notification.extra || {};
          const callerId = extra.callerId || extra.fromUserId;
          if (callerId) {
            this.handleIncomingCallUrl(this.buildIncomingCallUrl(callerId, extra.callId, 'answer'));
          }
        },
      );

      CapacitorApp.addListener('appUrlOpen', (event: any) => {
        this.handleIncomingCallUrl(event?.url);
      });

      CapacitorApp.getLaunchUrl().then((launch: any) => {
        this.handleIncomingCallUrl(launch?.url);
      }).catch(() => {});

      CapacitorApp.addListener('resume', () => {
        console.log('📱 App resumed - checking connections...');
        if (this.user?.id) {
          this.handleReconnection();
          this.checkAnnouncements();
        } else {
          console.warn('⚠️ Skipping reconnection: user not yet loaded.');
        }
      });

      this.backgroundMode.on('activate').subscribe(() => {
        console.log('🌙 App in background - rechecking WebSocket...');
        if (this.user?.id) {
          SocketService.initializeSocket().then(() => {
            SocketService.bindToAuthUser();
          });
        } else {
          console.warn('⚠️ Skipping background socket re-init: user not ready.');
        }
      });

      // ✅ Cordova-specific setup
      if (this.platform.is('cordova')) {
        this.statusBar.styleDefault();
        this.splashScreen.hide();
        this.backgroundMode.enable();
        this.network.onDisconnect().subscribe(() => {
          this.onOffline();
        });
      } else {
        console.log('Running in browser, Cordova not available');
      }

      // ✅ Initialize user & data
      // Auto-enable persistence of default static channel follows so
      // client will persist follows to the server when merging statics.
      try {
        if (!localStorage.getItem('persist_default_channel_follows')) {
          localStorage.setItem('persist_default_channel_follows', '1');
          console.log('📌 Enabled persist_default_channel_follows by default');
        }
      } catch (err) {
        console.warn('Could not set persist_default_channel_follows in localStorage', err);
      }

      this.getUserData();
      setTimeout(() => this.getJsonData(), 1500);

      setTimeout(() => {
        console.log('✨ Hiding splash screen');
        this.showSplash = false;
      }, 1200);
    });



    setTimeout(() => {
      this.audio = new Audio('/assets/audio/ringing.mp3');
      this.audio.load();
      console.log('🎵 Preloaded ringing audio');
    }, 2000);
  }

  startConnectionMonitoring() {
    this.connectionMonitorInterval = setInterval(() => {
      const isOnline = navigator.onLine;
      if (isOnline !== this.wasOnline) {
        console.log(
          `🌐 Network status changed: ${isOnline ? 'Online' : 'Offline'}`,
        );
        this.wasOnline = isOnline;

        if (isOnline) {
          this.handleReconnection();
        } else {
          this.handleOffline();
        }
      }
    }, 5000); // Check every 5 seconds
  }

  private async handleReconnection() {
    console.log('🔄 Attempting to reconnect all services...');
    if (!this.user?.id) {
      console.warn('⛔ User not initialized');
      return;
    }

    try {
      await SocketService.initializeSocket();
      SocketService.bindToAuthUser();

      if (!WebrtcService.peer || WebrtcService.peer.disconnected) {
        await this.initWebrtc();
      }

      this.checkAnnouncements();

      console.log('✅ All services reconnected successfully');
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      setTimeout(() => this.handleReconnection(), 10000);
    }
  }

  private handleOffline() {
    console.log('⚠️ App is offline - queuing operations');
    // Implement offline queue if needed
  }

  ionViewWillEnter() {
    // this.oneSignalService.close();
  }

  loadRequests() {
    this.requestService
      .requests(0)
      .then((resp: any) => {
        if (!resp || !resp.data) {
          console.warn('No request data received. Defaulting to 0.');
          this.newRequestsCount = 0;
          return;
        }
        this.newRequestsCount = resp.data.length;
      })
      .catch((err) => {
        console.error('Error in loadRequests:', err);
        this.newRequestsCount = 0;
      });
  }

  async presentModal(data: any[], title: string) {
    let modalData = data;
    if (!Array.isArray(data)) {
      console.error('Input data is not an array:', data);
      modalData = Object.keys(data).map((key) => ({
        name: key,
        values: data[key],
      }));
    }

    const modal = await this.modalCtrl.create({
      component: ListSearchComponent,
      componentProps: { data: modalData, title },
    });

    modal.onDidDismiss().then((result) => {
      console.log(`Selected ${title}:`, result.data);
      if (title === 'Countries') {
        this.selectedCountry = result.data;
      } else if (title === 'Cities') {
        this.selectedCity = result.data;
      } else if (title === 'Professions') {
        this.selectedProfession = result.data;
      } else if (title === 'Interests') {
        this.selectedInterests = result.data;
      }
    });

    return await modal.present();
  }

  async presentCountriesModal() {
    await this.presentModal(this.countries, 'Countries');
  }

  async presentProfessionsModal() {
    await this.presentModal(this.professions, 'Professions');
  }

  async presentEducationsModal() {
    await this.presentModal(this.educations, 'Educations');
  }

  async presentInterestsModal() {
    await this.presentModal(this.interests, 'Interests');
  }

  playAudio(src: string) {
    console.log('play app audio');
    console.log(src);
    if (!this.audio) {
      this.audio = new Audio();
    }
    this.audio.src = src;
    this.audio.load();
    this.audio.loop = true;
    this.audio
      .play()
      .then(() => {
        console.log('🎵 Audio started playing successfully');
      })
      .catch((error) => {
        console.warn('⚠️ Audio autoplay prevented:', error);
      });
  }

  private normalizeCallInvite(data: any = {}) {
    const callerId = data.callerId || data.fromUserId || data.from;
    if (!callerId) return null;
    const callId = data.callId || `legacy-${callerId}-${data.timestamp || Date.now()}`;
    return {
      ...data,
      type: data.type || 'incoming_call',
      category: data.category || 'call',
      event: data.event || 'call:invite',
      status: data.status || 'ringing',
      callType: data.callType || 'video',
      callerId: String(callerId),
      fromUserId: String(callerId),
      callId: String(callId),
      timestamp: data.timestamp || Date.now(),
      expiresAt: data.expiresAt || data.expiry || undefined
    };
  }

  private async handleIncomingCallInvite(data: any) {
    const invite = this.normalizeCallInvite(data);
    if (!invite) return;
    const status = String(invite.status || 'ringing');
    const expiresAt = invite.expiresAt ? Number(invite.expiresAt) : 0;
    if (status !== 'ringing' || (expiresAt && Date.now() > expiresAt)) {
      console.log('Ignoring stale incoming call invite:', { callId: invite.callId, status, expiresAt });
      return;
    }

    const key = invite.callId || `${invite.callerId}-${invite.timestamp}`;
    if (this.incomingCallKeys.has(key)) return;
    this.incomingCallKeys.add(key);
    setTimeout(() => this.incomingCallKeys.delete(key), 45000);

    console.log('Incoming call invite:', invite);
    localStorage.setItem('partnerId', invite.callerId);

    const queryParams = { answer: true, callId: invite.callId };
    const state = await CapacitorApp.getState().catch(() => ({ isActive: true }));
    if (state.isActive) {
      this.zone.run(() => {
        this.router.navigate(['/messages/video', invite.callerId], { queryParams });
      });
      return;
    }

    // When the WebView is not active, Android FCM native code owns the
    // full-screen call alert. Scheduling a second local notification here
    // races with the native call notification and can create duplicates.
    console.log('Incoming call received while inactive; native FCM alert will handle display.', invite.callId);
  }

  private hashCallId(callId: string): number {
    let hash = 0;
    for (let i = 0; i < callId.length; i++) {
      hash = ((hash << 5) - hash + callId.charCodeAt(i)) | 0;
    }
    return hash % 2147483647;
  }

  private isIncomingCallUrl(url?: string): boolean {
    return !!url && url.startsWith('folcen://incoming-call');
  }

  private prepareIncomingCallLaunch(url?: string) {
    if (!this.isIncomingCallUrl(url)) return;
    this.pendingIncomingCallUrl = url;
    this.showSplash = false;
    try { this.changeDetectorRef.detectChanges(); } catch (_) {}
  }

  private buildIncomingCallUrl(callerId: string, callId?: string, action: 'answer' | 'reject' = 'answer'): string {
    const answer = action === 'answer';
    const params = new URLSearchParams({
      callerId: callerId || '',
      fromUserId: callerId || '',
      callId: callId || '',
      answer: answer ? 'true' : 'false',
      action,
      autoAnswer: answer ? 'true' : 'false'
    });
    return `folcen://incoming-call?${params.toString()}`;
  }

  private handleIncomingCallUrl(url?: string) {
    if (!this.isIncomingCallUrl(url)) return;
    this.prepareIncomingCallLaunch(url);
    if (!this.user?.id) {
      this.pendingIncomingCallUrl = url;
      return;
    }
    this.pendingIncomingCallUrl = null;
    try {
      const parsed = new URL(url);
      const callerId = parsed.searchParams.get('callerId') || parsed.searchParams.get('fromUserId');
      const callId = parsed.searchParams.get('callId') || undefined;
      const action = parsed.searchParams.get('action') || (parsed.searchParams.get('answer') === 'false' ? 'reject' : 'answer');
      const autoAnswer = parsed.searchParams.get('autoAnswer') === 'true' || action === 'answer';
      if (!callerId) return;
      if (action === 'reject') {
        this.rejectIncomingCallFromUrl(callerId, callId);
        return;
      }
      this.zone.run(() => {
        this.router.navigate(['/messages/video', callerId], {
          queryParams: { answer: true, callId, autoAnswer, directCall: '1' },
        });
      });
    } catch (e) {
      console.warn('Failed to handle incoming call url:', e);
    }
  }

  private async rejectIncomingCallFromUrl(callerId: string, callId?: string) {
    try {
      await SocketService.initializeSocket();
      SocketService.bindToAuthUser();
      const socket = await SocketService.getSocket();
      const payload = {
        from: callerId,
        to: this.user?.id || (this.user as any)?._id,
        callId,
        reason: 'rejected',
        at: Date.now(),
      };
      if (socket?.connected) {
        socket.emit('video-call-declined', { from: callerId, to: payload.to, callId, reason: 'declined' });
      }
    } catch (e) {
      console.warn('Failed to reject incoming call from notification:', e);
    } finally {
      this.zone.run(() => {
        if (this.router.url.includes('/messages/video')) {
          this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
        }
      });
    }
  }

  async connectUser() {
    try {
      const socket = await SocketService.getSocket();
      this.socket = socket;

      SocketService.emit('connect-user', this.user.id);

      // Avoid duplicate handlers on reconnect. Backend emits all three for compatibility.
      const onIncomingInvite = (data: any) => this.handleIncomingCallInvite(data);
      ['call:invite', 'incoming-call', 'called'].forEach(eventName => {
        socket.off(eventName).on(eventName, onIncomingInvite);
      });

      this.messengerService.onMessage().subscribe((msg) => {
        if (msg?.event === 'stop-audio') this.audio?.pause();
      });

      socket.off('video-canceled').on('video-canceled', (data) => {
        console.log('🚫 Call canceled.', data);
        this.audio?.pause();
        localStorage.removeItem('partnerId');
        // If I'm the callee and this is a cancel/timeout, register missed call
        if (data && data.notify && this.user?.id) {
          this.webrtcService.addMissedCallFromSignaling(data, this.user.id, 'video-canceled');
        }
      });

      socket.off('video-call-timeout').on('video-call-timeout', (data) => {
        console.log('⏰ Call timed out.', data);
        this.audio?.pause();
        localStorage.removeItem('partnerId');
        if (this.user?.id) {
          this.webrtcService.addMissedCallFromSignaling(data, this.user.id, 'video-call-timeout');
        }
      });

      socket.off('missed-call').on('missed-call', (data) => {
        console.log('📞 Missed call received.', data);
        if (this.user?.id) {
          this.webrtcService.addMissedCallFromSignaling(data, this.user.id, 'missed-call');
        }
      });

      // follow-update, user-profile-updated and budget-update are handled
      // via reconnect-safe SocketService Observables subscribed in the constructor.
    } catch (e) {
      console.error('connectUser failed:', e);
    }
  }

  getUserData() {
    if (this.platform.is('cordova')) {
      // prefer new 'currentUser' key, fallback to legacy 'user'
      this.nativeStorage
        .getItem('currentUser')
        .then((userData) => {
          const parsedUser = typeof userData === 'string' ? JSON.parse(userData) : userData;
          this.initializeUser(parsedUser);
        })
        .catch(() => {
          // try legacy key, but prefer canonical 'currentUser' first
          (async () => {
            try {
              let u: any = null;
              try { u = await this.nativeStorage.getItem('currentUser'); } catch (e) { /* ignore */ }
              if (!u) { try { u = await this.nativeStorage.getItem('user'); } catch (e2) { /* ignore */ } }
              if (u) {
                const parsedUser = typeof u === 'string' ? JSON.parse(u) : u;
                this.initializeUser(parsedUser);
                return;
              }
            } catch (err) {
              console.warn('Error fetching user data from NativeStorage:', err);
            }
            this.fetchUserFromLocalStorage();
          })();
        });
    } else {
      this.fetchUserFromLocalStorage();
    }
  }

  private fetchUserFromLocalStorage() {
    const userString = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (userString) {
      try {
        const parsedUser = JSON.parse(userString);
        console.log('Fetched user data from localStorage:', parsedUser);
        this.initializeUser(parsedUser);
      } catch (err) {
        console.error('Failed to parse user JSON from localStorage:', err);
      }
    } else {
      console.log('User data not found in localStorage');
    }
  }

  private async initializeUser(user: any) {
    this.user = new User().initialize(user);
    this.userService.setCurrentUser(this.user); // Ensure UserService is updated

    try {
      const userId = this.user?.id || (this.user as any)?._id;
      if (userId) {
        this.oneSignalService.open(String(userId));
      }
    } catch (err) {
      console.warn('Push registration refresh failed:', err);
    }

    try {
      await SocketService.initializeSocket();
      SocketService.bindToAuthUser();
    } catch (err) {
      console.error('WebSocket initialization failed:', err);
    }

    setTimeout(() => this.initWebrtc(), 2500);
    this.connectUser();
    if (this.pendingIncomingCallUrl) {
      const pendingUrl = this.pendingIncomingCallUrl;
      this.pendingIncomingCallUrl = null;
      this.handleIncomingCallUrl(pendingUrl);
    }
    this.changeDetectorRef.detectChanges();

  }

  private async initWebrtc() {
    if (!this.user?.id) {
      console.error('❌ No authenticated user found');
      return;
    }

    try {
      if (
        WebrtcService.peer &&
        (WebrtcService.peer.disconnected ||
          WebrtcService.peer.destroyed ||
          !this.validatePeerId(WebrtcService.peer.id, this.user.id))
      ) {
        WebrtcService.peer.destroy();
        WebrtcService.peer = null;
      }

      if (!WebrtcService.peer) {
        await this.webRTC.createPeer(this.user.id);
        console.log('[peer:me]', {
          userId: this.webRTC.userId,
          peerId: WebrtcService.peer?.id,
          open:   WebrtcService.peer?.open
        });
        
        await this.waitForPeerOpen();

        const myPeerId = this.webRTC.getPeerId();
        if (!myPeerId?.startsWith(this.user.id)) {
          console.warn('Peer ID mismatch; clearing and recreating…', { myPeerId, userId: this.user.id });
          localStorage.removeItem('peerId');
          try { WebrtcService.peer?.destroy(); } catch {}
          WebrtcService.peer = null;
          await this.webRTC.createPeer(this.user.id);
          await this.waitForPeerOpen();
        }
        

        const existing = localStorage.getItem('lastPeerIdSent');
        if (!existing || existing.trim() === '') {
          localStorage.setItem('lastPeerIdSent', myPeerId);
          console.log('📌 Stored lastPeerIdSent in localStorage:', myPeerId);
        }

        console.log(`✅ PeerJS initialized. My ID: ${myPeerId}`);
      }

      this.webRTC.wait();

      const partnerId = localStorage.getItem('partnerId');
      if (partnerId && partnerId !== this.user.id) {
        this.userService.getPartnerPeerId(partnerId).subscribe({
          next: (partnerPeerId) => {
            if (!partnerPeerId?.startsWith(partnerId)) {
              console.warn('⚠️ Invalid partner peer ID format');
              return;
            }
            if (partnerPeerId === this.webRTC.getPeerId()) {
              console.warn('⚠️ Cannot call self');
              return;
            }
          },
          error: (err) => {
            console.error('❌ Partner peer lookup failed:', err);
            this.toastService.presentErrorToastr(
              'Could not connect to partner',
            );
          },
        });
      }
    } catch (err) {
      console.error('❌ WebRTC initialization failed:', err);
      setTimeout(() => this.initWebrtc(), 5000);
    }
  }

  private validatePeerId(peerId: string, expectedUserId: string): boolean {
    if (!peerId || !expectedUserId) return false;
    return peerId.startsWith(expectedUserId);
  }

  private async waitForPeerOpen() {
    return new Promise((resolve, reject) => {
      if (WebrtcService.peer && WebrtcService.peer.open) {
        return resolve(true);
      }
      if (!WebrtcService.peer) {
        return reject(new Error('⛔ Peer instance not initialized'));
      }
      WebrtcService.peer.once('open', () => resolve(true));
      setTimeout(() => reject(new Error('⏰ Peer open timeout')), 10000);
    });
  }

  getJsonData() {
    this.jsonService.getCountries().then((resp: any) => {
      if (!resp) return;
      
      this.countries = Array.isArray(resp)
        ? resp
        : Object.keys(resp).map((key) => ({ name: key, values: resp[key] }));

      this.nativeStorage
        .setItem('countries', JSON.stringify(this.countries))
        .catch((error) => {
          console.warn(
            'NativeStorage not available, using localStorage fallback',
            error,
          );
          localStorage.setItem(
            'countries',
            JSON.stringify(this.countries),
          );
        });
    });

    this.jsonService.getCurrencies().then((resp: any) => {
      this.currencies = resp;
      this.nativeStorage
        .setItem('currencies', JSON.stringify(resp))
        .catch((error) => {
          console.warn(
            'NativeStorage not available, using localStorage fallback',
            error,
          );
          localStorage.setItem('currencies', JSON.stringify(resp));
        });
    });

    this.jsonService.getEducations().then((resp: any) => {
      this.educations = resp;
      this.nativeStorage
        .setItem('educations', JSON.stringify(resp))
        .catch((error) => {
          console.warn(
            'NativeStorage not available, using localStorage fallback',
            error,
          );
          localStorage.setItem('educations', JSON.stringify(resp));
        });
    });

    this.jsonService.getProfessions().then((resp: any) => {
      this.professions = resp;
      this.nativeStorage
        .setItem('professions', JSON.stringify(resp))
        .catch((error) => {
          console.warn(
            'NativeStorage not available, using localStorage fallback',
            error,
          );
          localStorage.setItem('professions', JSON.stringify(resp));
        });
    });

    this.jsonService.getInterests().then((resp: any) => {
      this.interests = resp;
      this.nativeStorage
        .setItem('interests', JSON.stringify(resp))
        .catch((error) => {
          console.warn(
            'NativeStorage not available, using localStorage fallback',
            error,
          );
          localStorage.setItem('interests', JSON.stringify(resp));
        });
    });
  }

  async onOffline() {
    this.router.navigate(['/internet-error']);
  }
}
