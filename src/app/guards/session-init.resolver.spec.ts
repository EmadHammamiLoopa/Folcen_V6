import { firstValueFrom } from 'rxjs';
import { SessionInitResolver } from './session-init.resolver';

describe('SessionInitResolver characterization', () => {
  let sessionStore: any;
  let userService: any;
  let resolver: SessionInitResolver;

  function route(
    directCall: string | null
  ): any {
    return {
      queryParamMap: {
        get: jasmine
          .createSpy('get')
          .and.callFake(
            (name: string) =>
              name === 'directCall'
                ? directCall
                : null
          )
      }
    };
  }

  beforeEach(() => {
    delete (window as any).__sessionMetrics;

    sessionStore = {
      init: jasmine
        .createSpy('init')
        .and.returnValue(
          Promise.resolve({
            _id: 'restored-user'
          })
        ),

      getMetrics: jasmine
        .createSpy('getMetrics')
        .and.returnValue({
          initAttempts: 1
        })
    };

    userService = {
      currentUserValue: {
        _id: 'memory-user'
      }
    };

    resolver = new SessionInitResolver(
      sessionStore,
      userService
    );
  });

  afterEach(() => {
    delete (window as any).__sessionMetrics;
  });

  it('delegates normal route restoration to SessionStore.init', async () => {
    const result = await firstValueFrom(
      resolver.resolve(
        route(null)
      )
    );

    expect(result).toEqual({
      _id: 'restored-user'
    } as any);

    expect(
      sessionStore.init
    ).toHaveBeenCalledTimes(1);

    expect(
      (window as any).__sessionMetrics
    ).toEqual({
      initAttempts: 1
    });
  });

  it('directCall=1 bypasses SessionStore restoration and uses the in-memory user', async () => {
    const result = await firstValueFrom(
      resolver.resolve(
        route('1')
      )
    );

    expect(result).toEqual({
      _id: 'memory-user'
    } as any);

    expect(
      sessionStore.init
    ).not.toHaveBeenCalled();
  });

  it('directCall=1 resolves null when there is no in-memory user', async () => {
    userService.currentUserValue = null;

    const result = await firstValueFrom(
      resolver.resolve(
        route('1')
      )
    );

    expect(result).toBeNull();

    expect(
      sessionStore.init
    ).not.toHaveBeenCalled();
  });

  it('does not block navigation when SessionStore restoration rejects', async () => {
    sessionStore.init.and.returnValue(
      Promise.reject(
        new Error('offline')
      )
    );

    const result = await firstValueFrom(
      resolver.resolve(
        route(null)
      )
    );

    expect(result).toBeNull();

    expect(
      sessionStore.init
    ).toHaveBeenCalledTimes(1);
  });
});
