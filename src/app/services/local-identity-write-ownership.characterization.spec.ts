import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';

import { SigninComponent } from '../pages/auth/signin/signin.component';
import { SignupComponent } from '../pages/auth/signup/signup.component';

import { User } from '../models/User';

import { SessionAuthStateService } from './session-auth-state.service';
import { SessionCredentialStore } from './session-credential-store.service';
import { UserService } from './user.service';


describe(
  'Local identity write ownership characterization',
  () => {

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });


    function publishTokenSuccessfully(): void {
      spyOn(
        SessionCredentialStore,
        'publishAuthenticatedToken'
      ).and.returnValue(
        Promise.resolve()
      );
    }


    function makeSigninBrowserFallback(): any {
      const component: any =
        Object.create(SigninComponent.prototype);

      component.nativeStorage = {
        setItem: jasmine.createSpy(
          'nativeStorage.setItem'
        )
      };

      component.platform = {
        is: () => false
      };

      component.userService = {
        setCurrentUser: () => {
          throw new Error(
            'force signin browser fallback'
          );
        }
      };

      return component;
    }


    function makeSignupBrowserFallback(): any {
      const component: any =
        Object.create(SignupComponent.prototype);

      component.nativeStorage = {
        setItem: jasmine.createSpy(
          'nativeStorage.setItem'
        )
      };

      component.platform = {
        is: () => false
      };

      component.userService = {
        setCurrentUser: () => {
          throw new Error(
            'force signup browser fallback'
          );
        }
      };

      return component;
    }


    function makeUserService(): any {
      const service: any =
        Object.create(UserService.prototype);

      service.nativeStorage = null;

      service.currentUserSubject = {
        value: null,
        next: jasmine.createSpy(
          'currentUserSubject.next'
        )
      };

      service.profileCache = new Map();
      service.inflightProfiles = new Map();
      service.inflightCurrentUser$ = null;

      service.appEvents = {
        setBudget: jasmine.createSpy(
          'appEvents.setBudget'
        )
      };

      return service;
    }


    it(
      'signin browser fallback writes canonical then legacy using the same serialized JSON string',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const writes: any[][] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (
            key: string,
            value: string
          ) => {
            writes.push([
              key,
              value
            ]);
          }
        );

        const component =
          makeSigninBrowserFallback();

        const rawUser = {
          _id: 'signin-local-pair',
          firstName: 'Signin'
        };

        (component as any).storeUserData(
          'token',
          rawUser
        );

        flushMicrotasks();

        expect(
          writes.map(
            write => write[0]
          )
        ).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          typeof writes[0][1]
        ).toBe('string');

        expect(
          JSON.parse(writes[0][1])
        ).toEqual(rawUser);

        expect(
          writes[1][1]
        ).toBe(writes[0][1]);
      })
    );


    it(
      'signin browser fallback attempts legacy local write after canonical failure and swallows both failures',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const keys: string[] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (key: string) => {
            keys.push(key);

            throw new Error(
              `signin local ${key} failure`
            );
          }
        );

        const component =
          makeSigninBrowserFallback();

        expect(() => {
          (component as any).storeUserData(
            'token',
            {
              _id: 'signin-local-failure'
            }
          );

          flushMicrotasks();
        }).not.toThrow();

        expect(keys).toEqual([
          'currentUser',
          'user'
        ]);
      })
    );


    it(
      'signup browser fallback writes only canonical currentUser as a serialized JSON string',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const writes: any[][] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (
            key: string,
            value: string
          ) => {
            writes.push([
              key,
              value
            ]);
          }
        );

        const component =
          makeSignupBrowserFallback();

        const rawUser = {
          _id: 'signup-local-canonical',
          firstName: 'Signup'
        };

        (component as any).storeUserData(
          'token',
          rawUser
        );

        flushMicrotasks();

        expect(
          writes.length
        ).toBe(1);

        expect(
          writes[0][0]
        ).toBe('currentUser');

        expect(
          typeof writes[0][1]
        ).toBe('string');

        expect(
          JSON.parse(writes[0][1])
        ).toEqual(rawUser);
      })
    );


    it(
      'signup browser fallback swallows canonical local failure without adding a legacy write',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const keys: string[] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (key: string) => {
            keys.push(key);

            throw new Error(
              'signup local canonical failure'
            );
          }
        );

        const component =
          makeSignupBrowserFallback();

        expect(() => {
          (component as any).storeUserData(
            'token',
            {
              _id: 'signup-local-failure'
            }
          );

          flushMicrotasks();
        }).not.toThrow();

        expect(keys).toEqual([
          'currentUser'
        ]);
      })
    );


    it(
      'UserService serializes the same rawData to canonical and legacy local keys before in-memory publication',
      () => {
        const service =
          makeUserService();

        const events: string[] = [];
        const writes: any[][] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (
            key: string,
            value: string
          ) => {
            events.push(
              `local:${key}`
            );

            writes.push([
              key,
              value
            ]);
          }
        );

        service.currentUserSubject.next
          .and.callFake(
            () => {
              events.push(
                'memory'
              );
            }
          );

        const rawData = {
          _id: 'user-service-local-pair',
          firstName: 'RawData',
          customField: 'preserved'
        };

        const userObj: any =
          Object.create(User.prototype);

        userObj._id = rawData._id;

        userObj.toObject = () =>
          rawData;

        service.setCurrentUser(
          userObj,
          {
            force: true
          }
        );

        expect(
          writes.map(
            write => write[0]
          )
        ).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          writes[0][1]
        ).toBe(
          JSON.stringify(rawData)
        );

        expect(
          writes[1][1]
        ).toBe(
          JSON.stringify(rawData)
        );

        expect(events).toEqual([
          'local:currentUser',
          'local:user',
          'memory'
        ]);
      }
    );


    it(
      'UserService independently swallows both local write failures and still publishes in memory',
      () => {
        const service =
          makeUserService();

        const keys: string[] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (key: string) => {
            keys.push(key);

            throw new Error(
              `user service local ${key} failure`
            );
          }
        );

        const rawData = {
          _id: 'user-service-local-failure'
        };

        const userObj: any =
          Object.create(User.prototype);

        userObj._id = rawData._id;

        userObj.toObject = () =>
          rawData;

        expect(() => {
          service.setCurrentUser(
            userObj,
            {
              force: true
            }
          );
        }).not.toThrow();

        expect(keys).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          service.currentUserSubject.next
        ).toHaveBeenCalledTimes(1);

        expect(
          service.currentUserSubject.next
        ).toHaveBeenCalledWith(
          userObj
        );
      }
    );


    it(
      'persistCurrentUser writes canonical then legacy local JSON values when native persistence is disabled',
      async () => {
        const nativeStorage = {
          setItem: jasmine.createSpy(
            'nativeStorage.setItem'
          )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        const writes: any[][] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (
            key: string,
            value: string
          ) => {
            writes.push([
              key,
              value
            ]);
          }
        );

        const rawUser = {
          _id: 'owner-local-pair',
          firstName: 'Owner'
        };

        await service.persistCurrentUser(
          rawUser,
          false
        );

        expect(
          writes.map(
            write => write[0]
          )
        ).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          writes[0][1]
        ).toBe(
          JSON.stringify(rawUser)
        );

        expect(
          writes[1][1]
        ).toBe(
          JSON.stringify(rawUser)
        );

        expect(
          nativeStorage.setItem
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'persistCurrentUser attempts legacy local write after canonical local failure and resolves normally',
      async () => {
        const nativeStorage = {
          setItem: jasmine.createSpy(
            'nativeStorage.setItem'
          )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        const keys: string[] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (key: string) => {
            keys.push(key);

            if (
              key === 'currentUser'
            ) {
              throw new Error(
                'owner canonical local failure'
              );
            }
          }
        );

        await expectAsync(
          service.persistCurrentUser(
            {
              _id: 'owner-local-failure'
            },
            false
          )
        ).toBeResolved();

        expect(keys).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          nativeStorage.setItem
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'persistCurrentUser continues to native raw-object persistence after both local writes fail',
      async () => {
        const nativeStorage = {
          setItem: jasmine
            .createSpy(
              'nativeStorage.setItem'
            )
            .and.returnValue(
              Promise.resolve()
            )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        const localKeys: string[] = [];

        spyOn(
          localStorage,
          'setItem'
        ).and.callFake(
          (key: string) => {
            localKeys.push(key);

            throw new Error(
              `owner local ${key} failure`
            );
          }
        );

        const rawUser = {
          _id: 'owner-local-failure-native-continues'
        };

        await expectAsync(
          service.persistCurrentUser(
            rawUser,
            true
          )
        ).toBeResolved();

        expect(localKeys).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map(
              (args: any[]) =>
                args[0]
            )
        ).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          nativeStorage.setItem.calls.argsFor(0)[1]
        ).toBe(rawUser);

        expect(
          nativeStorage.setItem.calls.argsFor(1)[1]
        ).toBe(rawUser);
      }
    );

  }
);
