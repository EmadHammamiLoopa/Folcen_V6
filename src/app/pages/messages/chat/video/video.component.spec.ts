import { VideoComponent } from './video.component';
import { VideoEvents } from './events';

describe('VideoComponent lifecycle characterization', () => {
  function bareComponent(): any {
    const component = Object.create(VideoComponent.prototype) as any;
    component.webRTC = { clearVideoElements: jasmine.createSpy('clearVideoElements') };
    component.releaseWakeLock = jasmine.createSpy('releaseWakeLock');
    component.clearFinishedCallState = jasmine.createSpy('clearFinishedCallState');
    component.callStateSubscription = { unsubscribe: jasmine.createSpy('callStateUnsubscribe') };
    component.backButtonSubscription = { unsubscribe: jasmine.createSpy('backUnsubscribe') };
    component.connectionSubscriptions = [
      { unsubscribe: jasmine.createSpy('connectionUnsubscribe') },
    ];
    component.appStateListener = { remove: jasmine.createSpy('appStateRemove') };
    component.partnerAnsweredListener = () => undefined;
    component.nativeCallTerminalListener = () => undefined;
    component.peerCallErrorListener = () => undefined;
    return component;
  }

  it('component destruction releases owned subscriptions and window listeners', () => {
    const component = bareComponent();
    const removeListener = spyOn(window, 'removeEventListener');

    component.ngOnDestroy();

    expect(component.releaseWakeLock).toHaveBeenCalled();
    expect(component.appStateListener.remove).toHaveBeenCalled();
    expect(component.clearFinishedCallState).toHaveBeenCalled();
    expect(component.webRTC.clearVideoElements).toHaveBeenCalled();
    expect(component.callStateSubscription.unsubscribe).toHaveBeenCalled();
    expect(component.backButtonSubscription.unsubscribe).toHaveBeenCalled();
    expect(component.connectionSubscriptions).toEqual([]);
    expect(removeListener).toHaveBeenCalledWith('partner-answered', component.partnerAnsweredListener);
    expect(removeListener).toHaveBeenCalledWith('folcen-call-terminal', component.nativeCallTerminalListener);
    expect(removeListener).toHaveBeenCalledWith('peer-call-error', component.peerCallErrorListener);
  });

  it('stale terminal call IDs do not match the active call', () => {
    const component = bareComponent();
    component.callId = 'call-current';
    component.route = {
      snapshot: { queryParamMap: { get: () => 'call-current' } },
    };

    expect(component.isCurrentCallEvent({ callId: 'call-stale' })).toBeFalse();
    expect(component.isCurrentCallEvent({ callId: 'call-current' })).toBeTrue();
  });

  it('rebinding call events first removes the shared socket listeners it owns', () => {
    const component = bareComponent();
    const socket = {
      off: jasmine.createSpy('off'),
      on: jasmine.createSpy('on'),
    };
    component.socket = socket;
    component.ringer = { stop: () => undefined };

    component.listenForVideoCallEvents();

    [
      'video-call-started',
      'video-canceled',
      VideoEvents.CANCELED,
      VideoEvents.TIMEOUT,
      VideoEvents.MISSED,
      'video-call-cancelled',
      VideoEvents.ACCEPTED,
      VideoEvents.ENDED,
      VideoEvents.FAILED,
      'video-call-ended',
      'leave-call',
    ].forEach(event => expect(socket.off).toHaveBeenCalledWith(event));
    expect(socket.on).toHaveBeenCalled();
  });
});
