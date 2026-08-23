import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';

import { AppComponent } from '../app.component';
import { SessionAuthStateService } from './session-auth-state.service';
import { UserService } from './user.service';

import {
  ChannelComponent
} from '../pages/channels/channel/channel.component';

import {
  CommentsComponent
} from '../pages/channels/channel/comments/comments.component';

import {
  FeedPage
} from '../pages/feed/feed.page';

import {
  DisplayComponent
} from '../pages/profile/display/display.component';


type NativeStep =
  | {
      resolve: any;
    }
  | {
      reject: any;
    };


function scriptedNative(
  script: Record<string, NativeStep[]>
): {
  getItem: jasmine.Spy;
  calls: string[];
} {
  const calls: string[] = [];

  const getItem = jasmine
    .createSpy('nativeStorage.getItem')
    .and.callFake(
      (key: string): Promise<any> => {
        calls.push(key);

        const queue =
          script[key] || [];

        if (!queue.length) {
          return Promise.reject(
            new Error(
              `No scripted NativeStorage response for ${key}`
            )
          );
        }

        const step =
          queue.shift() as NativeStep;

        if (
          Object.prototype.hasOwnProperty.call(
            step,
            'reject'
          )
        ) {
          return Promise.reject(
            (step as any).reject
          );
        }

        return Promise.resolve(
          (step as any).resolve
        );
      }
    );

  return {
    getItem,
    calls
  };
}


