import {
  fakeAsync,
  flushMicrotasks,
  tick
} from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { UserService } from './user.service';

describe('UserService startup restoration characterization', () => {
  let service: any;
  let nativeStorage: any;

  const nativeUser = {
    _id: 'native-user',
    firstName: 'Native'
  };

  const localUser = {
    _id: 'local-user',
    firstName: 'Local'
  };

  beforeEach(() => {
    localStorage.clear();

    nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.callFake(() =>
          Promise.reject(new Error('missing'))
        ),

      remove: jasmine
        .createSpy('remove')
        .and.callFake(() =>
          Promise.resolve()
        )
    };

    // Deliberately bypass the constructor.
    //
    // The constructor also installs realtime orchestration. These tests
    // characterize only the existing private startup-restoration routine.
    service = Object.create(
      UserService.prototype
    ) as any;

    service.nativeStorage =
      nativeStorage;

    service.idService = {
      normalizeId: jasmine.createSpy('normalizeId')
    };

    service.callCounters = {
      profileRequests: 0,
      profileHits: 0,
      profileMisses: 0,
      initCalls: 0
    };

    service.setCurrentUser =
      jasmine.createSpy('setCurrentUser');

    service.refreshCurrentUser =
      jasmine
        .createSpy('refreshCurrentUser')
        .and.returnValue(
          of({ _id: 'validated-user' })
        );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('prefers NativeStorage currentUser over a local persisted user', fakeAsync(() => {
    localStorage.setItem(
      'currentUser',
      JSON.stringify(localUser)
    );

    nativeStorage.getItem.and.callFake(
      (key: string) => {
        if (key === 'currentUser') {
          return Promise.resolve(nativeUser);
        }

        return Promise.reject(
          new Error('missing')
        );
      }
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      service.setCurrentUser.calls.first().args
    ).toEqual([
      nativeUser,
      { force: true }
    ]);

    tick(0);
  }));

  it('falls back to local currentUser when NativeStorage restoration is unavailable', fakeAsync(() => {
    localStorage.setItem(
      'currentUser',
      JSON.stringify(localUser)
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      service.setCurrentUser.calls.first().args
    ).toEqual([
      localUser,
      { force: true }
    ]);

    tick(0);
  }));

  it('falls back to the legacy local user key when currentUser is absent', fakeAsync(() => {
    localStorage.setItem(
      'user',
      JSON.stringify(localUser)
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      service.setCurrentUser.calls.first().args
    ).toEqual([
      localUser,
      { force: true }
    ]);

    tick(0);
  }));

  it('does not consult native legacy user when native currentUser resolves falsy', fakeAsync(() => {
    localStorage.setItem(
      'currentUser',
      JSON.stringify(localUser)
    );

    nativeStorage.getItem.and.callFake(
      (key: string) => {
        if (key === 'currentUser') {
          return Promise.resolve(null);
        }

        if (key === 'user') {
          return Promise.resolve({
            _id: 'native-legacy-user',
            firstName: 'Native Legacy'
          });
        }

        return Promise.reject(
          new Error('missing')
        );
      }
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      nativeStorage.getItem.calls.allArgs()
    ).toEqual([
      ['currentUser']
    ]);

    expect(
      service.setCurrentUser.calls.first().args
    ).toEqual([
      localUser,
      { force: true }
    ]);

    tick(0);
  }));

  it('does not consult native legacy user when native currentUser rejects', fakeAsync(() => {
    localStorage.setItem(
      'currentUser',
      JSON.stringify(localUser)
    );

    nativeStorage.getItem.and.callFake(
      (key: string) => {
        if (key === 'currentUser') {
          return Promise.reject(
            new Error('canonical unavailable')
          );
        }

        if (key === 'user') {
          return Promise.resolve({
            _id: 'native-legacy-user',
            firstName: 'Native Legacy'
          });
        }

        return Promise.reject(
          new Error('missing')
        );
      }
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      nativeStorage.getItem.calls.allArgs()
    ).toEqual([
      ['currentUser']
    ]);

    expect(
      service.setCurrentUser.calls.first().args
    ).toEqual([
      localUser,
      { force: true }
    ]);

    tick(0);
  }));

  it('rejects the malformed local currentUser sentinel and clears both persisted user keys', fakeAsync(() => {
    localStorage.setItem(
      'currentUser',
      '[object Object]'
    );

    localStorage.setItem(
      'user',
      JSON.stringify(localUser)
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      localStorage.getItem('currentUser')
    ).toBeNull();

    expect(
      localStorage.getItem('user')
    ).toBeNull();

    expect(
      service.setCurrentUser
    ).not.toHaveBeenCalled();

    expect(
      service.refreshCurrentUser
    ).not.toHaveBeenCalled();
  }));

  it('schedules forced server validation after restoring a persisted user', fakeAsync(() => {
    const freshUser = {
      _id: 'native-user',
      firstName: 'Fresh'
    };

    nativeStorage.getItem.and.callFake(
      (key: string) =>
        key === 'currentUser'
          ? Promise.resolve(nativeUser)
          : Promise.reject(
              new Error('missing')
            )
    );

    service.refreshCurrentUser.and.returnValue(
      of(freshUser)
    );

    (service as any).initCurrentUser();
    flushMicrotasks();

    expect(
      service.refreshCurrentUser
    ).not.toHaveBeenCalled();

    tick(0);

    expect(
      service.refreshCurrentUser
    ).toHaveBeenCalledTimes(1);

    expect(
      service.refreshCurrentUser
    ).toHaveBeenCalledWith({
      forceRefresh: true
    });

    expect(
      service.setCurrentUser.calls.mostRecent().args
    ).toEqual([
      freshUser,
      { force: true }
    ]);
  }));

  [401, 403].forEach(status => {
    it(`clears persisted auth after restored-user validation returns ${status}`, fakeAsync(() => {
      localStorage.setItem(
        'token',
        'stored-token'
      );

      localStorage.setItem(
        'currentUser',
        JSON.stringify(nativeUser)
      );

      localStorage.setItem(
        'user',
        JSON.stringify(nativeUser)
      );

      nativeStorage.getItem.and.callFake(
        (key: string) =>
          key === 'currentUser'
            ? Promise.resolve(nativeUser)
            : Promise.reject(
                new Error('missing')
              )
      );

      service.refreshCurrentUser.and.returnValue(
        throwError({ status })
      );

      (service as any).initCurrentUser();
      flushMicrotasks();
      tick(0);

      expect(
        localStorage.getItem('token')
      ).toBeNull();

      expect(
        localStorage.getItem('currentUser')
      ).toBeNull();

      expect(
        localStorage.getItem('user')
      ).toBeNull();

      expect(
        nativeStorage.remove
      ).toHaveBeenCalledWith('token');

      expect(
        nativeStorage.remove
      ).toHaveBeenCalledWith('currentUser');

      expect(
        nativeStorage.remove
      ).toHaveBeenCalledWith('user');

      expect(
        service.setCurrentUser
      ).toHaveBeenCalledWith(null);
    }));
  });

  it('does not clear persisted auth for a non-authorization validation failure', fakeAsync(() => {
    localStorage.setItem(
      'token',
      'stored-token'
    );

    localStorage.setItem(
      'currentUser',
      JSON.stringify(nativeUser)
    );

    localStorage.setItem(
      'user',
      JSON.stringify(nativeUser)
    );

    nativeStorage.getItem.and.callFake(
      (key: string) =>
        key === 'currentUser'
          ? Promise.resolve(nativeUser)
          : Promise.reject(
              new Error('missing')
            )
    );

    service.refreshCurrentUser.and.returnValue(
      throwError({ status: 503 })
    );

    (service as any).initCurrentUser();
    flushMicrotasks();
    tick(0);

    expect(
      localStorage.getItem('token')
    ).toBe('stored-token');

    expect(
      localStorage.getItem('currentUser')
    ).not.toBeNull();

    expect(
      localStorage.getItem('user')
    ).not.toBeNull();

    expect(
      nativeStorage.remove
    ).not.toHaveBeenCalled();

    const clearedInMemory =
      service.setCurrentUser.calls
        .allArgs()
        .some((args: any[]) =>
          args[0] === null
        );

    expect(clearedInMemory).toBeFalse();
  }));
});
