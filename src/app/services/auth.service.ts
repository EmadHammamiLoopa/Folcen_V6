import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { Platform } from '@ionic/angular';
import { GooglePlus } from '@ionic-native/google-plus/ngx';
import { FirebaseService } from './firebase.service';

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
    platform: Platform,  
    private googlePlus: GooglePlus,
    private ngZone: NgZone, // Added NgZone
    private firebaseSvc: FirebaseService
  ) {
    super('auth/', nativeStorage, http, httpClient, router, platform);
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
    if (this.platform.is('cordova')) {
      return this.googlePlus.login({
        'webClientId': '785598983692-igiasirmagu9p3du2a04j67nfvkp81p7.apps.googleusercontent.com',
        'offline': true
      }).then(response => {
        console.log('Google login response:', response);
        // Send the token to your backend for verification and user creation
        return this.sendRequest({
          method: 'post',
          url: 'google-signin',
          data: { token: response.idToken }
        });
      }).catch(error => {
        console.error('Google login error:', error);
        throw error;
      });
    } else {
      // Fallback for web browser
      return new Promise((resolve, reject) => {
        this.loadGoogleAuthLibrary().then(() => {
          const auth2 = gapi.auth2.getAuthInstance();
          auth2.signIn().then((googleUser: any) => {
            const idToken = googleUser.getAuthResponse().id_token;
            console.log('Google login response:', googleUser);
            // Send the token to your backend for verification and user creation
            this.sendRequest({
              method: 'post',
              url: 'google-signin',
              data: { token: idToken }
            }).then(resolve).catch(reject);
          }).catch((error: any) => {
            console.error('Google login error:', error);
            reject(error);
          });
        }).catch((error: any) => {
          console.error('Google Auth Library load error:', error);
          reject(error);
        });
      });
    }
  }

  googleSignUp() {
    if (this.platform.is('cordova')) {
      return this.googlePlus.login({
        'webClientId': '785598983692-igiasirmagu9p3du2a04j67nfvkp81p7.apps.googleusercontent.com',
        'offline': true
      }).then(response => {
        console.log('Google login response:', response);
        // Send the token to your backend for verification and user creation
        return this.sendRequest({
          method: 'post',
          url: 'google-signup',
          data: { token: response.idToken }
        });
      }).catch(error => {
        console.error('Google signup error:', error);
        throw error;
      });
    } else {
      // Fallback for web browser
      return new Promise((resolve, reject) => {
        this.loadGoogleAuthLibrary().then(() => {
          const auth2 = gapi.auth2.getAuthInstance();
          auth2.signIn().then((googleUser: any) => {
            const idToken = googleUser.getAuthResponse().id_token;
            console.log('Google login response:', googleUser);
            // Send the token to your backend for verification and user creation
            this.sendRequest({
              method: 'post',
              url: 'google-signup',
              data: { token: idToken }
            }).then(resolve).catch(reject);
          }).catch((error: any) => {
            console.error('Google signup error:', error);
            reject(error);
          });
        }).catch((error: any) => {
          console.error('Google Auth Library load error:', error);
          reject(error);
        });
      });
    }
  }

  async firebaseSignup(email, password, profile) {
    try {
      const displayName = `${profile.firstName} ${profile.lastName}`;
      const fbUser = await this.firebaseSvc.signUp(email, password, displayName);
      const idToken = await fbUser.getIdToken();
      return await this.sendRequest({
        method: 'post',
        url: 'firebase-login',
        data: { idToken, profile }
      });
    } catch (err) {
      throw this.handleAuthError(err);
    }
  }

  async firebaseSignin(email, password, syncMongoPassword = false) {
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

  private handleAuthError(err: any) {
    console.error('Auth error caught in AuthService:', err);
    
    // Handle Firebase specific error codes
    if (err && err.code) {
      switch (err.code) {
        case 'auth/user-not-found':
          return { message: 'No account found with this email. Please sign up first.' };
        case 'auth/wrong-password':
          return { message: 'Incorrect password. Please try again.' };
        case 'auth/invalid-email':
          return { message: 'The email address is badly formatted.' };
        case 'auth/user-disabled':
          return { message: 'This account has been disabled. Please contact support.' };
        case 'auth/email-already-in-use':
          return { message: 'An account with this email already exists. Please sign in instead.', code: 'email-already-in-use' };
        case 'auth/weak-password':
          return { message: 'The password is too weak. Please use at least 8 characters.' };
        case 'auth/network-request-failed':
          return { message: 'Network error. Please check your internet connection.' };
        case 'auth/too-many-requests':
          return { message: 'Too many failed attempts. Please try again later.' };
        case 'auth/invalid-login-credentials':
          return { message: 'Invalid email or password. Please check your credentials.' };
        default:
          return { message: err.message || 'Authentication failed. Please try again.' };
      }
    }

    // If it's already a formatted error from our backend
    if (err && err.error && typeof err.error === 'string') {
      return err;
    }

    return err;
  }

  async firebaseResetPassword(email) {
    return this.firebaseSvc.resetPassword(email);
  }

  async resendVerification() {
    return this.firebaseSvc.resendVerification();
  }

  async checkVerification() {
    const fbUser = await this.firebaseSvc.reloadUser();
    if (fbUser && fbUser.emailVerified) {
      const idToken = await this.firebaseSvc.getIdToken(true); // Force refresh to get updated email_verified claim
      return await this.sendRequest({
        method: 'post',
        url: 'firebase-login',
        data: { idToken }
      });
    }
    return null;
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

  getUserId(): string {
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
