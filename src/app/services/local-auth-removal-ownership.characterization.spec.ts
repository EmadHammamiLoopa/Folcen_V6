import {
  fakeAsync,
  flushMicrotasks
} from '@angular/core/testing';
import { of } from 'rxjs';

import { SocketService } from './socket.service';
import { UserService } from './user.service';
import { SessionCredentialStore } from './session-credential-store.service';
import { SessionAuthStateService } from './session-auth-state.service';


describe(
  'Local auth removal ownership characterization',
  () => {

    describe(
      'SocketService logout removal policy',
      () => {

        beforeEach(async () => {
          localStorage.clear();

          SessionCredentialStore
            .setCachedToken(null);

          await SocketService
            .logout()
            .catch(() => undefined);

          SessionCredentialStore
            .setCachedToken(null);

          (SocketService as any)
            .ownerId = null;

          (SocketService as any)
            .emitQueue.length = 0;
        });


        afterEach(async () => {
          // A test may deliberately leave the raw removeItem spy in a
          // throwing state until Jasmine restores spies. Reset private
          // state directly so characterization cannot pollute later tests.
          (SocketService as any)
            .ownerId = null;

          (SocketService as any)
            .emitQueue.length = 0;

          SessionCredentialStore
            .setCachedToken(null);

          localStorage.clear();
        });


        it(
          'aborts cache invalidation and socket teardown when raw local token removal throws',
          async () => {
            localStorage.setItem(
              'token',
              'persisted-token'
            );

            SessionCredentialStore
              .setCachedToken(
                'cached-token'
              );

            (SocketService as any)
              .ownerId =
                'socket-owner';

            (SocketService as any)
              .emitQueue.push({
                event: 'queued-event',
                data: {
                  value: true
                }
              });

            const removedKeys: string[] = [];

            spyOn(
              localStorage,
              'removeItem'
            ).and.callFake(
              (key: string) => {
                removedKeys.push(
                  key
                );

                if (
                  key === 'token'
                ) {
                  throw new Error(
                    'forced socket token removal failure'
                  );
                }
              }
            );

            await expectAsync(
              SocketService.logout()
            ).toBeRejectedWithError(
              Error,
              'forced socket token removal failure'
            );

            expect(
              removedKeys
            ).toEqual([
              'token'
            ]);

            expect(
              SessionCredentialStore
                .getCachedToken()
            ).toBe(
              'cached-token'
            );

            expect(
              (SocketService as any)
                .ownerId
            ).toBe(
              'socket-owner'
            );

            expect(
              (SocketService as any)
                .emitQueue.length
            ).toBe(1);
          }
        );
      }
    );


    describe(
      'UserService malformed persisted identity removal policy',
      () => {
        let service: any;
        let nativeStorage: any;

        const localUser = {
          _id: 'legacy-local-user',
          firstName: 'Legacy'
        };


        beforeEach(() => {
          localStorage.clear();

          nativeStorage = {
            getItem: jasmine
              .createSpy(
                'nativeStorage.getItem'
              )
              .and.callFake(
                () =>
                  Promise.reject(
                    new Error(
                      'native user unavailable'
                    )
                  )
              ),

            remove: jasmine
              .createSpy(
                'nativeStorage.remove'
              )
              .and.returnValue(
                Promise.resolve()
              )
          };

          // Bypass the constructor exactly as the startup-restoration
          // characterization does. We are freezing only initCurrentUser.
          service =
            Object.create(
              UserService.prototype
            ) as any;

          service.nativeStorage =
            nativeStorage;

          service.idService = {
            normalizeId:
              jasmine.createSpy(
                'normalizeId'
              )
          };

          service.callCounters = {
            profileRequests: 0,
            profileHits: 0,
            profileMisses: 0,
            initCalls: 0
          };

          service.setCurrentUser =
            jasmine.createSpy(
              'setCurrentUser'
            );

          service.refreshCurrentUser =
            jasmine
              .createSpy(
                'refreshCurrentUser'
              )
              .and.returnValue(
                of({
                  _id: 'validated-user'
                })
              );
        });


        afterEach(() => {
          localStorage.clear();
        });


        it(
          'canonical removal failure skips legacy removal and is absorbed by startup restoration',
          fakeAsync(() => {
            localStorage.setItem(
              'currentUser',
              '[object Object]'
            );

            localStorage.setItem(
              'user',
              JSON.stringify(
                localUser
              )
            );

            const removedKeys: string[] = [];

            spyOn(
              localStorage,
              'removeItem'
            ).and.callFake(
              (key: string) => {
                removedKeys.push(
                  key
                );

                if (
                  key === 'currentUser'
                ) {
                  throw new Error(
                    'forced canonical identity removal failure'
                  );
                }
              }
            );

            let resolved = false;
            let rejected = false;

            (service as any)
              .initCurrentUser()
              .then(
                () => {
                  resolved = true;
                }
              )
              .catch(
                () => {
                  rejected = true;
                }
              );

            flushMicrotasks();

            expect(
              removedKeys
            ).toEqual([
              'currentUser'
            ]);

            expect(
              resolved
            ).toBeTrue();

            expect(
              rejected
            ).toBeFalse();

            expect(
              service.setCurrentUser
            ).not.toHaveBeenCalled();

            expect(
              service.refreshCurrentUser
            ).not.toHaveBeenCalled();
          })
        );


        it(
          'legacy removal is attempted after canonical success and its failure is absorbed by startup restoration',
          fakeAsync(() => {
            localStorage.setItem(
              'currentUser',
              '[object Object]'
            );

            localStorage.setItem(
              'user',
              JSON.stringify(
                localUser
              )
            );

            const removedKeys: string[] = [];

            spyOn(
              localStorage,
              'removeItem'
            ).and.callFake(
              (key: string) => {
                removedKeys.push(
                  key
                );

                if (
                  key === 'user'
                ) {
                  throw new Error(
                    'forced legacy identity removal failure'
                  );
                }
              }
            );

            let resolved = false;
            let rejected = false;

            (service as any)
              .initCurrentUser()
              .then(
                () => {
                  resolved = true;
                }
              )
              .catch(
                () => {
                  rejected = true;
                }
              );

            flushMicrotasks();

            expect(
              removedKeys
            ).toEqual([
              'currentUser',
              'user'
            ]);

            expect(
              resolved
            ).toBeTrue();

            expect(
              rejected
            ).toBeFalse();

            expect(
              service.setCurrentUser
            ).not.toHaveBeenCalled();

            expect(
              service.refreshCurrentUser
            ).not.toHaveBeenCalled();
          })
        );
      }
    );


    describe(
      'SessionAuthStateService targeted cleanup contrast',
      () => {

        it(
          'continues local identity removals after an earlier local removal failure',
          async () => {
            const nativeStorage = {
              remove: jasmine
                .createSpy(
                  'nativeStorage.remove'
                )
                .and.returnValue(
                  Promise.resolve()
                )
            };

            const service =
              new SessionAuthStateService(
                nativeStorage as any
              );

            SessionCredentialStore
              .setCachedToken(
                'cached-token'
              );

            const removedKeys: string[] = [];

            spyOn(
              localStorage,
              'removeItem'
            ).and.callFake(
              (key: string) => {
                removedKeys.push(
                  key
                );

                if (
                  key === 'token'
                ) {
                  throw new Error(
                    'forced targeted token removal failure'
                  );
                }
              }
            );

            await expectAsync(
              service.clearStoredAuth(
                false
              )
            ).toBeResolved();

            expect(
              removedKeys
            ).toEqual([
              'token',
              'currentUser',
              'user'
            ]);

            expect(
              SessionCredentialStore
                .getCachedToken()
            ).toBeNull();

            expect(
              nativeStorage.remove
            ).not.toHaveBeenCalled();
          }
        );
      }
    );
  }
);
