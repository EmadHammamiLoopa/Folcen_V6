import { throwError } from 'rxjs';
import { AppComponent } from '../app.component';
import { DataService } from './data.service';
import { SessionInvalidationCoordinator } from './session-invalidation-coordinator.service';
import { SocketService } from './socket.service';
import { UserService } from './user.service';

describe('Phase 3 auth failure ownership', () => {
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
      remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve()),
      clear: jasmine.createSpy('clear').and.returnValue(Promise.resolve()),
    };
    nativeHttp = {
      sendRequest: jasmine.createSpy('sendRequest'),
    };
    httpClient = {
      get: jasmine.createSpy('get'),
      post: jasmine.createSpy('post'),
      put: jasmine.createSpy('put'),
      delete: jasmine.createSpy('delete'),
    };
    router = {
      url: '/tabs/feed',
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true)),
    };
    platform = {
      is: jasmine.createSpy('is').and.returnValue(false),
    };
    sessionStore = {
      clear: jasmine.createSpy('clear'),
    };
    oneSignal = {
      close: jasmine.createSpy('close'),
    };

    service = new DataService(
      '/protected',
      nativeStorage,
      nativeHttp,
      httpClient,
      router,
      platform,
      sessionStore,
      oneSignal
    );
  });

  afterEach(() => {
    try { delete (window as any).peer; } catch (_) {}
    localStorage.clear();
    sessionStorage.clear();
    DataService.setTokenCache(null);
  });

  it('generic authenticated browser endpoint 401 rejects and preserves the valid session', async () => {
    const userJson = JSON.stringify({ _id: 'user-1' });
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('currentUser', userJson);
    httpClient.get.and.returnValue(throwError({ status: 401, kind: 'ordinary-endpoint' }));

    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());
    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    const clearUser = spyOn(UserService, 'clearUserState');
    const localClear = spyOn(localStorage, 'clear').and.callThrough();

    await expectAsync(
      service.sendRequest({ method: 'get', url: '/ordinary-resource' })
    ).toBeRejected();

    expect(logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('valid-token');
    expect(localStorage.getItem('currentUser')).toBe(userJson);
    expect(sessionStore.clear).not.toHaveBeenCalled();
    expect(socketLogout).not.toHaveBeenCalled();
    expect(clearUser).not.toHaveBeenCalled();
    expect(nativeStorage.clear).not.toHaveBeenCalled();
    expect(localClear).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('generic authenticated Cordova endpoint 401 follows the same request-local policy', async () => {
    const userJson = JSON.stringify({ _id: 'user-1' });
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('currentUser', userJson);
    platform.is.and.callFake((name: string) => name === 'cordova');
    nativeHttp.sendRequest.and.returnValue(Promise.reject({ status: 401, kind: 'ordinary-native-endpoint' }));

    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());
    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    const clearUser = spyOn(UserService, 'clearUserState');

    await expectAsync(
      service.sendRequest({ method: 'get', url: '/ordinary-native-resource' })
    ).toBeRejected();

    expect(logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('valid-token');
    expect(localStorage.getItem('currentUser')).toBe(userJson);
    expect(sessionStore.clear).not.toHaveBeenCalled();
    expect(socketLogout).not.toHaveBeenCalled();
    expect(clearUser).not.toHaveBeenCalled();
    expect(nativeStorage.clear).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  [400, 403, 404, 500, 0].forEach((status) => {
    it(`generic endpoint ${status} rejects without authoritative invalidation`, async () => {
      const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

      await expectAsync(
        (service as any).handleError({ status, kind: 'ordinary-endpoint' })
      ).toBeRejected();

      expect(logout).not.toHaveBeenCalled();
      expect(sessionStore.clear).not.toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  it('auth-page invalid-credentials 401 rejects without global logout or redirect recursion', async () => {
    router.url = '/auth/signin';
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync(
      (service as any).handleError({ status: 401, kind: 'invalid-credentials' })
    ).toBeRejected();

    expect(logout).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('explicit physical logout still owns the complete client cleanup path', async () => {
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('currentUser', JSON.stringify({ _id: 'user-1' }));
    sessionStorage.setItem('ephemeral', 'value');

    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    const clearUser = spyOn(UserService, 'clearUserState');
    const peerDestroy = jasmine.createSpy('peerDestroy');
    (window as any).peer = { destroy: peerDestroy };

    await service.logout();

    expect(nativeStorage.clear).toHaveBeenCalledTimes(1);
    expect(sessionStore.clear).toHaveBeenCalledWith('logout');
    expect(socketLogout).toHaveBeenCalledTimes(1);
    expect(clearUser).toHaveBeenCalledTimes(1);
    expect(oneSignal.close).toHaveBeenCalledTimes(1);
    expect(peerDestroy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(sessionStorage.getItem('ephemeral')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth', { replaceUrl: true });
  });

  it('deduplicates simultaneous authoritative invalidation into one physical logout', async () => {
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('currentUser', JSON.stringify({ _id: 'user-1' }));
    nativeStorage.getItem.and.returnValue(Promise.resolve(null));

    let releaseClear!: () => void;
    let clearStartedResolve!: () => void;
    const clearStarted = new Promise<void>(resolve => { clearStartedResolve = resolve; });
    const clearGate = new Promise<void>(resolve => { releaseClear = resolve; });
    nativeStorage.clear.and.callFake(() => {
      clearStartedResolve();
      return clearGate;
    });

    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    const clearUser = spyOn(UserService, 'clearUserState');
    const coordinator = new SessionInvalidationCoordinator();

    const first = coordinator.invalidate('server-force-logout', () => service.logout());
    const second = coordinator.invalidate('server-force-logout-duplicate', () => service.logout());

    expect(first).toBe(second);
    await clearStarted;
    expect(nativeStorage.clear).toHaveBeenCalledTimes(1);

    releaseClear();
    await Promise.all([first, second]);

    expect(nativeStorage.clear).toHaveBeenCalledTimes(1);
    expect(sessionStore.clear).toHaveBeenCalledTimes(1);
    expect(socketLogout).toHaveBeenCalledTimes(1);
    expect(clearUser).toHaveBeenCalledTimes(1);
    expect(oneSignal.close).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('resets coordinator ownership after completion so a later session can invalidate', async () => {
    const coordinator = new SessionInvalidationCoordinator();
    const executor = jasmine.createSpy('executor').and.returnValue(Promise.resolve());

    await Promise.all([
      coordinator.invalidate('first', executor),
      coordinator.invalidate('duplicate', executor),
    ]);
    await coordinator.invalidate('later-session', executor);

    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('AppComponent force-logout integration delegates to the authoritative coordinator', () => {
    const source = AppComponent.toString();

    expect(source).toContain('sessionInvalidation.invalidate');
    expect(source).toContain('requestAuthoritativeLogout');
    expect(source).not.toContain('await this.dataService.logout()');
  });

  it('DataService transport handling has no direct generic 401-to-logout escalation', () => {
    const source = DataService.toString();
    const handleErrorSource = source.slice(
      source.indexOf('handleError'),
      source.indexOf('logout()', source.indexOf('handleError'))
    );

    expect(handleErrorSource).not.toContain('this.logout');
  });

  [401, 403].forEach((status) => {
    it(`startup persisted-session validation ${status} still clears the invalid stored session`, async () => {
      localStorage.setItem('token', 'stale-token');
      localStorage.setItem('currentUser', JSON.stringify({ _id: 'user-1' }));
      localStorage.setItem('user', JSON.stringify({ _id: 'user-1' }));

      const startup: any = Object.create(UserService.prototype);
      startup.callCounters = { initCalls: 0 };
      startup.nativeStorage = {
        getItem: jasmine.createSpy('startupGetItem').and.returnValue(Promise.reject(new Error('missing'))),
        remove: jasmine.createSpy('startupRemove').and.returnValue(Promise.resolve()),
      };
      startup.idService = {
        normalizeId: (value: any) => String(value || ''),
      };
      startup.setCurrentUser = jasmine.createSpy('setCurrentUser');
      startup.refreshCurrentUser = jasmine.createSpy('refreshCurrentUser')
        .and.returnValue(throwError({ status }));

      await startup.initCurrentUser();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('currentUser')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(startup.nativeStorage.remove).toHaveBeenCalledWith('token');
      expect(startup.nativeStorage.remove).toHaveBeenCalledWith('currentUser');
      expect(startup.nativeStorage.remove).toHaveBeenCalledWith('user');
      expect(startup.setCurrentUser).toHaveBeenCalledWith(null);
    });
  });
});
