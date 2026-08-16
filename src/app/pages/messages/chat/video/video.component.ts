import { Location } from '@angular/common';
import { ToastService } from './../../../../services/toast.service';
import { UserService } from './../../../../services/user.service';
import { User } from './../../../../models/User';
import { WebrtcService } from './../../../../services/webrtc.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { SocketService } from 'src/app/services/socket.service';
import { MessengerService } from './../../../messenger.service';
import { AdMobFeeService } from './../../../../services/admobfree.service';
import { Socket } from 'socket.io-client';
import { JwtHelperService } from '@auth0/angular-jwt';
import { Subscription } from 'rxjs';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { Platform } from '@ionic/angular';
import { MediaConnection } from 'peerjs';
import { NgZone } from '@angular/core';
import { RingerService } from 'src/app/services/ringer.service';
import { VideoEvents } from './events';

@Component({
  selector: 'app-video',
  templateUrl: './video.component.html',
  styleUrls: ['./video.component.scss'],
})
export class VideoComponent implements OnInit, OnDestroy {
  calling = false;
  @ViewChild('partnerVideo', { static: false })
  private partnerVideoRef!: ElementRef<HTMLVideoElement>;
  pageLoading = false;
  topVideoFrame = 'partner-video';
  authUser: User; // âœ… The logged-in user
  partnerUser: User; // âœ… The recipient user (partner in the call)
  myEl: HTMLVideoElement;
  partnerEl: HTMLVideoElement;
  public partnerId?: string;
  public userId?: string;
  public callId?: string;
  public videoRequestId?: string;
  public autoAnswer = false;
  partner: User = new User();
  user: User = new User();
  answer = false;
  answered = false;
  socket: Socket | null = null; // Use the Socket type from socket.io-client
  audio: HTMLAudioElement;
  audioEnabled = true;
  cameraEnabled = true;
  localStream: MediaStream | null = null;
  remoteVideoReady = false;
  jwtHelper = new JwtHelperService();
  private callTimer: any; // For storing the timer reference
  partnerName: string;
  placingCall = false;
  private hangupHandled = false;
  answeringCall = false;
endingCall = false;
switchingCamera = false;
callTimeout: any = null;
private tearingDown = false;
private hasAnswered = false;
  private lastPlaceCallAt: number = 0;
  private acceptedSignalSent = false;
  private acceptedSignalStagesSent = new Set<string>();
  private outgoingRetryAfterAccepted = false;
  private connectingAfterRemoteReady = false;
  private autoAnswerScheduled = false;
  private answerCallPromise: Promise<void> | null = null;
  private acceptedRetryTimer: any = null;
  private activeMediaCall: MediaConnection | null = null;
  private wakeLock: any = null;
  private appStateListener: any = null;
  private terminalCallClosed = false;

callDuration: string = '00:00';
private callStartTime: number | null = null;
private callTimerInterval: any;
private unansweredTimeout: any;

// Add to your component
@ViewChild('myVideo',      { static: false }) myVideoRef:      ElementRef<HTMLVideoElement>;
  private callStateSubscription: Subscription;
  private connectionSubscriptions: Subscription[] = [];

  private partnerAnsweredListener: () => void;
  private backButtonSubscription: Subscription;
  private isRemoteEnd: boolean = false;

  constructor(
    public webRTC: WebrtcService,
    public elRef: ElementRef,
    private route: ActivatedRoute,
    private userService: UserService,
    private toastService: ToastService,
    private location: Location,
    private nativeStorage: NativeStorage,
    private router: Router,
    private messengerService: MessengerService,
    private adMobFeeService: AdMobFeeService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
    private platform: Platform,
    private ngZone: NgZone,
    private ringer: RingerService


  ) {    this.partnerAnsweredListener = () => {
    console.log("ðŸŽ‰ Partner has answered the call (class handler)");
    this.answered = true;
    this.cdr.detectChanges();
  };
}

ngAfterViewInit() {
  if (this.myVideoRef && this.partnerVideoRef) {
    this.webRTC.setVideoElements(this.myVideoRef.nativeElement,
                                 this.partnerVideoRef.nativeElement);
  }

  // run again when change-detection adds the videos
  this.cdr.detectChanges();
}


/* â”€â”€â”€ and always deregister on leave/destroy â€”â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
ionViewWillLeave() { this.webRTC.clearVideoElements(); }
ngOnDestroy() {
  this.releaseWakeLock();
  try { this.appStateListener?.remove?.(); } catch (_) {}
  this.clearFinishedCallState();
  this.webRTC.clearVideoElements();
  this.callStateSubscription?.unsubscribe();
  this.backButtonSubscription?.unsubscribe();
  this.connectionSubscriptions.forEach(s => s?.unsubscribe());
  this.connectionSubscriptions = [];
  window.removeEventListener('partner-answered', this.partnerAnsweredListener);
}


async ngOnInit() {
  /* â”€â”€ 1 â–¸ diagnostics & device list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  console.log('ðŸ“ž Initializing Video Call Componentâ€¦');
  this.webRTC.listAllMediaDevices();

  /* â”€â”€ 2 â–¸ react to call-state changes (connected / ended) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  this.callStateSubscription = this.webRTC.callState$
    .subscribe(state => {
      if (state?.connected) {
        this.answered = true;
        this.calling  = false;
        this.startCallTimer();
        this.requestWakeLock();
        this.ringer.stop();
        this.clearCallTimeout();
        this.clearUnansweredTimeout();
        this.clearAcceptedRetryTimer();
      } else if (state === null) {
        this.stopCallTimer();
        this.answered = false;
          this.calling = false;
        this.ringer.stop();
      }
      this.cdr.detectChanges();
    });

  /* â”€â”€ 3 â–¸ Android hardware-back button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  this.backButtonSubscription = this.platform.backButton
    .subscribeWithPriority(10, () => this.handleBackButton());

  /* â”€â”€ 4 â–¸ authentication â†’ socket â†’ route params â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  try {
    await this.getAuthUser();                               // fills this.authUser
    await this.initializeSocket(this.authUser._id);         // sets up listeners
    this.registerAppStateListener();

    this.route.paramMap.subscribe(params => {
      this.userId = params.get('id');
      if (!this.userId) {
        console.error('âŒ No partner ID in route');
        return void this.router.navigate(['/']);
      }

      /* partner profile, misc one-off listeners â€¦ */
      this.getUser();

      window.addEventListener('partner-answered', this.partnerAnsweredListener, { once:false });
      window.addEventListener('peer-call-error', () => {
        this.toastService.presentErrorToastr('Call could not be established');
        this.cancel(true);
      });

      /* caller / callee mode */
      this.route.queryParamMap.subscribe(qp => {
        this.answer = qp.get('answer') === 'true';
        this.callId = qp.get('callId') || undefined;
        this.videoRequestId = qp.get('videoRequestId') || undefined;
        this.autoAnswer = qp.get('autoAnswer') === 'true';
        if (!this.answer) {
          console.log('ðŸ”„ Caller mode â€” call will start on view enter');
        } else {
          this.startUnansweredTimeout();    // ring-in side
          // Native full-screen answer launches the route before Ionic has laid
          // out the video elements. Auto-answer is scheduled from ionViewWillEnter
          // after the elements and incoming peer are ready, preventing duplicate
          // camera acquisition and stale incoming-call screens.
        }
      });
    });

  } catch (err) {
    console.error('âŒ ngOnInit() aborting:', err);
    this.router.navigate(['/auth/signin']);
  }
}


