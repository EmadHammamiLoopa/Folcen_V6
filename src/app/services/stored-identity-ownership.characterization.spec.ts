import {
  SessionAuthStateService
} from './session-auth-state.service';

describe(
  'Stored identity ownership characterization',
  () => {
    let nativeStorage: any;
    let authState: SessionAuthStateService;

    beforeEach(() => {
      localStorage.clear();

      nativeStorage = {
        getItem: jasmine
          .createSpy('getItem')
          .and.returnValue(
            Promise.resolve(null)
          ),

        setItem: jasmine
          .createSpy('setItem')
          .and.returnValue(
            Promise.resolve()
          ),

        remove: jasmine
          .createSpy('remove')
          .and.returnValue(
            Promise.resolve()
          )
      };

      authState =
        new SessionAuthStateService(
          nativeStorage
        );
    });

    afterEach(() => {
      localStorage.clear();
    });

    it(
      'prefers canonical currentUser over a different legacy user value',
      () => {
        localStorage.setItem(
          'currentUser',
          '{"_id":"canonical-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-user"}'
        );

        expect(
          authState.getLocalUserRaw()
        ).toBe(
          '{"_id":"canonical-user"}'
        );

        expect(
          nativeStorage.getItem
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'falls back to legacy user when canonical currentUser is absent',
      () => {
        localStorage.setItem(
          'user',
          '{"_id":"legacy-user"}'
        );

        expect(
          authState.getLocalUserRaw()
        ).toBe(
          '{"_id":"legacy-user"}'
        );
      }
    );

    it(
      'falls back to legacy user when canonical currentUser is an empty string',
      () => {
        localStorage.setItem(
          'currentUser',
          ''
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-user"}'
        );

        expect(
          authState.getLocalUserRaw()
        ).toBe(
          '{"_id":"legacy-user"}'
        );
      }
    );

    it(
      'returns a truthy malformed canonical value instead of consulting the valid legacy value',
      () => {
        localStorage.setItem(
          'currentUser',
          '{malformed'
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-user"}'
        );

        expect(
          authState.getLocalUserRaw()
        ).toBe(
          '{malformed'
        );
      }
    );

    it(
      'returns null when neither canonical nor legacy identity is stored',
      () => {
        expect(
          authState.getLocalUserRaw()
        ).toBeNull();
      }
    );

    it(
      'does not swallow a localStorage read failure or introduce native fallback',
      () => {
        const getItemSpy =
          spyOn(
            Storage.prototype,
            'getItem'
          )
            .and.throwError(
              'local-storage-unavailable'
            );

        expect(
          () =>
            authState.getLocalUserRaw()
        ).toThrowError(
          'local-storage-unavailable'
        );

        expect(
          getItemSpy
        ).toHaveBeenCalled();

        expect(
          nativeStorage.getItem
        ).not.toHaveBeenCalled();
      }
    );
  }
);
