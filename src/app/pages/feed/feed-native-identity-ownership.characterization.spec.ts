import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';

import { FeedPage } from './feed.page';
import { User } from 'src/app/models/User';
import {
  SessionAuthStateService
} from 'src/app/services/session-auth-state.service';


describe(
  'FeedPage native identity ownership characterization',
  () => {

    afterEach(() => {
      localStorage.clear();
    });


    it(
      'reactive current user wins without reading native or local persisted identity',
      () => {
        const current =
          new User().initialize({
            _id: 'feed-reactive'
          });

        const page: any =
          Object.create(
            FeedPage.prototype
          );

        const nativeStorage = {
          getItem:
            jasmine.createSpy(
              'getItem'
            )
        };

        page.userService = {
          currentUserValue:
            current
        };

        page.platform = {
          is:
            jasmine.createSpy(
              'is'
            )
        };

        page.nativeStorage =
          nativeStorage;

        const localSpy =
          spyOn(
            SessionAuthStateService,
            'readLocalUserRaw'
          );

        page.getUserData();

        expect(page.user)
          .toBe(current);

        expect(
          nativeStorage.getItem
        ).not.toHaveBeenCalled();

        expect(
          page.platform.is
        ).not.toHaveBeenCalled();

        expect(
          localSpy
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'fulfilled null from legacy native user stays on the native success path without local fallback',
      fakeAsync(() => {
        const page: any =
          Object.create(
            FeedPage.prototype
          );

        const nativeStorage = {
          getItem:
            jasmine
              .createSpy(
                'getItem'
              )
              .and.returnValue(
                Promise.resolve(null)
              )
        };

        page.userService = {
          currentUserValue:
            null
        };

        page.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        page.nativeStorage =
          nativeStorage;

        const localSpy =
          spyOn(
            SessionAuthStateService,
            'readLocalUserRaw'
          ).and.returnValue(
            JSON.stringify({
              _id: 'feed-local'
            })
          );

        page.getUserData();

        flushMicrotasks();

        expect(
          nativeStorage.getItem.calls.allArgs()
        ).toEqual([
          ['user']
        ]);

        expect(
          localSpy
        ).not.toHaveBeenCalled();

        expect(
          page.user instanceof User
        ).toBeTrue();

        expect(
          page.user.id
        ).toBe('');
      })
    );


    it(
      'legacy native user rejection alone triggers local persisted identity fallback',
      fakeAsync(() => {
        const page: any =
          Object.create(
            FeedPage.prototype
          );

        const nativeStorage = {
          getItem:
            jasmine
              .createSpy(
                'getItem'
              )
              .and.returnValue(
                Promise.reject(
                  new Error(
                    'legacy unavailable'
                  )
                )
              )
        };

        page.userService = {
          currentUserValue:
            null
        };

        page.platform = {
          is:
            (name: string) =>
              name === 'cordova'
        };

        page.nativeStorage =
          nativeStorage;

        const localSpy =
          spyOn(
            SessionAuthStateService,
            'readLocalUserRaw'
          ).and.returnValue(
            JSON.stringify({
              _id: 'feed-local'
            })
          );

        page.getUserData();

        flushMicrotasks();

        expect(
          nativeStorage.getItem.calls.allArgs()
        ).toEqual([
          ['user']
        ]);

        expect(
          localSpy
        ).toHaveBeenCalledTimes(1);

        expect(
          page.user?._id ||
          page.user?.id
        ).toBe(
          'feed-local'
        );
      })
    );

  }
);
