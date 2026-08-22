import { of, throwError } from 'rxjs';
import { DataService } from './data.service';
import { SocketService } from './socket.service';
import { UserService } from './user.service';

describe('DataService auth/session characterization', () => {
  let nativeStorage: any;
  let nativeHttp: any;
  let httpClient: any;
  let router: any;
  let platform: any;
  let sessionStore: any;
  let oneSignal: any;
  let service: DataService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    DataService.setTokenCache(null);

    nativeStorage = {
      getItem: jasmine.createSpy('getItem').and.returnValue(Promise.resolve(null)),
      setItem: jasmine.createSpy('setItem').and.returnValue(Promise.resolve()),
      clear: jasmine.createSpy('clear').and.returnValue(Promise.resolve()),
    };
    nativeHttp = { sendRequest: jasmine.createSpy('sendRequest') };
    httpClient = {
      get: jasmine.createSpy('get').and.returnValue(of({ ok: true })),
      post: jasmine.createSpy('post').and.returnValue(of({ ok: true })),
      put: jasmine.createSpy('put').and.returnValue(of({ ok: true })),
      delete: jasmine.createSpy('delete').and.returnValue(of({ ok: true })),
    };
    router = {
      url: '/tabs/feed',
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true)),
    };
    platform = { is: jasmine.createSpy('is').and.returnValue(false) };
    sessionStore = { clear: jasmine.createSpy('clear') };
    oneSignal = { close: jasmine.createSpy('close') };

    service = new DataService(
      '/protected', nativeStorage, nativeHttp, httpClient, router,
      platform, sessionStore, oneSignal
    );
  });

  it('restores a token from localStorage before consulting NativeStorage', async () => {
    localStorage.setItem('token', 'local-token');

    await expectAsync(service.getToken()).toBeResolvedTo('local-token');
    expect(nativeStorage.getItem).not.toHaveBeenCalled();
  });

  it('falls back to NativeStorage on a Cordova runtime and backfills localStorage', async () => {
    platform.is.and.callFake((name: string) => name === 'cordova');
    nativeStorage.getItem.and.returnValue(Promise.resolve('native-token'));

    await expectAsync(service.getToken()).toBeResolvedTo('native-token');
    expect(localStorage.getItem('token')).toBe('native-token');
  });

  it('resolves an empty token when neither token store has a value', async () => {
    platform.is.and.callFake((name: string) => name === 'cordova');

    await expectAsync(service.getToken()).toBeResolvedTo('');
  });

  it('adds the current token to a valid authenticated browser request', async () => {
    localStorage.setItem('token', 'request-token');

    await service.sendRequest({ method: 'get', url: '/resource' });

    const options = httpClient.get.calls.mostRecent().args[1];
    expect(options.headers.Authorization).toBe('Bearer request-token');
  });

  it('ordinary 401 rejects without invoking the full logout path', async () => {
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync((service as any).handleError({ status: 401, kind: 'ordinary' }))
      .toBeRejected();

    expect(logout).not.toHaveBeenCalled();
  });

  it('does not treat a 401 code label alone as authoritative session invalidation', async () => {
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync((service as any).handleError({ status: 401, code: 'token_revoked' }))
      .toBeRejected();

    expect(logout).not.toHaveBeenCalled();
  });

  [
    { label: 'authorization denied', status: 403 },
    { label: 'network failure', status: 0 },
    { label: 'server failure', status: 503 },
  ].forEach(({ label, status }) => {
    it(`does not log out for ${label} (${status})`, async () => {
      const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

      await expectAsync((service as any).handleError({ status })).toBeRejected();

      expect(logout).not.toHaveBeenCalled();
    });
  });

  it('rejects a failed authenticated request without destroying the session', async () => {
    localStorage.setItem('token', 'request-token');
    httpClient.get.and.returnValue(throwError({ status: 401 }));
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync(service.sendRequest({ method: 'get', url: '/resource' }))
      .toBeRejected();

    expect(logout).not.toHaveBeenCalled();
  });

  it('explicit logout clears persistence, socket/user state, and navigates to auth', async () => {
    localStorage.setItem('token', 'before-logout');
    sessionStorage.setItem('ephemeral', 'value');
    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    const clearUser = spyOn(UserService, 'clearUserState');

    await service.logout();

    expect(nativeStorage.clear).toHaveBeenCalled();
    expect(sessionStore.clear).toHaveBeenCalledWith('logout');
    expect(socketLogout).toHaveBeenCalled();
    expect(clearUser).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('ephemeral')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth', { replaceUrl: true });
  });
});

/**
 * Ordinary endpoint failures, including 401, remain request-local.
 * Full client cleanup is reserved for explicit/authoritative invalidation paths.
 */
