import { WebrtcService } from './webrtc.service';

describe(
  'WebrtcService authenticated identity fallback characterization',
  () => {
    let service: any;
    let addMissedCallSpy: jasmine.Spy;

    beforeEach(() => {
      localStorage.clear();

      WebrtcService.peer =
        null as any;

      service = Object.create(
        WebrtcService.prototype
      ) as any;

      service.creatingPeer = false;
      service.userId = undefined;

      service.idService = {
        normalizeId:
          jasmine
            .createSpy(
              'normalizeId'
            )
            .and.callFake(
              (value: any) => {
                if (!value) {
                  return null;
                }

                return `normalized-${String(value)}`;
              }
            )
      };

      addMissedCallSpy =
        jasmine.createSpy(
          'addMissedCall'
        );

      service.addMissedCall =
        addMissedCallSpy;
    });


    afterEach(() => {
      localStorage.clear();

      WebrtcService.peer =
        null as any;
    });


    it(
      'uses an explicitly supplied signaling identity instead of stored user state',
      () => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'different-stored-user'
          })
        );

        service.addMissedCallFromSignaling(
          {
            callerId: 'caller-1',
            callerName: 'Caller One',
            calleeId: 'explicit-self',
            at: '2026-08-23T12:00:00.000Z'
          },
          'explicit-self',
          'missed-call'
        );

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledWith({
          userId: 'caller-1',
          userName: 'Caller One',
          timestamp:
            '2026-08-23T12:00:00.000Z'
        });
      }
    );


    it(
      'recovers a missing signaling identity from canonical currentUser storage',
      () => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'canonical-self'
          })
        );

        localStorage.setItem(
          'user',
          JSON.stringify({
            _id: 'legacy-other'
          })
        );

        service.addMissedCallFromSignaling(
          {
            from: 'caller-2',
            fromName: 'Caller Two',
            to: 'canonical-self',
            reason: 'missed',
            at: '2026-08-23T12:01:00.000Z'
          },
          '',
          'missed-call'
        );

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledWith({
          userId: 'caller-2',
          userName: 'Caller Two',
          timestamp:
            '2026-08-23T12:01:00.000Z'
        });
      }
    );


    it(
      'falls back to legacy user storage when canonical currentUser is absent',
      () => {
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: 'legacy-self'
          })
        );

        service.addMissedCallFromSignaling(
          {
            callerId: 'caller-3',
            calleeId: 'legacy-self',
            type: 'timeout',
            at: '2026-08-23T12:02:00.000Z'
          },
          '',
          'missed-call'
        );

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          addMissedCallSpy
        ).toHaveBeenCalledWith({
          userId: 'caller-3',
          userName: 'Unknown',
          timestamp:
            '2026-08-23T12:02:00.000Z'
        });
      }
    );


    it(
      'does not fall through to legacy user when canonical stored user is malformed',
      () => {
        localStorage.setItem(
          'currentUser',
          'not-valid-json'
        );

        localStorage.setItem(
          'user',
          JSON.stringify({
            _id: 'legacy-self'
          })
        );

        service.addMissedCallFromSignaling(
          {
            callerId: 'caller-4',
            calleeId: 'legacy-self',
            reason: 'missed'
          },
          '',
          'missed-call'
        );

        expect(
          addMissedCallSpy
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'waitForPeerOpen recovers and normalizes canonical stored identity before observing an already-open peer',
      async () => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'stored-self'
          })
        );

        localStorage.setItem(
          'user',
          JSON.stringify({
            _id: 'legacy-other'
          })
        );

        const createPeerSpy =
          jasmine.createSpy(
            'createPeer'
          );

        service.createPeer =
          createPeerSpy;

        WebrtcService.peer = {
          open: true
        } as any;

        await service.waitForPeerOpen();

        expect(
          service.idService
            .normalizeId
        ).toHaveBeenCalledWith(
          'stored-self'
        );

        expect(
          service.userId
        ).toBe(
          'normalized-stored-self'
        );

        expect(
          createPeerSpy
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'createPeer recovers a missing auth id from canonical storage and normalizes it before spawning',
      async () => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'stored-peer-owner'
          })
        );

        localStorage.setItem(
          'user',
          JSON.stringify({
            _id: 'legacy-other'
          })
        );

        const makeCandidateIdSpy =
          jasmine
            .createSpy(
              'makeCandidateId'
            )
            .and.returnValue(
              'candidate-peer-id'
            );

        const spawnPeerSpy =
          jasmine
            .createSpy(
              'spawnPeer'
            )
            .and.returnValue(
              Promise.resolve()
            );

        service.makeCandidateId =
          makeCandidateIdSpy;

        service.spawnPeer =
          spawnPeerSpy;

        WebrtcService.peer =
          null as any;

        await service.createPeer('');

        expect(
          service.idService
            .normalizeId
        ).toHaveBeenCalledWith(
          'stored-peer-owner'
        );

        expect(
          makeCandidateIdSpy
        ).toHaveBeenCalledWith(
          'normalized-stored-peer-owner'
        );

        expect(
          spawnPeerSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          spawnPeerSpy
        ).toHaveBeenCalledWith(
          'candidate-peer-id',
          'normalized-stored-peer-owner'
        );

        expect(
          service.creatingPeer
        ).toBeFalse();
      }
    );


    it(
      'createPeer preserves an explicitly supplied auth id and normalizes it before spawning',
      async () => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'stored-other'
          })
        );

        const makeCandidateIdSpy =
          jasmine
            .createSpy(
              'makeCandidateId'
            )
            .and.returnValue(
              'candidate-explicit-id'
            );

        const spawnPeerSpy =
          jasmine
            .createSpy(
              'spawnPeer'
            )
            .and.returnValue(
              Promise.resolve()
            );

        service.makeCandidateId =
          makeCandidateIdSpy;

        service.spawnPeer =
          spawnPeerSpy;

        WebrtcService.peer =
          null as any;

        await service.createPeer(
          'explicit-owner'
        );

        expect(
          service.idService
            .normalizeId
        ).toHaveBeenCalledWith(
          'explicit-owner'
        );

        expect(
          makeCandidateIdSpy
        ).toHaveBeenCalledWith(
          'normalized-explicit-owner'
        );

        expect(
          spawnPeerSpy
        ).toHaveBeenCalledWith(
          'candidate-explicit-id',
          'normalized-explicit-owner'
        );

        expect(
          service.creatingPeer
        ).toBeFalse();
      }
    );
  }
);
