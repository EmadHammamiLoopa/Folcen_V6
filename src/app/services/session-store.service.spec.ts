import { BehaviorSubject, of, throwError } from 'rxjs';
import { SessionStoreService } from './session-store.service';

describe('SessionStoreService characterization', () => {
  function makeUserService(initial: any = null) {
    const subject = new BehaviorSubject<any>(initial);
    return {
      currentUser: subject.asObservable(),
      currentUserValue: initial,
      refreshCurrentUser: jasmine.createSpy('refreshCurrentUser').and.returnValue(of(initial)),
      resetUserCache: jasmine.createSpy('resetUserCache'),
      subject,
    };
  }

  it('uses an already restored authenticated user without another profile request', async () => {
    const restored = { _id: 'user-1' };
    const userService = makeUserService(restored);
    const store = new SessionStoreService(userService as any);

    await expectAsync(store.init()).toBeResolvedTo(restored as any);
    expect(userService.refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent restoration attempts into one profile request', async () => {
    const refreshed = { _id: 'user-2' };
    const userService = makeUserService(null);
    userService.refreshCurrentUser.and.returnValue(of(refreshed));
    const store = new SessionStoreService(userService as any);

    const [first, second] = await Promise.all([store.init(), store.init()]);

    expect(first).toEqual(refreshed as any);
    expect(second).toEqual(refreshed as any);
    expect(userService.refreshCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing session value when profile restoration fails', async () => {
    const userService = makeUserService(null);
    userService.refreshCurrentUser.and.returnValue(throwError(new Error('offline')));
    const store = new SessionStoreService(userService as any);

    await expectAsync(store.init()).toBeResolvedTo(null);
  });

  it('clears observable state and the UserService cache on logout', () => {
    const userService = makeUserService({ _id: 'user-3' });
    const store = new SessionStoreService(userService as any);
    let latest: any = undefined;
    store.user$.subscribe(value => latest = value);

    store.clear('logout');

    expect(latest).toBeNull();
    expect(userService.resetUserCache).toHaveBeenCalledWith('logout');
  });
});
