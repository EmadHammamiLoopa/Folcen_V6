import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, ModalController, Platform } from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { OneSignalService } from '../../../services/one-signal.service';
import { UserService } from '../../../services/user.service';
import { FirebaseService } from '../../../services/firebase.service';
import { User } from '../../../models/User';
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
    private alertCtrl: AlertController,
    private platform: Platform,
    private socketService: SocketService,
    private userService: UserService,
    private firebaseService: FirebaseService
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
  
    const { email, password } = this.form.value;

    try {
      // Primary path: MongoDB-based signin
      const resp = await this.auth.signin({ email, password });
      await this._handleSigninSuccess(resp);
    } catch (firstErr) {
      // If the backend returns 401, the user's MongoDB password may be stale
      // after a Firebase password reset (Firebase reset email updates Firebase
      // only — MongoDB hash is not changed). Fall back to Firebase signin so
      // that users who reset their password can still log in.
      const status = firstErr?.status ?? firstErr?.error?.status;
      if (status === 401) {
        try {
          // Pass syncMongoPassword=true so the backend re-hashes and stores
          // this password in MongoDB, fixing future MongoDB-only logins.
          const fbResp = await this.auth.firebaseSignin(email, password, true);
          await this._handleSigninSuccess(fbResp);
          return;
        } catch (fbErr) {
          // Firebase also failed — fall through and show the original error
          console.warn('Firebase fallback signin also failed:', fbErr);
        }
      }

      this.pageLoading = false;
      console.error('Sign-in error:', firstErr);

      let message = 'An unexpected error occurred.';
      if (firstErr && firstErr.error) {
        if (typeof firstErr.error === 'string') {
          message = firstErr.error;
        } else if (firstErr.error.message) {
          message = firstErr.error.message;
        } else if (firstErr.error.error) {
          message = firstErr.error.error;
        }
      } else if (firstErr && firstErr.message) {
        message = firstErr.message;
      } else if (typeof firstErr === 'string') {
        message = firstErr;
      }

      if (firstErr && firstErr.errors) {
        this.validationErrors = firstErr.errors;
      } else if (firstErr && firstErr.error && firstErr.error.errors && typeof firstErr.error.errors === 'object') {
        this.validationErrors = firstErr.error.errors;
      } else {
        this.toastService.presentErrorToastr(message);
      }
    }
  }

  private async _handleSigninSuccess(resp: any) {
    console.log('Sign-in response:', resp);
    this.user = new User().initialize(resp.data.user);

    await this.storeUserData(resp.data.token, resp.data.user);

    try {
      await SocketService.initializeSocket();
      SocketService.bindToAuthUser();
      console.log('✅ WebSocket initialized and bound');
    } catch (error) {
      console.error('❌ WebSocket initialization failed:', error);
    }

    this.pageLoading = false;

    // Email not yet verified — send user to the verification step instead of
    // showing the main app (auth guard would redirect anyway, but doing it here
    // gives an explicit message rather than looking like "unauthorized").
    if (this.user.emailVerified === false) {
      this.toastService.presentErrorToastr('Please verify your email address. Check your inbox and click the verification link, then sign in again.');
      await this.router.navigate(['/auth/signup']);
      return;
    }

    if (!this.user.loggedIn) {
      console.log('User not logged in according to flag, showing welcome alert');
      await this.showWelcomeAlert();
    }

    console.log('Navigating to /tabs/new-friends');
    await this.router.navigate(['/tabs/new-friends']);
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

  async forgotPassword() {
    const alert = await this.alertCtrl.create({
      header: 'Reset Password',
      message: 'Enter your email address and we will send you a password reset link.',
      cssClass: 'forgot-password-alert',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Your email address',
          value: this.form.get('email')?.value || '',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel',
        },
        {
          text: 'Send Reset Link',
          cssClass: 'alert-confirm',
          // handler MUST be synchronous — async handlers return a Promise
          // (truthy) so Ionic closes the alert immediately and `return false`
          // never keeps it open.
          handler: (data) => {
            const email = (data.email || '').trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              this.toastService.presentErrorToastr('Please enter a valid email address.');
              return false; // keep alert open — works because handler is sync
            }
            // email looks valid — let the alert close, then send asynchronously
            this._sendPasswordReset(email);
            // returning undefined / truthy closes the alert
          },
        },
      ],
    });
    await alert.present();
  }

  private async _sendPasswordReset(email: string) {
    // Step 1 — backend pre-flight: ensures a Firebase Auth account exists for
    // legacy MongoDB-only users. Run in the background and never block the
    // Firebase email send — if it fails the account may already exist anyway.
    try {
      await this.auth.sendRequest({ method: 'post', url: 'forgot-password', data: { email } });
    } catch (_ignored) {
      // Backend unavailable or user not in DB — still attempt Firebase below.
    }

    // Step 2 — Firebase sends the reset email via its own infrastructure.
    try {
      await this.firebaseService.resetPassword(email);
      this.toastService.presentSuccessToastr(
        `Reset email sent to ${email}. Check your inbox and spam folder.\n\nAlways use the latest email — earlier links expire once a new one is sent.`
      );
    } catch (err: any) {
      let msg = 'Failed to send reset email. Please try again in a few minutes.';
      if (err?.code === 'auth/invalid-email') {
        msg = 'Invalid email address.';
      } else if (err?.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please wait a few minutes and try again.';
      } else if (err?.code === 'auth/user-not-found') {
        // Still show generic message — don't reveal if address exists
        msg = 'If that email is registered, a reset link will be sent.';
      }
      this.toastService.presentErrorToastr(msg);
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