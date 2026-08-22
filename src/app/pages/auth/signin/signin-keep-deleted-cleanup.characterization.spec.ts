import { SigninComponent } from './signin.component';
import { SocketService } from 'src/app/services/socket.service';

describe(
  'SigninComponent Keep Deleted auth cleanup characterization',
  () => {
    let component: any;
    let alertConfig: any;
    let alertPresent: jasmine.Spy;
    let alertCtrl: any;
    let auth: any;
    let router: any;
    let userService: any;
    let socketLogoutSpy: jasmine.Spy;

    beforeEach(() => {
      localStorage.clear();

      alertConfig = null;

      alertPresent =
        jasmine.createSpy(
          'present'
        ).and.returnValue(
          Promise.resolve()
        );

      alertCtrl = {
        create: jasmine
          .createSpy('create')
          .and.callFake(
            async (config: any) => {
              alertConfig = config;

              return {
                present:
                  alertPresent
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

      userService = {
        restoreAccount:
          jasmine.createSpy(
            'restoreAccount'
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

      component.userService =
        userService;

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
    });


    function keepDeletedHandler(): () => Promise<void> {
      expect(
        alertConfig
      ).toBeTruthy();

      const buttons =
        alertConfig.buttons || [];

      const keepDeleted =
        buttons.find(
          (button: any) =>
            button?.text ===
            'Keep Deleted'
        );

      expect(
        keepDeleted
      ).toBeTruthy();

      expect(
        keepDeleted.role
      ).toBe(
        'cancel'
      );

      return keepDeleted.handler;
    }


    it(
      'Keep Deleted signs out Firebase, tears down socket auth, clears local auth and returns to signin',
      async () => {
        localStorage.setItem(
          'token',
          'deleted-account-token'
        );

        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            _id: 'deleted-user'
          })
        );

        localStorage.setItem(
          'user',
          JSON.stringify({
            _id: 'deleted-user'
          })
        );

        await component
          .showRestoreAccountPrompt(
            {
              _id: 'deleted-user',
              isDeleted: true
            },
            {
              data: {
                token:
                  'deleted-account-token',

                user: {
                  _id:
                    'deleted-user',

                  isDeleted:
                    true
                }
              }
            }
          );

        expect(
          alertCtrl.create
        ).toHaveBeenCalledTimes(1);

        expect(
          alertConfig.backdropDismiss
        ).toBeFalse();

        expect(
          alertPresent
        ).toHaveBeenCalledTimes(1);

        const handler =
          keepDeletedHandler();

        await handler();

        expect(
          auth.signOutFirebase
        ).toHaveBeenCalledTimes(1);

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);

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
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );

        expect(
          userService.restoreAccount
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'Keep Deleted still clears local auth and navigates when Firebase and socket teardown fail',
      async () => {
        auth.signOutFirebase
          .and.returnValue(
            Promise.reject(
              new Error(
                'firebase signout failed'
              )
            )
          );

        socketLogoutSpy
          .and.returnValue(
            Promise.reject(
              new Error(
                'socket logout failed'
              )
            )
          );

        localStorage.setItem(
          'token',
          'persisted-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"deleted-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"deleted-user"}'
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
                  _id:
                    'deleted-user',

                  isDeleted:
                    true
                }
              }
            }
          );

        const handler =
          keepDeletedHandler();

        await expectAsync(
          handler()
        ).toBeResolved();

        expect(
          auth.signOutFirebase
        ).toHaveBeenCalledTimes(1);

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);

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
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );
  }
);
