import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';
import { Platform } from '@ionic/angular';
import { ElementRef, Injectable, NgZone, Inject, forwardRef } from '@angular/core';
import Peer, { MediaConnection, PeerJSOption } from 'peerjs';
import { PermissionService } from './permission.service';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { UserService } from './user.service';
import { IdService } from './id.service';
import { ToastService } from './toast.service';
import { User } from '../models/User';
import { SocketService } from './socket.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DeviceManagerService } from './device-manager.service';
import { VideoEvents } from '../pages/messages/chat/video/events';
import { AppEventsService } from './app-events.service';

interface MissedCall {
  userId: string;
  userName: string;
  timestamp: string;
  userAvatar?: string;
}
type MaybeWrapped<T> = T | { data: T };

function unwrapUser(resp: MaybeWrapped<User>): User {
  const anyResp = resp as any;
  return (anyResp && typeof anyResp === 'object' && 'data' in anyResp)
    ? (anyResp.data as User)
    : (resp as User);
}

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  static peer: Peer;
  myStream: MediaStream;
  public myEl?: HTMLVideoElement;
  public partnerEl?: HTMLVideoElement;
  private latestRemoteStream: MediaStream | null = null;
  user: User = new User(); // ✅ Added user property here
  private peerHeartbeatInterval: any;
  private missedCallsSubject = new BehaviorSubject<MissedCall[]>([]);
  public missedCalls$ = this.missedCallsSubject.asObservable();
  private deviceChangeListener: () => void;
  private activeStreams: Map<string, MediaStream> = new Map(); // Track streams by tabId
  private tabId = Math.random().toString(36).substring(2, 9); // Unique tab ID
  private isClosed = false;
  private activeDevices: { video?: string, audio?: string } = {};
  private deviceLockChannel?: BroadcastChannel;
  myPeerId: string;
  public localStream: MediaStream | null = null;
  stun = 'stun.l.google.com:19302';
  mediaConnection: MediaConnection;
  options: PeerJSOption;
  stunServer: RTCIceServer = { urls: 'stun:' + this.stun, };
  static call;
  facingMode = "user";
  public partnerId?: string;
  public userId?: string;
  private missedHandlersBound = false;
  private callTimeoutTimer: any = null; // timeout for unanswered outbound/inbound calls
  private lastMissedEmitKey: string | null = null; // guard for single explicit missed emission per attempt

  constructor(
    private androidPermission: AndroidPermissions,
    private permissionService: PermissionService,
    private router: Router,
    private nativeStorage: NativeStorage,
    private socketService: SocketService,
    private userService: UserService,
    private toastService: ToastService,
    private zone: NgZone,
    private deviceManager: DeviceManagerService
    , private appEvents: AppEventsService
    , @Inject(forwardRef(() => IdService)) private idService: IdService
  ) {
    this.options = { key: 'cd1ft79ro8g833di', debug: 3 };
    this.loadMissedCallsFromStorage();

  // forward initial missed calls into app-level stream (do not run heavy ops in zone)
  // we use runOutsideAngular to avoid triggering CD for this initial wiring
  this.zone.runOutsideAngular(() => {
    try { this.appEvents.setMissedCalls(this.missedCallsSubject.value || []); } catch(e) {}
  });

    // Safely set up device change listener
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      this.deviceChangeListener = () => {
        this.handleDeviceChange();
        this.refreshDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
    } else {
      console.warn('MediaDevices API not available');
    }

    if (typeof BroadcastChannel !== 'undefined') {
      this.deviceLockChannel = new BroadcastChannel('device_locks');
      this.deviceLockChannel.onmessage = (event) => {
        if (event.data.type === 'release' && this.activeDevices[event.data.kind] === event.data.deviceId) {
          delete this.activeDevices[event.data.kind];
        }
      };
    }
  }

  private delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 🔁 Retry getUserMedia in case of temporary device lock
  private async tryGetMediaStreamWithRetries(
    constraints: MediaStreamConstraints,
    retries: number = 3,
    delay: number = 500
  ): Promise<MediaStream> {
    for (let i = 0; i < retries; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        if (i === retries - 1) throw error;
        console.warn(`🔁 Retry (${i + 1}) after error:`, error);
        await this.delay(delay);
      }
    }
    throw new Error("Failed to get media stream after retries");
  }

  // ✅ Main function: acquire stream with specific devices and tab locking
  async getStreamForTabWithDeviceIds(videoId: string, audioId: string, tabId: string): Promise<MediaStream | null> {
    console.log(`[webrtc] 🎥 trying getUserMedia with:\n→ video deviceId: ${videoId}\n→ audio deviceId: ${audioId}\n→ tabId: ${tabId}`);

    // 1. Release any currently active stream
    if (this.myStream) {
      console.log('[webrtc] 🔁 Releasing previous stream');
      this.myStream.getTracks().forEach(track => track.stop());
      this.myStream = null;
    }

    // 2. Check if devices are locked
    const isVideoAvailable = await this.deviceManager.acquireDevice(videoId, tabId);
    const isAudioAvailable = await this.deviceManager.acquireDevice(audioId, tabId);
    if (!isVideoAvailable || !isAudioAvailable) {
      console.warn('🔒 One or both devices are locked by another tab.');
      return null;
    }

    // 3. Try to get media stream with retries
    const MAX_RETRIES = 3;
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoId } },
          audio: {
            deviceId: { exact: audioId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        this.myStream = stream;
        console.log('[webrtc] ✅ Acquired stream successfully.');
        return stream;
      } catch (error: any) {
        attempts++;
        if (error.name === 'OverconstrainedError') {
          console.warn(`🔁 Retry (${attempts}) after OverconstrainedError for tab ${tabId}`);
          await this.delay(500); // delay between retries
        } else {
          console.error('❌ Failed to get media stream:', error);
          break;
        }
      }
    }

    // 4. Release the locks if acquisition failed
    this.deviceManager.releaseDevice(videoId, tabId);
    this.deviceManager.releaseDevice(audioId, tabId);

    return null;
  }
  ngOnDestroy() {
    // Clean up device change listener
    if (this.deviceChangeListener && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
    }

    // Clean up BroadcastChannel
    if (this.deviceLockChannel) {
      this.deviceLockChannel.close();
    }

    // Ensure all resources are released
    this.close();
  }

  private get peer(): Peer {
    return WebrtcService.peer;
  }

  /** Start an outgoing call and keep a reference to it */
  /** webrtc.service.ts ───────────────────────────────────────────────────
   * Start an outgoing video-call. (user-id → peer-id)
   * – guarantees our own PeerJS instance is OPEN
   * – resolves the partner’s current peer-id
   * – pings the peer before dialling
   * – emits the “video-call-started” socket event
   * – returns the MediaConnection so the caller can attach <stream> events
   * */
  public async startCall(
    partnerUserId : string, // <-- pass USER-ID here
    localStream : MediaStream, // <-- already opened camera/mic
    options: { callId?: string; videoRequestId?: string } = {}
  ): Promise<MediaConnection> {
    // reset explicit-missed emission guard for a fresh attempt
    this.lastMissedEmitKey = null;
    this.isClosed = false; // ✅ allow reinitialization
    if (!WebrtcService.peer) {
      await this.createPeer(this.userId); // fallback
    }

    /* 0 — sanity checks -------------------------------------------------- */
    if (!localStream) {
      throw new Error('Local MediaStream missing');
    }
    if (!this.userId) {
      throw new Error('auth userId not set');
    }

    /* 1 — make sure *our* peer is ready --------------------------------- */
    await this.createPeer(this.userId); // no-op if it already exists
    await this.waitForPeerOpen(); // throws after 10 s timeout

    /* 2 — look-up partner’s current peer-id ------------------------------ */
    const callId = options.callId || this.createCallId(partnerUserId);
    const partnerPeerId = await this.resolvePartnerPeerId(partnerUserId, callId, options.videoRequestId);
    if (!partnerPeerId) {
      throw new Error('Partner is offline or has no peer-id');
    }



    /* 4 — dial! ---------------------------------------------------------- */
    const mc = this.peer.call(
      partnerPeerId,
      localStream,
      { sdpTransform: preferVp8 } // keep the VP8 tweak
    );
    WebrtcService.call = mc; // store globally

    // start outbound timeout: if nobody answers, teardown and emit timeout
    try { clearTimeout(this.callTimeoutTimer); } catch(_) {}
    this.callTimeoutTimer = setTimeout(async () => {
      try {
        // if still not connected, close local call and notify server
        const stillConnected = this.callState.value && this.callState.value.connected;
        if (!stillConnected) {
          console.log('[webrtc] outbound timeout fired; closing call and notifying server');
          try { mc.close(); } catch(e) { console.warn('[webrtc] mc.close failed', e); }

          // update local state so caller UI reflects timeout
          try { this.zone.run(() => this.callState.next({ connected: false, type: 'caller' })); } catch(e) {}

          // send a timeout signal to the server so callee and other devices know
          try {
            const sock = await SocketService.getSocket();
            if (sock?.connected) {
              sock.emit('video-call-timeout', { from: this.userId, to: partnerUserId, callId, at: Date.now() });
              // Explicit missed outcome for callee (authoritative)
              this.emitMissedOutcomeOnce(this.userId!, partnerUserId, 'timeout');
            }
          } catch (e) { console.warn('[webrtc] failed to emit video-call-timeout', e); }

          // central cleanup to clear streams/refs
          this.cleanupCallState('timeout');
        }
      } catch (e) { console.warn('[webrtc] outbound timeout handler error', e); }
    }, 30000); // 30s outbound timeout

    const connected = () => this.callState.next({ connected: true, type: 'caller' });
    let remoteAttached = false;
    
    mc.once('stream', (remote) => {
      if (remoteAttached) return;
      remoteAttached = true;
      try { clearTimeout(this.callTimeoutTimer); } catch(_) {}
      this.attachRemoteStream(this.partnerEl!, remote, connected);
    });
    
    mc.peerConnection?.addEventListener('track', (ev) => {
      const [remote] = ev.streams;
      if (remote && !remoteAttached) {
        try { clearTimeout(this.callTimeoutTimer); } catch(_) {}
        remoteAttached = true;
        this.attachRemoteStream(this.partnerEl!, remote, connected);
      }
    });
    

    /* 5 — emit “video-call-started” via socket --------------------------- */
    try {
      const sock = await SocketService.getSocket(); // static helper in your svc
      sock?.emit('video-call-started', {
        from : this.userId,
        to : partnerUserId,
        callId,
        myPeerId : this.getPeerId(),
        partnerPeerId
      });
    } catch {
      /* socket not critical – ignore */
    }

    return mc;
  }

  private async resolvePartnerPeerId(partnerUserId: string, callId?: string, videoRequestId?: string): Promise<string | null> {
    const delays = [0, 350, 700, 1200, 1800, 2500, 3200];
    let lastPeerId: string | null = null;

    for (let i = 0; i < delays.length; i++) {
      const delayMs = delays[i];
      if (delayMs) await this.delay(delayMs);
      try {
        lastPeerId = await this.userService.getPartnerPeerId(
          partnerUserId,
          i === 0,
          callId ? { callId, callType: 'video', videoRequestId } : undefined
        ).toPromise();
        if (lastPeerId) return lastPeerId;
      } catch (err) {
        console.warn('[webrtc] partner peer lookup failed; retrying', err);
      }
    }

    return lastPeerId;
  }

  private createCallId(partnerUserId: string): string {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `call-${this.userId || 'me'}-${partnerUserId}-${Date.now()}-${randomPart}`;
  }

  // central cleanup used when remote cancels or timeout occurs
  private cleanupCallState(reason?: string) {
    try { clearTimeout(this.callTimeoutTimer); } catch(_) {}
    this.callTimeoutTimer = null;

    try {
      if (WebrtcService.call) {
        try { WebrtcService.call.close(); } catch(_) {}
        WebrtcService.call = null;
      }
    } catch (_) {}

    try {
      if (this.partnerEl) this.partnerEl.srcObject = null;
    } catch(_) {}

    try {
      // keep local stream active, but clear partner references
      this.partnerId = undefined;
    } catch(_) {}

    try { this.zone.run(() => this.callState.next(null)); } catch(_) {}
    console.log('[webrtc] cleanupCallState', reason || 'cleanup');
  }

  /**
   * Emit a single explicit missed-call outcome before cleanup. This is authoritative
   * and should be the only source the backend uses for budget updates.
   * Guarded by a key (callerId|calleeId) so duplicates from race-y paths are avoided.
   */
  private async emitMissedOutcomeOnce(callerId: string, calleeId: string, why: 'timeout'|'cancel'|'rejected'): Promise<void> {
    try {
      if (why !== 'timeout') return;
      const key = `${callerId}|${calleeId}`;
      if (this.lastMissedEmitKey === key) return; // already emitted for this attempt
      this.lastMissedEmitKey = key;
      const sock = await SocketService.getSocket();
      if (!sock?.connected) return;
      const base = { from: callerId, to: calleeId, at: Date.now() };
      sock.emit(VideoEvents.MISSED_TIMEOUT,  { ...base, reason: 'timeout' });
      // For older servers that only understand generic 'missed-call'
      sock.emit(VideoEvents.MISSED, { ...base, reason: 'timeout' });
    } catch(e) { console.warn('[webrtc] emitMissedOutcomeOnce failed', e); }
  }

  public async getOptimalMediaStream(): Promise<MediaStream> {
    try {
      // Get available devices with locking
      const videoDeviceId = await this.deviceManager.getAvailableDevice('videoinput', this.tabId);
      const audioDeviceId = await this.deviceManager.getAvailableDevice('audioinput', this.tabId);
      if (!videoDeviceId || !audioDeviceId) {
        throw new Error('All devices are currently in use');
      }

      // Store the acquired device IDs
      this.activeDevices = { video: videoDeviceId, audio: audioDeviceId };
      console.log('Using devices:', { video: videoDeviceId, audio: audioDeviceId });

      // Create stream with acquired devices
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 30 },
          deviceId: { exact: videoDeviceId }
        },
        audio: {
          deviceId: { exact: audioDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Log the actual devices being used
      stream.getTracks().forEach(track => {
        const settings = track.getSettings();
        console.log(`Active ${track.kind}:`, {
          deviceId: settings.deviceId,
          label: track.label,
          ...settings
        });
      });

      return stream;
    } catch (error) {
      console.error('Error acquiring optimal media stream:', error);

      // Fallback strategy with device locking
      try {
        console.log('Attempting fallback with relaxed constraints');
        const fallbackStream = await this.getFallbackMediaStream();

        // Update active devices with whatever worked in fallback
        fallbackStream.getTracks().forEach(track => {
          const settings = track.getSettings();
          if (track.kind === 'video') {
            this.activeDevices.video = settings.deviceId;
          } else if (track.kind === 'audio') {
            this.activeDevices.audio = settings.deviceId;
          }
        });

        return fallbackStream;
      } catch (fallbackError) {
        console.error('Fallback media acquisition failed:', fallbackError);
        throw new Error(
          'Could not acquire any media devices. Please check your camera and microphone permissions.'
        );
      }
    }
  }

  public setVideoElements(my: HTMLVideoElement, partner: HTMLVideoElement) {
    this.myEl = my;
    this.partnerEl = partner;
    this.myEl.muted = true;
    this.myEl.volume = 0;
    this.partnerEl.muted = false;
    this.partnerEl.volume = 1;

    /* replay local stream (after navigation) */
    if (this.myStream) this.myEl.srcObject = this.myStream;

    /* replay remote stream (after navigation) */
    if (this.latestRemoteStream) this.partnerEl.srcObject = this.latestRemoteStream;
  }

  public clearVideoElements() {
    this.myEl = this.partnerEl = undefined;
  }
  public async listAllMediaDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("📷📢 Available media devices:");
      devices.forEach((device, index) => {
        console.log(`[${index}] ${device.kind}: "${device.label || '(label hidden)'}" (deviceId: ${device.deviceId})`);
      });
    } catch (err) {
      console.error("❌ Failed to list media devices:", err);
    }
  }

  private async getFallbackMediaStream(): Promise<MediaStream> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    const audioDevices = devices.filter(d => d.kind === 'audioinput');

    // Try each video device until one works
    for (const videoDevice of videoDevices) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoDevice.deviceId } },
          audio: audioDevices.length > 0 ? {
            deviceId: { exact: audioDevices[0].deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        return stream;
      } catch (videoError) {
        console.log(`Video device ${videoDevice.deviceId} failed, trying next...`);
      }
    }

    // If all video devices failed, try audio only
    for (const audioDevice of audioDevices) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: audioDevice.deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        return stream;
      } catch (audioError) {
        console.log(`Audio device ${audioDevice.deviceId} failed, trying next...`);
      }
    }

    throw new Error('No available media devices found');
  }

  public getMissedCalls(): MissedCall[] {
    return this.missedCallsSubject.value;
  }

  // Update registerMissedCall to prevent duplicates and include names
  public async registerMissedCall(userId: string): Promise<void> {
    try {
      const current = this.missedCallsSubject.value || [];
      const now = Date.now();
      if (current.some(c => c.userId === userId && now - new Date(c.timestamp).getTime() < 60_000)) return;
  
      let userName: string | undefined;
      let userAvatar: string | undefined;
      try {
        const resp = await this.userService.getUserProfile(userId).toPromise();
        const u = unwrapUser(resp as MaybeWrapped<User>);
        userName   = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || undefined;
        userAvatar = u?.mainAvatar;
      } catch {}
  
      const newCall = {
        userId,
        userName: userName || `User ${userId.slice(0, 6)}`,
        userAvatar,
        timestamp: new Date().toISOString(),
      };
  
      const updated = [newCall, ...current];
      localStorage.setItem('missedCalls', JSON.stringify(updated));
  
      // update internal subject outside the zone first, then notify UI within zone
      this.missedCallsSubject.next(updated);
      try {
        this.zone.run(() => { this.appEvents.setMissedCalls(updated); });
      } catch(e) {}
      console.log('📒 missed-call stored:', newCall);
    } catch (e) {
      console.error('Error registering missed call:', e);
    }
  }
  // Update clearMissedCalls
  clearMissedCalls(): void {
    localStorage.removeItem('missedCalls');
    // record the clear time so late-arriving/old signals don't re-add cleared calls
    const clearedAt = Date.now();
    localStorage.setItem('missedCallsClearedAt', String(clearedAt));
    this.zone.run(() => {
      this.missedCallsSubject.next([]);
      try { this.appEvents.setMissedCalls([]); } catch(e) {}
    });
    // notify other sessions/devices (server may broadcast to other sockets)
    (async () => {
      try {
        const sock = await SocketService.getSocket();
        if (sock?.connected && this.userId) {
          sock.emit('missed-calls-cleared', { userId: this.userId, clearedAt });
        }
      } catch (e) { /* ignore */ }
    })();
  }

  // Remove missed calls for a specific user and update observers
  public removeMissedCallsFor(userId: string): void {
    try {
      const stored = JSON.parse(localStorage.getItem('missedCalls') || '[]') as MissedCall[];
      const filtered = stored.filter(c => c.userId !== userId);
      localStorage.setItem('missedCalls', JSON.stringify(filtered));
      this.zone.run(() => {
        this.missedCallsSubject.next(filtered);
        try { this.appEvents.setMissedCalls(filtered); } catch(e) {}
      });
      console.log('[webrtc] removed missed calls for', userId);
      // notify other sessions to remove this user's missed calls as well
      (async () => {
        try {
          const sock = await SocketService.getSocket();
          if (sock?.connected && this.userId) {
            // send ownerUserId to match backend's expected payload key
            sock.emit('missed-call-removed', { ownerUserId: this.userId, removedUserId: userId, at: Date.now() });
          }
        } catch(e) {}
      })();
    } catch (e) {
      console.warn('[webrtc] failed to remove missed calls for', userId, e);
    }
  }

  public addMissedCall(call: MissedCall): void {
    const current = this.missedCallsSubject.value || [];
    // ignore if this missed call is older than the last clear time
    try {
      const clearedAt = Number(localStorage.getItem('missedCallsClearedAt') || '0');
      const callTs = call.timestamp ? new Date(call.timestamp).getTime() : Date.now();
      if (clearedAt && callTs <= clearedAt) return; // don't re-add old cleared calls
    } catch (e) { /* ignore */ }
    const isDup = current.some(c =>
      c.userId === call.userId &&
      Math.abs(new Date(c.timestamp).getTime() - new Date(call.timestamp).getTime()) < 60_000
    );
    if (isDup) return;
  
    const updated = [call, ...current];
    localStorage.setItem('missedCalls', JSON.stringify(updated));
    // update subject outside Angular to avoid CD thrash
    this.missedCallsSubject.next(updated);
    try {
      console.log('[webrtc] addMissedCall -> adding missed call for', call.userId, call.userName, call.timestamp);
      this.zone.run(() => { this.appEvents.setMissedCalls(updated); });
    } catch(e) { console.warn('[webrtc] addMissedCall: appEvents.setMissedCalls failed', e); }
  }

  // webrtc.service.ts
  addMissedCallFromSignaling(ev: any, myId: string, eventName?: string) {
    console.log('[webrtc] addMissedCallFromSignaling received', { ev, myId, eventName });
    // defensive: if myId not provided (race during startup), try to recover from localStorage
    if (!myId) {
      try {
        const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
        myId = raw ? (JSON.parse(raw)?._id || JSON.parse(raw)?.id) : myId;
        if (myId) console.log('[webrtc] recovered myId from storage in addMissedCallFromSignaling', myId);
      } catch(e) {}
    }
    const callerId = ev?.callerId ?? ev?.from;
    const calleeId = ev?.calleeId ?? ev?.to;
    const reasonPayload = (ev?.reason ?? ev?.type ?? ev?.event ?? '').toString();
    const iAmCallee = !!myId && myId === calleeId;

    // Determine "explicit missed" either by the socket event name
    // or by legacy payload markers ("missed", "missed-call").
    const isExplicitByEvent = [
      VideoEvents.MISSED as any,
      VideoEvents.MISSED_TIMEOUT as any,
      'missed-call'
    ].includes(eventName as any);

    const isExplicitByReason = reasonPayload === 'missed' || reasonPayload === 'missed-call' || reasonPayload === 'timeout';

    if (!(iAmCallee && (isExplicitByEvent || isExplicitByReason))) {
      console.log('[webrtc] addMissedCallFromSignaling -> ignored (not callee or not explicit)', { iAmCallee, isExplicitByEvent, isExplicitByReason });
      return;
    }

    console.log('[webrtc] addMissedCallFromSignaling -> registering missed for callerId', callerId);
    this.addMissedCall({
      userId: callerId,
      userName: ev?.callerName ?? ev?.fromName ?? 'Unknown',
      timestamp: ev?.at ?? new Date().toISOString()
    });
  }

  loadMissedCallsFromStorage(): void {
    try {
      const stored = localStorage.getItem('missedCalls');
      const parsed: MissedCall[] = stored ? JSON.parse(stored) : [];
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      const sanitized = (Array.isArray(parsed) ? parsed : []).filter((call: any) => {
        if (!call || !call.userId) return false;
        const ts = call.timestamp ? new Date(call.timestamp).getTime() : 0;
        if (!ts || !Number.isFinite(ts)) return false;
        return (now - ts) <= maxAgeMs;
      });
      if (sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
        localStorage.setItem('missedCalls', JSON.stringify(sanitized));
      }
      // do not force change detection for heavy load; update internals then notify zone
      this.missedCallsSubject.next(sanitized);
      try { this.zone.run(() => { this.appEvents.setMissedCalls(sanitized); }); } catch(e) {}
    } catch (err) {
      console.error('Error loading missed calls:', err);
      this.missedCallsSubject.next([]);
      try { this.zone.run(() => { this.appEvents.setMissedCalls([]); }); } catch(e) {}
    }
  }

