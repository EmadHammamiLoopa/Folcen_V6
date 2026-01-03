import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, ModalController } from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { OneSignalService } from '../../../services/one-signal.service';
import { UserService } from '../../../services/user.service';
import { SocketService } from 'src/app/services/socket.service';

import { SigninComponent } from './signin.component';

describe('SigninComponent', () => {
  let component: SigninComponent;
  let fixture: ComponentFixture<SigninComponent>;

  beforeEach(waitForAsync(() => {
    const mockAuth = { signin: () => Promise.resolve({ data: { token: '', user: {} } }), googleSignIn: () => Promise.resolve({ data: { token: '', user: {} } }) };
    const mockToast = { presentSuccessToastr: () => {}, presentErrorToastr: () => {} };
    const mockNativeStorage = { setItem: async () => {} };
    const mockOneSignal = {};
    const mockUserService = { setCurrentUser: () => {} };
    const mockModalCtrl = { create: async () => ({ present: async () => {}, onDidDismiss: async () => ({}) }) };
    const mockPlatform = { is: (p: string) => false };
    const mockSocketService = { initializeSocket: async () => {}, getSocket: async () => ({ id: 'test' }), bindToAuthUser: () => {} };

    TestBed.configureTestingModule({
      declarations: [ SigninComponent ],
      imports: [IonicModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: ToastService, useValue: mockToast },
        { provide: NativeStorage, useValue: mockNativeStorage },
        { provide: OneSignalService, useValue: mockOneSignal },
        { provide: UserService, useValue: mockUserService },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: SocketService, useValue: mockSocketService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SigninComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
