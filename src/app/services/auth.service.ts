import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { Platform } from '@ionic/angular';
import { GooglePlus } from '@ionic-native/google-plus/ngx';
import { FirebaseService } from './firebase.service';
import { environment } from 'src/environments/environment';

declare const gapi: any; // Declare gapi for TypeScript

@Injectable({
  providedIn: 'root'
})
export class AuthService extends DataService {

  constructor(
    nativeStorage: NativeStorage, 
    http: HTTP, 
    httpClient: HttpClient, 
    router: Router, 
    private platformRef: Platform,  
    private googlePlus: GooglePlus,
    private ngZone: NgZone, // Added NgZone
    private firebaseSvc: FirebaseService
  ) {
    super('auth/', nativeStorage, http, httpClient, router, platformRef);
  //  this.loadGoogleAuthLibrary(); // Load Google Auth Library
  }

  private loadGoogleAuthLibrary() {
    return new Promise<void>((resolve, reject) => {
      gapi.load('auth2', () => {
        gapi.auth2.init({
          client_id: '785598983692-igiasirmagu9p3du2a04j67nfvkp81p7.apps.googleusercontent.com'
        }).then(() => {
          resolve();
        }).catch((error: any) => {
          reject(error);
        });
      });
    });
  }

  getCurrentUserId() {
    return localStorage.getItem('userId'); // Example: Adjust based on authentication method
  }
  
  verifyEmail(email: string) {
    return this.sendRequest({
      method: 'post',
      url: 'checkEmail',
      data: { email }
    });
  }

  signup(data: any) {
    return this.sendRequest({
      method: 'post',
      url: 'signup',
      data
    });
  }

  googleSignIn() {
    return this.firebaseGoogleLogin('google_signin');
  }

  googleSignUp() {
    return this.firebaseGoogleLogin('google_signup');
  }

  private async firebaseGoogleLogin(context: 'google_signin' | 'google_signup') {
    try {
      const fbUser = this.shouldUseNativeGoogle()
        ? await this.nativeGoogleLogin()
        : await this.firebaseSvc.signInWithGoogle();
      const idToken = await fbUser.getIdToken();
      return await this.sendRequest({
        method: 'post',
        url: 'firebase-login',
        data: {
          idToken,
          profile: this.buildGoogleProfile(fbUser, context)
        }
      });
    } catch (err) {
      throw this.handleAuthError(err);
    }
  }

  private shouldUseNativeGoogle(): boolean {
    return this.platformRef.is('hybrid') || this.platformRef.is('cordova') || this.platformRef.is('capacitor');
  }

  private async nativeGoogleLogin() {
    const webClientId = (environment as any)?.firebase?.webClientId;
    const result = await this.googlePlus.login({
      webClientId,
      offline: false,
      scopes: 'profile email'
    });

    return this.firebaseSvc.signInWithGoogleToken(result?.idToken, result?.accessToken);
  }

  private buildGoogleProfile(fbUser: any, context: 'google_signin' | 'google_signup') {
    const displayName = String(fbUser?.displayName || '').trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const email = String(fbUser?.email || '').trim().toLowerCase();
    const fallbackName = email ? email.split('@')[0] : 'Google';
    const photoURL = fbUser?.photoURL || '';

    return {
      firstName: nameParts[0] || fallbackName,
      lastName: nameParts.slice(1).join(' ') || '',
      email,
      mainAvatar: photoURL,
      avatar: photoURL ? [photoURL] : [],
      emailVerified: fbUser?.emailVerified === true,
      acceptedTerms: true,
      signupProvider: 'google',
      acceptanceContext: context
    };
  }

  async firebaseSignup(email: string, password: string, profile: any) {
    try {
      const displayName = `${profile.firstName} ${profile.lastName}`;
      let fbUser: any;
      let isNewFirebaseAccount = false;

      try {
        fbUser = await this.firebaseSvc.signUp(email, password, displayName);
        isNewFirebaseAccount = true;
      } catch (fbSignupErr: any) {
        if (fbSignupErr.code === 'auth/email-already-in-use') {
          // Try to sign in with the same credentials in case the Firebase account
          // already exists with the same password (e.g. interrupted previous signup).
          try {
            fbUser = await this.firebaseSvc.signIn(email, password);
            isNewFirebaseAccount = false;
          } catch (fbSigninErr: any) {
            // Different password — cannot recover automatically. Surface the error
            // so the UI shows the "Account Already Exists" dialog.
            throw fbSignupErr;
          }
        } else {
          throw fbSignupErr;
        }
      }

      const idToken = await fbUser.getIdToken();
      try {
        return await this.sendRequest({
          method: 'post',
          url: 'firebase-login',
          data: { idToken, profile }
        });
      } catch (backendErr: any) {
        // Backend failed to create the MongoDB record.
        // If we JUST created this Firebase account, delete it so Firebase and
        // MongoDB stay in sync — no orphaned Firebase accounts.
        if (isNewFirebaseAccount) {
          try {
            await this.firebaseSvc.deleteCurrentUser();
            console.log('[firebaseSignup] Cleaned up new Firebase account after backend failure');
          } catch (deleteErr) {
            console.warn('[firebaseSignup] Could not delete orphaned Firebase account:', deleteErr);
          }
        }
        throw backendErr;
      }
    } catch (err) {
      throw this.handleAuthError(err);
    }
  }

