import { of } from 'rxjs';

import { DataService } from './data.service';
import { SocketService } from './socket.service';
import { SigninComponent } from '../pages/auth/signin/signin.component';
import { SignupComponent } from '../pages/auth/signup/signup.component';

describe('Token credential ownership characterization', () => {
  function tokenFor(
    userId: string
  ): string {
    const header =
      btoa(
        JSON.stringify({
          alg: 'none'
        })
      ).replace(/=/g, '');

    const payload =
      btoa(
        JSON.stringify({
          id: userId
        })
      ).replace(/=/g, '');

    return (
      `${header}.` +
      `${payload}.signature`
    );
  }

  function makeDataService(
    cordova = false
  ): {
    service: DataService;
    nativeStorage: any;
  } {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(null)
        ),

      setItem: jasmine
        .createSpy('setItem')
        .and.returnValue(
          Promise.resolve()
        ),

      clear: jasmine
        .createSpy('clear')
        .and.returnValue(
          Promise.resolve()
        )
    };

    const nativeHttp = {
      sendRequest: jasmine
        .createSpy('sendRequest')
    };

    const httpClient = {
      get: jasmine
        .createSpy('get')
        .and.returnValue(
          of({ ok: true })
        ),

      post: jasmine
        .createSpy('post')
        .and.returnValue(
          of({ ok: true })
        ),

      put: jasmine
        .createSpy('put')
        .and.returnValue(
          of({ ok: true })
        ),

      delete: jasmine
        .createSpy('delete')
        .and.returnValue(
          of({ ok: true })
        )
    };

    const router = {
      url: '/tabs/feed',
      navigateByUrl: jasmine
        .createSpy('navigateByUrl')
    };

    const platform = {
      is: jasmine
        .createSpy('is')
        .and.callFake(
          (name: string) =>
            cordova &&
            name === 'cordova'
        )
    };

    const sessionStore = {
      clear: jasmine
        .createSpy('clear')
    };

    const oneSignal = {
      close: jasmine
        .createSpy('close')
    };

    return {
      nativeStorage,

      service:
        new DataService(
          '/protected',
          nativeStorage as any,
          nativeHttp as any,
          httpClient as any,
          router as any,
          platform as any,
          sessionStore as any,
          oneSignal as any
        )
    };
  }

  function makeAuthEntry(
    prototype: any,
    cordova: boolean
  ): {
    component: any;
    nativeStorage: any;
    userService: any;
  } {
    const component =
      Object.create(
        prototype
      ) as any;

    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
        .and.returnValue(
          Promise.resolve()
        )
    };

    const userService = {
      setCurrentUser: jasmine
        .createSpy('setCurrentUser')
    };

    component.platform = {
      is: jasmine
        .createSpy('is')
        .and.callFake(
          (name: string) =>
            cordova &&
            name === 'cordova'
        )
    };

    component.nativeStorage =
      nativeStorage;

    component.userService =
      userService;

    return {
      component,
      nativeStorage,
      userService
    };
  }

  beforeEach(async () => {
    await SocketService
      .logout()
      .catch(() => undefined);

    SocketService.setTokenCache(null);
    DataService.setTokenCache(null);

    localStorage.clear();
  });

  afterEach(async () => {
    await SocketService
      .logout()
      .catch(() => undefined);

    SocketService.setTokenCache(null);
    DataService.setTokenCache(null);

    localStorage.clear();
  });

  it('DataService uses its cache when localStorage no longer has the token', async () => {
    const {
      service
    } = makeDataService(false);

    DataService.setTokenCache(
      'cached-token'
    );

    localStorage.removeItem(
      'token'
    );

    await expectAsync(
      service.getToken()
    ).toBeResolvedTo(
      'cached-token'
    );
  });

  it('DataService localStorage token outranks an older static cache value', async () => {
    const {
      service
    } = makeDataService(false);

    DataService.setTokenCache(
      'old-cache-token'
    );

    localStorage.setItem(
      'token',
      'new-local-token'
    );

    await expectAsync(
      service.getToken()
    ).toBeResolvedTo(
      'new-local-token'
    );
  });

  it('SocketService can derive its owner from the synchronous token cache alone', () => {
    SocketService.setTokenCache(
      tokenFor(
        'cache-owner'
      )
    );

    localStorage.removeItem(
      'token'
    );

    expect(
      SocketService.getOwnerId()
    ).toBe(
      'cache-owner'
    );
  });

  it('SocketService localStorage token outranks an older socket token cache', () => {
    SocketService.setTokenCache(
      tokenFor(
        'old-owner'
      )
    );

    localStorage.setItem(
      'token',
      tokenFor(
        'local-owner'
      )
    );

    expect(
      SocketService.getOwnerId()
    ).toBe(
      'local-owner'
    );
  });

  it('sign-in publishes the browser token to localStorage and socket authentication state', async () => {
    const {
      component,
      nativeStorage,
      userService
    } = makeAuthEntry(
      SigninComponent.prototype,
      false
    );

    await component.storeUserData(
      'signin-browser-token',
      {
        _id: 'signin-user'
      }
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'signin-browser-token'
    );

    expect(
      nativeStorage.setItem
    ).not.toHaveBeenCalledWith(
      'token',
      jasmine.anything()
    );

    expect(
      userService.setCurrentUser
    ).toHaveBeenCalled();

    expect(
      (SocketService as any).tokenCache
    ).toBe(
      'signin-browser-token'
    );
  });

  it('sign-in persists the token to NativeStorage as well as local/socket state on Cordova', async () => {
    const {
      component,
      nativeStorage
    } = makeAuthEntry(
      SigninComponent.prototype,
      true
    );

    await component.storeUserData(
      'signin-native-token',
      {
        _id: 'signin-native-user'
      }
    );

    expect(
      nativeStorage.setItem
    ).toHaveBeenCalledWith(
      'token',
      'signin-native-token'
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'signin-native-token'
    );

    expect(
      (SocketService as any).tokenCache
    ).toBe(
      'signin-native-token'
    );
  });

  it('sign-up publishes the browser token to localStorage and socket authentication state', async () => {
    const {
      component,
      nativeStorage,
      userService
    } = makeAuthEntry(
      SignupComponent.prototype,
      false
    );

    await component.storeUserData(
      'signup-browser-token',
      {
        _id: 'signup-user'
      }
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'signup-browser-token'
    );

    expect(
      nativeStorage.setItem
    ).not.toHaveBeenCalledWith(
      'token',
      jasmine.anything()
    );

    expect(
      userService.setCurrentUser
    ).toHaveBeenCalled();

    expect(
      (SocketService as any).tokenCache
    ).toBe(
      'signup-browser-token'
    );
  });

  it('sign-up persists the token to NativeStorage as well as local/socket state on Cordova', async () => {
    const {
      component,
      nativeStorage
    } = makeAuthEntry(
      SignupComponent.prototype,
      true
    );

    await component.storeUserData(
      'signup-native-token',
      {
        _id: 'signup-native-user'
      }
    );

    expect(
      nativeStorage.setItem
    ).toHaveBeenCalledWith(
      'token',
      'signup-native-token'
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(
      'signup-native-token'
    );

    expect(
      (SocketService as any).tokenCache
    ).toBe(
      'signup-native-token'
    );
  });
});