private handleBackButton() {
  console.log('ðŸ”™ Handling back button');
  if (this.answer && !this.answered && this.userId && this.socket?.connected) {
    const base = { from: this.userId, to: this.authUser._id, callId: this.callId, at: Date.now() };
    this.emitWebSocketEvent(VideoEvents.DECLINED, { ...base, reason: 'declined' });
  }

  this.clearUnansweredTimeout();
  this.clearFinishedCallState();
  this.stopCallTimer();
  this.ringer.stop();
  this.webRTC.close({ silent: true });
  this.router.navigate(['/tabs/messages/list'], { replaceUrl: true }); // â† key line
}

private clearFinishedCallState(): void {
  // REMOTE_UI_RESET_ON_CLEAR
  this.remoteVideoReady = false;

  try {
    const remote =
      this.partnerVideoRef?.nativeElement ||
      document.querySelector('#partner-video') as HTMLVideoElement;

    if (remote) {
      try { remote.pause(); } catch (_) {}
      try { remote.srcObject = null; } catch (_) {}
    }
  } catch (_) {}

  try { localStorage.removeItem('partnerId'); } catch (_) {}
  try { localStorage.removeItem('pendingIncomingCallUrl'); } catch (_) {}
  try { sessionStorage.removeItem('pendingIncomingCallUrl'); } catch (_) {}
  try { clearTimeout(this.callTimeout); this.callTimeout = null; } catch (_) {}
  this.clearUnansweredTimeout();
  this.calling = false;
  this.placingCall = false;
  this.autoAnswerScheduled = false;
  this.acceptedSignalStagesSent.clear();
  this.clearAcceptedRetryTimer();
  this.activeMediaCall = null;
  this.hangupHandled = false;
}

private registerAppStateListener(): void {
  if (this.appStateListener) return;
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      if (this.isCallLocallyFinished()) {
        console.log('[video] app resumed after finished call; leaving stale video route', { callId: this.callId });
        this.ngZone.run(() => this.router.navigate(['/tabs/messages/list'], { replaceUrl: true }));
        return;
      }
      if (this.answered || this.hasAnswered) {
        this.requestWakeLock();
      }
    }
  }).then(listener => this.appStateListener = listener).catch(err => {
    console.warn('[video] app state listener failed', err);
  });
}

private async requestWakeLock(): Promise<void> {
  try {
    const nav: any = navigator as any;
    if (!nav?.wakeLock || this.wakeLock) return;
    this.wakeLock = await nav.wakeLock.request('screen');
    this.wakeLock.addEventListener?.('release', () => {
      this.wakeLock = null;
    });
    console.log('[video] screen wake lock active');
  } catch (e) {
    console.warn('[video] screen wake lock unavailable', e);
  }
}

private releaseWakeLock(): void {
  try { this.wakeLock?.release?.(); } catch (_) {}
  this.wakeLock = null;
}

private markCallLocallyFinished(): void {
  this.terminalCallClosed = true;
  if (!this.callId) return;
  try {
    const raw = localStorage.getItem('finishedVideoCallIds');
    const ids = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(ids) ? ids.filter((item: any) => item?.callId !== this.callId) : [];
    next.push({ callId: this.callId, at: Date.now() });
    localStorage.setItem('finishedVideoCallIds', JSON.stringify(next.slice(-20)));
  } catch (_) {}
}

private isCallLocallyFinished(): boolean {
  if (this.terminalCallClosed) return true;
  if (!this.callId) return false;
  try {
    const raw = localStorage.getItem('finishedVideoCallIds');
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) && ids.some((item: any) => item?.callId === this.callId && Date.now() - Number(item.at || 0) < 2 * 60 * 60 * 1000);
  } catch (_) {
    return false;
  }
}

private clearCallTimeout(): void {
  try {
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
  } catch (_) {}
}

private clearAcceptedRetryTimer(): void {
  try {
    if (this.acceptedRetryTimer) {
      clearTimeout(this.acceptedRetryTimer);
      this.acceptedRetryTimer = null;
    }
  } catch (_) {}
}


// Remove ionViewDidLeave and keep ionViewWillLeave
// In your video component

private showSelfPreview(stream: MediaStream): void {
  const el = this.myVideoRef.nativeElement;

  if (!el.srcObject)  { el.srcObject = stream; }
  el.muted = true;                           // autoplay allow-list
  el.volume = 0;

  const playNow = () => {
    el.play()
      .then(() => {
        this.remoteVideoReady = true;
        this.cdr.detectChanges();
      })
      .catch(() => {});
  };
  if (el.readyState >= 1)           { playNow(); }      // metadata present
  else                              { el.onloadedmetadata = playNow; }
}


  private cleanupResources() {
    console.log('ðŸ§¹ Cleaning up resources');

    // 1. Remove event listeners
    window.removeEventListener("partner-answered", this.partnerAnsweredListener);

    // 2. Clean up audio
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }

    // 3. Clean up WebRTC
    this.webRTC.close();

    // 4. Clean up video elements
    if (this.myEl) {
      this.myEl.srcObject = null;
      this.myEl.pause();
    }
    if (this.partnerEl) {
      this.partnerEl.srcObject = null;
      this.partnerEl.pause();
    }

    // 5. Clean up socket
    this.leaveCallRoom();            // ðŸ‘ˆ NEW (optional here)

  }




// Add these methods to your component
startCallTimer() {
  if (this.callTimerInterval) return;
  this.callStartTime = Date.now();

  this.callTimerInterval = setInterval(() => {
    if (!this.callStartTime) return;

    const elapsedMs = Date.now() - this.callStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    this.callDuration = `${minutes}:${seconds}`;
  }, 1000); // update every second
}

startMissedCallTimeout() {
  this.clearCallTimeout();
  this.callTimeout = setTimeout(() => {
    if (!this.answered) {
      console.log('â° No answer in 60 sec â€” cancelling call');
      this.calling = false; // ensure UI reflects ended state immediately
      this.cancel(false, 'timeout');   // â¬… reason
    }
  }, 60000);
}

stopCallTimer() {
  clearInterval(this.callTimerInterval);
  this.callTimerInterval = null;
  this.callStartTime = null;
  this.callDuration = '00:00';
}