// change signature
public async bindMissedCallSocketHandlers() {
  const sock = await SocketService.getSocket();
  if (!sock || this.missedHandlersBound) return;
  // Keep the socket handlers outside Angular zone to avoid CD on every signal burst
  this.zone.runOutsideAngular(() => {
  const names = [
    // teardown-only events (no missed accounting here)
    'video-canceled',
    'video-call-cancelled',
    'cancel-video',
    'video-call-timeout',
    VideoEvents.CANCELED as any,
    VideoEvents.TIMEOUT as any,
  ];

  names.forEach(n => { try { sock.off(n); } catch(_) {} });
  // IMPORTANT: do NOT bind missed accounting to teardown events; cleanup only is handled below

  // Listen for cross-device clear/remove events so clears sync across sessions
  try { sock.off('missed-calls-cleared'); } catch(_) {}
  try { sock.off('missed-call-removed'); } catch(_) {}

  // Keep the handlers outside Angular and only re-enter zone to update UI state
  sock.on('missed-calls-cleared', (ev: any) => {
    try {
      const owner = ev?.userId || ev?.owner;
      const clearedAt = ev?.clearedAt || ev?.at;
      if (!owner || owner !== this.userId) return;
      // adopt cleared timestamp and empty list
      localStorage.setItem('missedCallsClearedAt', String(clearedAt || Date.now()));
      localStorage.removeItem('missedCalls');
      this.missedCallsSubject.next([]);
      try { this.zone.run(() => { this.appEvents.setMissedCalls([]); }); } catch(e) {}
    } catch (e) { /* ignore */ }
  });

  sock.on('missed-call-removed', (ev: any) => {
    try {
      // accept either owner or ownerUserId for compatibility
      const owner = ev?.ownerUserId || ev?.owner;
      const removedUserId = ev?.removedUserId;
      if (!owner || owner !== this.userId || !removedUserId) return;
      const stored = JSON.parse(localStorage.getItem('missedCalls') || '[]') as MissedCall[];
      const filtered = stored.filter(c => c.userId !== removedUserId);
      localStorage.setItem('missedCalls', JSON.stringify(filtered));
      this.missedCallsSubject.next(filtered);
      try { this.zone.run(() => { this.appEvents.setMissedCalls(filtered); }); } catch(e) {}
    } catch (e) { /* ignore */ }
  });
  // ensure active calls are torn down when remote cancels or timeouts
  sock.off('video-canceled'); try { } catch(_) {}
  sock.off('video-call-timeout'); try { } catch(_) {}
  sock.on('video-canceled', async (ev:any) => {
    try {
      // Normalize ids
      const fromId = ev?.from?._id || ev?.from || ev?.callerId;
      const toId = ev?.to?._id || ev?.to || ev?.calleeId;

  // Do not register missed here; explicit MISSED_* will handle accounting

      // If this event references either party (caller or callee matches our user), tear down local UI
      if ((fromId && fromId === this.userId) || (toId && toId === this.userId) || (!toId && !fromId)) {
        this.cleanupCallState('remote-canceled');
      }
    } catch(e) {}
  });

  sock.on('video-call-timeout', async (ev:any) => {
    try {
      const fromId = ev?.from?._id || ev?.from || ev?.callerId;
      const toId = ev?.to?._id || ev?.to || ev?.calleeId;
  // Do not register missed here; explicit MISSED_* will handle accounting
      // Tear down if either side matches our user
      if ((fromId && fromId === this.userId) || (toId && toId === this.userId) || (!toId && !fromId)) {
        this.cleanupCallState('remote-timeout');
      }
    } catch(e) {}
  });

  // Explicit missed events accounting (pass event name so we don't depend on payload)
  const onExplicitMissed = (ev: any, evtName: string) => {
    try { this.addMissedCallFromSignaling(ev, this.userId, evtName); } catch(_) {}
  };
  sock.on(VideoEvents.MISSED,          (ev:any) => onExplicitMissed(ev, VideoEvents.MISSED));
  sock.on(VideoEvents.MISSED_TIMEOUT,  (ev:any) => onExplicitMissed(ev, VideoEvents.MISSED_TIMEOUT));
  sock.on(VideoEvents.MISSED_CANCELED, (ev:any) => onExplicitMissed(ev, VideoEvents.MISSED_CANCELED));
  sock.on(VideoEvents.MISSED_REJECTED, (ev:any) => onExplicitMissed(ev, VideoEvents.MISSED_REJECTED));
  this.missedHandlersBound = true;
  console.log('[missed][svc] socket handlers bound');

  }); // end runOutsideAngular

} // end bindMissedCallSocketHandlers

  
  getMedia(facingMode: string) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    .then((stream) => {
      this.handleSuccess(stream);
      return true
    }, err => {
      this.handleError(err);
      return false
    })
  }

  async init(myEl: HTMLVideoElement, partnerEl: HTMLVideoElement): Promise<boolean> {
    try {
      // ✅ First validate and store the elements
      if (!myEl || !partnerEl) {
        console.error("❌ Cannot initialize WebRTC: video elements are undefined");
        return false;
      }
      this.myEl = myEl;
      this.partnerEl = partnerEl;

      // ✅ Then request permissions
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) return false;

      // ✅ Finally get the media stream
      this.myStream = await this.getUserMedia();
      if (!this.myStream) return false;

      this.myEl.srcObject = this.myStream;
      this.myEl.muted = true;
      this.myEl.volume = 0;
      this.partnerEl.muted = false;
      this.partnerEl.volume = 1;
      console.log("✅ Media stream initialized with device:",
        this.myStream.getVideoTracks()[0]?.label || 'No video',
        this.myStream.getAudioTracks()[0]?.label || 'No audio'
      );
      return true;
    } catch (error) {
      console.error("WebRTC initialization failed:", error);
      return false;
    }
  }

  getPeerId(): string | null {
    if (this.myPeerId) return this.myPeerId;
    if (WebrtcService.peer?.id) return WebrtcService.peer.id;
    const fromLS = localStorage.getItem('peerId');
    return fromLS ?? null;
  }
  

  // webrtc.service.ts
  async handleDeviceChange() {
    if (!this.myStream) return;

    const videoTrack = this.myStream.getVideoTracks()[0];
    const audioTrack = this.myStream.getAudioTracks()[0];

    // Check if current devices are still working
    const devices = await navigator.mediaDevices.enumerateDevices();
    const currentVideoDevice = videoTrack?.getSettings().deviceId;
    const currentAudioDevice = audioTrack?.getSettings().deviceId;

    // If current video device is no longer available, switch
    if (videoTrack && (!currentVideoDevice ||
      !devices.some(d => d.kind === 'videoinput' && d.deviceId === currentVideoDevice))) {
      console.log('Current video device unavailable, switching...');
      await this.switchToAvailableDevice('videoinput');
    }

    // Same for audio
    if (audioTrack && (!currentAudioDevice ||
      !devices.some(d => d.kind === 'audioinput' && d.deviceId === currentAudioDevice))) {
      console.log('Current audio device unavailable, switching...');
      await this.switchToAvailableDevice('audioinput');
    }
  }

  private async switchToAvailableDevice(kind: 'videoinput' | 'audioinput'): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const availableDevices = devices.filter(d => d.kind === kind);

    for (const device of availableDevices) {
      try {
        const constraints = { [kind]: { deviceId: { exact: device.deviceId } } };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (kind === 'videoinput') {
          const newTrack = newStream.getVideoTracks()[0];
          const oldTrack = this.myStream.getVideoTracks()[0];
          if (oldTrack) {
            this.myStream.removeTrack(oldTrack);
            oldTrack.stop();
          }
          this.myStream.addTrack(newTrack);
          this.myEl.srcObject = this.myStream;

          // Replace in peer connection if active
          if (WebrtcService.call) {
            const sender = this.getVideoSender();
            if (sender) await sender.replaceTrack(newTrack);
          }
        } else {
          const newTrack = newStream.getAudioTracks()[0];
          const oldTrack = this.myStream.getAudioTracks()[0];
          if (oldTrack) {
            this.myStream.removeTrack(oldTrack);
            oldTrack.stop();
          }
          this.myStream.addTrack(newTrack);

          // Replace in peer connection if active
          if (WebrtcService.call) {
            const sender = this.getAudioSender();
            if (sender) await sender.replaceTrack(newTrack);
          }
        }
        return; // Successfully switched
      } catch (error) {
        console.log(`Failed to switch to ${kind} device ${device.deviceId}`, error);
      }
    }

    console.error(`No available ${kind} devices could be activated`);
  }

  // webrtc.service.ts
  // Add these methods to your WebrtcService class:
  /** Refresh the list of available media devices */
  async refreshDevices(): Promise<void> {
    try {
      await navigator.mediaDevices.enumerateDevices();
      // This triggers the devicechange event which will update our device list
    } catch (error) {
      console.error('Error refreshing devices:', error);
    }
  }

  /** Get the video sender from the current peer connection */
  private getVideoSender(): RTCRtpSender | null {
    if (!WebrtcService.call || !WebrtcService.call.peerConnection) {
      return null;
    }
    const senders = WebrtcService.call.peerConnection.getSenders();
    return senders.find(sender => sender.track?.kind === 'video') || null;
  }

  /** Get the audio sender from the current peer connection */
  private getAudioSender(): RTCRtpSender | null {
    if (!WebrtcService.call || !WebrtcService.call.peerConnection) {
      return null;
    }
    const senders = WebrtcService.call.peerConnection.getSenders();
    return senders.find(sender => sender.track?.kind === 'audio') || null;
  }
  private startPeerIdHeartbeat(userId: string, peerId: string) {
    if (this.peerHeartbeatInterval) {
      clearInterval(this.peerHeartbeatInterval);
    }
    this.peerHeartbeatInterval = setInterval(() => {
      this.userService.heartbeatPeer(userId) // new lightweight call
        .catch(err => console.error('❌ heartbeat failed:', err));
    }, 60_000); // every 60 s
  }

  // webrtc.service.ts ── improved: auto-create peer if missing and wait for open
  public async waitForPeerOpen(): Promise<void> {
    // If Peer instance missing, try to create it using a known userId.
    // If userId is not yet available, attempt to recover it from localStorage
    // or wait briefly for other initialization code to set it.
    if (!WebrtcService.peer) {
      // Attempt to recover userId from localStorage as a best-effort
      if (!this.userId) {
        try {
          const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
          if (raw) {
            const parsed = JSON.parse(raw);
            this.userId = parsed?._id || parsed?.id || this.userId;
            if (this.userId) console.log('[webrtc] recovered userId from localStorage', this.userId);
          }
        } catch (e) { /* ignore JSON errors */ }
      }

      // If still unknown, poll briefly (10s) for other code to set this.userId
      if (!this.userId) {
        const waited = await new Promise<boolean>(resolve => {
          const maxWait = 10_000;
          const interval = 200;
          const start = Date.now();
          const iv = setInterval(() => {
            if (this.userId) {
              clearInterval(iv);
              return resolve(true);
            }
            if (Date.now() - start > maxWait) {
              clearInterval(iv);
              return resolve(false);
            }
          }, interval);
        });

        if (!waited) {
          return Promise.reject(new Error('PeerJS instance not created yet and userId unknown'));
        }
      }

      // At this point we have a userId -> try to create the Peer
      try {
        await this.createPeer(this.userId as string);
      } catch (err) {
        console.error('Failed to auto-create PeerJS instance:', err);
        return Promise.reject(err);
      }
    }

    if (WebrtcService.peer.open) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[webrtc] peer.open timeout (60 s)');
        cleanup();
        reject(new Error('⏰ peer.open timeout (60 s)'));
      }, 60_000);

      const onOpen = () => {
        clearTimeout(timeout);
        cleanup();
        resolve();
      };
      const onError = (err: any) => {
        clearTimeout(timeout);
        cleanup();
        console.error('[webrtc] peer error while waiting for open:', err);
        reject(err || new Error('Peer error'));
      };

      const cleanup = () => {
        try { WebrtcService.peer.off('open', onOpen); } catch(_) {}
        try { WebrtcService.peer.off('error', onError); } catch(_) {}
      };

      try {
        WebrtcService.peer.once('open', onOpen);
        WebrtcService.peer.once('error', onError);
      } catch (e) {
        clearTimeout(timeout);
        cleanup();
        console.error('[webrtc] failed to attach listeners to peer', e);
        return reject(e);
      }
    });
  }

  private creatingPeer = false;

  private spawnPeer(candidateId: string, authUserId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try { WebrtcService.peer?.destroy(); } catch {}
      WebrtcService.peer = new Peer(candidateId, {
        host : 'peerjs-whei.onrender.com',
        port : 443,
        secure : true,
        path : '/peerjs',
        debug: 2,
        pingInterval: 25000,
        config : {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
  
// webrtc.service.ts → spawnPeer(): after setting userId
WebrtcService.peer.once('open', async () => {
  this.myPeerId = candidateId;
  this.userId = authUserId;
  localStorage.setItem('peerId', candidateId);
  try { await this.userService.sendPeerIdToBackend(authUserId, candidateId); } catch {}
  this.startPeerIdHeartbeat(authUserId, candidateId);

    // ✅ ensure missed-call handlers are attached
  await this.bindMissedCallSocketHandlers();
  this.wait();

  resolve();
});

  
      WebrtcService.peer.once('error', (err: any) => {
        reject(err);
      });
    });
  }
  
  private makeCandidateId(base: string) {
    // Normalize base via IdService to ensure we never interpolate raw objects
    let baseStr = this.idService.normalizeId(base as any) || String(base || 'user');
    if (String(base) === '[object Object]' || baseStr.includes('[object Object]')) {
      console.warn('[webrtc] makeCandidateId received object-like base, coerced to', baseStr);
    }
    // short, URL-safe suffix
    return `${baseStr}-${Math.random().toString(36).slice(2,6)}`;
  }
  
  async createPeer(authUserId: string): Promise<void> {
    if (this.creatingPeer) return;
    if (WebrtcService.peer && WebrtcService.peer.open) return;
    // defensive: recover authUserId from localStorage if missing
    if (!authUserId) {
      try {
        const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
        if (raw) {
          const parsed = JSON.parse(raw);
          authUserId = parsed?._id || parsed?.id || authUserId;
          if (authUserId) console.log('[webrtc] createPeer recovered authUserId from localStorage', authUserId);
        }
      } catch (e) { /* ignore */ }
    }
    // Normalize authUserId using IdService to avoid object-shaped ids
    const normalized = this.idService.normalizeId(authUserId as any);
    if (normalized) {
      authUserId = normalized;
    } else {
      authUserId = String(authUserId || 'user');
      if (String(authUserId) === '[object Object]') console.warn('[webrtc] createPeer fallback coerced authUserId to string');
    }
    this.creatingPeer = true;
  
    try {
      // Try a fresh suffixed ID first (avoids collisions / zombie sessions)
      let candidate = this.makeCandidateId(authUserId);
      try {
        await this.spawnPeer(candidate, authUserId);
        return;
      } catch (e: any) {
        if (e?.type !== 'unavailable-id') throw e;
      }
  
      // Try another suffix
      candidate = this.makeCandidateId(authUserId);
      try {
        await this.spawnPeer(candidate, authUserId);
        return;
      } catch (e: any) {
        if (e?.type !== 'unavailable-id') throw e;
      }
  
      // Fallback: plain base id as last resort
      await this.spawnPeer(authUserId, authUserId);
    } finally {
      this.creatingPeer = false;
    }
  }

  async getPartnerUser(partnerId: string): Promise<User | null> {
    try {
      const user = await this.userService.getUserProfile(partnerId).toPromise();
      console.log("userService.getUserProfile(", user);
      return user || null; // Return the user object or null if undefined
    } catch (error) {
      console.error("❌ Error fetching partner user:", error);
      return null;
    }
  }

  // Add to WebrtcService
  private callState = new BehaviorSubject<{connected: boolean, type: 'caller' | 'receiver'}>(null);
  public callState$ = this.callState.asObservable();

  async getUserMedia(): Promise<MediaStream | null> {
    // Reuse a live stream if we already have one
    if (this.myStream && this.myStream.getTracks().some(t => t.readyState === 'live')) {
      return this.myStream;
    }
  
    try {
      // Acquire specific devices (with your locking)
      const videoDeviceId = await this.deviceManager.getAvailableDevice('videoinput', this.tabId);
      const audioDeviceId = await this.deviceManager.getAvailableDevice('audioinput', this.tabId);
      if (!videoDeviceId || !audioDeviceId) {
        throw new Error('All devices are currently in use');
      }
  
      // Remember intended devices
      this.activeDevices = { video: videoDeviceId, audio: audioDeviceId };
  
      // Create the stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 30 },
          deviceId: { exact: videoDeviceId }
        },
        audio: {
          deviceId: { exact: audioDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
  
      // ✅ Keep references so close() can stop tracks reliably
      this.myStream = stream;
      this.activeStreams.set(this.tabId, stream);
  
      // Update activeDevices with what the browser actually picked
      stream.getTracks().forEach(track => {
        const id = track.getSettings().deviceId;
        if (track.kind === 'video' && id) this.activeDevices.video = id;
        if (track.kind === 'audio' && id) this.activeDevices.audio = id;
      });
  
      return stream;
  
    } catch (error) {
      console.error('Error acquiring media:', error);
  
      // Fallback: relaxed constraints
      try {
        console.log('Attempting fallback with relaxed constraints');
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
  
        // ✅ Also keep references for fallback
        this.myStream = fallbackStream;
        this.activeStreams.set(this.tabId, fallbackStream);
  
        // Best-effort: record actual devices used
        this.activeDevices = {};
        fallbackStream.getTracks().forEach(track => {
          const id = track.getSettings().deviceId;
          if (track.kind === 'video' && id) this.activeDevices.video = id;
          if (track.kind === 'audio' && id) this.activeDevices.audio = id;
        });
  
        return fallbackStream;
  
      } catch (fallbackError) {
        console.error('Fallback media acquisition failed:', fallbackError);
        this.toastService.presentErrorToastr(
          'All cameras/microphones are in use. Please close other applications using these devices and try again.'
        );
        return null;
      }
    }
  }
  
  private async attachRemoteStream(
    el: HTMLVideoElement,
    stream: MediaStream,
    afterConnected: () => void,
  ) {
    if (this.myStream && stream && stream.id === this.myStream.id) {
      console.warn('[webrtc] ignoring local stream attached as remote stream');
      return;
    }
    el.srcObject = stream;
    el.muted = false;
    el.volume = 1;

    /* Kick off playback */
    const resume = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(() => setTimeout(resume, 100)); // retry if autoplay blocked
      }
    };

    if (el.readyState >= 1) {
      resume(); // metadata is already available
    } else {
      el.onloadedmetadata = resume; // wait until it is
    }
    afterConnected();
  }
  private releaseCurrentStream() {
    if (this.activeStreams.has(this.tabId)) {
      const stream = this.activeStreams.get(this.tabId);
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      }
      this.activeStreams.delete(this.tabId);
    }

    // Release any device locks
    if (this.activeDevices.video) {
      this.deviceManager.releaseDevice(this.activeDevices.video, this.tabId);
    }
    if (this.activeDevices.audio) {
      this.deviceManager.releaseDevice(this.activeDevices.audio, this.tabId);
    }
    this.activeDevices = {};
  }

  // Store missed call when recipient is offline
  async storeMissedCall(userId: string) {
    const missedCalls = JSON.parse(localStorage.getItem("missedCalls") || "[]");

    // Avoid duplicates:
    if (missedCalls.some(call => call.userId === userId)) {
      console.log(`❗ Missed call for ${userId} already exists`);
      return;
    }

    // Get partner name (optional but better UX)
    let userName = userId;
    try {
      const partner = await this.userService.getUserProfile(userId).toPromise();
      userName = `${partner.firstName} ${partner.lastName}`;
    } catch (err) {
      console.warn("⚠ Could not fetch partner name");
    }

    missedCalls.push({
      userId,
      userName,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem("missedCalls", JSON.stringify(missedCalls));
    // Ensure Angular change detection runs when we emit
    try {
      this.zone.run(() => {
        this.missedCallsSubject.next(missedCalls);
        try { this.appEvents.setMissedCalls(missedCalls); } catch(e) {}
      });
    } catch (e) {
      // fallback if zone not available
      try {
        this.missedCallsSubject.next(missedCalls);
        try { this.appEvents.setMissedCalls(missedCalls); } catch(e) {}
      } catch(_) {}
    }
    console.log(`🔔 Missed call stored for ${userName}`);
  }

  notifyMissedCalls() {
    const missedCalls = JSON.parse(localStorage.getItem('missedCalls')) || [];
    if (missedCalls.length > 0) {
      alert(`📞 You have ${missedCalls.length} missed call(s)!`);
      localStorage.removeItem('missedCalls'); // Clear after notifying
    }
  }

  async requestPermissions() {
    try {
      await this.permissionService.getPermission(this.androidPermission.PERMISSION.CAMERA);
      await this.permissionService.getPermission(this.androidPermission.PERMISSION.RECORD_AUDIO);
      await this.permissionService.getPermission(this.androidPermission.PERMISSION.MODIFY_AUDIO_SETTINGS);
    } catch (err) {
      console.error("❌ Permission error:", err);
      return false;
    }
    return true;
  }

  async wait() {
    console.log("📡 Waiting for incoming calls...");
    try { WebrtcService.peer.off("call"); } catch(_) {}
    // register peer 'call' handler outside Angular to avoid CD for incoming signalling
    WebrtcService.peer.on("call", async (call) => {
      // run minimal synchronous work outside angular
      this.zone.runOutsideAngular(async () => {
        console.log('[peer:rx] incoming from', call.peer);
        try {
          WebrtcService.call = call;
          const partnerId = call.peer.split('-')[0];
          this.partnerId = partnerId;
          localStorage.setItem('partnerId', partnerId);

          // re-enter Angular only for navigation/UI actions
          try {
            await this.zone.run(async () => {
              if (!this.router.url.includes('/messages/video')) {
                await this.router.navigate(
                  ['/messages/video', partnerId],
                  { queryParams: { answer: true }, state: { incomingCall: true } }
                );
              }
            });
          } catch (e) {
            console.warn('[webrtc] navigation skipped due to zone issues', e);
          }

          // Basic safety handlers (these are light and kept out of zone)
          call.on("close", () => {
            console.log("📴 Call closed by remote peer");
            try { if (this.partnerEl) this.partnerEl.srcObject = null; } catch(_) {}
          });
          call.on("error", (err) => {
            console.error("❌ Call error:", err);
            try { if (this.partnerEl) this.partnerEl.srcObject = null; } catch(_) {}
          });
        } catch (error) {
          console.error("❌ Error handling incoming call:", error);
          try { call.close(); } catch {}
        }
      });
    });
  }
  

  // ✅ Function to check if the peer is online
  async checkPeerOnline(peerId: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        try { conn?.close(); } catch {}
        resolve(ok);
      };
  
      const conn = WebrtcService.peer.connect(peerId, { reliable: false });
      const t = setTimeout(() => finish(false), 2000); // hard 2s cap
  
      conn.on('open',  () => { clearTimeout(t); finish(true);  });
      conn.on('error', () => { clearTimeout(t); finish(false); });
      conn.on('close', () => { clearTimeout(t); finish(false); });
    });
  }
  

  handleSuccess(stream: MediaStream) {
    this.myStream = stream;
    if (!this.myEl) {
      console.warn("⚠️ Video element not ready yet. Stream will be assigned later.");
      return;
    }
    try {
      this.myEl.srcObject = stream;
      this.myEl.muted = true; // Important for local playback
      console.log("✅ Stream successfully assigned to video element");
    } catch (error) {
      console.error("❌ Error assigning stream to video element:", error);
    }
  }

  handleError(error: any) {
    if (error.name === 'NotReadableError') {
      this.toastService.presentErrorToastr(
        'Camera/mic is being used by another app. ' +
        'Please close other applications using your devices.'
      );
    }
    if (error.name === 'ConstraintNotSatisfiedError') {
      this.errorMsg(`The resolution px is not supported by your device.`);
    } else if (error.name === 'PermissionDeniedError') {
      this.errorMsg(
        'Permissions have not been granted to use your camera and ' +
        'microphone, you need to allow the page access to your devices in ' +
        'order for the demo to work.'
      );
    }
    this.errorMsg(`getUserMedia error: ${error.name}`, error);
  }

  errorMsg(msg: string, error?: any) {
    const errorElement = document.querySelector('#errorMsg');
    if (errorElement) {
      errorElement.innerHTML += `<p>${msg}</p>`;
    }
    if (typeof error !== 'undefined') {
      console.error(error);
    }
  }
  /* ────────────────────────────────────────────────────────────────────────────
   * webrtc.service.ts ▸ replace the whole answer() with this function
   *────────────────────────────────────────────────────────────────────────────*/
  async answer(call?: MediaConnection) {
    if (!this.myStream || !this.myStream.getTracks().some(t => t.readyState === 'live')) {
      console.warn('[answer] no live local stream; grabbing camera');
      this.myStream = await this.getUserMedia();
      if (!this.myStream) return console.error('[answer] still no local media');
    }

    const activeCall = call || WebrtcService.call;
    if (!activeCall) return console.error('[answer] no call object');
    if (typeof (activeCall as any).answer !== 'function') {
      WebrtcService.call = null;
      return console.error('[answer] call object is not answerable');
    }

    activeCall.answer(this.myStream);
    this.callState.next({ connected: false, type: 'receiver' });

    try {
      activeCall.peerConnection?.addEventListener('iceconnectionstatechange', () => {
        console.log('[ICE-RX]', activeCall.peerConnection?.iceConnectionState);
      });
    } catch (_) {}

    let remoteAttached = false;
    const attach = (remote: MediaStream, src: 'stream' | 'track') => {
      if (!remote) return;
      if (this.myStream && remote.id === this.myStream.id) {
        console.warn('[answer] ignoring local stream attached as remote stream');
        return;
      }
      this.latestRemoteStream = remote;
      if (!this.partnerEl || remoteAttached) return;
      remoteAttached = true;
      this.partnerEl.srcObject = remote;
      this.partnerEl.muted = false;
      this.partnerEl.volume = 1;
      console.log(`[RX ${src}] tracks=`, remote.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));
      const play = () => this.partnerEl?.play().catch(() => setTimeout(play, 120));
      if (this.partnerEl.readyState >= 1) play();
      else this.partnerEl.onloadedmetadata = play;
      this.callState.next({ connected: true, type: 'receiver' });
    };

    activeCall.on('track', (e: any) => attach(e.streams?.[0], 'track'));
    activeCall.on('stream', (s: MediaStream) => attach(s, 'stream'));
    activeCall.on('close', () => {
      console.log('[answer] closed');
      this.callState.next(null);
    });
    activeCall.on('error', e => console.error(e));
  }
  public async close(opts?: { silent?: boolean }): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    const silent = !!opts?.silent;

    console.log("🛑 Closing WebRTC connections and releasing devices...");

    // Release device locks
    if (this.activeDevices.video) {
      this.deviceManager.releaseDevice(this.activeDevices.video, this.tabId);
      this.deviceLockChannel?.postMessage({ type: 'release', kind: 'video', deviceId: this.activeDevices.video });
    }
    if (this.activeDevices.audio) {
      this.deviceManager.releaseDevice(this.activeDevices.audio, this.tabId);
      this.deviceLockChannel?.postMessage({ type: 'release', kind: 'audio', deviceId: this.activeDevices.audio });
    }

    if (this.peerHeartbeatInterval) {
      clearInterval(this.peerHeartbeatInterval);
      this.peerHeartbeatInterval = null;
    }
    
    this.activeDevices = {};

    // Peer connection
    if (WebrtcService.call) {
      try { WebrtcService.call.close(); } catch {}
      WebrtcService.call = null;
    }

    // Media streams
    if (this.myStream) {
      this.myStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
        t.enabled = false;
      });
      this.myStream = null;
    }

    // Video elements
    if (this.myEl) this.myEl.srcObject = null;
    if (this.partnerEl) this.partnerEl.srcObject = null;

    // ✅ Only emit ENDED when *we* initiated the hangup
    if (!silent && this.userId && this.partnerId) {
      const sock = await SocketService.getSocket();
      if (sock?.connected) {
        sock.emit(VideoEvents.ENDED, { from: this.userId, to: this.partnerId });
        sock.emit('leave-call', { room: this.partnerId });
        // If your enum name differs from backend literal, keep both:
        if (VideoEvents.ENDED !== 'video-call-ended') {
          sock.emit('video-call-ended', { from: this.userId, to: this.partnerId });
        }
      }
    }
    this.callState.next(null);
  }

  toggleCamera() {
    this.myStream.getVideoTracks()[0].enabled = !this.myStream.getVideoTracks()[0].enabled;
    return this.myStream.getVideoTracks()[0].enabled;
  }

  toggleAudio() {
    this.myStream.getAudioTracks()[0].enabled = !this.myStream.getAudioTracks()[0].enabled;
    return this.myStream.getAudioTracks()[0].enabled;
  }

  toggleCameraDirection() {
    this.facingMode = this.facingMode == 'user' ? 'environment' : 'user';
    this.getMedia(this.facingMode);
  }
}
/** Move every VP8 payloadId to the front of the m=video line. */
/** preferVp8 v2 – no duplicate payload-ids */
function preferVp8(sdp: string): string {
  const lines = sdp.split('\r\n');
  let mLineIndex = -1;
  const vp8Ids: string[] = [];

  lines.forEach((l, i) => {
    if (l.startsWith('m=video')) mLineIndex = i;
    const m = l.match(/^a=rtpmap:(\d+)\s+VP8\/90000/i);
    if (m) vp8Ids.push(m[1]);
  });

  if (mLineIndex !== -1 && vp8Ids.length) {
    const parts = lines[mLineIndex].trim().split(' ');
    const header = parts.slice(0, 3); // ← was 4
    const restIds = parts.slice(3);
    const newList = [
      ...vp8Ids,
      ...restIds.filter(id => !vp8Ids.includes(id))
    ];
    lines[mLineIndex] = [...header, ...newList].join(' ');
  }

  return lines.join('\r\n');
}
