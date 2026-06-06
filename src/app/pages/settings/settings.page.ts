import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { AlertController, ModalController } from '@ionic/angular';
import constants from 'src/app/helpers/constants';
import { User } from 'src/app/models/User';
import { AuthService } from 'src/app/services/auth.service';
import { SocketService } from 'src/app/services/socket.service';
import { ToastService } from 'src/app/services/toast.service';
import { UserService } from 'src/app/services/user.service';
import { ThemeService } from 'src/app/services/theme.service';
import { IdService } from 'src/app/services/id.service';
import { PrivacyPolicyComponent } from '../privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from '../terms-of-service/terms-of-service.component';
import { Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { GuidedTourService } from 'src/app/services/guided-tour.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit, OnDestroy {
  readonly features = environment.features;
  appVersion = constants.VERSION;
  user: User;
  socket: Socket | null = null; // Use the Socket type from socket.io-client
  pageLoading = false;
  ageVisibility = false;
  randomVisibility: boolean;
  allowVideoRequestsFromNonFriends = true;
  isPrivate = false;
  loading = false;
  isUpdating = false;
  isLightMode = false;
  private destroy$ = new Subject<void>();
  private syncingToggleState = false;
  private retryingVideoRequestSetting = false;
  blockedUsers: any[] = [];
  blockedLoading = false;

  constructor(
    private alertController: AlertController,
    private nativeStorage: NativeStorage,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router,
    private auth: AuthService,
    private modalCtrl: ModalController,
    private themeService: ThemeService,
    private changeDetectorRef: ChangeDetectorRef
    , private idService: IdService,
    private guidedTour: GuidedTourService
  ) {}

  async ngOnInit() {
    await this.initializeSocket(); // Initialize the WebSocket
    this.isLightMode = this.themeService.getTheme() === 'light';
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleTheme(event: any) {
    const theme = event.detail.checked ? 'light' : 'dark';
    this.themeService.setTheme(theme);
    this.isLightMode = theme === 'light';
  }

  async ionViewWillEnter() {
    this.pageLoading = true;
    await this.getUser();
  }

  async openBlockedModal() {
    const modal = await this.modalCtrl.create({
      component: (await import('./blocked-users-modal/blocked-users-modal.component')).BlockedUsersModalComponent,
      cssClass: 'blocked-users-modal'
    });

    modal.onDidDismiss().then((res) => {
      if (res && res.data && res.data.goToProfile) {
        const id = res.data.goToProfile;
        this.router.navigate(['/profile/display', this.idService.encodeForTransport(id)]);
      }
    });

    await modal.present();
  }

  async openAvatarCustomize() {
    const modal = await this.modalCtrl.create({
      component: (await import('../../components/avatar-customize-modal/avatar-customize-modal.component')).AvatarCustomizeModalComponent,
      componentProps: { profile: this.user }
    });
    await modal.present();
  }

  regenerateAvatar() {
    const newSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    this.userService.updateProfile({ avatarSeed: newSeed }).subscribe({
      next: () => this.toastService.presentSuccessToastr('Avatar regenerated'),
      error: () => this.toastService.presentErrorToastr('Failed to regenerate avatar')
    });
  }

  loadBlockedUsers() {
    try {
      this.blockedLoading = true;
      const cu = this.userService.currentUserValue;
      const blocked = (cu && cu.blockedUsers) ? cu.blockedUsers : [];
      this.blockedUsers = [];
      if (!blocked || !blocked.length) {
        this.blockedLoading = false;
        return;
      }

      let pending = blocked.length;
      blocked.forEach((id: any) => {
        let nid = id;
        try { nid = this.idService.normalizeId(id) || String(id); } catch (e) { nid = String(id); }
        this.userService.getUserProfile(nid).subscribe({
          next: (u: any) => {
            if (u) this.blockedUsers.push(u);
            pending -= 1; if (pending === 0) this.blockedLoading = false;
          },
          error: () => { pending -= 1; if (pending === 0) this.blockedLoading = false; }
        });
      });
    } catch (e) { this.blockedLoading = false; }
  }

  unblockUser(user: any) {
    const id = user?._id || user?.id;
    if (!id) return;
    this.userService.unblock(id).subscribe({
      next: () => {
        this.toastService.presentSuccessToastr('User unblocked');
        this.blockedUsers = this.blockedUsers.filter(u => (u._id || u.id) !== id);
        // Invalidate profile cache for the unblocked user and refresh lists
        try { this.userService.invalidateProfile(String(id)); } catch (e) {}
        try { this.userService.triggerFriendsRefresh(); } catch (e) {}
        this.userService.refreshCurrentUser({ forceRefresh: true }).subscribe(()=>{}, ()=>{});
      },
      error: (err) => {
        console.error('Error unblocking user', err);
        this.toastService.presentErrorToastr('Error unblocking user');
      }
    });
  }

  async initializeSocket() {
    try {
      this.socket = await SocketService.getSocket(); // Await the WebSocket instance
    } catch (error) {
      console.error('⚠️ Failed to initialize WebSocket:', error);
    }
  }

  async getUser() {
    try { this.userService.refreshCurrentUser({ forceRefresh: true }).subscribe(() => {}, () => {}); } catch (e) {}
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.user = user;
        this.pageLoading = false;
        
        // Only update local toggle states if we are not currently in the middle of an update
        if (!this.isUpdating) {
          this.syncingToggleState = true;
          const savedVideoRequestValue = this.getSavedVideoRequestSetting(user);
          this.randomVisibility = this.user.randomVisible;
          this.allowVideoRequestsFromNonFriends = savedVideoRequestValue !== null
            ? savedVideoRequestValue
            : this.user.allowVideoRequestsFromNonFriends !== false;
          this.user.allowVideoRequestsFromNonFriends = this.allowVideoRequestsFromNonFriends;
          this.ageVisibility = this.user.ageVisible;
          this.isPrivate = this.user.isPrivate;
          setTimeout(() => this.syncingToggleState = false, 0);
          this.retryVideoRequestSettingIfNeeded(savedVideoRequestValue, user);
        }
        
        this.changeDetectorRef.detectChanges();
      }
    });
  }

  async changeEmail() {
    const alert = await this.alertController.create({
      header: 'Change Email',
      message: 'Your current email is: ' + this.user.email,
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Your new email here',
        },
        {
          name: 'current_password',
          type: 'password',
          placeholder: 'Enter your current password',
        },
      ],
      buttons: [
        {
          text: 'CANCEL',
          cssClass: 'text-dark',
          role: 'cancel',
        },
        {
          text: 'CHANGE',
          handler: (res) => {
            this.loading = true;

            // Validate email input
            if (!res.email || res.email.trim() === '') {
              this.loading = false;
              this.toastService.presentErrorToastr('Email is required.');
              return false;
            }

            // Validate password input
            if (!res.current_password || res.current_password.trim() === '') {
              this.loading = false;
              this.toastService.presentErrorToastr('Password is required to change email.');
              return false;
            }

            // Make API call to update email
            this.userService.updateEmail(this.user._id, res.email, res.current_password).subscribe(
              (resp: any) => {
                console.log('API response:', resp);

                // Ensure the response has the expected data structure
                if (resp && resp.data && resp.data.email) {
                  this.toastService.presentSuccessToastr('Email changed successfully.');
                  this.user.email = resp.data.email;
                    // Use centralized userService to persist authenticated user safely
                    try { this.userService.setCurrentUser(this.user); } catch(e) {}
                } else {
                  this.toastService.presentErrorToastr('Unexpected response format.');
                }

                this.loading = false;
              },
              (err) => {
                console.error('Error updating email:', err);
                this.loading = false;

                // Handle error response more gracefully
                if (err.error && err.error.message) {
                  // Specific error message from the server
                  this.toastService.presentErrorToastr(`Error: ${err.error.message}`);
                } else if (err.status === 400) {
                  // Bad Request errors
                  this.toastService.presentErrorToastr(
                    'Invalid email format. Please enter a valid email address.'
                  );
                } else if (err.status === 409) {
                  // Conflict (e.g., email already in use)
                  this.toastService.presentErrorToastr(
                    'This email is already registered. Please try a different one.'
                  );
                } else if (err.status === 500) {
                  // Server error
                  this.toastService.presentErrorToastr('Server error. Please try again later.');
                } else {
                  // General error fallback
                  this.toastService.presentErrorToastr(
                    'An unexpected error occurred while updating your email. Please try again.'
                  );
                }
              }
            );
          },
        },
      ],
    });
    await alert.present();
  }

  async changePassword() {
    const alert = await this.alertController.create({
      header: 'Change Password',
      message: 'Change your password regularly for safety',
      inputs: [
        {
          name: 'current_password',
          type: 'password',
          placeholder: 'Old Password',
        },
        {
          name: 'password',
          type: 'password',
          placeholder: 'New Password',
        },
        {
          name: 'password_confirmation',
          type: 'password',
          placeholder: 'Confirm New Password',
        },
      ],
      buttons: [
        {
          text: 'CANCEL',
          cssClass: 'text-dark',
          role: 'cancel',
        },
        {
          text: 'CHANGE',
          handler: (res) => {
            this.loading = true;

            // Validate the input
            if (!res.current_password || !res.password || !res.password_confirmation) {
              this.loading = false;
              this.toastService.presentErrorToastr('All fields are required.');
              return false;
            }

            if (res.password !== res.password_confirmation) {
              this.loading = false;
              this.toastService.presentErrorToastr('New password and confirmation do not match.');
              return false;
            }

            // Make API call to update the password
            this.userService
              .updatePassword(this.user._id, {
                current_password: res.current_password,
                password: res.password,
                password_confirmation: res.password_confirmation,
              })
              .subscribe(
                (resp: any) => {
                  this.loading = false;
                  this.toastService.presentSuccessToastr(resp.message || 'Password changed successfully.');
                },
                (err) => {
                  console.error('Error updating password:', err);
                  this.loading = false;

                  // Display the error message based on the error status or structure
                  if (err.error && err.error.message) {
                    this.toastService.presentErrorToastr(err.error.message);
                  } else if (err.status === 400) {
                    this.toastService.presentErrorToastr('Current password is incorrect.');
                  } else {
                    this.toastService.presentErrorToastr('An error occurred while updating the password.');
                  }
                }
              );
          },
        },
      ],
    });

    await alert.present();
  }

  async signout() {
    this.loading = true;
    console.log('Signout process started');
    try {
      // 1. Notify server
      try { await this.auth.signout(); } catch (e) { console.warn('Server signout failed', e); }
      
      // 2. Perform full client-side cleanup
      await this.auth.logout();
      
      this.loading = false;
      console.log('Signout successful');
    } catch (err) {
      this.loading = false;
      console.error('Signout error:', err);
      this.toastService.presentErrorToastr('Sorry, an error has occurred. Please try again later.');
      // Fallback to basic logout if something fails
      this.auth.logout();
    }
  }

  toggleRandomVisibility(event) {
    const newValue = event.detail.checked;
    if (newValue === this.user.randomVisible) return;

    this.randomVisibility = newValue;
    this.loading = true;
    this.isUpdating = true;
    this.userService.updateRandomVisibility(this.user._id, newValue).subscribe(
      (resp: any) => {
        if (resp && resp.data) {
          this.userService.setCurrentUser(resp.data);
        } else {
          this.user.randomVisible = newValue;
          this.userService.setCurrentUser(this.user);
        }
        this.toastService.presentSuccessToastr(resp.message || 'Visibility updated');
        this.loading = false;
        // Keep isUpdating true for a bit longer to let all streams settle
        setTimeout(() => {
          this.isUpdating = false;
          this.changeDetectorRef.detectChanges();
        }, 1000);
      },
      (err) => {
        this.loading = false;
        this.isUpdating = false;
        this.randomVisibility = this.user.randomVisible; // Revert on error
        this.toastService.presentErrorToastr(err.message || 'Error updating visibility');
      }
    );
  }

  toggleAgeVisibility(event) {
    const newValue = event.detail.checked;
    if (newValue === this.user.ageVisible) return;

    this.ageVisibility = newValue;
    this.loading = true;
    this.isUpdating = true;
    this.userService.updateAgeVisibility(newValue).subscribe(
      (resp: any) => {
        if (resp && resp.data) {
          this.userService.setCurrentUser(resp.data);
        } else {
          this.user.ageVisible = newValue;
          this.userService.setCurrentUser(this.user);
        }
        this.toastService.presentSuccessToastr(resp.message || 'Age visibility updated');
        this.loading = false;
        // Keep isUpdating true for a bit longer to let all streams settle
        setTimeout(() => {
          this.isUpdating = false;
          this.changeDetectorRef.detectChanges();
        }, 1000);
      },
      (err) => {
        this.loading = false;
        this.isUpdating = false;
        this.ageVisibility = this.user.ageVisible; // Revert on error
        this.toastService.presentErrorToastr(err.message || 'Error updating age visibility');
      }
    );
  }

  toggleNonFriendVideoRequests(event) {
    const checked = event?.detail?.checked;
    if (this.syncingToggleState || typeof checked !== 'boolean' || this.isUpdating || !this.user) return;

    const newValue = checked;
    const previousValue = this.user.allowVideoRequestsFromNonFriends !== false;
    if (newValue === previousValue) return;

    this.allowVideoRequestsFromNonFriends = newValue;
    this.user.allowVideoRequestsFromNonFriends = newValue;
    this.saveVideoRequestSetting(newValue, this.user);
    this.userService.setCurrentUser(this.user, { force: true });
    this.loading = true;
    this.isUpdating = true;
    this.userService.updateNonFriendVideoRequests(newValue).subscribe(
      (resp: any) => {
        const updatedUser = resp?.data || resp?.user || null;
        if (resp && resp.data) {
          this.user = new User().initialize(updatedUser);
        } else {
          this.user.allowVideoRequestsFromNonFriends = newValue;
        }
        this.user.allowVideoRequestsFromNonFriends = newValue;
        this.allowVideoRequestsFromNonFriends = newValue;
        this.saveVideoRequestSetting(newValue, this.user);
        this.userService.setCurrentUser(this.user, { force: true });
        this.toastService.presentSuccessToastr(resp.message || 'Video request setting updated');
        this.loading = false;
        setTimeout(() => {
          this.isUpdating = false;
          this.changeDetectorRef.detectChanges();
        }, 500);
      },
      (err) => {
        this.loading = false;
        this.isUpdating = false;
        this.allowVideoRequestsFromNonFriends = previousValue;
        this.saveVideoRequestSetting(previousValue, this.user);
        this.toastService.presentErrorToastr(err.message || 'Error updating video request setting');
      }
    );
  }

  private videoRequestSettingKey(userLike?: any): string {
    const id = userLike?._id || userLike?.id || this.user?._id || this.user?.id || this.userService.getCurrentUserId() || 'unknown';
    return `folcen.videoRequests.allow.${id}`;
  }

  private getSavedVideoRequestSetting(userLike?: any): boolean | null {
    try {
      const raw = localStorage.getItem(this.videoRequestSettingKey(userLike));
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch (_) {}
    return null;
  }

  private saveVideoRequestSetting(value: boolean, userLike?: any): void {
    try { localStorage.setItem(this.videoRequestSettingKey(userLike), value ? 'true' : 'false'); } catch (_) {}
  }

  private retryVideoRequestSettingIfNeeded(savedValue: boolean | null, userLike?: any): void {
    if (savedValue === null || this.retryingVideoRequestSetting) return;
    const serverValue = userLike?.allowVideoRequestsFromNonFriends !== false;
    if (serverValue === savedValue) return;

    this.retryingVideoRequestSetting = true;
    this.userService.updateNonFriendVideoRequests(savedValue).subscribe({
      next: () => { this.retryingVideoRequestSetting = false; },
      error: () => { this.retryingVideoRequestSetting = false; }
    });
  }

  togglePrivacy(event) {
    const newValue = event.detail.checked;
    if (newValue === this.user.isPrivate) return;

    this.isPrivate = newValue;
    this.loading = true;
    this.isUpdating = true;
    this.userService.updatePrivacy(newValue).subscribe(
      (resp: any) => {
        if (resp && resp.data) {
          this.userService.setCurrentUser(resp.data);
        } else {
          this.user.isPrivate = newValue;
          this.userService.setCurrentUser(this.user);
        }
        this.toastService.presentSuccessToastr(resp.message || 'Privacy settings updated');
        this.loading = false;
        // Keep isUpdating true for a bit longer to let all streams settle
        setTimeout(() => {
          this.isUpdating = false;
          this.changeDetectorRef.detectChanges();
        }, 1000);
      },
      (err) => {
        this.loading = false;
        this.isUpdating = false;
        this.isPrivate = this.user.isPrivate; // Revert on error
        this.toastService.presentErrorToastr(err.message || 'Error updating privacy settings');
      }
    );
  }

  async openPrivacyPolicy() {
    const modal = await this.modalCtrl.create({
      component: PrivacyPolicyComponent,
    });

    await modal.present();
  }

  async openTermsOfService() {
    const modal = await this.modalCtrl.create({
      component: TermsOfServiceComponent,
    });

    await modal.present();
  }

  async replayGuideTour() {
    await this.guidedTour.replay();
  }

  async deleteAccount() {
    const alert = await this.alertController.create({
      header: 'Delete Account',
      message:
        'Your account will be deactivated immediately and you will be signed out. You can restore it by logging in again before the retention period ends. After deletion, we will show you the exact number of days remaining before permanent removal.',
      buttons: [
        {
          text: 'cancel',
          role: 'cancel',
        },
        {
          text: 'delete account',
          cssClass: 'text-danger',
          handler: () => {
            this.userService.deleteAccount().subscribe(
              async (resp) => {
                try {
                  const days = resp && resp.data && resp.data.retentionDays ? resp.data.retentionDays : null;
                  const msg = days
                    ? `Your account is scheduled for permanent deletion in ${days} days. You can restore it any time before then by signing in again.`
                    : 'Your account has been deleted.';
                  // store a short-lived notice so the signin page can show it after navigation
                  try { localStorage.setItem('deletionNotice', JSON.stringify({ message: msg, expiresAt: Date.now() + 24 * 3600 * 1000 })); } catch (e) {}
                  const confirmAlert = await this.alertController.create({
                    header: 'Account Scheduled For Deletion',
                    message: msg,
                    buttons: [{
                      text: 'OK',
                      handler: () => this.signout()
                    }]
                  });
                  await confirmAlert.present();
                } catch (e) {}
              },
              (err) => {
                const msg = err?.error?.message || err?.message || 'Failed to delete account. Please try again.';
                this.toastService.presentErrorToastr(msg);
              }
            );
          },
        },
      ],
    });
    await alert.present();
  }
}
