import { DataService } from './data.service';
import { SessionCredentialStore } from './session-credential-store.service';
import { SocketService } from './socket.service';

describe('SessionCredentialStore coordination', () => {
  beforeEach(async () => {
    localStorage.clear();

    SessionCredentialStore.setCachedToken(
      null
    );

    await SocketService
      .logout()
      .catch(() => undefined);

    SessionCredentialStore.setCachedToken(
      null
    );
  });

  afterEach(async () => {
    await SocketService
      .logout()
      .catch(() => undefined);

    SessionCredentialStore.setCachedToken(
      null
    );

    localStorage.clear();
  });

  it('prefers the persisted local token over the in-memory fallback cache', () => {
    SessionCredentialStore.setCachedToken(
      'cached-token'
    );

    localStorage.setItem(
      'token',
      'local-token'
    );

    expect(
      SessionCredentialStore.readSynchronousToken()
    ).toBe(
      'local-token'
    );
  });

  it('uses the shared cache when localStorage has no token', () => {
    SessionCredentialStore.setCachedToken(
      'cached-token'
    );

    localStorage.removeItem(
      'token'
    );

    expect(
      SessionCredentialStore.readSynchronousToken()
    ).toBe(
      'cached-token'
    );
  });

  it('DataService token publication feeds the shared fallback cache', () => {
    DataService.setTokenCache(
      'data-token'
    );

    // DataService historically persists localStorage as part of
    // setTokenCache. Remove it to isolate the cache contract.
    localStorage.removeItem(
      'token'
    );

    expect(
      SessionCredentialStore.readSynchronousToken()
    ).toBe(
      'data-token'
    );
  });

  it('SocketService token publication feeds the same shared fallback cache', () => {
    SocketService.setTokenCache(
      'socket-token'
    );

    localStorage.removeItem(
      'token'
    );

    expect(
      SessionCredentialStore.readSynchronousToken()
    ).toBe(
      'socket-token'
    );
  });

  it('startup restoration prefers localStorage without consulting NativeStorage', async () => {
    localStorage.setItem(
      'token',
      'local-startup-token'
    );

    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(
            'native-startup-token'
          )
        )
    };

    await expectAsync(
      SessionCredentialStore.restoreStartupToken(
        nativeStorage
      )
    ).toBeResolvedTo(
      'local-startup-token'
    );

    expect(
      nativeStorage.getItem
    ).not.toHaveBeenCalled();
  });

  it('startup restoration falls back to NativeStorage and backfills localStorage', async () => {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(
            'native-startup-token'
          )
        )
    };

    await expectAsync(
      SessionCredentialStore.restoreStartupToken(
        nativeStorage
      )
    ).toBeResolvedTo(
      'native-startup-token'
    );

    expect(
      nativeStorage.getItem
    ).toHaveBeenCalledWith(
      'token'
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'native-startup-token'
    );
  });

  it('startup restoration resolves null when neither persistence store has a token', async () => {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(null)
        )
    };

    await expectAsync(
      SessionCredentialStore.restoreStartupToken(
        nativeStorage
      )
    ).toBeResolvedTo(null);

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();
  });

  it('native persisted-token read backfills localStorage', async () => {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(
            'native-request-token'
          )
        )
    };

    await expectAsync(
      SessionCredentialStore
        .readNativeTokenAndBackfill(
          nativeStorage
        )
    ).toBeResolvedTo(
      'native-request-token'
    );

    expect(
      nativeStorage.getItem
    ).toHaveBeenCalledWith(
      'token'
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'native-request-token'
    );
  });

  it('native persisted-token read leaves error handling to its caller', async () => {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.reject(
            new Error(
              'native read failed'
            )
          )
        )
    };

    await expectAsync(
      SessionCredentialStore
        .readNativeTokenAndBackfill(
          nativeStorage
        )
    ).toBeRejected();

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();
  });

  it('authenticated browser publication persists local state and shared cache without NativeStorage', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
    };

    await SessionCredentialStore
      .publishAuthenticatedToken(
        'browser-auth-token',
        nativeStorage,
        false
      );

    expect(
      nativeStorage.setItem
    ).not.toHaveBeenCalled();

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'browser-auth-token'
    );

    expect(
      SessionCredentialStore.getCachedToken()
    ).toBe(
      'browser-auth-token'
    );
  });

  it('authenticated Cordova publication writes NativeStorage before publishing local/cache state', async () => {
    const events: string[] = [];

    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
        .and.callFake(
          async (
            key: string,
            value: any
          ) => {
            events.push(
              `native:${key}:${value}`
            );

            return value;
          }
        )
    };

    const originalWriteLocal =
      SessionCredentialStore.writeLocalToken;

    spyOn(
      SessionCredentialStore,
      'writeLocalToken'
    ).and.callFake(
      (value: string | null) => {
        events.push(
          `local:${value}`
        );

        originalWriteLocal.call(
          SessionCredentialStore,
          value
        );
      }
    );

    await SessionCredentialStore
      .publishAuthenticatedToken(
        'cordova-auth-token',
        nativeStorage,
        true
      );

    expect(
      events
    ).toEqual([
      'native:token:cordova-auth-token',
      'local:cordova-auth-token'
    ]);

    expect(
      SessionCredentialStore.getCachedToken()
    ).toBe(
      'cordova-auth-token'
    );
  });

  it('authenticated Cordova publication stops before local/cache state when NativeStorage fails', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
        .and.returnValue(
          Promise.reject(
            new Error(
              'native persistence failed'
            )
          )
        )
    };

    await expectAsync(
      SessionCredentialStore
        .publishAuthenticatedToken(
          'failed-auth-token',
          nativeStorage,
          true
        )
    ).toBeRejected();

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();

    expect(
      SessionCredentialStore.getCachedToken()
    ).toBeNull();
  });
});
