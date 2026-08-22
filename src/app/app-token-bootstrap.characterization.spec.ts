import { AppComponent } from './app.component';
import { SocketService } from './services/socket.service';

import {
  LocalNotifications
} from '@capacitor/local-notifications';

import {
  App as CapacitorApp
} from '@capacitor/app';

describe('AppComponent token bootstrap characterization', () => {
  let setTokenCacheSpy: jasmine.Spy;
  let refreshAuthSpy: jasmine.Spy;
  let initializeSocketSpy: jasmine.Spy;

  function createApp(
    nativeToken: any = null
  ): {
    app: any;
    nativeStorage: any;
    sessionStore: any;
    platform: any;
  } {
    const nativeStorage = {
      getItem: jasmine
        .createSpy('getItem')
        .and.returnValue(
          Promise.resolve(nativeToken)
        )
    };

    const platform = {
      ready: jasmine
        .createSpy('ready')
        .and.returnValue(
          Promise.resolve()
        ),

      is: jasmine
        .createSpy('is')
        .and.returnValue(false)
    };

    const sessionStore = {
      init: jasmine
        .createSpy('init')
        .and.returnValue(
          Promise.resolve(null)
        )
    };

    const app: any =
      Object.create(
        AppComponent.prototype
      );

    app.platform = platform;
    app.nativeStorage = nativeStorage;

    app.themeService = {
      initializeTheme:
        jasmine.createSpy(
          'initializeTheme'
        )
    };

    app.sessionStore =
      sessionStore;

    app.statusBar = {
      styleDefault:
        jasmine.createSpy(
          'styleDefault'
        )
    };

    app.splashScreen = {
      hide:
        jasmine.createSpy(
          'hide'
        )
    };

    app.network = {
      onDisconnect:
        jasmine.createSpy(
          'onDisconnect'
        ).and.returnValue({
          subscribe:
            jasmine.createSpy(
              'subscribe'
            )
        })
    };

    app.getUserData =
      jasmine.createSpy(
        'getUserData'
      );

    app.getJsonData =
      jasmine.createSpy(
        'getJsonData'
      );

    app.handleIncomingCallUrl =
      jasmine.createSpy(
        'handleIncomingCallUrl'
      );

    app.handleReconnection =
      jasmine.createSpy(
        'handleReconnection'
      );

    app.checkAnnouncements =
      jasmine.createSpy(
        'checkAnnouncements'
      );

    app.onOffline =
      jasmine.createSpy(
        'onOffline'
      );

    app.user = null;
    app.showSplash = true;

    return {
      app,
      nativeStorage,
      sessionStore,
      platform
    };
  }

  async function flushMicrotasks(
    rounds = 12
  ): Promise<void> {
    for (
      let i = 0;
      i < rounds;
      i += 1
    ) {
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    localStorage.clear();

    jasmine.clock().install();

    setTokenCacheSpy =
      spyOn(
        SocketService,
        'setTokenCache'
      );

    refreshAuthSpy =
      spyOn(
        SocketService,
        'refreshAuth'
      ).and.returnValue(
        Promise.resolve()
      );

    initializeSocketSpy =
      spyOn(
        SocketService,
        'initializeSocket'
      ).and.returnValue(
        Promise.resolve()
      );

    spyOn(
      LocalNotifications,
      'requestPermissions'
    ).and.returnValue(
      Promise.resolve({
        display: 'granted'
      } as any)
    );

    spyOn(
      LocalNotifications,
      'addListener'
    ).and.returnValue(
      Promise.resolve({
        remove:
          jasmine.createSpy(
            'remove'
          )
      }) as any
    );

    spyOn(
      CapacitorApp,
      'addListener'
    ).and.returnValue(
      Promise.resolve({
        remove:
          jasmine.createSpy(
            'remove'
          )
      }) as any
    );

    spyOn(
      CapacitorApp,
      'getLaunchUrl'
    ).and.returnValue(
      Promise.resolve(
        undefined
      ) as any
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('prefers an existing local token without consulting NativeStorage', async () => {
    localStorage.setItem(
      'token',
      'local-token'
    );

    const {
      app,
      nativeStorage,
      sessionStore
    } = createApp(
      'native-token'
    );

    app.initializeApp();

    await flushMicrotasks();

    expect(
      nativeStorage.getItem
    ).not.toHaveBeenCalled();

    expect(
      setTokenCacheSpy
    ).toHaveBeenCalledWith(
      'local-token'
    );

    expect(
      refreshAuthSpy
    ).toHaveBeenCalledTimes(1);

    expect(
      sessionStore.init
    ).toHaveBeenCalledTimes(1);

    expect(
      initializeSocketSpy
    ).toHaveBeenCalled();
  });

  it('falls back to NativeStorage, backfills localStorage, and seeds socket auth', async () => {
    const {
      app,
      nativeStorage,
      sessionStore
    } = createApp(
      'native-token'
    );

    app.initializeApp();

    await flushMicrotasks();

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
      setTokenCacheSpy
    ).toHaveBeenCalledWith(
      'native-token'
    );

    expect(
      refreshAuthSpy
    ).toHaveBeenCalledTimes(1);

    expect(
      sessionStore.init
    ).toHaveBeenCalledTimes(1);
  });

  it('does not refresh socket auth when no persisted token exists', async () => {
    const {
      app,
      nativeStorage,
      sessionStore
    } = createApp(
      null
    );

    app.initializeApp();

    await flushMicrotasks();

    expect(
      nativeStorage.getItem
    ).toHaveBeenCalledWith(
      'token'
    );

    expect(
      localStorage.getItem(
        'token'
      )
    ).toBeNull();

    expect(
      setTokenCacheSpy
    ).not.toHaveBeenCalled();

    expect(
      refreshAuthSpy
    ).not.toHaveBeenCalled();

    expect(
      sessionStore.init
    ).toHaveBeenCalledTimes(1);

    expect(
      initializeSocketSpy
    ).toHaveBeenCalled();
  });

  it('refreshes socket authentication before session and socket startup when a token exists', async () => {
    localStorage.setItem(
      'token',
      'ordered-token'
    );

    const {
      app,
      sessionStore
    } = createApp();

    app.initializeApp();

    await flushMicrotasks();

    const refreshOrder =
      (refreshAuthSpy.calls.first() as any)
        .invocationOrder;

    const sessionOrder =
      (sessionStore.init.calls.first() as any)
        .invocationOrder;

    const socketOrder =
      (initializeSocketSpy.calls.first() as any)
        .invocationOrder;

    expect(
      refreshOrder
    ).toBeLessThan(
      sessionOrder
    );

    expect(
      sessionOrder
    ).toBeLessThan(
      socketOrder
    );
  });
});
