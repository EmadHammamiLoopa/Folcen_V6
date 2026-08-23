import { SigninComponent } from './signin.component';
import { SocketService } from 'src/app/services/socket.service';
import { SessionCredentialStore } from 'src/app/services/session-credential-store.service';

describe(
  'SigninComponent Keep Deleted native auth cleanup regression',
  () => {
    let component: any;
    let alertConfig: any;
    let alertCtrl: any;
    let auth: any;
    let router: any;
    let platform: any;
    let nativeStorage: any;
    let socketLogoutSpy: jasmine.Spy;

    beforeEach(() => {
      localStorage.clear();

      SessionCredentialStore.setCachedToken(
        null
      );

      alertConfig = null;

      alertCtrl = {
        create: jasmine
          .createSpy('create')
          .and.callFake(
            async (config: any) => {
              alertConfig = config;

              return {
                present:
                  jasmine
                    .createSpy('present')
                    .and.returnValue(
                      Promise.resolve()
                    )
              };
            }
          )
      };

      auth = {
        signOutFirebase:
          jasmine
            .createSpy(
              'signOutFirebase'
            )
            .and.returnValue(
              Promise.resolve()
            )
      };

      router = {
        navigate:
          jasmine
            .createSpy('navigate')
            .and.returnValue(
              Promise.resolve(true)
            )
      };

      platform = {
        is: jasmine
          .createSpy('is')
          .and.returnValue(true)
      };

      nativeStorage = {
        remove: jasmine
          .createSpy('remove')
          .and.returnValue(
            Promise.resolve()
          )
      };

      component = Object.create(
        SigninComponent.prototype
      ) as any;

      component.alertCtrl =
        alertCtrl;

      component.auth =
        auth;

      component.router =
        router;

      component.platform =
        platform;

      component.nativeStorage =
        nativeStorage;

      component.userService = {
        restoreAccount:
          jasmine.createSpy(
            'restoreAccount'
          )
      };

      component.toastService = {
        presentSuccessToastr:
          jasmine.createSpy(
            'presentSuccessToastr'
          ),

        presentErrorToastr:
          jasmine.createSpy(
            'presentErrorToastr'
          )
      };

      socketLogoutSpy =
        spyOn(
          SocketService,
          'logout'
        ).and.returnValue(
          Promise.resolve()
        );
    });


    afterEach(() => {
      localStorage.clear();

      SessionCredentialStore.setCachedToken(
        null
      );
    });


    function keepDeletedHandler(): () => Promise<void> {
      expect(
        alertConfig
      ).toBeTruthy();

      const keepDeleted =
        (alertConfig.buttons || [])
          .find(
            (button: any) =>
              button?.text ===
              'Keep Deleted'
          );

      expect(
        keepDeleted
      ).toBeTruthy();

      return keepDeleted.handler;
    }


    it(
      'clears Cordova native credentials as well as local and shared credentials',
      async () => {
        localStorage.setItem(
          'token',
          'deleted-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"deleted-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"deleted-user"}'
        );

        SessionCredentialStore.setCachedToken(
          'deleted-token'
        );

        await component
          .showRestoreAccountPrompt(
            {
              _id: 'deleted-user',
              isDeleted: true
            },
            {
              data: {
                user: {
                  _id: 'deleted-user',
                  isDeleted: true
                }
              }
            }
          );

        await keepDeletedHandler()();

        expect(
          auth.signOutFirebase
        ).toHaveBeenCalledTimes(1);

        expect(
          platform.is
        ).toHaveBeenCalledWith(
          'cordova'
        );

        expect(
          nativeStorage.remove.calls.allArgs()
        ).toEqual([
          ['token'],
          ['currentUser'],
          ['user']
        ]);

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );


    it(
      'continues remaining native cleanup and navigation when native token removal fails',
      async () => {
        nativeStorage.remove
          .and.callFake(
            (key: string) => {
              if (key === 'token') {
                return Promise.reject(
                  new Error(
                    'native token remove failed'
                  )
                );
              }

              return Promise.resolve();
            }
          );

        localStorage.setItem(
          'token',
          'deleted-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"deleted-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"deleted-user"}'
        );

        SessionCredentialStore.setCachedToken(
          'deleted-token'
        );

        await component
          .showRestoreAccountPrompt(
            {
              _id: 'deleted-user',
              isDeleted: true
            },
            {
              data: {
                user: {
                  _id: 'deleted-user',
                  isDeleted: true
                }
              }
            }
          );

        await expectAsync(
          keepDeletedHandler()()
        ).toBeResolved();

        expect(
          nativeStorage.remove.calls.allArgs()
        ).toEqual([
          ['token'],
          ['currentUser'],
          ['user']
        ]);

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );
  }
);