// video.component.ts
async ionViewWillEnter() {
  // IMPORTANT:
  // Ionic can reuse this video component between calls.
  // Never inherit the previous call's remote-video UI state.
  this.remoteVideoReady = false;

  try {
    const oldRemote =
      this.partnerVideoRef?.nativeElement ||
      document.querySelector('#partner-video') as HTMLVideoElement;

    if (oldRemote) {
      try { oldRemote.pause(); } catch (_) {}
      try { oldRemote.srcObject = null; } catch (_) {}
      oldRemote.removeAttribute('src');
      oldRemote.load?.();
    }
  } catch (_) {}

  console.error('[video-ui] fresh call UI state', {
    remoteVideoReady: this.remoteVideoReady,
    callId: this.callId
  });

  try {
    this.hydrateRouteStateFromSnapshot();
    if (this.isCallLocallyFinished()) {
      console.log('[video] ignoring stale video route for finished call', { callId: this.callId });
      this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
      return;
    }
    this.pageLoading = !this.answer;
    this.cdr.detectChanges();

    await this.waitForVideoElements();
    // Always wire elements so incoming remote stream can attach later
    this.webRTC.setVideoElements(this.myEl, this.partnerEl);

    if (this.answer) {
      this.acceptedSignalSent = false;
      this.pageLoading = false;
      this.cdr.detectChanges();
      if (this.autoAnswer) {
        this.ringer.stop();

        // Native incoming-call Answer means the user has already accepted.
        // Background/resume must not trust a PeerJS instance left open from
        // before suspension. Start preparing a fresh receiver transport now.
        this.ensureIncomingPeerReady().catch(err => {
          console.warn('[video] background peer prewarm failed; Answer will retry', err);
        });

        this.scheduleAutoAnswer('view-enter');
      } else {
        this.ringer.start('calling.mp3');
        await this.ensureIncomingPeerReady();
      }
      // keep your startUnansweredTimeout() from ngOnInit or call here
    } else {
      await this.ensurePartnerLoaded();
      if (!this.canStartOutgoingCall()) {
        this.toastService.presentErrorToastr('Video calls are available only for friends or an accepted one-time request.');
        this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
        return;
      }
      // Outgoing side: open camera.
      // Fast path has no artificial delay. If Android's camera HAL is
      // still releasing the previous call, recover once and retry.
      let ok = await this.webRTC.init(this.myEl, this.partnerEl);

      if (!ok) {
        console.warn('[video] outgoing media init failed; camera recovery retry');

        await this.webRTC.recoverMediaAfterCameraFailure(700);

        ok = await this.webRTC.init(this.myEl, this.partnerEl);
      }

      if (!ok) {
        throw new Error('Media init failed after camera recovery');
      }

      await this.placeCall();
    }
  } catch (e) {
    console.error(e);

    // If an outgoing invite was already created/sent but local startup
    // later fails, terminate the authoritative call so the other device
    // does not continue ringing.
    if (
      !this.answer &&
      this.callId &&
      this.authUser?._id &&
      this.userId
    ) {
      try {
        this.socket?.emit('video-call-cancelled', {
          from: this.authUser._id,
          to: this.userId,
          callId: this.callId,
          reason: 'local-start-failed',
          at: Date.now()
        });

        console.error('[video] local startup failure -> cancel sent', {
          callId: this.callId
        });
      } catch (_) {}
    }

    this.ringer.stop();
    this.calling = false;
    this.placingCall = false;

    this.toastService.presentErrorToastr('Failed to start video call.');
    this.router.navigate(['/']);
  } finally {
    this.pageLoading = false;
    this.cdr.detectChanges();
  }
}

private hydrateRouteStateFromSnapshot(): void {
  const id = this.route.snapshot.paramMap.get('id');
  if (id) this.userId = id;

  const query = this.route.snapshot.queryParamMap;
  this.answer = query.get('answer') === 'true';

  // Ionic caches pages. Never inherit a callId from the previous call.
  // Incoming routes provide their authoritative callId explicitly;
  // outgoing routes must generate a fresh one in placeCall().
  this.callId = query.get('callId') || undefined;

  this.videoRequestId =
    query.get('videoRequestId') ||
    undefined;

  this.autoAnswer =
    this.answer &&
    query.get('autoAnswer') === 'true';
}

private scheduleAutoAnswer(source: string): void {
  if (!this.answer || !this.autoAnswer || this.autoAnswerScheduled || this.hasAnswered) return;
  this.autoAnswerScheduled = true;
  this.answeringCall = true;
  this.cdr.detectChanges();
  console.log('[video] auto-answer scheduled from native incoming call', { source, callId: this.callId, caller: this.userId });
  setTimeout(() => this.answerCall(), source === 'view-enter' ? 50 : 300);
}

private canStartOutgoingCall(): boolean {
  if (this.answer) return true;
  if (this.videoRequestId) return true;
  return !!(this.partner?.isFriend || (this.partner as any)?.friend || this.user?.isFriend || (this.user as any)?.friend);
}

private incomingPeerReadyPromise: Promise<void> | null = null;
private incomingPeerReadyCallId: string | undefined;

private ensureIncomingPeerReady(): Promise<void> {
  // If there is no authoritative callId, preserve the old behaviour.
  if (!this.callId) {
    return this.prepareIncomingPeerFresh();
  }

  const key = String(this.callId);

  // ionViewWillEnter may already have prepared the incoming PeerJS
  // listener. Do not destroy/recreate it again when Answer is pressed.
  if (
    this.incomingPeerReadyPromise &&
    this.incomingPeerReadyCallId === key
  ) {
    console.log('[video] reusing incoming peer preparation', {
      callId: this.callId
    });
    return this.incomingPeerReadyPromise;
  }

  this.incomingPeerReadyCallId = key;

  const promise = this.prepareIncomingPeerFresh();
  this.incomingPeerReadyPromise = promise;

  // A failed preparation must be retryable.
  promise.catch(() => {
    if (
      this.incomingPeerReadyPromise === promise &&
      this.incomingPeerReadyCallId === key
    ) {
      this.incomingPeerReadyPromise = null;
      this.incomingPeerReadyCallId = undefined;
    }
  });

  return promise;
}

private async prepareIncomingPeerFresh(): Promise<void> {
  try {
    const myId = this.authUser?._id || this.authUser?.id;
    if (!myId) throw new Error('Missing authenticated user for incoming peer');
    // Each answered call gets a fresh PeerJS transport.
    // The caller now waits for READY, so it cannot dial the old peer ID
    // while this refresh is happening.
    try {
      if (WebrtcService.call) {
        try { WebrtcService.call.close(); } catch (_) {}
        WebrtcService.call = null;
      }
    } catch (_) {}

    // A native background Answer resumes the WebView. An existing Peer
    // may still report open=true while its transport is stale. Force a fresh
    // PeerJS session only for that background/native auto-answer path.
    const nativeIncoming =
      this.route.snapshot.queryParamMap.get('directCall') === '1';

    await this.webRTC.createPeer(
      myId,
      this.autoAnswer === true || nativeIncoming
    );
    await this.webRTC.waitForPeerOpen();
    const peerId = this.webRTC.getPeerId();
    if (!peerId) throw new Error('Peer ID was not created');
    await this.userService.sendPeerIdToBackend(myId, peerId);
    await this.webRTC.wait(this.callId);
  } catch (e) {
    console.warn('[video] incoming peer warmup failed', e);
    throw e;
  }
}

private async ensurePartnerLoaded(): Promise<void> {
  if (this.partner?._id || (this.partner as any)?.id) return;
  if (!this.userId) return;

  try {
    const resp: any = await this.userService.getUserProfile(this.userId).toPromise();
    const userData = resp?.data || resp;
    if (userData) {
      this.partner = userData instanceof User ? userData : new User().initialize(userData);
      this.cdr.detectChanges();
    }
  } catch (e) {
    console.warn('[video] partner preload failed', e);
  }
}






// video.component.ts  (somewhere near other helpers)
private wireHangup(mc: MediaConnection) {
  this.activeMediaCall = mc;
  mc.once('close', () => {
    if (this.activeMediaCall !== mc) {
      console.log('[video] ignoring stale media close event');
      return;
    }
    // Prevent re-entry if we fired the close ourselves
    if (this.hangupHandled || this.tearingDown) return;
    this.hangupHandled = true;
    this.ngZone.run(() => this.closeCall());   // run inside Angular
  });
}

private hasActiveConnectedCall(): boolean {
  const hasRemoteStream = !!(this.partnerEl?.srcObject || this.partnerVideoRef?.nativeElement?.srcObject);
  return !!(this.answered || this.hasAnswered || this.callStartTime || hasRemoteStream);
}


