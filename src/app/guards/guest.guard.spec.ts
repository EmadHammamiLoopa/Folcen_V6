import { GuestGuard } from './guest.guard';

describe('GuestGuard session restoration characterization', () => {
  let nativeStorage: any;
  let router: any;
  let platform: any;

  function tokenFor(offsetSeconds: number): string {
    const encode = (value: any) =>
      btoa(JSON.stringify(value))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return [
      encode({ alg: 'none', typ: 'JWT' }),
      encode({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + offsetSeconds
      }),
      'signature'
    ].join('.');
  }

  function makeGuard(): GuestGuard {
    return new GuestGuard(
      nativeStorage,
      router,
      platform
    );
  }

  beforeEach(() => {
    localStorage.clear();

    nativeStorage = {
      getItem: jasmine.createSpy('getItem'),
      remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve())
    };

    router = {
      navigate: jasmine.createSpy('navigate')
    };

    platform = {
      ready: jasmine.createSpy('ready').and.returnValue(Promise.resolve()),
      is: jasmine.createSpy('is').and.callFake(() => false)
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('blocks guest routes for a valid browser session and redirects into the app', async () => {
    localStorage.setItem('token', tokenFor(3600));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/tabs/new-friends']);
  });

  it('allows guest routes and clears an expired browser session', async () => {
    localStorage.setItem('token', tokenFor(-60));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1'
      })
    );
    localStorage.setItem(
      'user',
      JSON.stringify({
        _id: 'user-1'
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('allows guest routes when browser auth state is incomplete', async () => {
    localStorage.setItem('token', tokenFor(3600));

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();

    // Existing GuestGuard behavior does not clear an incomplete
    // non-expired token/user pair.
    expect(localStorage.getItem('token')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks guest routes for a valid Cordova session', async () => {
    platform.is.and.callFake(
      (name: string) => name === 'cordova'
    );

    nativeStorage.getItem.and.callFake((key: string) => {
      if (key === 'token') {
        return Promise.resolve(tokenFor(3600));
      }

      if (key === 'currentUser') {
        return Promise.resolve({
          _id: 'user-1',
          emailVerified: true
        });
      }

      return Promise.resolve(null);
    });

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/tabs/new-friends']);
  });

  it('allows guest routes and clears an expired Cordova session', async () => {
    platform.is.and.callFake(
      (name: string) => name === 'cordova'
    );

    nativeStorage.getItem.and.callFake((key: string) => {
      if (key === 'token') {
        return Promise.resolve(tokenFor(-60));
      }

      if (key === 'currentUser') {
        return Promise.resolve({
          _id: 'user-1'
        });
      }

      return Promise.resolve(null);
    });

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();

    expect(nativeStorage.remove).toHaveBeenCalledWith('token');
    expect(nativeStorage.remove).toHaveBeenCalledWith('currentUser');
    expect(nativeStorage.remove).toHaveBeenCalledWith('user');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
