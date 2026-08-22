import {
  HttpRequest,
  HttpResponse
} from '@angular/common/http';
import {
  firstValueFrom,
  of
} from 'rxjs';

import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor token ownership characterization', () => {
  let nativeStorage: any;
  let platform: any;
  let router: any;
  let toastCtrl: any;
  let next: any;
  let interceptor: AuthInterceptor;

  beforeEach(() => {
    localStorage.clear();

    nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(null)
        )
    };

    platform = {
      is: jasmine
        .createSpy('is')
        .and.returnValue(false)
    };

    router = {
      url: '/tabs/feed',
      navigate: jasmine
        .createSpy('navigate')
    };

    toastCtrl = {
      create: jasmine
        .createSpy('create')
        .and.returnValue(
          Promise.resolve({
            present: jasmine
              .createSpy('present')
              .and.returnValue(
                Promise.resolve()
              )
          })
        )
    };

    next = {
      handle: jasmine
        .createSpy('handle')
        .and.returnValue(
          of(
            new HttpResponse({
              status: 200
            })
          )
        )
    };

    interceptor =
      new AuthInterceptor(
        nativeStorage,
        platform,
        router,
        toastCtrl
      );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not attach a stored token to an auth-entry request', async () => {
    localStorage.setItem(
      'token',
      'stale-token'
    );

    const request =
      new HttpRequest(
        'POST',
        '/auth/signin',
        {}
      );

    await firstValueFrom(
      interceptor.intercept(
        request,
        next
      )
    );

    const forwarded =
      next.handle.calls
        .mostRecent()
        .args[0];

    expect(
      forwarded.headers.has(
        'Authorization'
      )
    ).toBeFalse();

    expect(
      nativeStorage.getItem
    ).not.toHaveBeenCalled();
  });

  it('attaches the local browser token to a protected request', async () => {
    localStorage.setItem(
      'token',
      'browser-token'
    );

    const request =
      new HttpRequest(
        'GET',
        '/protected/resource'
      );

    await firstValueFrom(
      interceptor.intercept(
        request,
        next
      )
    );

    const forwarded =
      next.handle.calls
        .mostRecent()
        .args[0];

    expect(
      forwarded.headers.get(
        'Authorization'
      )
    ).toBe(
      'Bearer browser-token'
    );

    expect(
      nativeStorage.getItem
    ).not.toHaveBeenCalled();
  });

  it('does not consult NativeStorage in a browser when no local token exists', async () => {
    platform.is.and.returnValue(false);

    const request =
      new HttpRequest(
        'GET',
        '/protected/resource'
      );

    await firstValueFrom(
      interceptor.intercept(
        request,
        next
      )
    );

    const forwarded =
      next.handle.calls
        .mostRecent()
        .args[0];

    expect(
      nativeStorage.getItem
    ).not.toHaveBeenCalled();

    expect(
      forwarded.headers.has(
        'Authorization'
      )
    ).toBeFalse();
  });

  it('falls back to NativeStorage on Cordova, backfills localStorage, and attaches the token', async () => {
    platform.is.and.callFake(
      (name: string) =>
        name === 'cordova'
    );

    nativeStorage.getItem
      .and.returnValue(
        Promise.resolve(
          'native-token'
        )
      );

    const request =
      new HttpRequest(
        'GET',
        '/protected/resource'
      );

    await firstValueFrom(
      interceptor.intercept(
        request,
        next
      )
    );

    const forwarded =
      next.handle.calls
        .mostRecent()
        .args[0];

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
      'native-token'
    );

    expect(
      forwarded.headers.get(
        'Authorization'
      )
    ).toBe(
      'Bearer native-token'
    );
  });
});