private async waitForVideoElements(): Promise<void> {
  return new Promise((resolve, reject) => {
    const maxAttempts = 30; // Increased further
    let attempts = 0;

    const checkElements = () => {
      attempts++;

      // Use both ViewChild and direct DOM query with fallbacks
      this.myEl = this.myVideoRef?.nativeElement ||
                 document.querySelector('#my-video') as HTMLVideoElement;
      this.partnerEl = this.partnerVideoRef?.nativeElement ||
                      document.querySelector('#partner-video') as HTMLVideoElement;

      if (this.myEl && this.partnerEl) {
        console.log('âœ… Video elements found after', attempts, 'attempts');
        resolve();
      } else if (attempts >= maxAttempts) {
        console.error('Video elements not found:', {
          myVideoRef: !!this.myVideoRef,
          partnerVideoRef: !!this.partnerVideoRef,
          myVideoDOM: !!document.querySelector('#my-video'),
          partnerVideoDOM: !!document.querySelector('#partner-video')
        });
        reject(new Error(`Video elements not found after ${maxAttempts} attempts`));
      } else {
        setTimeout(checkElements, 150); // Slightly longer delay
      }
    };

    // Initial check after a brief delay to allow rendering
    setTimeout(checkElements, 100);
  });
}

handleVideoError(type: 'local' | 'partner') {
  console.error(`${type} video error`);
  this.toastService.presentErrorToastr(`${type} video failed to load`);
}
getUserId() {
  this.route.paramMap.subscribe((params) => {
      this.userId = params.get('id');
      console.log("ðŸŸ¢ Retrieved Parternrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr User ID:", this.userId);

      this.route.queryParamMap.subscribe((query) => {
          this.answer = query.get('answer') ? true : false;
          this.callId = query.get('callId') || undefined;
          this.videoRequestId = query.get('videoRequestId') || undefined;
          this.autoAnswer = query.get('autoAnswer') === 'true';
          console.log("ðŸŸ¢ Answer Mode:", this.answer);

          this.getUser();
      });
  });
}


