import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { OneSignalService } from '../../../services/one-signal.service';
import { UserService } from '../../../services/user.service';
import { User } from '../../../models/User';
import { ModalController } from '@ionic/angular';
import { WelcomeAlertComponent } from '../welcome-alert/welcome-alert.component';
import { SocketService } from 'src/app/services/socket.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
})
export class SigninComponent implements OnInit {
  form: FormGroup;
  pageLoading = false;
  validationErrors = {};
  user: User;

  constructor(
    private formBuilder: FormBuilder,
    private auth: AuthService,
    private toastService: ToastService,
    private router: Router,
    private nativeStorage: NativeStorage,
    private oneSignalService: OneSignalService,
    private modalCtrl: ModalController,
    private platform: Platform,
    private socketService: SocketService,  // <-- Inject WebSocket Service here
    private userService: UserService
  ) {}

  ngOnInit() {
    this.initializeForm();
  }

  ionViewWillEnter() {
    this.clearForm();
  }

  initializeForm() {
    this.form = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });

    // Clear validation errors when user starts typing
    this.form.valueChanges.subscribe(() => {
      if (Object.keys(this.validationErrors).length > 0) {
        this.validationErrors = {};
      }
    });
  }

  clearForm() {
    this.form.patchValue({
      email: '',
      password: '',
    });
  }

  async submit() {
    this.pageLoading = true;
    console.log('Submit clicked, form values:', this.form.value);

    // Guard against accidental empty submits (can happen if input hasn't propagated)
    if (!this.form || !this.form.value) {
      this.pageLoading = false;
      return;
    }

    if (this.form.invalid) {
      this.pageLoading = false;
      this.validationErrors = {};
      Object.keys(this.form.controls).forEach((k) => {
        const control = this.form.get(k);
        if (control && control.errors) {
          this.validationErrors[k] = Object.keys(control.errors).map(e => {
            if (e === 'required') return 'This field is required';
            if (e === 'email') return 'Enter a valid email address';
            return e;
          });
        }
      });
      return;
    }
  
    try {
      const resp = await this.auth.signin({
        email: this.form.value.email,
        password: this.form.value.password,
      });
    
      console.log('Sign-in response:', resp);
      this.user = new User().initialize(resp.data.user);
    
      await this.storeUserData(resp.data.token, resp.data.user);
    
      // ✅ Initialize Socket (idempotent)
      try {
        await SocketService.initializeSocket();
        SocketService.bindToAuthUser();
        console.log('✅ WebSocket initialized and bound');
      } catch (error) {
        console.error('❌ WebSocket initialization failed:', error);
      }
    
      this.pageLoading = false;

      if (!this.user.loggedIn) {
        console.log('User not logged in according to flag, showing welcome alert');
        await this.showWelcomeAlert();
      }
    
      console.log('Navigating to /tabs/new-friends');
      await this.router.navigate(['/tabs/new-friends']);
    }  catch (err) {
      this.pageLoading = false;
      console.error('Sign-in error:', err);

      let message = 'An unexpected error occurred.';
      if (err && err.error) {
        if (typeof err.error === 'string') {
          message = err.error;
        } else if (err.error.message) {
          message = err.error.message;
        } else if (err.error.error) {
          message = err.error.error;
        }
      } else if (err && err.message) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      }

      if (err && err.errors) {
        this.validationErrors = err.errors;
      } else if (err && err.error && err.error.errors && typeof err.error.errors === 'object') {
        this.validationErrors = err.error.errors;
      } else {
        this.toastService.presentErrorToastr(message);
      }
    }
  }
  

  private async storeUserData(token: string, user: any) {
    console.log('Storing user data');
    // Keep token in native/local storage, but centralize user object writes through UserService
    try {
      if (this.platform.is('cordova')) {
        await this.nativeStorage.setItem('token', token);
      } else {
        try { localStorage.setItem('token', token); } catch (e) {}
      }
    } catch (e) {
      // token persistence failed, continue
    }

    try {
      // Use UserService to persist the authenticated user safely (will write canonical + legacy keys)
      const userObj = new User().initialize(user);
      this.userService.setCurrentUser(userObj, { force: true });
    } catch (e) {
      console.warn('Failed to persist user via UserService, falling back to local writes', e);
      const userData = JSON.stringify(user);
      try {
        if (this.platform.is('cordova')) {
          try { await this.nativeStorage.setItem('currentUser', userData); } catch(e) {}
          try { await this.nativeStorage.setItem('user', userData); } catch(e) {}
        } else {
          try { localStorage.setItem('currentUser', userData); } catch(e) {}
          try { localStorage.setItem('user', userData); } catch(e) {}
        }
      } catch (e2) {
        // swallow fallback errors
      }
    }
  }

  async showWelcomeAlert() {
    console.log('Showing welcome alert');
    const modal = await this.modalCtrl.create({
      component: WelcomeAlertComponent,
      componentProps: {
        user: this.user,
      },
      animated: true,
      showBackdrop: true,
    });
    await modal.present();
  }

  // Google Sign-in method
  async googleSignin() {
    try {
      const resp = await this.auth.googleSignIn();
      console.log('Google Sign-In response:', resp);
      this.pageLoading = false;
      this.user = new User().initialize(resp.data.user);
  
      await this.storeUserData(resp.data.token, resp.data.user);

      // ✅ Initialize Socket (idempotent)
      try {
        await SocketService.initializeSocket();
        SocketService.bindToAuthUser();
        console.log('✅ WebSocket initialized and bound');
      } catch (error) {
        console.error('❌ WebSocket initialization failed:', error);
      }
  
      if (!this.user.loggedIn) {
        await this.showWelcomeAlert();
      }
  
      this.router.navigate(['/tabs/new-friends']);
    } catch (err) {
      this.pageLoading = false;
      console.error('Google Sign-In error:', err);

      let message = 'An unexpected error occurred.';
      if (err && err.error) {
        if (typeof err.error === 'string') {
          message = err.error;
        } else if (err.error.message) {
          message = err.error.message;
        } else if (err.error.error) {
          message = err.error.error;
        }
      } else if (err && err.message) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      }

      if (err && err.errors) {
        this.validationErrors = err.errors;
      } else if (err && err.error && err.error.errors && typeof err.error.errors === 'object') {
        this.validationErrors = err.error.errors;
      } else {
        this.toastService.presentErrorToastr(message);
      }
    }
  }
  
}