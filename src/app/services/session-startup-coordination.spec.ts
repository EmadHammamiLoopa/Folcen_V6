import { BehaviorSubject, of } from 'rxjs';
import { SessionStoreService } from './session-store.service';
import { UserService } from './user.service';

describe('Startup session coordination', () => {
  it('UserService exposes its in-flight startup restoration promise', async () => {
    const service =
      Object.create(UserService.prototype) as any;

    const restoration =
      Promise.resolve();

    service.startupRestorationPromise =
      restoration;

    expect(
      service.waitForStartupRestoration()
    ).toBe(restoration);

    await restoration;
  });

  it('SessionStore waits for persisted-user restoration before deciding to refresh', async () => {
    const restored = {
      _id: 'restored-user'
    };

    let current: any = null;
    let finishRestoration: () => void;

    const subject =
      new BehaviorSubject<any>(null);

    const restoration =
      new Promise<void>(resolve => {
        finishRestoration = () => {
          current = restored;
          subject.next(restored);
          resolve();
        };
      });

    const userService: any = {
      currentUser: subject.asObservable(),

      get currentUserValue() {
        return current;
      },

      waitForStartupRestoration:
        jasmine
          .createSpy('waitForStartupRestoration')
          .and.returnValue(restoration),

      refreshCurrentUser:
        jasmine
          .createSpy('refreshCurrentUser')
          .and.returnValue(
            of({ _id: 'unexpected-refresh' })
          ),

      resetUserCache:
        jasmine.createSpy('resetUserCache')
    };

    const store =
      new SessionStoreService(userService);

    const initialization =
      store.init();

    await Promise.resolve();

    expect(
      userService.refreshCurrentUser
    ).not.toHaveBeenCalled();

    finishRestoration();

    await expectAsync(
      initialization
    ).toBeResolvedTo(restored as any);

    expect(
      userService.waitForStartupRestoration
    ).toHaveBeenCalledTimes(1);

    expect(
      userService.refreshCurrentUser
    ).not.toHaveBeenCalled();
  });

  it('concurrent SessionStore init calls still issue only one refresh when restoration finds no user', async () => {
    let current: any = null;
    let finishRestoration: () => void;

    const refreshed = {
      _id: 'refreshed-user'
    };

    const subject =
      new BehaviorSubject<any>(null);

    const restoration =
      new Promise<void>(resolve => {
        finishRestoration = resolve;
      });

    const userService: any = {
      currentUser: subject.asObservable(),

      get currentUserValue() {
        return current;
      },

      waitForStartupRestoration:
        jasmine
          .createSpy('waitForStartupRestoration')
          .and.returnValue(restoration),

      refreshCurrentUser:
        jasmine
          .createSpy('refreshCurrentUser')
          .and.callFake(() => {
            current = refreshed;
            subject.next(refreshed);
            return of(refreshed);
          }),

      resetUserCache:
        jasmine.createSpy('resetUserCache')
    };

    const store =
      new SessionStoreService(userService);

    const first =
      store.init();

    const second =
      store.init();

    await Promise.resolve();

    expect(
      userService.refreshCurrentUser
    ).not.toHaveBeenCalled();

    finishRestoration();

    const results =
      await Promise.all([
        first,
        second
      ]);

    expect(results).toEqual([
      refreshed as any,
      refreshed as any
    ]);

    expect(
      userService.waitForStartupRestoration
    ).toHaveBeenCalledTimes(1);

    expect(
      userService.refreshCurrentUser
    ).toHaveBeenCalledTimes(1);
  });
});