  async firebaseSignin(email: string, password: string, syncMongoPassword = false) {
    try {
      console.log('[DEBUG] AuthService: firebaseSignin called for:', email);
      const fbUser = await this.firebaseSvc.signIn(email, password);
      console.log('[DEBUG] AuthService: Firebase sign-in success, UID:', fbUser.uid);
      const idToken = await fbUser.getIdToken();
      console.log('[DEBUG] AuthService: Firebase ID Token obtained (first 20 chars):', idToken.substring(0, 20));
      const body: any = { idToken };
      if (syncMongoPassword) {
        // Ask the backend to re-hash and store this password in MongoDB so that
        // future logins via the standard signin route work without needing Firebase.
        body.rawPassword = password;
      }
      return await this.sendRequest({
        method: 'post',
        url: 'firebase-login',
        data: body
      });
    } catch (err) {
      throw this.handleAuthError(err);
    }
  }

  async signOutFirebase(): Promise<void> {
    try {
      await this.firebaseSvc.logout();
    } catch (e) {
      // best-effort cleanup
    }
  }

  private handleAuthError(err: any): { message: string; code?: string; status?: number; errors?: any } {
    console.error('Auth error caught in AuthService:', err);

    // Firebase-specific error codes
    if (err && err.code) {
      switch (err.code) {
        case 'auth/user-not-found':
          return { message: 'No account found with this email. Please sign up first.' };
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
          return { message: 'Incorrect email or password. Please try again.' };
        case 'auth/invalid-email':
          return { message: 'The email address is not valid.' };
        case 'auth/user-disabled':
          return { message: 'This account has been disabled. Please contact support.' };
        case 'auth/email-already-in-use':
          return { message: 'An account with this email already exists.', code: 'email-already-in-use' };
        case 'auth/weak-password':
          return { message: 'Password too weak. Please use at least 8 characters.' };
        case 'auth/network-request-failed':
          return { message: 'Network error. Please check your internet connection and try again.' };
        case 'auth/too-many-requests':
          return { message: 'Too many failed attempts. Please try again later.' };
        default:
          return { message: err.message || 'Authentication failed. Please try again.' };
      }
    }

    // Backend HTTP error (Angular HttpErrorResponse)
    if (err && typeof err.status === 'number') {
      const body = err.error;
      // Preserve field-level validation errors if the backend sent an errors object
      if (body && body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)) {
        return { message: body.message || 'Please correct the highlighted fields.', status: err.status, errors: body.errors };
      }
      // Plain message from backend
      const msg = body?.message
        || (typeof body?.errors === 'string' ? body.errors : null)
        || (typeof body === 'string' ? body : null)
        || `Request failed (${err.status}). Please try again.`;
      return { message: msg, status: err.status };
    }

    // Fallback
    return { message: err?.message || 'An unexpected error occurred. Please try again.' };
  }

  async firebaseResetPassword(email: string) {
    return this.firebaseSvc.resetPassword(email);
  }

  async resendVerification() {
    return this.firebaseSvc.resendVerification();
  }

  async checkVerification() {
    // Wait for Firebase auth state to be restored from persistence.
    // This is essential when the app is opened fresh (not a same-session signup):
    // currentUser is null until the async restoration completes.
    // Firebase 9.x has no authStateReady() — we use onAuthStateChanged instead.
    const fbUser: any = await this.firebaseSvc.waitForAuthReady();
    if (!fbUser) return null; // Not signed in to Firebase at all

    // Reload to pick up the latest server-side state (emailVerified flag).
    try { await fbUser.reload(); } catch (_) { /* network issue — continue anyway */ }

    // Force-refresh the ID token. The new token contains the definitive
    // email_verified claim issued directly by Firebase Auth servers.
    // This is more reliable than fbUser.emailVerified, which can lag behind
    // the server state even after reload() in some Firebase SDK versions.
    const idToken = await fbUser.getIdToken(true);
    if (!idToken) return null;

    // Decode the JWT payload to read email_verified (claims are public, no secret needed).
    const decodeVerified = (token: string): boolean => {
      try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)));
        return claims.email_verified === true;
      } catch (_) {
        return fbUser.emailVerified === true;
      }
    };

    let emailVerified = decodeVerified(idToken);

    // Firebase can take a few seconds to propagate email verification across all
    // servers. If the first check says "not verified", wait 2 s and retry once
    // before giving up — this avoids making the user tap the button twice.
    if (!emailVerified) {
      await new Promise(r => setTimeout(r, 2000));
      try { await fbUser.reload(); } catch (_) {}
      const idToken2 = await fbUser.getIdToken(true).catch(() => null);
      if (idToken2) {
        emailVerified = decodeVerified(idToken2);
      }
    }

    if (!emailVerified) return null;

    // Always use a fresh token for the backend call
    const finalToken = await fbUser.getIdToken(false).catch(() => null) || idToken;
    return await this.sendRequest({
      method: 'post',
      url: 'firebase-login',
      data: { idToken: finalToken }
    });
  }

  signin(data: any) {
    return this.sendRequest({
      method: 'post',
      url: 'signin',
      data
    });
  }

  signout() {
    console.log('Sending signout request to server'); // Log to verify request initiation
    return this.sendRequest({
      method: 'post',
      url: 'signout'
    }).then(response => {
      console.log('Signout response:', response); // Log to verify response
      return response;
    }).catch(error => {
      console.error('Signout error:', error); // Log to capture error
      throw error;
    });
  }

  getAuthUser() {
    return this.sendRequest({
      method: 'get',
      url: 'user'
    });
  }

  getUserId(): string | null {
    try {
      const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
      const user = raw ? JSON.parse(raw) : null;
      return user ? user._id : null;
    } catch (error) {
      console.error('Error retrieving user ID', error);
      return null;
    }
  }
}
