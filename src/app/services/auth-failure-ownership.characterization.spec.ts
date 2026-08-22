import { throwError } from 'rxjs';
import { DataService } from './data.service';
import { SocketService } from './socket.service';
import { UserService } from './user.service';

describe('Phase 3 auth failure ownership characterization', () => {
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
      getItem: jasmine.createSpy('getItem').and.returnValue(Promise.reject(new Error('missing'))),
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

  it('LEGACY_CHARACTERIZATION generic authenticated endpoint 401 escalates to full logout ownership', async () => {
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('currentUser', JSON.stringify({ _id: 'user-1' }));
    httpClient.get.and.returnValue(throwError({ status: 401, kind: 'ordinary-endpoint' }));
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync(
      service.sendRequest({ method: 'get', url: '/ordinary-resource' })
    ).toBeRejected();

    expect(logout).toHaveBeenCalledTimes(1);
  });

  [400, 403, 404, 500, 0].forEach((status) => {
    it(`generic endpoint ${status} rejects without escalating to full logout`, async () => {
      const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

      await expectAsync(
        (service as any).handleError({ status, kind: 'ordinary-endpoint' })
      ).toBeRejected();

      expect(logout).not.toHaveBeenCalled();
    });
  });

  it('auth-page invalid-credentials 401 rejects without starting global logout or redirect recursion', async () => {
    router.url = '/auth/signin';
    const logout = spyOn(service, 'logout').and.returnValue(Promise.resolve());

    await expectAsync(
      (service as any).handleError({ status: 401, kind: 'invalid-credentials' })
    ).toBeRejected();

    expect(logout).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('explicit logout owns the complete client cleanup path', async () => {
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

  it('LEGACY_CHARACTERIZATION concurrent direct full-logouts are not deduplicated', async () => {
    const socketLogout = spyOn(SocketService, 'logout').and.returnValue(Promise.resolve());
    spyOn(UserService, 'clearUserState');

    await Promise.all([
      service.logout(),
      service.logout(),
    ]);

    expect(nativeStorage.clear).toHaveBeenCalledTimes(2);
    expect(socketLogout).toHaveBeenCalledTimes(2);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(2);
  });

  [401, 403].forEach((status) => {
    it(`startup persisted-session validation ${status} clears the invalid stored session`, async () => {
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
