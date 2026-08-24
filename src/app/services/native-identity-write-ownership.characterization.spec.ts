import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';

import { SigninComponent } from '../pages/auth/signin/signin.component';
import { SignupComponent } from '../pages/auth/signup/signup.component';

import { SessionAuthStateService } from './session-auth-state.service';
import { SessionCredentialStore } from './session-credential-store.service';
import { UserService } from './user.service';


describe(
  'Native identity write ownership characterization',
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


    function makeSigninFallback(
      nativeStorage: any
    ): any {
      const component: any =
        Object.create(SigninComponent.prototype);

      component.nativeStorage = nativeStorage;

      component.platform = {
        is: (name: string) =>
          name === 'cordova'
      };

      component.userService = {
        setCurrentUser: () => {
          throw new Error(
            'force signin fallback'
          );
        }
      };

      return component;
    }


    function makeSignupFallback(
      nativeStorage: any
    ): any {
      const component: any =
        Object.create(SignupComponent.prototype);

      component.nativeStorage = nativeStorage;

      component.platform = {
        is: (name: string) =>
          name === 'cordova'
      };

      component.userService = {
        setCurrentUser: () => {
          throw new Error(
            'force signup fallback'
          );
        }
      };

      return component;
    }


    function makeUserService(
      nativeStorage: any
    ): any {
      const service: any =
        Object.create(UserService.prototype);

      service.nativeStorage = nativeStorage;

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
      'signin Cordova fallback awaits canonical JSON-string write before legacy JSON-string write',
      fakeAsync(() => {
        publishTokenSuccessfully();

        let resolveCanonical:
          ((value?: any) => void) | null = null;

        const canonicalPending =
          new Promise<any>((resolve) => {
            resolveCanonical = resolve;
          });

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.callFake(
              (
                key: string,
                value: any
              ) => {
                if (key === 'currentUser') {
                  return canonicalPending;
                }

                return Promise.resolve(value);
              }
            )
        };

        const component =
          makeSigninFallback(nativeStorage);

        const rawUser = {
          _id: 'signin-sequence',
          firstName: 'Signin'
        };

        (component as any).storeUserData(
          'token',
          rawUser
        );

        flushMicrotasks();

        expect(
          nativeStorage.setItem.calls.count()
        ).toBe(1);

        expect(
          nativeStorage.setItem.calls.argsFor(0)[0]
        ).toBe('currentUser');

        const canonicalValue =
          nativeStorage.setItem.calls.argsFor(0)[1];

        expect(
          typeof canonicalValue
        ).toBe('string');

        expect(
          JSON.parse(canonicalValue)
        ).toEqual(rawUser);

        resolveCanonical!(null);

        flushMicrotasks();

        expect(
          nativeStorage.setItem.calls.count()
        ).toBe(2);

        expect(
          nativeStorage.setItem.calls.argsFor(1)[0]
        ).toBe('user');

        const legacyValue =
          nativeStorage.setItem.calls.argsFor(1)[1];

        expect(
          typeof legacyValue
        ).toBe('string');

        expect(legacyValue).toBe(canonicalValue);
      })
    );


    it(
      'signin Cordova fallback attempts legacy write even when canonical write rejects and swallows both failures',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.callFake(
              (key: string) =>
                Promise.reject(
                  new Error(
                    `signin ${key} failure`
                  )
                )
            )
        };

        const component =
          makeSigninFallback(nativeStorage);

        expect(() => {
          (component as any).storeUserData(
            'token',
            {
              _id: 'signin-failure'
            }
          );

          flushMicrotasks();
        }).not.toThrow();

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map((args: any[]) => args[0])
        ).toEqual([
          'currentUser',
          'user'
        ]);
      })
    );


    it(
      'signup Cordova fallback writes only canonical currentUser as a JSON string',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.returnValue(
              Promise.resolve()
            )
        };

        const component =
          makeSignupFallback(nativeStorage);

        const rawUser = {
          _id: 'signup-canonical-only',
          firstName: 'Signup'
        };

        (component as any).storeUserData(
          'token',
          rawUser
        );

        flushMicrotasks();

        expect(
          nativeStorage.setItem.calls.count()
        ).toBe(1);

        const args =
          nativeStorage.setItem.calls.argsFor(0);

        expect(args[0]).toBe('currentUser');

        expect(
          typeof args[1]
        ).toBe('string');

        expect(
          JSON.parse(args[1])
        ).toEqual(rawUser);
      })
    );


    it(
      'signup Cordova fallback swallows canonical write rejection without adding a legacy write',
      fakeAsync(() => {
        publishTokenSuccessfully();

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.returnValue(
              Promise.reject(
                new Error(
                  'signup canonical failure'
                )
              )
            )
        };

        const component =
          makeSignupFallback(nativeStorage);

        expect(() => {
          (component as any).storeUserData(
            'token',
            {
              _id: 'signup-failure'
            }
          );

          flushMicrotasks();
        }).not.toThrow();

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map((args: any[]) => args[0])
        ).toEqual([
          'currentUser'
        ]);
      })
    );


    it(
      'UserService publishes canonical and legacy native raw objects without waiting for the first native promise',
      () => {
        const neverSettles =
          new Promise<any>(() => {});

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.returnValue(
              neverSettles
            )
        };

        const service =
          makeUserService(nativeStorage);

        const rawUser = {
          _id: 'user-service-fire-and-forget',
          firstName: 'RawObject'
        };

        service.setCurrentUser(
          rawUser,
          {
            force: true
          }
        );

        expect(
          nativeStorage.setItem.calls.count()
        ).toBe(2);

        const first =
          nativeStorage.setItem.calls.argsFor(0);

        const second =
          nativeStorage.setItem.calls.argsFor(1);

        expect(first[0]).toBe('currentUser');
        expect(second[0]).toBe('user');

        expect(
          typeof first[1]
        ).toBe('object');

        expect(
          typeof second[1]
        ).toBe('object');

        expect(second[1]).toBe(first[1]);

        expect(
          service.currentUserSubject.next
        ).toHaveBeenCalledTimes(1);
      }
    );


    it(
      'UserService swallows native promise rejections while continuing local and in-memory publication',
      fakeAsync(() => {
        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.callFake(
              (key: string) =>
                Promise.reject(
                  new Error(
                    `user service ${key} failure`
                  )
                )
            )
        };

        const service =
          makeUserService(nativeStorage);

        service.setCurrentUser(
          {
            _id: 'user-service-rejection',
            firstName: 'StillPublished'
          },
          {
            force: true
          }
        );

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map((args: any[]) => args[0])
        ).toEqual([
          'currentUser',
          'user'
        ]);

        expect(
          localStorage.getItem('currentUser')
        ).not.toBeNull();

        expect(
          localStorage.getItem('user')
        ).not.toBeNull();

        expect(
          service.currentUserSubject.next
        ).toHaveBeenCalledTimes(1);

        flushMicrotasks();
      })
    );


    it(
      'persistCurrentUser writes local JSON pair and native raw-object pair while independently swallowing canonical native failure',
      async () => {
        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.callFake(
              (
                key: string,
                value: any
              ) => {
                if (key === 'currentUser') {
                  return Promise.reject(
                    new Error(
                      'canonical persistence failure'
                    )
                  );
                }

                return Promise.resolve(value);
              }
            )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        const rawUser = {
          _id: 'owner-pair',
          firstName: 'Owner'
        };

        await service.persistCurrentUser(
          rawUser,
          true
        );

        expect(
          localStorage.getItem('currentUser')
        ).toBe(
          JSON.stringify(rawUser)
        );

        expect(
          localStorage.getItem('user')
        ).toBe(
          JSON.stringify(rawUser)
        );

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map((args: any[]) => args[0])
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


    it(
      'persistCurrentUser awaits canonical native completion before attempting legacy native write',
      fakeAsync(() => {
        let resolveCanonical:
          ((value?: any) => void) | null = null;

        const canonicalPending =
          new Promise<any>((resolve) => {
            resolveCanonical = resolve;
          });

        const nativeStorage = {
          setItem: jasmine
            .createSpy('setItem')
            .and.callFake(
              (
                key: string,
                value: any
              ) => {
                if (key === 'currentUser') {
                  return canonicalPending;
                }

                return Promise.resolve(value);
              }
            )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        service.persistCurrentUser(
          {
            _id: 'owner-await-order'
          },
          true
        );

        expect(
          nativeStorage.setItem.calls.count()
        ).toBe(1);

        expect(
          nativeStorage.setItem.calls.argsFor(0)[0]
        ).toBe('currentUser');

        resolveCanonical!(null);

        flushMicrotasks();

        expect(
          nativeStorage.setItem.calls.allArgs()
            .map((args: any[]) => args[0])
        ).toEqual([
          'currentUser',
          'user'
        ]);
      })
    );


    it(
      'persistCurrentUser with includeNative false keeps the local pair and performs no native identity writes',
      async () => {
        const nativeStorage = {
          setItem: jasmine.createSpy(
            'setItem'
          )
        };

        const service =
          new SessionAuthStateService(
            nativeStorage as any
          );

        const rawUser = {
          _id: 'local-only-owner'
        };

        await service.persistCurrentUser(
          rawUser,
          false
        );

        expect(
          nativeStorage.setItem
        ).not.toHaveBeenCalled();

        expect(
          localStorage.getItem('currentUser')
        ).toBe(
          JSON.stringify(rawUser)
        );

        expect(
          localStorage.getItem('user')
        ).toBe(
          JSON.stringify(rawUser)
        );
      }
    );

  }
);
