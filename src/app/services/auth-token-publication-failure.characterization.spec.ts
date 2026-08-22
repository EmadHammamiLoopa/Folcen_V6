import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';

import { SigninComponent } from '../pages/auth/signin/signin.component';
import { SignupComponent } from '../pages/auth/signup/signup.component';

import { SocketService } from './socket.service';
import { DataService } from './data.service';
import { SessionCredentialStore } from './session-credential-store.service';

describe('authentication token publication failure characterization', () => {
  const token = 'publication-token';

  function buildSignin(
    cordova: boolean,
    nativeStorage: any
  ): any {
    const component: any =
      Object.create(
        SigninComponent.prototype
      );

    component.platform = {
      is: jasmine
        .createSpy('is')
        .and.callFake(
          (name: string) =>
            name === 'cordova'
              ? cordova
              : false
        )
    } as Partial<Platform>;

    component.nativeStorage =
      nativeStorage as NativeStorage;

    component.userService = {
      setCurrentUser:
        jasmine.createSpy(
          'setCurrentUser'
        )
    };

    return component;
  }

  function buildSignup(
    cordova: boolean,
    nativeStorage: any
  ): any {
    const component: any =
      Object.create(
        SignupComponent.prototype
      );

    component.platform = {
      is: jasmine
        .createSpy('is')
        .and.callFake(
          (name: string) =>
            name === 'cordova'
              ? cordova
              : false
        )
    } as Partial<Platform>;

    component.nativeStorage =
      nativeStorage as NativeStorage;

    component.userService = {
      setCurrentUser:
        jasmine.createSpy(
          'setCurrentUser'
        )
    };

    return component;
  }

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

  it('signin Cordova native persistence failure prevents later token publication in the current implementation', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
        .and.returnValue(
          Promise.reject(
            new Error(
              'native write failed'
            )
          )
        )
    };

    const socketSpy =
      spyOn(
        SocketService,
        'setTokenCache'
      );

    const dataSpy =
      spyOn(
        DataService,
        'setTokenCache'
      );

    const component =
      buildSignin(
        true,
        nativeStorage
      );

    await component.storeUserData(
      token,
      { id: 'signin-user' }
    );

    expect(
      nativeStorage.setItem
    ).toHaveBeenCalledWith(
      'token',
      token
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();

    expect(
      socketSpy
    ).not.toHaveBeenCalled();

    expect(
      dataSpy
    ).not.toHaveBeenCalled();
  });

  it('signup Cordova native persistence failure prevents later token publication in the current implementation', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
        .and.returnValue(
          Promise.reject(
            new Error(
              'native write failed'
            )
          )
        )
    };

    const socketSpy =
      spyOn(
        SocketService,
        'setTokenCache'
      );

    const component =
      buildSignup(
        true,
        nativeStorage
      );

    await component.storeUserData(
      token,
      { id: 'signup-user' }
    );

    expect(
      nativeStorage.setItem
    ).toHaveBeenCalledWith(
      'token',
      token
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();

    expect(
      socketSpy
    ).not.toHaveBeenCalled();
  });

  it('signin browser publication does not consult NativeStorage', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
    };

    const socketSpy =
      spyOn(
        SocketService,
        'setTokenCache'
      );

    const dataSpy =
      spyOn(
        DataService,
        'setTokenCache'
      );

    const component =
      buildSignin(
        false,
        nativeStorage
      );

    await component.storeUserData(
      token,
      { id: 'signin-user' }
    );

    expect(
      nativeStorage.setItem
    ).not.toHaveBeenCalled();

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(token);

    expect(
      socketSpy
    ).toHaveBeenCalledWith(
      token
    );

    expect(
      dataSpy
    ).toHaveBeenCalledWith(
      token
    );
  });

  it('signup browser publication does not consult NativeStorage and still publishes the socket token', async () => {
    const nativeStorage = {
      setItem: jasmine
        .createSpy('setItem')
    };

    const socketSpy =
      spyOn(
        SocketService,
        'setTokenCache'
      );

    const component =
      buildSignup(
        false,
        nativeStorage
      );

    await component.storeUserData(
      token,
      { id: 'signup-user' }
    );

    expect(
      nativeStorage.setItem
    ).not.toHaveBeenCalled();

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBe(token);

    expect(
      socketSpy
    ).toHaveBeenCalledWith(
      token
    );
  });
});