getUser() {
  console.log('Fetching partner profile for ID:', this.userId);
  this.userService.getUserProfile(this.userId).subscribe(
    async (resp: any) => {
      this.pageLoading = false;
      console.log('Partner profile response:', resp);

      const userData = resp.data || resp;

      if (userData) {
        try {
          console.log('Raw userData:', userData);
          this.partner = userData instanceof User ? userData : new User().initialize(userData);
          console.log('Partner initialized successfully:', this.partner);
        } catch (error) {
          console.error('Error initializing partner user:', error);
          this.handleUserInitError();
        }
      } else {
        console.error('Invalid response data: userData is null or undefined');
        this.handleUserInitError();
      }
    },
    (err) => {
      console.error('Error fetching partner profile:', err);
      this.pageLoading = false;
      this.location.back();
      this.toastService.presentErrorToastr('Cannot make this call, try again later');
    }
  );
}


  async getAuthUser(): Promise<void> {
    return new Promise((resolve) => {
      console.log('ðŸ” Starting authentication process...');

  const getToken = async (): Promise<string | null> => {
    console.log('ðŸ”‘ Attempting to retrieve token...');
    if (this.isCordovaAvailable()) {
      console.log('ðŸ“± Cordova platform detected - using NativeStorage');
      try {
        const token = await this.nativeStorage.getItem('token');
        console.log('âœ… Token retrieved from NativeStorage');
        return token;
      } catch (err) {
        console.warn("âš ï¸ Failed to retrieve token from NativeStorage:", err);
        return null;
      }
    } else {
      console.log('ðŸ–¥ï¸ Web platform detected - using localStorage');
      const token = localStorage.getItem('token');
      console.log(token ? 'âœ… Token retrieved from localStorage' : 'âŒ No token in localStorage');
      return token;
    }
  };

  getToken().then((token) => {
    if (!token) {
      console.error("âŒ No token found in storage");
      this.router.navigate(['/auth/signin']);
      return;
    }

    console.log('ðŸ” Token found, decoding...');
    try {
      const decoded = this.jwtHelper.decodeToken(token);
      console.log('ðŸ” Decoded token content:', {
        idPresent: !!decoded?._id,
        firstNamePresent: !!decoded?.firstName,
        lastNamePresent: !!decoded?.lastName,
        avatarPresent: !!decoded?.mainAvatar
      });

      if (!decoded?._id) {
        console.error("âŒ Invalid token structure - missing _id");
        this.router.navigate(['/auth/signin']);
        return;
      }

      // ONLY use the decoded token data
      this.authUser = new User().initialize({
        _id: decoded._id,
        firstName: decoded.firstName || '',
        lastName: decoded.lastName || '',
        mainAvatar: decoded.mainAvatar || ''
      });

          console.log("ðŸ” Auth user initialized:", this.authUser._id);
          resolve();
        } catch (error) {
          console.error("âŒ Token decoding failed:", error);
          this.router.navigate(['/auth/signin']);
        }
      });
    });
  }


  handleUserInitError() {
    this.pageLoading = false;
    this.toastService.presentErrorToastr('User not found, please log in again');
    this.router.navigate(['/auth/signin']);
  }


  async initializeSocket(userId: string) {
    try {
        if (this.socket) {
            console.warn("âš ï¸ WebSocket already initialized. Checking connection...");
            if (this.socket.connected) {
                console.log("âœ… WebSocket is already connected.");
                return;
            } else {
                console.warn("ðŸ”„ WebSocket was disconnected. Attempting to reconnect...");
                this.socket.disconnect(); // Ensure cleanup before reconnecting
                this.socket = null;
            }
        }

        console.log("ðŸ”µ Initializing WebSocket for userId:", userId);
        await SocketService.initializeSocket();
        await SocketService.ensureConnected();

        // âœ… Retry WebSocket retrieval to ensure it's available
        let attempts = 0;
        while ((!this.socket || !this.socket.connected) && attempts < 3) {
            this.socket = await SocketService.getSocket();
            if (!this.socket || !this.socket.connected) {
                console.warn(`âš ï¸ WebSocket still not available. Retrying (${attempts + 1}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec before retrying
            }
            attempts++;
        }

        if (!this.socket || !this.socket.connected) {
            console.error("âŒ WebSocket initialization failed after multiple attempts.");
            return;
        }

        console.log("âœ… WebSocket instance retrieved:", this.socket.id);
        await this.webRTC.bindMissedCallSocketHandlers();

        this.listenForVideoCallEvents(); // Ensure event listeners are set up

    } catch (error) {
        console.error("âŒ WebSocket initialization failed:", error);
    }
}


// video.component.ts
private idOf = (x: any) => (x && typeof x === 'object') ? (x._id || x.id) : x;

listenForVideoCallEvents() {
  if (!this.socket) return;

  this.socket.off('video-call-started');
  this.socket.off('video-canceled');
  this.socket.off(VideoEvents.CANCELED);
  this.socket.off(VideoEvents.TIMEOUT);
  this.socket.off(VideoEvents.MISSED);
  this.socket.off('cancel-video');              // â¬… add this off

  this.socket.off('video-call-cancelled');
  this.socket.off('video-call-timeout');
  this.socket.off(VideoEvents.ACCEPTED);
  this.socket.off(VideoEvents.ENDED);
  this.socket.off(VideoEvents.FAILED);
  this.socket.off('video-call-ended');
  this.socket.off('leave-call');

  this.socket.on('video-call-started', () => {
    // Signaling has started, but the callee may not have answered yet.
    // Keep caller tone playing until WebRTC reports a real connection.
    console.log('[video] signaling started');
  });

  this.socket.on(VideoEvents.ACCEPTED, async (ev: any) => {
    try {
      if (this.answer) return;
      const evCallId = ev?.callId;
      if (!evCallId || !this.callId || String(evCallId) !== String(this.callId)) return;
      const caller = this.idOf(ev?.from);
      const callee = this.idOf(ev?.to);
      if (caller && this.authUser?._id && String(caller) !== String(this.authUser._id)) return;
      if (callee && this.userId && String(callee) !== String(this.userId)) return;
      const stage = ev?.stage || 'ready';
      this.ringer.stop();
      this.calling = false;

      if (stage === 'answered') {
        this.clearAcceptedRetryTimer();
        this.clearCallTimeout();
        this.connectingAfterRemoteReady = false;
        this.answered = true;
        this.startCallTimer();
        this.cdr.detectChanges();
        return;
      }

      this.connectingAfterRemoteReady = true;
      this.cdr.detectChanges();

      // The receiver has finished preparing its PeerJS listener.
      // There is no earlier media call anymore, so create exactly one
      // MediaConnection now.
      this.clearAcceptedRetryTimer();

      const readyPeerId =
        typeof ev?.peerId === 'string' && ev.peerId.trim()
          ? ev.peerId.trim()
          : undefined;

      console.error('[PERF][caller] READY_RX', {
        callId: this.callId,
        directPeerId: !!readyPeerId,
        peerId: readyPeerId
      });

      await this.retryOutgoingMediaCallAfterAccepted(readyPeerId);
    } catch (err) {
      console.warn('[video] accepted retry failed', err);
    }
  });

  const onCanceled = async (ev?: any) => {
    const from = ev?.from ?? ev?.callerId ?? this.userId;
    const to   = ev?.to   ?? ev?.calleeId;

    // Ignore stale cancel events that belong to an earlier call attempt
    const evAt = ev?.at ? (typeof ev.at === 'string' ? Date.parse(ev.at) : Number(ev.at)) : null;
    if (evAt && this.lastPlaceCallAt && evAt < (this.lastPlaceCallAt - 1000)) {
      console.log('[video] ignoring stale cancel event', { evAt, lastPlaceCallAt: this.lastPlaceCallAt });
      return;
    }

    // No implicit missed accounting here anymore; server will emit explicit MISSED_* from caller/callee

    try {
      // always clear local timers/flags so caller UI updates immediately
      this.clearUnansweredTimeout();
      this.clearCallTimeout();
      this.stopCallTimer();
      this.ringer.stop();
      this.clearFinishedCallState();

      // close peer connections and local streams
      await this.webRTC.close({ silent: true });

      // Reset flags so the UI reflects "not in call"
      this.calling = false;
      this.answered = false;
      this.hasAnswered = false;

      // Ensure navigation happens in Angular zone (caller side sees UI teardown)
      if (this.router.url.includes('/video')) {
        this.ngZone.run(() => this.router.navigate(['/tabs/messages/list'], { replaceUrl: true }));
      }
    } catch (err) {
      console.warn('Error handling cancel event:', err);
      // best-effort navigation/cleanup
      try { this.ringer.stop(); this.webRTC.close({ silent: true }); } catch(e){}
      if (this.router.url.includes('/video')) this.router.navigate(['/tabs/messages/list']);
    }
  };

  // unifying cancel handler across legacy/canonical names
  this.socket.on('video-canceled', onCanceled);
  this.socket.on('video-call-cancelled', onCanceled);
  this.socket.on('cancel-video',         onCanceled);   // â¬… important

  this.socket.on(VideoEvents.CANCELED, async (ev) => {
    const to   = this.idOf(ev?.to);
    const from = this.idOf(ev?.from);

    // No implicit missed accounting here; teardown only

    // force local UI teardown for both caller & callee
    try { this.clearUnansweredTimeout(); } catch(_) {}
    try { clearTimeout(this.callTimeout); this.callTimeout = null; } catch(_) {}
    try { this.stopCallTimer(); } catch(_) {}
    this.clearFinishedCallState();
    this.ringer.stop();
    this.clearCallTimeout();
    try { await this.webRTC.close({ silent: true }); } catch(_) {}
    if (this.myEl)      { this.myEl.srcObject = null; this.myEl.pause(); }
    if (this.partnerEl) { this.partnerEl.srcObject = null; this.partnerEl.pause(); }
    this.messengerService.sendMessage({ event: 'stop-audio' });
    if (String(ev?.reason || '').toLowerCase() !== 'timeout') {
      await this.toastService.presentSuccessToastr('Call was canceled.');
    }
    this.leaveCallRoom();
    this.calling = false;
    this.answered = false;
    if (this.router.url.includes('/video')) {
      this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
    }
  });

  // unify timeout handling for legacy and canonical events
  const onTimeout = async (ev: any) => {
    if (this.tearingDown) return;

    this.tearingDown = true;

    try {
      console.log('[video] authoritative timeout received', {
        callId: ev?.callId,
        from: ev?.from ?? ev?.callerId,
        to: ev?.to ?? ev?.calleeId
      });

      this.clearUnansweredTimeout();
      this.clearCallTimeout();
      this.stopCallTimer();
      this.ringer.stop();
      this.releaseWakeLock();

      this.calling = false;
      this.answered = false;
      this.hasAnswered = false;

      try {
        await this.webRTC.close({ silent: true });
      } catch (_) {}

      if (this.router.url.includes('/video')) {
        this.ngZone.run(() =>
          this.router.navigate(
            ['/tabs/messages/list'],
            { replaceUrl: true }
          )
        );
      }
    } finally {
      // Ionic can reuse the component for a later call.
      this.tearingDown = false;
    }
  };

  this.socket.on(VideoEvents.TIMEOUT, onTimeout);
  this.socket.on('video-call-timeout', onTimeout);

  // handle end events from server (some backends emit 'video-call-ended')
  const onEnded = async (_ev: any) => {
    try { this.clearUnansweredTimeout(); } catch(_) {}
    try { clearTimeout(this.callTimeout); this.callTimeout = null; } catch(_) {}
    try { this.stopCallTimer(); } catch(_) {}
    this.clearFinishedCallState();
    this.ringer.stop();
    try { await this.webRTC.close({ silent: true }); } catch(_) {}
    if (this.myEl)      { this.myEl.srcObject = null; this.myEl.pause(); }
    if (this.partnerEl) { this.partnerEl.srcObject = null; this.partnerEl.pause(); }
    this.messengerService.sendMessage({ event: 'stop-audio' });
    this.leaveCallRoom();
    this.calling = false;
    this.answered = false;
    if (this.router.url.includes('/video')) {
      this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
    }
  };

  this.socket.on(VideoEvents.ENDED, onEnded);
  this.socket.on('video-call-ended', onEnded);

  // if remote leaves the call room, force local teardown when not answered
  this.socket.on('leave-call', async (ev:any) => {
    try {
      const who = this.idOf(ev?.user);
      const room = this.idOf(ev?.room);
      if (this.hasActiveConnectedCall()) {
        console.log('[video] ignoring leave-call while active call is connected', { who, room, userId: this.userId, callId: this.callId });
        return;
      }
      // If the partner leaves or the room matches current partner, and we haven't answered, just teardown
      if (!this.answered && !this.hasAnswered && (who === this.userId || room === this.userId)) {
        await onEnded(ev);
      }
    } catch (e) { /* ignore */ }
  });

  this.socket.on(VideoEvents.MISSED, (ev) => {
    // Dedicated missed events: service will account from MISSED_*; show toast only
    this.toastService.presentErrorToastr('Missed call.');
  });

  // (moved above) already wired legacy cancel names

}




private leaveCallRoom() {
  if (this.socket && this.socket.connected) {
    this.socket.emit('leave-call', {
      room : this.userId,        // or whatever room you use
      user : this.authUser._id,
    });
  }
}

  async init(myVideoEl: HTMLVideoElement, partnerVideoEl: HTMLVideoElement): Promise<void> {
    try {
        // âœ… Request user media (camera + mic)
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        await this.webRTC.listAllMediaDevices();

        if (!stream) {
            throw new Error("âŒ Failed to get media stream.");
        }

        // âœ… Assign local stream to video element
        myVideoEl.srcObject = stream;

        // âœ… Store the stream for later use
        this.localStream = stream;

        console.log("âœ… Local video stream initialized.");

    } catch (err) {
        console.error("âŒ Error initializing video:", err);
    }
}

async emitWebSocketEvent(eventName: string, data: any) {
  if (!this.socket?.connected) {
      console.warn("âš ï¸ WebSocket is not ready. Trying to retrieve...");
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      this.socket = await SocketService.getSocket();

      if (!this.socket?.connected) {
          console.error("âŒ WebSocket is still not available. Aborting event emit.");
          SocketService.emit(eventName, data);
          return;
      }
  }

  if (!this.socket.connected) {
      console.warn("âš ï¸ WebSocket is disconnected. Attempting to reconnect...");
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      this.socket = await SocketService.getSocket();
  }

  if (!this.socket?.connected) {
      SocketService.emit(eventName, data);
      return;
  }

  console.log(`ðŸ“¤ Emitting event: ${eventName}`, data);
  this.socket.emit(eventName, data);

}

private async validateAnswerableCall(): Promise<{ answerable: boolean; status?: string; error?: string }> {
  if (this.isCallLocallyFinished()) return { answerable: false, status: 'ended' };
  if (!this.callId) return { answerable: true };
  try {
    if (!this.socket?.connected) {
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      this.socket = await SocketService.getSocket();
    }
    if (!this.socket?.connected) return { answerable: true };

    return await new Promise(resolve => {
      const timedSocket: any = (this.socket as any).timeout ? (this.socket as any).timeout(5000) : this.socket;
      timedSocket.emit('call-state-check', { callId: this.callId }, (errOrAck: any, maybeAck?: any) => {
        const ack = maybeAck === undefined ? errOrAck : maybeAck;
        const err = maybeAck === undefined ? null : errOrAck;
        if (err) return resolve({ answerable: true });
        resolve({
          answerable: ack?.answerable !== false,
          status: ack?.status || ack?.state,
          error: ack?.error
        });
      });
    });
  } catch (e: any) {
    console.warn('[video] call-state-check failed; falling back to local answer flow', e);
    return { answerable: true };
  }
}




  waitForAnswer() {
    const timer = setInterval(() => {
      if (this.partnerEl && this.partnerEl.srcObject) {
        this.ringer.stop();
        this.messengerService.sendMessage({ event: 'stop-audio' });
        this.answered = true;
        clearTimeout(this.callTimeout);

        this.cdr.detectChanges(); // âœ… Force update
        this.countVideoCalls();
        this.swapVideo('my-video');
        clearInterval(timer);
      }
    }, 10);
  }

  getVideoCalls() {
    return this.nativeStorage.getItem('videoCalls').then(
      (calls) => {
        return calls;
      },
      (err) => {
        return [];
      }
    );
  }

  countVideoCalls() {
    this.getVideoCalls().then((calls) => {
        calls = Array.isArray(calls) ? calls : []; // âœ… Ensure it's an array
  calls = calls.filter((call) => call && typeof call.date === 'number' && (new Date().getTime() - call.date) < 24 * 60 * 60 * 1000);

        calls.push({
          id: this.authUser._id, // Changed from this.user.id
          date: new Date().getTime(),
        });

        this.nativeStorage.setItem('videoCalls', calls);
    });
}


  swapVideo(topVideo: string) {
    this.topVideoFrame = topVideo;
  }

  private stopLocalStream() {
    try {
      this.localStream?.getTracks().forEach(t => t.stop());
    } catch {}
    this.localStream = null;
  }

  async closeCall(): Promise<void> {
    if (this.tearingDown) return;
    this.tearingDown = true;
    this.markCallLocallyFinished();

    console.log('ðŸ“´ Closing the call with full cleanupâ€¦');

    this.clearUnansweredTimeout();
    this.stopCallTimer();
    this.ringer.stop();
    this.releaseWakeLock();
    this.clearFinishedCallState();
    // Tell peer ONLY if we initiated the hangup
    if (!this.isRemoteEnd && this.socket?.connected) {
      await this.emitWebSocketEvent(VideoEvents.ENDED, {
        from: this.authUser._id,
        to  : this.userId,
        callId: this.callId,
      });
    }
    this.stopLocalStream();
    // Silence re-emit when remote ended
    await this.webRTC.close({ silent: this.isRemoteEnd });
    this.localStream = null;

    // Tidy up
    if (this.myEl)      { this.myEl.srcObject = null; this.myEl.pause(); }
    if (this.partnerEl) { this.partnerEl.srcObject = null; this.partnerEl.pause(); }
    this.leaveCallRoom();

    this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
    this.tearingDown = false;
  }



  async cancel(manualClose = false, reason: 'cancel' | 'timeout' = 'cancel'): Promise<void> {
    if (this.tearingDown) return;
    this.tearingDown = true;
    this.markCallLocallyFinished();

    console.log('âŒ Cancelling callâ€¦');
    this.clearUnansweredTimeout();
    this.stopCallTimer();
    this.ringer.stop();
    this.releaseWakeLock();
    this.messengerService.sendMessage({ event: 'stop-audio' });
    this.clearFinishedCallState();

    if (this.socket?.connected) {
      if (!this.answered) {
        // Distinguish caller vs callee side: if answer=true, we're the callee rejecting
        if (this.answer) {
          if (reason !== 'timeout') {
            const base = { from: this.userId, to: this.authUser._id, callId: this.callId, at: Date.now() };
            await this.emitWebSocketEvent(VideoEvents.DECLINED, { ...base, reason: 'declined' });
          }
        } else if (reason === 'timeout') {
          const base = { from: this.authUser._id, to: this.userId, callId: this.callId, at: Date.now() };
          await this.emitWebSocketEvent(VideoEvents.MISSED_TIMEOUT, { ...base, reason: 'timeout' });
          await this.emitWebSocketEvent(VideoEvents.MISSED, { ...base, reason: 'timeout' });
          const payload = { ...base, reason: 'timeout' };
          try { this.socket.emit(VideoEvents.CANCELED, payload); } catch(_) {}
          try { this.socket.emit('cancel-video', payload); } catch(_) {}
        } else {
          const payload = { from: this.authUser._id, to: this.userId, callId: this.callId, at: Date.now(), reason: 'cancel' };
          try { this.socket.emit(VideoEvents.CANCELED, payload); } catch(_) {}
          try { this.socket.emit('cancel-video', payload); } catch(_) {}
        }
      } else {
        this.socket.emit(VideoEvents.ENDED, { from: this.authUser._id, to: this.userId, callId: this.callId });
      }
    }

    this.stopLocalStream();
    await this.webRTC.close({ silent: true });

    if (this.myEl)      { this.myEl.srcObject = null; this.myEl.pause(); }
    if (this.partnerEl) { this.partnerEl.srcObject = null; this.partnerEl.pause(); }
    this.localStream = null;

    if (!manualClose) this.router.navigate(['/tabs/messages/list']);
    this.tearingDown = false;
  }








startUnansweredTimeout() {
  this.clearUnansweredTimeout(); // cleanup if needed
  this.unansweredTimeout = setTimeout(() => {
    if (!this.answered) {
      console.warn('â±ï¸ Call unanswered after 60 seconds. Closing...');
      this.cancel(false, 'timeout');
    }
  }, 60000); // 60 seconds
}

clearUnansweredTimeout() {
  if (this.unansweredTimeout) {
    clearTimeout(this.unansweredTimeout);
    this.unansweredTimeout = null;
  }
}

async placeCall() {
  let started = false;
  try {
    const now = Date.now();
    if (now - this.lastPlaceCallAt < 2000) {
      this.toastService.presentErrorToastr('Please wait a moment before retrying the call');
      return;
    }
    this.lastPlaceCallAt = now;
    this.terminalCallClosed = false;
    this.hangupHandled = false;
    this.activeMediaCall = null;
    this.outgoingRetryAfterAccepted = false;
    this.placingCall = true;
    this.calling     = true;
    if (!this.callId) {
      this.callId = `call-${this.authUser?._id || 'me'}-${this.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    this.ringer.start('ringing.mp3');
    this.requestWakeLock();
    await this.consumeOneTimeVideoRequest();
    const wakeAlreadySent = await this.primeIncomingCallWake();
  // start the missed-call timeout immediately so PeerJS delays don't prevent it
  try { this.startMissedCallTimeout(); } catch(e) {}

    await this.webRTC.waitForPeerOpen();

    if (!this.myEl || !this.partnerEl) await this.waitForVideoElements();

    // ensure fresh local stream
    if (this.localStream && !this.localStream.getTracks().some(t => t.readyState === 'live')) {
      this.localStream = null;
    }
    if (!this.localStream) {
      this.localStream = await this.webRTC.getUserMedia();
      if (!this.localStream) {
        this.toastService.presentErrorToastr('Cannot access camera / mic');
        return;
      }
      this.showSelfPreview(this.localStream);
    }

    // tell WebrtcService who the peer is (used when closing)
    this.webRTC.partnerId = this.userId!;
    console.log('[peer:me]', {
      userId: this.webRTC.userId,
      peerId: WebrtcService.peer?.id,
      open:   WebrtcService.peer?.open
    });

    // Signaling/FCM invite has already been sent above.
    // Do NOT dial PeerJS yet. The receiver may still be opening the
    // app, registering its peer ID, or preparing camera/mic.
    //
    // Receiver will send ACCEPTED(stage='ready') when its PeerJS
    // listener is ready. Only then do we create ONE MediaConnection.
    started = true;
    this.calling = true;

    console.log('[video] invite sent; waiting for receiver READY', {
      callId: this.callId,
      to: this.userId,
      wakeAlreadySent
    });
  } catch (err: any) {
    this.ringer.stop();
    this.toastService.presentErrorToastr(err.message ?? String(err));
  } finally {
    this.placingCall = false;
    // ensure no dangling timeout remains if placeCall failed
    if (!started) {
      try { clearTimeout(this.callTimeout); this.callTimeout = null; } catch(e) {}
    }
  }
}

private async retryOutgoingMediaCallAfterAccepted(readyPeerId?: string): Promise<void> {
  if (this.outgoingRetryAfterAccepted || this.answered || this.answer) return;
  if (!this.userId || !this.callId) return;
  this.outgoingRetryAfterAccepted = true;
  console.log('[video] receiver READY; starting authoritative media call', {
    callId: this.callId,
    to: this.userId
  });

  try {
    if (!this.myEl || !this.partnerEl) await this.waitForVideoElements();
    this.webRTC.setVideoElements(this.myEl, this.partnerEl);

    if (this.localStream && !this.localStream.getTracks().some(t => t.readyState === 'live')) {
      this.localStream = null;
    }
    if (!this.localStream) {
      this.localStream = await this.webRTC.getUserMedia();
      if (!this.localStream) throw new Error('Cannot access camera / mic');
      this.showSelfPreview(this.localStream);
    }

    try {
      const previousCall = WebrtcService.call;
      if (previousCall && typeof (previousCall as any).close === 'function') {
        if (this.activeMediaCall === previousCall) {
          this.activeMediaCall = null;
        }
        previousCall.close();
      }
    } catch (_) {}
    WebrtcService.call = null;

    this.webRTC.partnerId = this.userId;
    const mc = await this.webRTC.startCall(this.userId, this.localStream, {
      callId: this.callId,
      videoRequestId: this.videoRequestId,
      wakeOnFirstLookup: false,
      preferredPeerId: readyPeerId
    });
    this.wireHangup(mc);
    mc.on('stream', (remote) => this.attachRemoteStream(remote));
    mc.on('error', (e) => console.error('[call:accepted-retry] error', e));
  } catch (err: any) {
    this.outgoingRetryAfterAccepted = false;
    const message = err?.message || 'Could not connect to the accepted call yet.';
    console.warn('[video] accepted media retry failed', err);
    this.toastService.presentErrorToastr(message);
  }
}


private async primeIncomingCallWake(): Promise<boolean> {
  if (!this.userId || !this.callId) return false;
  try {
    await this.userService.getPartnerPeerId(this.userId, true, {
      callId: this.callId,
      callType: 'video',
      videoRequestId: this.videoRequestId
    }).toPromise();
    return true;
  } catch (e) {
    console.warn('[video] early incoming-call wake failed; startCall will retry wake', e);
    return false;
  }
}
private async consumeOneTimeVideoRequest() {
  if (!this.videoRequestId || !this.socket?.connected) return;
  try {
    this.socket.emit('video-call-used', { messageId: this.videoRequestId });
    console.log('[video] consumed one-time video request', this.videoRequestId);
    this.videoRequestId = undefined;
  } catch (e) {
    console.warn('[video] failed to consume one-time video request', e);
  }
}




onRemoteVideoPlaying(): void {
  if (this.remoteVideoReady) return;

  const el = this.partnerVideoRef?.nativeElement;
  const stream = el?.srcObject as MediaStream | null;

  if (!stream) return;

  const liveVideo = stream
    .getVideoTracks()
    .some(track =>
      track.readyState === 'live' &&
      track.enabled
    );

  if (!liveVideo) return;

  // A 'playing' event alone is not enough on some Android WebViews.
  // Do not expose the native video surface until a decoded frame exists.
  if (!el.videoWidth || !el.videoHeight) {
    console.warn('[video-ui] playing without decoded remote frame yet', {
      videoWidth: el.videoWidth,
      videoHeight: el.videoHeight
    });
    return;
  }

  console.error('[PERF][ui] REMOTE_VIDEO_VISIBLE', {
    callId: this.callId,
    streamId: stream.id,
    videoWidth: el.videoWidth,
    videoHeight: el.videoHeight
  });

  this.remoteVideoReady = true;
  this.answered = true;
  this.cdr.detectChanges();
}


private attachRemoteStream(remote: MediaStream): void {
  console.error('[PERF][media] REMOTE_MEDIA', {
    callId: this.callId,
    at: performance.now(),
    tracks: remote?.getTracks?.().map(t => ({
      kind: t.kind,
      state: t.readyState
    }))
  });
  if (this.localStream && remote && remote.id === this.localStream.id) {
    console.warn('[video] ignoring local stream attached as remote stream');
    return;
  }
  const el = this.partnerVideoRef.nativeElement;
  el.srcObject = remote;
  el.muted = false;
  el.volume = 1;

  const playNow = () => el.play().catch(() => {});
  if (el.readyState >= 1) { playNow(); }
  else                    { el.onloadedmetadata = playNow; }
  this.connectingAfterRemoteReady = false;
  this.clearCallTimeout();
  this.clearUnansweredTimeout();
  this.ringer.stop();
  this.answered = true;
  this.startCallTimer();
  this.cdr.detectChanges();
}


// In video.component.ts - modify the answerCall() method
async answerCall(): Promise<void> {
  if (this.answerCallPromise) return this.answerCallPromise;
  this.answerCallPromise = this.performAnswerCall();
  try {
    await this.answerCallPromise;
  } finally {
    this.answerCallPromise = null;
  }
}

private async performAnswerCall(): Promise<void> {
console.log('[video] answerCall invoked', { callId: this.callId, autoAnswer: this.autoAnswer, hasAnswered: this.hasAnswered, answeringCall: this.answeringCall });

  /* make sure cached stream is still live */
if (this.localStream &&
  !this.localStream.getTracks().some(t => t.readyState === 'live')) {
this.localStream = null;
}
if (this.hasAnswered) return;
this.hangupHandled = false;
this.activeMediaCall = null;
this.terminalCallClosed = false;
this.hasAnswered = true;

  try {
    this.answeringCall = true;
    this.cdr.detectChanges();

    const answerPerfStart = performance.now();
    const perf = (stage: string) => {
      console.error(
        `[PERF][answer] ${stage} +${Math.round(performance.now() - answerPerfStart)}ms`,
        { callId: this.callId }
      );
    };

    perf('TAP');

    // User already accepted: stop ringing immediately instead of waiting
    // for validation / PeerJS / camera.
    this.ringer.stop();
    this.requestWakeLock();

    const hasLiveLocal =
      !!this.localStream &&
      this.localStream.getTracks().some(t => t.readyState === 'live');

    /*
     * These operations do not depend on each other, so run them together:
     *
     * 1. backend verifies the call is still answerable
     * 2. PeerJS listener is made ready
     * 3. camera/mic are acquired
     *
     * Manual incoming calls normally already warmed PeerJS from
     * ionViewWillEnter(), so do not repeat the backend peer registration.
     */
    const validationPromise = this.validateAnswerableCall()
      .then(result => {
        perf('VALIDATION_DONE');
        return result;
      })
      .catch(err => {
        console.error('[PERF][answer] VALIDATION_FAILED', err, err?.stack);
        throw err;
      });

    const peerPromise: Promise<void> = (
      this.answer
        ? (
            this.autoAnswer
              ? this.ensureIncomingPeerReady()
              : (
                  WebrtcService.peer?.open && this.webRTC.getPeerId()
                    ? this.webRTC.wait(this.callId)
                    : this.ensureIncomingPeerReady()
                )
          )
        : Promise.resolve()
    ).then(result => {
      perf('PEER_READY');
      return result;
    }).catch(err => {
      console.error('[PERF][answer] PEER_FAILED', err, err?.stack);
      throw err;
    });

    const mediaPromise: Promise<MediaStream | null> = (
      hasLiveLocal
        ? Promise.resolve(this.localStream)
        : this.webRTC.getUserMedia()
    ).then(result => {
      perf('MEDIA_READY');
      return result;
    }).catch(err => {
      console.error('[PERF][answer] MEDIA_FAILED', err, err?.stack);
      throw err;
    });

    const [state, , preparedStream] = await Promise.all([
      validationPromise,
      peerPromise,
      mediaPromise
    ]);

    perf('VALIDATION_PEER_MEDIA_READY');

    if (!state.answerable) {
      throw new Error(
        state.status === 'timeout'
          ? 'This call has expired.'
          : 'This call is no longer available.'
      );
    }

    if (!preparedStream) {
      throw new Error('Cannot access camera / mic');
    }

    this.localStream = preparedStream;
    this.showSelfPreview(this.localStream);

    perf('READY_SIGNAL_START');

    await this.signalAcceptedToCaller('ready');

    perf('READY_SIGNAL_SENT');

    const incoming = await this.waitForIncomingCall(this.autoAnswer ? 85000 : 45000);
    if (!incoming || typeof (incoming as any).answer !== 'function') {
      WebrtcService.call = null;
      throw new Error('This call is no longer answerable');
    }

    // Install remote-media listeners BEFORE answer().
    // PeerJS can emit the remote stream very quickly after answer and
    // registering afterwards can miss the first stream event.
    let remoteAttached = false;

    const attachIncomingRemote = (remote: MediaStream | null | undefined) => {
      if (!remote || remoteAttached) return;

      if (
        this.localStream &&
        remote.id === this.localStream.id
      ) {
        console.warn('[answer] ignoring local stream as remote');
        return;
      }

      remoteAttached = true;

      console.error('[PERF][receiver] REMOTE_MEDIA', {
        callId: this.callId,
        streamId: remote.id,
        tracks: remote.getTracks().map(t => `${t.kind}:${t.readyState}`)
      });

      this.attachRemoteStream(remote);
    };

    incoming.on('stream', (remote: MediaStream) => {
      attachIncomingRemote(remote);
    });

    try {
      incoming.peerConnection?.addEventListener('track', (ev: RTCTrackEvent) => {
        const remote = ev.streams?.[0];
        if (remote) {
          attachIncomingRemote(remote);
        }
      });
    } catch (_) {}

    incoming.on('error', (e) => console.error('[answer] error', e));

    // Usually answered synchronously by WebrtcService.wait().
    if (!(incoming as any).__folcenAnswered) {
      console.error('[answer] fallback answer()', {
        callId: this.callId,
        peer: incoming.peer
      });

      incoming.answer(this.localStream);
      (incoming as any).__folcenAnswered = true;
    }

    await this.signalAcceptedToCaller('answered');

    this.wireHangup(incoming);
    this.startCallTimer();
    this.ringer.stop();

    this.answered = true;
    this.countVideoCalls();

  } catch (err: any) {
    this.hasAnswered = false;
    this.answered = false;
    this.stopCallTimer();
    this.ringer.stop();
    const message = err?.message || 'Unable to answer call yet. Please try again.';
    this.toastService.presentErrorToastr(message);
    if (/no longer|expired|answerable|available/i.test(message)) {
      this.clearFinishedCallState();
      try { await this.webRTC.close({ silent: true }); } catch (_) {}
      this.router.navigate(['/tabs/messages/list'], { replaceUrl: true });
    }
  } finally {
    this.answeringCall = false;
    this.cdr.detectChanges();
  }
}

private async signalAcceptedToCaller(stage: 'ready' | 'answered'): Promise<void> {
  if (this.acceptedSignalStagesSent.has(stage)) return;
  if (!this.userId || !this.authUser?._id) return;
  this.acceptedSignalSent = true;
  this.acceptedSignalStagesSent.add(stage);
  console.log('[video] signaling accepted to caller', { stage, callId: this.callId, caller: this.userId, callee: this.authUser._id });
  // Callee -> caller.
  // On an incoming call:
  //   authUser = callee (this device)
  //   userId   = caller
  await this.emitWebSocketEvent(VideoEvents.ACCEPTED, {
    // Backend contract:
    // from = original caller
    // to   = original callee
    from: this.userId,
    to: this.authUser._id,
    callId: this.callId,
    stage,
    peerId: stage === 'ready' ? this.webRTC.getPeerId() : undefined
  });
}

private async waitForIncomingCall(timeoutMs = 12000): Promise<MediaConnection | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (WebrtcService.call && typeof (WebrtcService.call as any).answer === 'function') return WebrtcService.call;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return WebrtcService.call && typeof (WebrtcService.call as any).answer === 'function' ? WebrtcService.call : null;
}



  toggleAudio() {
    if (!this.webRTC.myStream) {
      console.error("âŒ Cannot toggle audio: Media stream is not initialized.");
      return;
    }
    this.audioEnabled = this.webRTC.toggleAudio();
  }

  toggleCamera() {
    if (!this.webRTC.myStream) {
      console.error("âŒ Cannot toggle camera: Media stream is not initialized.");
      return;
    }
    this.cameraEnabled = this.webRTC.toggleCamera();
  }


  toggleCameraDirection() {
    this.webRTC.toggleCameraDirection();
  }



  isCordovaAvailable(): boolean {
    return !!(window.cordova && window.cordova.platformId !== 'browser');
  }
}
