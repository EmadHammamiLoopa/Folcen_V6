import { TestBed } from '@angular/core/testing';
import { WebrtcService } from './webrtc.service';

// Minimal mocks to allow fast unit tests without real devices
class MockDeviceManager {
  async acquireDevice(id: string, tabId: string) { return true; }
  releaseDevice(id: string, tabId: string) { return; }
  async getAvailableDevice(kind: string, tabId: string) { return 'mock-device-id'; }
}

describe('WebrtcService (unit)', () => {
  let svc: WebrtcService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WebrtcService,
        { provide: (window as any).DeviceManagerService, useClass: MockDeviceManager }
      ]
    });
    svc = TestBed.inject(WebrtcService);

    // Mock navigator.mediaDevices getter to return a fake implementation
    spyOnProperty(navigator, 'mediaDevices', 'get').and.returnValue({
      getUserMedia: jasmine.createSpy('getUserMedia').and.callFake((_) => Promise.resolve(new MediaStream())),
      enumerateDevices: jasmine.createSpy('enumerateDevices').and.returnValue(Promise.resolve([]))
    } as any);
  });

  it('acquires a stream with device ids (mocked)', async () => {
    const stream = await svc.getStreamForTabWithDeviceIds('video-1', 'audio-1', 'tab-1');
    expect(stream).toBeTruthy();
    expect((navigator as any).mediaDevices.getUserMedia).toHaveBeenCalled();
  });
});