describe(
  'Native identity ownership characterization',
  () => {

    afterEach(() => {
      try {
        localStorage.removeItem(
          'currentUser'
        );

        localStorage.removeItem(
          'user'
        );
      } catch (_) {}
    });


    // ========================================================
    // Existing central owner contract
    // ========================================================

    it(
      'SessionAuthStateService canonical resolution blocks legacy fallback even when canonical resolves null',
      async () => {
        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              }
            ],

            user: [
              {
                resolve: {
                  _id: 'legacy-owner'
                }
              }
            ]
          });

        const owner =
          new SessionAuthStateService(
            {
              getItem:
                native.getItem
            } as any
          );

        const result =
          await owner.getNativeUser();

        expect(result)
          .toBeNull();

        expect(native.calls)
          .toEqual([
            'currentUser'
          ]);
      }
    );


    it(
      'SessionAuthStateService falls back to legacy only when canonical native read rejects',
      async () => {
        const legacy = {
          _id: 'legacy-owner'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                reject:
                  new Error(
                    'canonical unavailable'
                  )
              }
            ],

            user: [
              {
                resolve: legacy
              }
            ]
          });

        const owner =
          new SessionAuthStateService(
            {
              getItem:
                native.getItem
            } as any
          );

        const result =
          await owner.getNativeUser();

        expect(result)
          .toBe(legacy);

        expect(native.calls)
          .toEqual([
            'currentUser',
            'user'
          ]);
      }
    );


    // ========================================================
    // AppComponent:
    //
    // First canonical read is promise-based.
    // Legacy is NOT consulted on canonical success.
    // On canonical rejection, code retries canonical and only
    // then falls through to legacy when retry result is falsy.
    // ========================================================

    it(
      'AppComponent accepts a successful canonical native read without retrying or consulting legacy',
      fakeAsync(() => {
        const canonical = {
          _id: 'app-canonical'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: canonical
              }
            ],

            user: [
              {
                resolve: {
                  _id: 'app-legacy'
                }
              }
            ]
          });

        const component: any =
          Object.create(
            AppComponent.prototype
          );

        component.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.initializeUser =
          jasmine.createSpy(
            'initializeUser'
          );

        component.fetchUserFromLocalStorage =
          jasmine.createSpy(
            'fetchUserFromLocalStorage'
          );

        component.getUserData();

        flushMicrotasks();

        expect(native.calls)
          .toEqual([
            'currentUser'
          ]);

        expect(
          component.initializeUser
        ).toHaveBeenCalledWith(
          canonical
        );

        expect(
          component.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    it(
      'AppComponent retries canonical after first rejection before using legacy on a falsy retry',
      fakeAsync(() => {
        const legacy = {
          _id: 'app-legacy'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                reject:
                  new Error(
                    'first canonical failure'
                  )
              },

              {
                resolve: null
              }
            ],

            user: [
              {
                resolve: legacy
              }
            ]
          });

        const component: any =
          Object.create(
            AppComponent.prototype
          );

        component.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.initializeUser =
          jasmine.createSpy(
            'initializeUser'
          );

        component.fetchUserFromLocalStorage =
          jasmine.createSpy(
            'fetchUserFromLocalStorage'
          );

        component.getUserData();

        flushMicrotasks();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'currentUser',
            'user'
          ]);

        expect(
          component.initializeUser
        ).toHaveBeenCalledWith(
          legacy
        );

        expect(
          component.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    // ========================================================
    // UserService.getAuthUser():
    // memory first -> canonical -> legacy on falsy -> local.
    // ========================================================

    it(
      'UserService getAuthUser returns in-memory identity without reading NativeStorage',
      async () => {
        const memoryUser = {
          _id: 'memory-user'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: {
                  _id: 'native-user'
                }
              }
            ]
          });

        const service: any =
          Object.create(
            UserService.prototype
          );

        service.currentUserSubject = {
          value:
            memoryUser
        };

        service.nativeStorage = {
          getItem:
            native.getItem
        };

        const result =
          await service.getAuthUser();

        expect(result)
          .toBe(memoryUser);

        expect(native.calls)
          .toEqual([]);
      }
    );


    it(
      'UserService getAuthUser uses legacy native identity when canonical resolves falsy',
      async () => {
        const legacy = {
          _id: 'service-legacy'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              }
            ],

            user: [
              {
                resolve: legacy
              }
            ]
          });

        const service: any =
          Object.create(
            UserService.prototype
          );

        service.currentUserSubject = {
          value:
            null
        };

        service.nativeStorage = {
          getItem:
            native.getItem
        };

        const result: any =
          await service.getAuthUser();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'user'
          ]);

        expect(
          result?._id || result?.id
        ).toBe(
          'service-legacy'
        );
      }
    );


    // ========================================================
    // Shared feature policy:
    // canonical -> legacy when canonical result is falsy.
    // ChannelComponent is representative of the simple form.
    // ========================================================

    it(
      'ChannelComponent uses legacy native identity when canonical resolves falsy',
      fakeAsync(() => {
        const legacy = {
          _id: 'channel-legacy'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              }
            ],

            user: [
              {
                resolve: legacy
              }
            ]
          });

        const component: any =
          Object.create(
            ChannelComponent.prototype
          );

        component.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.initializeUser =
          jasmine.createSpy(
            'initializeUser'
          );

        component.fetchUserFromLocalStorage =
          jasmine.createSpy(
            'fetchUserFromLocalStorage'
          );

        component.getUserData();

        flushMicrotasks();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'user'
          ]);

        expect(
          component.initializeUser
        ).toHaveBeenCalledWith(
          legacy
        );

        expect(
          component.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    // ========================================================
    // Comments has a distinct duplicate canonical retry:
    // currentUser -> currentUser -> user.
    // ========================================================

    it(
      'CommentsComponent retries canonical before consulting legacy when first canonical value is falsy',
      fakeAsync(() => {
        const secondCanonical = {
          _id:
            'comments-second-canonical'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              },

              {
                resolve:
                  secondCanonical
              }
            ],

            user: [
              {
                resolve: {
                  _id:
                    'comments-legacy'
                }
              }
            ]
          });

        const component: any =
          Object.create(
            CommentsComponent.prototype
          );

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.loadFriendTagUsers =
          jasmine.createSpy(
            'loadFriendTagUsers'
          );

        component.fetchUserFromLocalStorage =
          jasmine.createSpy(
            'fetchUserFromLocalStorage'
          );

        component.getUserData();

        flushMicrotasks();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'currentUser'
          ]);

        expect(
          component.user?._id ||
          component.user?.id
        ).toBe(
          'comments-second-canonical'
        );

        expect(
          component.loadFriendTagUsers
        ).toHaveBeenCalled();

        expect(
          component.fetchUserFromLocalStorage
        ).not.toHaveBeenCalled();
      })
    );


    // ========================================================
    // Feed is intentionally legacy-only on NativeStorage.
    // Local fallback happens on native rejection.
    // ========================================================

    it(
      'FeedPage reads only legacy native user and falls back to local identity on rejection',
      fakeAsync(() => {
        const native =
          scriptedNative({
            user: [
              {
                reject:
                  new Error(
                    'legacy unavailable'
                  )
              }
            ]
          });

        const page: any =
          Object.create(
            FeedPage.prototype
          );

        page.userService = {
          currentUserValue:
            null
        };

        page.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        page.nativeStorage = {
          getItem:
            native.getItem
        };

        spyOn(
          SessionAuthStateService,
          'readLocalUserRaw'
        ).and.returnValue(
          JSON.stringify({
            _id:
              'feed-local'
          })
        );

        page.getUserData();

        flushMicrotasks();

        expect(native.calls)
          .toEqual([
            'user'
          ]);

        expect(
          page.user?._id ||
          page.user?.id
        ).toBe(
          'feed-local'
        );
      })
    );


    // ========================================================
    // Profile cache:
    // sync memory/local result wins before NativeStorage.
    // Native path uses canonical -> legacy on falsy.
    // ========================================================

    it(
      'DisplayComponent readCachedUserAsync does not read NativeStorage when sync cache returns identity',
      async () => {
        const cached = {
          _id:
            'profile-sync'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: {
                  _id:
                    'profile-native'
                }
              }
            ]
          });

        const component: any =
          Object.create(
            DisplayComponent.prototype
          );

        component.readCachedUserSync =
          jasmine.createSpy(
            'readCachedUserSync'
          ).and.returnValue(
            cached
          );

        component.platform = {
          is:
            () => true
        };

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        const result =
          await component
            .readCachedUserAsync();

        expect(result)
          .toBe(cached);

        expect(native.calls)
          .toEqual([]);
      }
    );


    it(
      'DisplayComponent readCachedUserAsync uses legacy native identity when canonical resolves falsy',
      async () => {
        const legacy = {
          _id:
            'profile-legacy'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              }
            ],

            user: [
              {
                resolve:
                  legacy
              }
            ]
          });

        const component: any =
          Object.create(
            DisplayComponent.prototype
          );

        component.readCachedUserSync =
          jasmine.createSpy(
            'readCachedUserSync'
          ).and.returnValue(
            null
          );

        component.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.normalizeCachedUser =
          jasmine.createSpy(
            'normalizeCachedUser'
          ).and.callFake(
            (value: any) =>
              value
          );

        const result =
          await component
            .readCachedUserAsync();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'user'
          ]);

        expect(result)
          .toBe(legacy);

        expect(
          component.normalizeCachedUser
        ).toHaveBeenCalledWith(
          legacy
        );
      }
    );


    // ========================================================
    // Profile refresh has the same duplicate-canonical shape
    // observed in Comments:
    // currentUser -> currentUser -> user.
    // ========================================================

    it(
      'DisplayComponent refresh retries canonical before legacy when first canonical value is falsy',
      fakeAsync(() => {
        const secondCanonical = {
          _id:
            'profile-second-canonical'
        };

        const native =
          scriptedNative({
            currentUser: [
              {
                resolve: null
              },

              {
                resolve:
                  secondCanonical
              }
            ],

            user: [
              {
                resolve: {
                  _id:
                    'profile-legacy'
                }
              }
            ]
          });

        const component: any =
          Object.create(
            DisplayComponent.prototype
          );

        component.userId =
          'viewed-user';

        component.getUser =
          jasmine.createSpy(
            'getUser'
          );

        component.getAuthUser =
          jasmine.createSpy(
            'getAuthUser'
          );

        component.nativeStorage = {
          getItem:
            native.getItem
        };

        component.refresh(
          null
        );

        flushMicrotasks();

        expect(
          component.getUser
        ).toHaveBeenCalled();

        expect(native.calls)
          .toEqual([
            'currentUser',
            'currentUser'
          ]);

        expect(
          component.authUser?._id ||
          component.authUser?.id
        ).toBe(
          'profile-second-canonical'
        );
      })
    );

  }
);
