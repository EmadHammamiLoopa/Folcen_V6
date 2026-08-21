import { WebrtcService } from './webrtc.service';

describe('WebrtcService teardown characterization', () => {
  function teardownService(): any {
    const service = Object.create(WebrtcService.prototype) as any;
    service.isClosed = false;
    service.activeDevices = {};
    service.activeStreams = new Map();
    service.callTimeoutTimer = null;
    service.peerHeartbeatInterval = null;
    service.deviceManager = { releaseDevice: jasmine.createSpy('releaseDevice') };
    service.callState = { next: jasmine.createSpy('callStateNext') };
    service.latestRemoteStream = { id: 'remote' };
    return service;
  }

  afterEach(() => {
    (WebrtcService as any).call = null;
    localStorage.clear();
  });

  it('close stops local media tracks and closes the active PeerJS media connection', async () => {
    const service = teardownService();
    localStorage.setItem('token', 'token-before-call');
    localStorage.setItem('user', JSON.stringify({ _id: 'user-before-call' }));
    const videoTrack = { stop: jasmine.createSpy('videoStop'), enabled: true };
    const audioTrack = { stop: jasmine.createSpy('audioStop'), enabled: true };
    service.myStream = { getTracks: () => [videoTrack, audioTrack] };
    service.localStream = service.myStream;
    const mediaCall = { close: jasmine.createSpy('mediaCallClose') };
    (WebrtcService as any).call = mediaCall;

    await service.close({ silent: true });

    expect(mediaCall.close).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.enabled).toBeFalse();
    expect(audioTrack.enabled).toBeFalse();
    expect(service.myStream).toBeNull();
    expect(service.localStream).toBeNull();
    expect((WebrtcService as any).call).toBeNull();
    expect(localStorage.getItem('token')).toBe('token-before-call');
    expect(localStorage.getItem('user')).toBe(JSON.stringify({ _id: 'user-before-call' }));
  });

  it('close releases device locks and detaches both video elements', async () => {
    const service = teardownService();
    service.activeDevices = { video: 'camera-1', audio: 'microphone-1' };
    service.tabId = 'tab-1';
    service.myEl = { srcObject: {} };
    service.partnerEl = { srcObject: {} };

    await service.close({ silent: true });

    expect(service.deviceManager.releaseDevice).toHaveBeenCalledWith('camera-1', 'tab-1');
    expect(service.deviceManager.releaseDevice).toHaveBeenCalledWith('microphone-1', 'tab-1');
    expect(service.myEl.srcObject).toBeNull();
    expect(service.partnerEl.srcObject).toBeNull();
    expect(service.activeDevices).toEqual({});
  });

  it('repeated close is idempotent after all media state is released', async () => {
    const service = teardownService();
    service.isClosed = true;
    service.myStream = null;
    service.localStream = null;

    await service.close({ silent: true });

    expect(service.callState.next).not.toHaveBeenCalled();
  });
});
