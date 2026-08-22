import {
  fakeAsync,
  flushMicrotasks,
  tick
} from '@angular/core/testing';

import {
  of,
  throwError
} from 'rxjs';

import { UserService } from './user.service';
import { SessionCredentialStore } from './session-credential-store.service';

describe(
  'UserService restored-user validation credential invalidation',
  () => {
    let service: any;
    let nativeStorage: any;

    const restoredUser = {
      _id: 'restored-user',
      firstName: 'Restored'
    };

    beforeEach(() => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);

      nativeStorage = {
        getItem: jasmine
          .createSpy('getItem')
          .and.callFake(
            (key: string) =>
              key === 'currentUser'
                ? Promise.resolve(
                    restoredUser
                  )
                : Promise.reject(
                    new Error('missing')
                  )
          ),

        remove: jasmine
          .createSpy('remove')
          .and.returnValue(
            Promise.resolve()
          )
      };

      // Characterize only startup restoration/validation.
      // Avoid constructor realtime orchestration.
      service = Object.create(
        UserService.prototype
      ) as any;

      service.nativeStorage =
        nativeStorage;

      service.idService = {
        normalizeId:
          jasmine.createSpy(
            'normalizeId'
          )
      };

      service.callCounters = {
        profileRequests: 0,
        profileHits: 0,
        profileMisses: 0,
        initCalls: 0
      };

      service.setCurrentUser =
        jasmine.createSpy(
          'setCurrentUser'
        );

      service.refreshCurrentUser =
        jasmine
          .createSpy(
            'refreshCurrentUser'
          )
          .and.returnValue(
            of({
              _id: 'validated-user'
            })
          );
    });

    afterEach(() => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);
    });

    it(
      '401 startup validation rejection clears the shared fallback credential',
      fakeAsync(() => {
        localStorage.setItem(
          'token',
          'persisted-token'
        );

        localStorage.setItem(
          'currentUser',
          JSON.stringify(
            restoredUser
          )
        );

        localStorage.setItem(
          'user',
          JSON.stringify(
            restoredUser
          )
        );

        SessionCredentialStore
          .setCachedToken(
            'cached-token'
          );

        service.refreshCurrentUser
          .and.returnValue(
            throwError({
              status: 401
            })
          );

        (service as any)
          .initCurrentUser();

        flushMicrotasks();
        tick(0);
        flushMicrotasks();

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBeNull();

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'token'
        );

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'currentUser'
        );

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'user'
        );

        expect(
          service.setCurrentUser
        ).toHaveBeenCalledWith(
          null
        );
      })
    );

    it(
      'non-authorization startup validation failure preserves persisted and shared credentials',
      fakeAsync(() => {
        localStorage.setItem(
          'token',
          'persisted-token'
        );

        localStorage.setItem(
          'currentUser',
          JSON.stringify(
            restoredUser
          )
        );

        localStorage.setItem(
          'user',
          JSON.stringify(
            restoredUser
          )
        );

        SessionCredentialStore
          .setCachedToken(
            'cached-token'
          );

        service.refreshCurrentUser
          .and.returnValue(
            throwError({
              status: 503
            })
          );

        (service as any)
          .initCurrentUser();

        flushMicrotasks();
        tick(0);
        flushMicrotasks();

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBe(
          'persisted-token'
        );

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).not.toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).not.toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBe(
          'cached-token'
        );

        expect(
          nativeStorage.remove
        ).not.toHaveBeenCalled();

        const clearedInMemory =
          service
            .setCurrentUser
            .calls
            .allArgs()
            .some(
              (args: any[]) =>
                args[0] === null
            );

        expect(
          clearedInMemory
        ).toBeFalse();
      })
    );
  }
);
