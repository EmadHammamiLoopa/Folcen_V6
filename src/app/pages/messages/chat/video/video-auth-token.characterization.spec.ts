import { VideoComponent } from './video.component';

describe(
  'VideoComponent auth token ownership characterization',
  () => {
    let component: any;
    let nativeStorage: any;
    let router: any;
    let jwtHelper: any;

    beforeEach(() => {
      localStorage.clear();

      nativeStorage = {
        getItem:
          jasmine.createSpy(
            'getItem'
          )
      };

      router = {
        navigate:
          jasmine
            .createSpy(
              'navigate'
            )
            .and.returnValue(
              Promise.resolve(true)
            )
      };

      jwtHelper = {
        decodeToken:
          jasmine.createSpy(
            'decodeToken'
          )
      };

      component = Object.create(
        VideoComponent.prototype
      ) as any;

      component.nativeStorage =
        nativeStorage;

      component.router =
        router;

      component.jwtHelper =
        jwtHelper;
    });


    afterEach(() => {
      localStorage.clear();
    });


    async function flushAuthWork(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }


    it(
      'browser reads only the local token and initializes authUser from that decoded token',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(false);

        localStorage.setItem(
          'token',
          'browser-token'
        );

        nativeStorage.getItem
          .and.returnValue(
            Promise.resolve(
              'native-other-token'
            )
          );

        jwtHelper.decodeToken
          .and.returnValue({
            _id: 'browser-user',
            firstName: 'Browser',
            lastName: 'User',
            mainAvatar: 'browser-avatar'
          });

        await component.getAuthUser();

        expect(
          component.isCordovaAvailable
        ).toHaveBeenCalled();

        expect(
          nativeStorage.getItem
        ).not.toHaveBeenCalled();

        expect(
          jwtHelper.decodeToken
        ).toHaveBeenCalledOnceWith(
          'browser-token'
        );

        expect(
          component.authUser?._id
        ).toBe(
          'browser-user'
        );

        expect(
          component.authUser?.firstName
        ).toBe(
          'Browser'
        );

        expect(
          component.authUser?.lastName
        ).toBe(
          'User'
        );

        expect(
          router.navigate
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'Cordova reads only the native token even when a different local token exists',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(true);

        localStorage.setItem(
          'token',
          'local-other-token'
        );

        nativeStorage.getItem
          .and.returnValue(
            Promise.resolve(
              'native-token'
            )
          );

        jwtHelper.decodeToken
          .and.returnValue({
            _id: 'native-user',
            firstName: 'Native',
            lastName: 'User'
          });

        await component.getAuthUser();

        expect(
          nativeStorage.getItem
        ).toHaveBeenCalledOnceWith(
          'token'
        );

        expect(
          jwtHelper.decodeToken
        ).toHaveBeenCalledOnceWith(
          'native-token'
        );

        expect(
          component.authUser?._id
        ).toBe(
          'native-user'
        );

        expect(
          router.navigate
        ).not.toHaveBeenCalled();
      }
    );


    it(
      'Cordova native token failure does not fall back to an available local token',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(true);

        localStorage.setItem(
          'token',
          'local-fallback-token'
        );

        nativeStorage.getItem
          .and.returnValue(
            Promise.reject(
              new Error(
                'native token read failed'
              )
            )
          );

        component.getAuthUser();

        await flushAuthWork();

        expect(
          nativeStorage.getItem
        ).toHaveBeenCalledOnceWith(
          'token'
        );

        expect(
          jwtHelper.decodeToken
        ).not.toHaveBeenCalled();

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );


    it(
      'browser missing local token does not consult NativeStorage and redirects to signin',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(false);

        nativeStorage.getItem
          .and.returnValue(
            Promise.resolve(
              'native-token'
            )
          );

        component.getAuthUser();

        await flushAuthWork();

        expect(
          nativeStorage.getItem
        ).not.toHaveBeenCalled();

        expect(
          jwtHelper.decodeToken
        ).not.toHaveBeenCalled();

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );


    it(
      'decoded token without _id is rejected and redirects to signin',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(false);

        localStorage.setItem(
          'token',
          'invalid-structure-token'
        );

        jwtHelper.decodeToken
          .and.returnValue({
            firstName: 'Missing',
            lastName: 'Identity'
          });

        component.getAuthUser();

        await flushAuthWork();

        expect(
          jwtHelper.decodeToken
        ).toHaveBeenCalledOnceWith(
          'invalid-structure-token'
        );

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );


    it(
      'token decode failure redirects to signin',
      async () => {
        component.isCordovaAvailable =
          jasmine
            .createSpy(
              'isCordovaAvailable'
            )
            .and.returnValue(false);

        localStorage.setItem(
          'token',
          'decode-error-token'
        );

        jwtHelper.decodeToken
          .and.throwError(
            'decode failed'
          );

        component.getAuthUser();

        await flushAuthWork();

        expect(
          jwtHelper.decodeToken
        ).toHaveBeenCalledOnceWith(
          'decode-error-token'
        );

        expect(
          router.navigate
        ).toHaveBeenCalledWith(
          ['/auth/signin']
        );
      }
    );
  }
);
