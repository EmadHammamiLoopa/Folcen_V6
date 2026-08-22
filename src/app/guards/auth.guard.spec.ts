import { of } from 'rxjs';
import { AuthGuard } from './auth.guard';

describe('AuthGuard session restoration characterization', () => {
  let nativeStorage: any;
  let router: any;
  let platform: any;
  let http: any;

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

  function makeGuard(): AuthGuard {
    return new AuthGuard(
      nativeStorage,
      router,
      platform,
      http
    );
  }

  beforeEach(() => {
    localStorage.clear();

    nativeStorage = {
      getItem: jasmine.createSpy('getItem'),
      setItem: jasmine.createSpy('setItem').and.returnValue(Promise.resolve()),
      remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve())
    };

    router = {
      navigate: jasmine.createSpy('navigate')
    };

    platform = {
      ready: jasmine.createSpy('ready').and.returnValue(Promise.resolve()),
      is: jasmine.createSpy('is').and.callFake(() => false)
    };

    http = {
      get: jasmine.createSpy('get').and.returnValue(
        of({
          data: {
            _id: 'user-1',
            emailVerified: true
          }
        })
      )
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('allows a browser session with a valid token and verified persisted user', async () => {
    localStorage.setItem('token', tokenFor(3600));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });

  it('clears an expired browser session and redirects to signin', async () => {
    localStorage.setItem('token', tokenFor(-60));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );
    localStorage.setItem(
      'user',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/signin']);
  });

  it('clears an inconsistent browser session when token exists but user is missing', async () => {
    localStorage.setItem('token', tokenFor(3600));

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(localStorage.getItem('token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/signin']);
  });

  it('redirects an unverified user to the verification signup step', async () => {
    localStorage.setItem('token', tokenFor(3600));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: false
      })
    );

    http.get.and.returnValue(
      of({
        data: {
          _id: 'user-1',
          emailVerified: false
        }
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/auth/signup'],
      {
        queryParams: {
          reason: 'email_not_verified'
        }
      }
    );
  });

  it('allows navigation when verification refresh changes the persisted user to verified', async () => {
    localStorage.setItem('token', tokenFor(3600));
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: false
      })
    );

    http.get.and.returnValue(
      of({
        data: {
          _id: 'user-1',
          emailVerified: true
        }
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();
    expect(http.get).toHaveBeenCalledTimes(1);

    const currentUser = JSON.parse(
      localStorage.getItem('currentUser') as string
    );
    const legacyUser = JSON.parse(
      localStorage.getItem('user') as string
    );

    expect(currentUser.emailVerified).toBeTrue();
    expect(legacyUser.emailVerified).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redirects a browser session with no token to signin without global clearing', async () => {
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/signin']);

    // Existing behavior: no-token path does not call clearStoredAuth().
    expect(localStorage.getItem('currentUser')).not.toBeNull();
  });

  it('preserves the Cordova localStorage user fallback when NativeStorage has a token but no user', async () => {
    platform.is.and.callFake(
      (name: string) => name === 'cordova'
    );

    nativeStorage.getItem.and.callFake((key: string) => {
      if (key === 'token') {
        return Promise.resolve(tokenFor(3600));
      }
      return Promise.reject(new Error(`missing ${key}`));
    });

    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        _id: 'user-1',
        emailVerified: true
      })
    );

    const allowed = await makeGuard().canActivate();

    expect(allowed).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
