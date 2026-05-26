import { devLogger } from "src/app/utils/dev-logger";
import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  User as FirebaseUser
} from 'firebase/auth';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private auth;

  constructor() {
    const firebaseConfig = {
      apiKey: "AIzaSyCswx6wNkbKdJ9ZQlw7WyEjSIqaAR66y0g",
      authDomain: "folcen-8fd1c.firebaseapp.com",
      projectId: "folcen-8fd1c",
      storageBucket: "folcen-8fd1c.firebasestorage.app",
      messagingSenderId: "309126815402",
      appId: "1:309126815402:android:825e97660fdf00e09fbad3"
    };

    const app = initializeApp(firebaseConfig);
    this.auth = getAuth(app);
  }

  getAuth() {
    return this.auth;
  }

  async signUp(email: string, password: string, displayName?: string) {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    if (displayName) {
      await updateProfile(userCredential.user, { displayName }).catch(err => devLogger.error('Update profile error:', err));
    }
    await sendEmailVerification(userCredential.user);
    return userCredential.user;
  }

  async signIn(email: string, password: string) {
    devLogger.log('[DEBUG] FirebaseService: signIn called for:', email);
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      devLogger.log('[DEBUG] FirebaseService: signInWithEmailAndPassword success');
      return userCredential.user;
    } catch (error) {
      devLogger.error('[DEBUG] FirebaseService: signInWithEmailAndPassword error:', error);
      throw error;
    }
  }

  async logout() {
    return signOut(this.auth);
  }

  async resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  async resendVerification() {
    if (this.auth.currentUser) {
      return sendEmailVerification(this.auth.currentUser);
    } else {
      throw new Error('No user logged in to Firebase');
    }
  }

  async reloadUser() {
    if (this.auth.currentUser) {
      await this.auth.currentUser.reload();
      return this.auth.currentUser;
    }
    return null;
  }

  async getIdToken(forceRefresh: boolean = false): Promise<string | null> {
    const user = this.auth.currentUser;
    if (user) {
      return user.getIdToken(forceRefresh);
    }
    return null;
  }

  onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(this.auth, callback);
  }

  /**
   * Returns a Promise that resolves to the current Firebase user (or null)
   * once Firebase has finished restoring auth state from persistence.
   * Required in Firebase 9.x — authStateReady() was only added in v10.1.
   */
  waitForAuthReady(): Promise<FirebaseUser | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  /**
   * Delete the currently signed-in Firebase user.
   * Called to keep Firebase in sync with MongoDB when a backend failure
   * prevents the MongoDB record from being created.
   */
  async deleteCurrentUser(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      await deleteUser(user);
    }
  }
}
