import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';

import {
  AppComponent
} from './app.component';


describe(
  'AppComponent native identity ownership characterization',
  () => {

    function createApp(
      getItem: jasmine.Spy,
      cordova = true
    ): any {
      const app: any =
        Object.create(
          AppComponent.prototype
        );

      app.platform = {
        is:
          jasmine
            .createSpy('is')
            .and.callFake(
              (name: string) =>
                cordova &&
                name === 'cordova'
            )
      };

      app.nativeStorage = {
        getItem
      };

      app.initializeUser =
        jasmine.createSpy(
          'initializeUser'
        );

      app.fetchUserFromLocalStorage =
        jasmine.createSpy(
          'fetchUserFromLocalStorage'
        );

      return app;
    }


    it(
      'browser path skips NativeStorage and delegates directly to local identity',
      () => {
        const getItem =
          jasmine.createSpy(
            'getItem'
          );

        const app =
          createApp(
            getItem,
            false
          );

        app.getUserData();

        expect(
          getItem
        ).not.toHaveBeenCalled();

        expect(
          app.initializeUser
        ).not.toHaveBeenCalled();

        expect(
          app.fetchUserFromLocalStorage
        ).toHaveBeenCalledTimes(1);
      }
    );


    it(
      'first canonical fulfillment wins immediately without retry legacy or local fallback',
      fakeAsync(() => {
        const canonical = {
          _id: 'app-first-canonical'
        };

        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.returnValue(
              Promise.resolve(
                canonical
              )
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser']
        ]);

        expect(
          app.initializeUser
        ).toHaveBeenCalledTimes(1);

        expect(
          app.initializeUser
        ).toHaveBeenCalledWith(
          canonical
        );

        expect(
          app.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    it(
      'first canonical fulfilled null remains on the success path without retry or local fallback',
      fakeAsync(() => {
        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.returnValue(
              Promise.resolve(null)
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser']
        ]);

        expect(
          app.initializeUser
        ).toHaveBeenCalledTimes(1);

        expect(
          app.initializeUser
        ).toHaveBeenCalledWith(
          null
        );

        expect(
          app.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    it(
      'first canonical JSON parse failure enters recovery and retry canonical can win',
      fakeAsync(() => {
        const retryCanonical = {
          _id: 'app-retry-canonical'
        };

        let currentReads = 0;

        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.callFake(
              (key: string) => {
                if (
                  key === 'currentUser'
                ) {
                  currentReads += 1;

                  if (
                    currentReads === 1
                  ) {
                    return Promise.resolve(
                      '{invalid-json'
                    );
                  }

                  return Promise.resolve(
                    retryCanonical
                  );
                }

                return Promise.resolve({
                  _id: 'app-legacy'
                });
              }
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser'],
          ['currentUser']
        ]);

        expect(
          app.initializeUser
        ).toHaveBeenCalledTimes(1);

        expect(
          app.initializeUser
        ).toHaveBeenCalledWith(
          retryCanonical
        );

        expect(
          app.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    it(
      'first canonical rejection retries canonical before consulting legacy native user',
      fakeAsync(() => {
        const legacy = {
          _id: 'app-legacy'
        };

        let currentReads = 0;

        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.callFake(
              (key: string) => {
                if (
                  key === 'currentUser'
                ) {
                  currentReads += 1;

                  if (
                    currentReads === 1
                  ) {
                    return Promise.reject(
                      new Error(
                        'first canonical unavailable'
                      )
                    );
                  }

                  return Promise.resolve(
                    null
                  );
                }

                if (
                  key === 'user'
                ) {
                  return Promise.resolve(
                    legacy
                  );
                }

                return Promise.reject(
                  new Error('missing')
                );
              }
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser'],
          ['currentUser'],
          ['user']
        ]);

        expect(
          app.initializeUser
        ).toHaveBeenCalledTimes(1);

        expect(
          app.initializeUser
        ).toHaveBeenCalledWith(
          legacy
        );

        expect(
          app.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    it(
      'recovery falls back to local only after retry canonical and legacy both produce no user',
      fakeAsync(() => {
        let currentReads = 0;

        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.callFake(
              (key: string) => {
                if (
                  key === 'currentUser'
                ) {
                  currentReads += 1;

                  if (
                    currentReads === 1
                  ) {
                    return Promise.reject(
                      new Error(
                        'first canonical unavailable'
                      )
                    );
                  }

                  return Promise.resolve(
                    null
                  );
                }

                if (
                  key === 'user'
                ) {
                  return Promise.resolve(
                    null
                  );
                }

                return Promise.reject(
                  new Error('missing')
                );
              }
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser'],
          ['currentUser'],
          ['user']
        ]);

        expect(
          app.initializeUser
        ).not.toHaveBeenCalled();

        expect(
          app.fetchUserFromLocalStorage
        ).toHaveBeenCalledTimes(1);
      })
    );


    it(
      'malformed retry canonical value triggers local fallback without consulting legacy user',
      fakeAsync(() => {
        let currentReads = 0;

        const getItem =
          jasmine
            .createSpy(
              'getItem'
            )
            .and.callFake(
              (key: string) => {
                if (
                  key === 'currentUser'
                ) {
                  currentReads += 1;

                  if (
                    currentReads === 1
                  ) {
                    return Promise.reject(
                      new Error(
                        'first canonical unavailable'
                      )
                    );
                  }

                  return Promise.resolve(
                    '{still-invalid'
                  );
                }

                if (
                  key === 'user'
                ) {
                  return Promise.resolve({
                    _id: 'should-not-be-read'
                  });
                }

                return Promise.reject(
                  new Error('missing')
                );
              }
            );

        const app =
          createApp(getItem);

        app.getUserData();

        flushMicrotasks();

        expect(
          getItem.calls.allArgs()
        ).toEqual([
          ['currentUser'],
          ['currentUser']
        ]);

        expect(
          app.initializeUser
        ).not.toHaveBeenCalled();

        expect(
          app.fetchUserFromLocalStorage
        ).toHaveBeenCalledTimes(1);
      })
    );

  }
);
