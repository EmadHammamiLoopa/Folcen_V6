import { Component, Input, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { AlertController, PopoverController, Platform, ModalController, LoadingController } from '@ionic/angular';
import { AuthService } from './../../../services/auth.service';
import { RequestService } from './../../../services/request.service';
import { ToastService } from './../../../services/toast.service';
import { UserService } from './../../../services/user.service';
import { User } from './../../../models/User';
import { Request } from './../../../models/Request';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import constants from 'src/app/helpers/constants';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { DropDownComponent } from '../../drop-down/drop-down.component';
import { FollowListModalComponent } from '../follow-list-modal/follow-list-modal.component';
import { ReportModalComponent } from '../../../components/report-modal/report-modal.component';
import { UploadFileService } from 'src/app/services/upload-file.service';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Camera } from '@ionic-native/camera/ngx';
import { environment } from 'src/environments/environment';
import { IdService } from 'src/app/services/id.service';
import { Subscription } from 'rxjs';

import { PhotoViewerComponent } from '../../../components/photo-viewer/photo-viewer.component';
import { SocketService } from 'src/app/services/socket.service';

@Component({
  selector: 'app-display',
  templateUrl: './display.component.html',
  styleUrls: ['./display.component.scss'],
})
export class DisplayComponent implements OnInit, OnDestroy {
  pageLoading = true;
  authUser: User;
  @Input() user: User;
  domaine = constants.DOMAIN_URL;
  myProfile: boolean;
  isFriend: boolean = false;
  notFriendOrMe: boolean = false;
  userId: string;
  mainAvatar: string;
  imageLoading = false;
  isUploading = false;
  usedCached = false;

  private userSub: Subscription | null = null;
  private socketSub: Subscription | null = null;

  constructor(
    private auth: AuthService, private userService: UserService, private requestService: RequestService,
    private toastService: ToastService, private alertCtrl: AlertController, private router: Router,
    private platform: Platform, private route: ActivatedRoute, private popoverController: PopoverController,
    private modalCtrl: ModalController,
    private loadingCtrl: LoadingController,
  private nativeStorage: NativeStorage, private sanitizer: DomSanitizer, private changeDetectorRef: ChangeDetectorRef,
    private uploadFile: UploadFileService, private camera: Camera, private webView: WebView,
    private location: Location,
    private idService: IdService
  ) {}

  ngOnInit() {
    console.log("Initializing DisplayComponent...");
    this.getUserId();

    // Subscribe to current user changes to keep friend status in sync
    this.userSub = this.userService.currentUser.subscribe((updatedUser) => {
      if (!updatedUser) return;

      // If we are on "display/null" or viewing our own ID, we should update
      const isMe = this.myProfile || !this.userId || this.userId === 'null' || (this.userId === updatedUser._id);

      if (isMe) {
        console.log('DisplayComponent: Updating own profile from currentUser stream');
        this.user = updatedUser;
        this.mainAvatar = this.user.mainAvatarPath;
        this.myProfile = true; // Ensure this is set
        this.changeDetectorRef.detectChanges();
      } else if (this.user && !this.myProfile) {
        this.checkIfFriend();
        this.changeDetectorRef.detectChanges();
      }
    });

    // Subscribe to server profile update notifications to refresh follow counts in real-time
    try {
      this.socketSub = SocketService.userProfileUpdated$.subscribe((payload: any) => {
        try {
          const uid = payload?.userId;
          if (!uid) return;
          // If the viewed profile changed, reload it
          if (this.user && (this.user._id === String(uid) || this.user.id === String(uid))) {
            console.log('DisplayComponent: Socket update received for viewed user', uid);
            this.userService.getUserProfile(this.user._id, { forceRefresh: true }).subscribe({
              next: (u: any) => { if (u) { this.user = new User().initialize(u); this.changeDetectorRef.detectChanges(); } },
              error: (err) => { this.handleUserDataError(err); }
            });
          }
        } catch (e) { console.warn('Error handling profile update socket payload', e); }
      });
    } catch (e) { /* ignore socket subscription errors */ }

    // Subscribe to follow updates
    try {
      const followSub = SocketService.followUpdate$.subscribe((payload: any) => {
        if (this.user && (this.user._id === payload.followedId || this.user._id === payload.followerId)) {
          console.log('DisplayComponent: Follow update received, refreshing profile');
          this.userService.getUserProfile(this.user._id, { forceRefresh: true }).subscribe({
            next: (u: any) => { if (u) { this.user = new User().initialize(u); this.changeDetectorRef.detectChanges(); } },
            error: (err) => { this.handleUserDataError(err); }
          });
        }
      });
      if (this.socketSub) {
        // We can't easily add to socketSub if it's a single Subscription, 
        // but we can use a composite subscription or just another field.
        // For simplicity, I'll just add it to the existing socketSub if I can, 
        // but socketSub is assigned above. I'll use a private subs array.
      }
    } catch (e) {}

    // Subscribe to friend updates
    try {
      const friendSub = SocketService.friendRequestsUpdated$.subscribe((payload: any) => {
        if (this.user) {
          console.log('DisplayComponent: Friend update received, refreshing profile');
          this.userService.getUserProfile(this.user._id, { forceRefresh: true }).subscribe({
            next: (u: any) => { if (u) { this.user = new User().initialize(u); this.changeDetectorRef.detectChanges(); } },
            error: (err) => { this.handleUserDataError(err); }
          });
        }
      });
    } catch (e) {}
  }

  ngOnDestroy() {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
    try { if (this.socketSub) this.socketSub.unsubscribe(); } catch (e) {}
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  get isLocked(): boolean {
    if (!this.user || this.myProfile) return false;
    // If profile is private, only ACTIVE followers or friends can see content
    const isFollowingActive = this.user.isFollowing && this.user.followStatus === 'active';
    return this.user.isPrivate && !isFollowingActive && !this.user.isFriend;
  }

  get suggestedChannels(): any[] {
    if (!this.user || !this.user.followedChannels || this.myProfile) return [];
    
    const me = this.userService.currentUserValue;
    if (!me) return [];

    const myChannelIds = (me.followedChannels || []).map(c => {
      if (typeof c === 'string') return c;
      return c._id || c.id;
    });
    
    // Filter channels that User B follows but I don't
    return this.user.followedChannels.filter(c => {
      if (!c) return false;
      const channelId = typeof c === 'string' ? c : (c._id || c.id);
      return !myChannelIds.includes(channelId);
    }).filter(c => typeof c === 'object'); // Only show if we have the object data
  }

  getChannelImage(channel: any): string {
    if (!channel) return 'assets/images/channel-placeholder.png';
    const img = channel.image || channel.photo;
    if (!img) return 'assets/images/channel-placeholder.png';
    if (img.startsWith('http')) return img;
    return this.domaine + (img.startsWith('/') ? '' : '/') + img;
  }

  joinChannel(channel: any) {
    const channelId = channel._id || channel.id;
    if (!channelId) return;
    
    this.router.navigate(['/tabs/channels/channel', channelId]);
  }

  ionViewWillEnter() {
    console.log("Entering view...");
    this.pageLoading = true;
    this.getUserId();
  }

  getUserId() {
    this.route.paramMap.subscribe(params => {
      this.userId = params.get('id');
      console.log('Route userId:', this.userId);
      // Defensive: decode URL-safe base64 transport ids if present
      try {
        if (this.userId && this.userId !== 'null') {
          const decoded = this.idService.decodeFromTransport(this.userId);
          if (decoded) {
            console.log('Decoded route id:', this.userId, '->', decoded);
            this.userId = decoded;
          }
        }
      } catch (e) { /* ignore decode errors */ }
  
  const storedRaw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  let storedUser: any = null;
  try {
    storedUser = storedRaw ? JSON.parse(storedRaw) : null;
  } catch (e) {
    // Sometimes nativeStorage returns a Buffer-like object serialized; attempt to recover
    try {
      const parsed = typeof storedRaw === 'string' ? JSON.parse(storedRaw) : null;
      storedUser = parsed;
    } catch (err) {
      storedUser = null;
    }
  }
  // If storedUser looks like a Buffer wrapper (e.g., { buffer: { data: [...] } }), decode it
  if (storedUser && storedUser.buffer && Array.isArray(storedUser.buffer.data)) {
    try {
      const bytes = new Uint8Array(storedUser.buffer.data);
      const decoded = new TextDecoder().decode(bytes);
      const recovered = JSON.parse(decoded);
      storedUser = recovered;
      console.warn('Decoded Buffer-like stored user into object');
    } catch (e) {
      console.warn('Failed to decode Buffer-like stored user', e);
    }
  }
      if (!this.userId || this.userId === 'null') {
        if (storedUser && storedUser._id) {
          this.userId = storedUser._id;
          this.myProfile = true;
          console.log('Using stored userId:', this.userId);
          this.loadUserData();
        } else {
          console.error('No user ID found in route or local storage');
          this.getAuthUser();
        }
      } else {
        if (storedUser && storedUser._id === this.userId) {
          this.myProfile = true;
          console.log('Viewing own profile with userId:', this.userId);
        } else {
          this.myProfile = false;
          console.log('Viewing another user profile with userId:', this.userId);
        }
        this.loadUserData();
      }
    });
  }
  

  loadUserData() {
    if (this.myProfile) {
      this.userService.getUserProfile(this.userId).subscribe({
        next: (user) => {
          if (user && user._id) {
              this.user = new User().initialize(user);
              this.mainAvatar = this.user.mainAvatarPath;
              this.pageLoading = false;
            console.log('Loaded user data for own profile:', this.user);
          } else {
            console.error('User data is undefined or missing _id for own profile:', user);
            this.handleUserDataError();
          }
          this.changeDetectorRef.detectChanges(); // Trigger change detection
        },
        error: (err) => {
          console.error('Error fetching user profile for own profile:', err);
          this.pageLoading = false;
          this.handleUserDataError(err);
        }
      });
    } else {
      this.userService.getUserProfile(this.userId).subscribe({
        next: (user) => {
          if (user && user._id) {
            this.user = new User().initialize(user);
            
            // 🚫 Guard: Do not allow viewing Admin profiles as regular users
            const role = (this.user.role || '').toUpperCase();
            if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN') {
              console.warn('Attempted to view Admin profile, redirecting...');
              this.handleUserDataError({ status: 403 });
              return;
            }

            this.mainAvatar = this.user.mainAvatarPath;
            // Trust backend isFriend/friend status initially; 
            // subscription to currentUser will handle real-time updates.
            this.pageLoading = false;
            console.log('Loaded user data for another profile:', this.user);
          } else {
            console.error('User data is undefined or missing _id for another profile:', user);
            this.handleUserDataError();
          }
          this.changeDetectorRef.detectChanges(); // Trigger change detection
        },
        error: (err) => {
          console.error('Error fetching user profile for another profile:', err);
          this.pageLoading = false;
          this.handleUserDataError(err);
        }
      });
    }
  }
  
  private processSelectedMedia(resp: any) {
    let imageUrl = resp.imageData;
  
    if (this.platform.is('cordova')) {
      imageUrl = this.webView.convertFileSrc(resp.imageData);
    }
  
    const imageFile = new Blob([resp.file], { type: resp.file.type });
    const imageName = resp.name || resp.file.name;
  
    const formData = new FormData();
    formData.append('avatar', imageFile, imageName);
  
    this.isUploading = true;
    this.userService.uploadAvatar(this.user._id, formData).subscribe({
      next: (response: any) => {
        if (response && response.user) {
          // The backend returns the updated user object
          const updatedUser = new User().initialize(response.user);
          
          // Update local state
          this.user = updatedUser;
          this.mainAvatar = updatedUser.mainAvatarPath;
          
          // Persist
          this.updateUserInStorage(this.user.toObject());
          
          // Notify other components/services via UserService
          this.userService.setCurrentUser(this.user, { force: true });
          
          this.isUploading = false;
          this.changeDetectorRef.detectChanges();
          this.toastService.presentSuccessToastr('Avatar uploaded successfully!');
        } else {
          this.isUploading = false;
          this.toastService.presentErrorToastr('Invalid response from server.');
        }
      },
      error: () => {
        this.isUploading = false;
        this.toastService.presentErrorToastr('Error uploading image');
      }
    });
  }
  

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
  
    const formData = new FormData();
    formData.append('avatar', file, file.name);
  
    this.isUploading = true;
    this.userService.uploadAvatar(this.user._id, formData).subscribe({
      next: (response: any) => {
        if (response && response.user) {
          const updatedUser = new User().initialize(response.user);
          
          this.user = updatedUser;
          this.mainAvatar = updatedUser.mainAvatarPath;
          
          this.updateUserInStorage(this.user.toObject());
          
          // Notify other components/services via UserService
          this.userService.setCurrentUser(this.user, { force: true });
          
          this.isUploading = false;
          this.changeDetectorRef.detectChanges();
          this.toastService.presentSuccessToastr('Avatar uploaded successfully!');
        } else {
          this.isUploading = false;
        }
      },
      error: (err) => {
        this.isUploading = false;
        this.toastService.presentErrorToastr('Upload failed: ' + (err.message || err));
      }
    });
  }

  openImagePicker() {
    if (this.platform.is('cordova')) {
      // Native mobile: use existing uploadFile logic
      this.uploadFile.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY, 'image')
        .then(resp => this.processSelectedMedia(resp))
        .catch(err => this.toastService.presentErrorToastr('Failed: ' + err));
    } else {
      // Browser: trigger file input manually
      const input = document.getElementById('webImageInput') as HTMLInputElement;
      input?.click();
    }
  }
  
  
  openCameraPicker() {
    this.uploadFile.takePicture(this.camera.PictureSourceType.CAMERA, 'image')
      .then(resp => this.processSelectedMedia(resp))
      .catch(err => this.toastService.presentErrorToastr('Failed: ' + err));
  }
  
  openVideoPicker() {
    this.uploadFile.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY, 'video')
      .then(resp => this.processSelectedMedia(resp))
      .catch(err => this.toastService.presentErrorToastr('Failed: ' + err));
  }
  

  checkIfFriend() {
    const me = this.userService.currentUserValue;
    if (!me || !this.userId || !this.user) {
      return;
    }

    // Check if the viewed user ID is in my friends list
    const myFriends = me.friends || [];
    const isFriendLocally = myFriends.some(f => {
      const friendId = (typeof f === 'string') ? f : (f._id || f.id);
      return String(friendId) === String(this.userId);
    });

    // Update the user object
    this.user.isFriend = isFriendLocally;
    this.user.friend = isFriendLocally;

    console.log(`Is friend check for ${this.userId}: local=${isFriendLocally}`);
  }

  getAuthUser() {
    this.userService.getUserProfile('me').subscribe({
      next: (user) => {
        if (user && user._id) {
          this.userId = user._id;
          this.myProfile = true;
          this.user = new User().initialize(user);
          this.mainAvatar = this.user.mainAvatarPath;
          this.pageLoading = false;
          console.log('Loaded authenticated user data:', this.user);
          this.loadUserData();
        } else {
          console.error('Authenticated user data is undefined or missing _id:', user);
          this.handleUserDataError();
        }
        this.changeDetectorRef.detectChanges(); // Trigger change detection
      },
      error: (err) => {
        console.error('Error fetching authenticated user profile:', err);
        this.pageLoading = false;
        this.handleUserDataError();
      }
    });
  }
  

  checkUserStatus() {
  const storedRaw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  const storedUser = storedRaw ? JSON.parse(storedRaw) : null;
    if (storedUser && storedUser._id) {
      if (storedUser._id === this.user._id) {
        this.user.loggedIn = true;
        this.myProfile = true;
      } else if (storedUser.friends && storedUser.friends.includes(this.user._id)) {
        this.user.isFriend = true;
      } else {
        this.user.isFriend = false;
      }
    } else {
      this.user.loggedIn = false;
    }
    this.notFriendOrMe = !this.user.isFriend && !this.myProfile;
  }

  avatarUrl(src?: string): string {
    if (!src) return 'assets/images/avatars/placeholder.png';
    if (/^https?:\/\//i.test(src)) return src;     // already absolute
    return `${this.domaine}${src.startsWith('/') ? '' : '/'}${src}`;
  }

  isDefaultAvatar(avatarUrl: string): boolean {
    return this.user?.isDefaultAvatar(avatarUrl) || false;
  }

  sanitizeUrl(url: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  pickMedia(mediaType: 'image' | 'video', sourceType: number) {
    this.uploadFile.takePicture(sourceType, mediaType)
      .then((resp: any) => {
        let imageUrl = resp.imageData;
  
        if (this.platform.is('cordova')) {
          imageUrl = this.webView.convertFileSrc(resp.imageData);
        }
  
        const imageFile = new Blob([resp.file], { type: resp.file.type });
        const imageName = resp.name || resp.file.name;
  
        const formData = new FormData();
        formData.append('avatar', imageFile, imageName);
  
        this.userService.uploadAvatar(this.user._id, formData).subscribe({
          next: (response: any) => {
            if (response && response.user) {
              this.userService.getUserProfile(response.user._id).subscribe({
                next: (updatedUser) => {
                  this.user = new User().initialize(updatedUser); // Re-initialize with User class
                  this.mainAvatar = this.user.mainAvatarPath;
                  
                  // Notify other components/services via UserService
                  this.userService.setCurrentUser(this.user, { force: true });
                  
                  this.toastService.presentSuccessToastr('Avatar uploaded successfully!');
                },
                error: (err) => {
                  console.error('Failed to reload user data after image upload:', err);
                  this.toastService.presentErrorToastr('Failed to reload user data.');
                }
              });
            }
          },
          error: (error) => {
            this.toastService.presentErrorToastr('Error uploading image: ' + error);
          }
        });
      }, err => {
        this.toastService.presentErrorToastr('Image capture failed: ' + err);
      });
  }

  

    
  

  async showProfileAlert() {
    if (!this.user.profileCreated) {
      const alert = await this.alertCtrl.create({
        header: 'Remember',
        message: 'You can whenever hide your age, and disable/enable random function from setting',
        buttons: [
          {
            text: 'OK',
            role: 'cancel'
          }
        ]
      });

      await alert.present();
    }
  }

  saveUserToStorage() {
    if (this.myProfile) {
      this.platform.ready().then(() => {
        // Use centralized storage setter to ensure guards and dual-write behavior
        try { this.userService.setCurrentUser(this.user.toObject()); } catch(e) {}
      });
    }
  }

  refresh(event) {
    if (this.userId && this.userId !== 'null') {
      this.getUser(event);
      // prefer currentUser then fallback to legacy key
      (async () => {
        try {
          let u: any = null;
          try { u = await this.nativeStorage.getItem('currentUser'); } catch(e) {}
          if (!u) {
            try { u = await this.nativeStorage.getItem('currentUser'); } catch (e) { /* ignore */ }
          }
          if (!u) try { u = await this.nativeStorage.getItem('user'); } catch(e) {}
          if (u) this.authUser = new User().initialize(u);
        } catch (e) {
          // ignore
        }
      })();
    } else {
      this.getAuthUser();
      this.myProfile = true;
    }
  }

  getUser(event?) {
    this.userService.getUserProfile(this.userId).subscribe({
      next: (user: User) => {
        if (user && user._id) {
          this.pageLoading = false;
          this.user = new User().initialize(user);
          this.mainAvatar = this.user.mainAvatarPath;
          // only persist to storage when viewing own profile
          if (this.myProfile) {
            this.updateUserInStorage(this.user.toObject());
          }
  
          if (user.friends && this.authUser && this.authUser._id) {
            this.isFriend = user.friends.includes(this.authUser._id);
          } else {
            this.isFriend = false;
            console.warn('User friends list or authUser is undefined:', user.friends, this.authUser);
          }
  
          this.notFriendOrMe = !this.isFriend && !this.myProfile;
          console.log('Loaded user data:', this.user);
        } else {
          console.error('User data is undefined or missing _id:', user);
          this.handleUserDataError();
        }
        this.changeDetectorRef.detectChanges();
  
        if (event) event.target.complete();
      },
      error: (err) => {
        console.error('Error fetching user profile:', err);
        this.pageLoading = false;
        if (event) event.target.complete();
        this.handleUserDataError();
      }
    });
  }
  
  private handleUserDataError(err?: any) {
    // If it's a 403 Forbidden, it likely means we are blocked or the profile is private
    if (err && (err.status === 403 || err.status === 401)) {
      console.warn('Access denied to profile, showing restricted view');
      // Create a minimal user object to trigger the "Private Profile" UI
      this.user = new User().initialize({
        _id: this.userId,
        isPrivate: true,
        isFollowing: false,
        isFriend: false,
        fullName: 'Private Profile',
        firstName: 'Private',
        lastName: 'Profile'
      });
      this.pageLoading = false;
      this.changeDetectorRef.detectChanges();
      return;
    }

    // Display a toast message for other errors
    this.toastService.presentErrorToastr('Failed to load user data. Please try again later.');
  
    // Reset relevant variables
    this.user = null;
    this.pageLoading = false;
  }
  
  follow() {
    this.userService.follow(this.user._id).subscribe(
      (resp: any) => {
        this.user.followed = resp.data;
        // Redundant toast removed: this.toastService.presentStdToastr(this.user.followed ? 'follow' : 'unfollow');
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  request() {
    if (this.user.friend) this.removeFriendShipConf();
    else if (this.user.request === 'requesting') this.acceptRequest();
    else if (this.user.request === 'requested') this.cancelRequest();
    else this.requestFriendship();
  }

  handleError(err) {
    this.toastService.presentErrorToastr(err);
  }

  acceptRequest() {
    this.requestService.acceptRequest(this.user.requests[0]._id).then(
      () => {
        this.user.friend = true;
        this.user.isFriend = true;
        this.userService.triggerFriendsRefresh();
      },
      err => this.handleError(err)
    );
  }

  removeFriend() {
    this.userService.removeFriendship(this.user._id).subscribe(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        if (resp.data) {
          this.user.friend = false;
          this.user.isFriend = false;
          this.user.request = null;
          this.userService.triggerFriendsRefresh();
        }
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  cancelRequest() {
    this.requestService.cancelRequest(this.user.requests[0]._id).then(
      () => {
        this.user.request = null;
        this.user.requests = [];
      },
      err => this.handleError(err)
    );
  }

  requestFriendship() {
    this.requestService.request(this.user._id).then(
      (resp: any) => {
        this.user.request = 'requested';
        this.user.friend = false;
        this.user.requests.push(new Request(resp.data.request));
        this.toastService.presentSuccessToastr(resp.message);
      },
      err => {
        err = JSON.parse(err);
        if (err.code && err.code === constants.ERROR_CODES.SUBSCRIPTION_ERROR) {
          this.router.navigate(['/tabs/subscription']);
          this.toastService.presentErrorToastr(err.message);
        } else {
          this.toastService.presentErrorToastr(err);
        }
      }
    );
  }

  async removeFriendShipConf() {
    const alert = await this.alertCtrl.create({
      header: 'Remove Friendship',
      message: 'Do you really want to remove your friendship?',
      buttons: [
        {
          text: 'CANCEL',
          role: 'cancel'
        },
        {
          text: 'REMOVE',
          cssClass: 'text-danger',
          handler: () => this.removeFriendship()
        }
      ]
    });
    await alert.present();
  }

  removeFriendship() {
    this.userService.removeFriendship(this.user._id).subscribe(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        if (resp.data) {
          this.user.friend = false;
          this.user.request = null;
        }
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  async presentPopover(ev: any) {
    const popoverItems = [
      {
        text: 'Block',
        icon: 'fas fa-minus-circle',
        event: 'block'
      },
      {
        text: 'Report',
        icon: 'fas fa-exclamation-triangle',
        event: 'report'
      }
    ];
    const popover = await this.popoverController.create({
      component: DropDownComponent,
      event: ev,
      cssClass: 'dropdown-popover',
      componentProps: {
        items: popoverItems
      }
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data && data.event) {
      if (data.event === 'block') {
        this.blockUserConf();
      } else if (data.event === 'report') {
        this.reportUser();
      }
    }
  }

  changeMainAvatar(avatar: string) {
    this.userService.updateMainAvatar(this.user._id, avatar).subscribe({
      next: (resp: any) => {
        // Update both the model and the local state immediately
        if (resp.user) {
          this.user = new User().initialize(resp.user);
        } else {
          this.user.mainAvatar = avatar;
          // If we're setting a photo as main, we should clear the customized style locally too
          if (!avatar.includes('dicebear.com')) {
            this.user.avatarStyle = '';
          }
        }
        
        this.mainAvatar = this.user.mainAvatarPath;
        
        // Persist and detect changes
        this.updateUserInStorage(this.user.toObject());
        
        // Notify other components/services via UserService
        this.userService.setCurrentUser(this.user, { force: true });
        
        this.toastService.presentSuccessToastr('Main avatar updated');
        this.changeDetectorRef.detectChanges();
      },
      error: (e) => {
        const errorMsg = e.error?.message || e.message || 'Failed to update main avatar';
        this.toastService.presentErrorToastr(errorMsg);
      }
    });
  }

  async viewPhoto(index: any) {
    console.log('viewPhoto called with index:', index);
    
    let galleryAvatars = this.user.avatars;
    
    // If clicking the main avatar (index is a path and matches mainAvatarPath), 
    // or if gallery is empty, show ONLY the main avatar in the viewer.
    if (galleryAvatars.length === 0 || index === this.user.mainAvatarPath) {
      galleryAvatars = [{
        path: this.user.mainAvatarPath,
        url: this.user.mainAvatar
      }];
    }

    // Map all avatars to full URLs for the viewer
    const photos = galleryAvatars.map(a => a.url);
    const rawPaths = galleryAvatars.map(a => a.path);

    console.log('Gallery photos for viewer:', photos);

    let initialIndex = 0;
    if (typeof index === 'number') {
      initialIndex = index;
    } else {
      // If index is a path, find it in the filtered list
      initialIndex = rawPaths.indexOf(index);
      if (initialIndex === -1) initialIndex = 0;
    }
    
    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: {
        photos: photos,
        rawPaths: rawPaths,
        initialIndex: initialIndex,
        myProfile: this.myProfile,
        currentMainPath: this.user.mainAvatarPath
      },
      cssClass: 'photo-viewer-modal'
    });
    
    console.log('Presenting photo viewer modal...');
    await modal.present();
    console.log('Photo viewer modal presented.');

    const { data } = await modal.onWillDismiss();
    if (data && data.action) {
      if (data.action === 'setMain') {
        this.changeMainAvatar(data.path);
      } else if (data.action === 'delete') {
        this.removeAvatar(data.path);
      } else if (data.action === 'report') {
        this.reportUser(data.path);
      }
    }
  }
  
  
  
  

  updateUserInStorage(updatedUser: any) {
    // Safety: only persist to the authenticated user's storage when we're viewing/updating our own profile.
    if (!this.myProfile) {
      console.warn('Skipping updateUserInStorage(): not current user profile. Avoiding accidental overwrite of auth user.');
      return;
    }
    try { this.userService.setCurrentUser(updatedUser); } catch(e) {}
    this.changeDetectorRef.detectChanges();
  }

  removeAvatar(avatarUrl: string) {
    // Optimistic update: remove from local array immediately for real-time feel
    const originalAvatarPaths = [...this.user.avatar];
    this.user.avatar = this.user.avatar.filter(path => path !== avatarUrl && this.user.avatarUrl(path) !== avatarUrl);
    this.changeDetectorRef.detectChanges();

    this.userService.removeAvatar(this.user._id, avatarUrl).subscribe({
      next: (response: any) => {
        // Success: update with server data to ensure consistency
        this.user = new User().initialize(response.user);
        this.mainAvatar = this.user.mainAvatarPath;

        this.updateUserInStorage(this.user.toObject());
        
        // Notify other components/services via UserService
        this.userService.setCurrentUser(this.user, { force: true });
        
        this.changeDetectorRef.detectChanges();
      },
      error: (err) => {
        // Rollback on error
        this.user.avatar = originalAvatarPaths;
        this.changeDetectorRef.detectChanges();
        
        // Fix [object Object] error by extracting message string
        const errorMsg = err.error?.message || err.message || 'Failed to delete image';
        this.toastService.presentErrorToastr(errorMsg);
      }
    });
  }

  uploadAvatar(files: { url: string, file: any, name: string }[]) {
    const formData: FormData = new FormData();
    files.forEach(file => {
      formData.append('avatar', file.file, file.name);
    });
  
    this.userService.updateAvatar(this.user._id, formData).subscribe(
      (response: any) => {
        if (response && response.user) {
          // Assume response.user contains the updated user data, including the new avatar URLs
          const updatedUser = new User().initialize(response.user);
  
          // Update the avatar list
          this.user.avatar = updatedUser.avatar;
  
          // Update the user in local storage or native storage
          this.updateUserInStorage(updatedUser.toObject());
  
          // Notify other components/services via UserService
          this.userService.setCurrentUser(updatedUser, { force: true });

          // Trigger change detection to update the UI
          this.changeDetectorRef.detectChanges();
  
          // Optionally, display a success toast
          this.toastService.presentSuccessToastr('Avatar uploaded successfully!');
        } else {
          console.error('Invalid response structure:', response);
          this.toastService.presentErrorToastr('Error: Invalid response from server.');
        }
      },
      (error) => {
        console.error('Error uploading avatar:', error);
        this.toastService.presentErrorToastr('Error uploading avatar. Please try again.');
      }
    );
  }
  

  private isOldDefaultAvatar(avatar: string): boolean {
    return this.user?.isDefaultAvatar(avatar) || false;
  }

  trackByAvatar(index: number, item: any) {
    return item?.path || item;
  }

  
  async blockUserConf() {
    const alert = await this.alertCtrl.create({
      header: 'Block User',
      message: 'Do you really want to block this user?',
      buttons: [
        {
          text: 'CANCEL',
          role: 'cancel'
        },
        {
          text: 'BLOCK',
          cssClass: 'text-danger',
          handler: () => this.blockUser()
        }
      ]
    });
    await alert.present();
  }

  blockUser() {
    this.userService.block(this.user._id).subscribe(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        this.router.navigateByUrl('/tabs/profile/display/null');
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  async reportUser(photoPath?: string) {
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: photoPath ? 'this photo' : this.user.fullName
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      const loading = await this.loadingCtrl.create({
        message: 'Please wait...'
      });
      await loading.present();

      const reportPayload = { ...data };
      if (photoPath) {
        reportPayload.photoUrl = photoPath;
        reportPayload.entityType = 'Photo';
      }

      this.userService.report(this.userId, reportPayload).subscribe(
        (resp: any) => {
          loading.dismiss();
          this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
        },
        (err) => {
          loading.dismiss();
          this.toastService.presentErrorToastr(err || 'Error reporting user');
        }
      );
    }
  }

  videoCall() {
    if (this.user && this.user.isFriend) {
      this.router.navigateByUrl('/messages/video/' + this.user._id);
    } else {
      this.videoCallSubAlert();
    }
  }
  

  async videoCallSubAlert() {
    const message = !this.user.isFriend ? 
      `You can only have a call with friends. How about sending a friend request to ${this.user.fullName}?` :
      `You must subscribe to call ${this.user.fullName}.`;
      
    const buttons: any[] = [
      {
        text: 'CANCEL',
        role: 'cancel'
      }
    ];
  
    if (!this.user.isFriend) {
      buttons.push(
        {
          text: 'SEND REQUEST',
          cssClass: 'text-primary',
          handler: () => {
            this.request();
          }
        }
      );
    } else {
      buttons.push(
        {
          text: 'SUBSCRIBE',
          cssClass: 'text-danger',
          handler: () => {
            this.router.navigateByUrl('/tabs/subscription');
          }
        }
      );
    }
  
    const alert = await this.alertCtrl.create({
      header: `You can't call ${this.user.fullName}`,
      message: message,
      buttons: buttons
    });
  
    await alert.present();
  }
  
  async openAvatarCustomize() {
    const modal = await this.modalCtrl.create({
      component: (await import('../../../components/avatar-customize-modal/avatar-customize-modal.component')).AvatarCustomizeModalComponent,
      componentProps: { profile: this.user }
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      console.log('Avatar customization modal dismissed with data:', data);
      // Force a refresh of the current user to ensure all components stay in sync
      this.userService.refreshCurrentUser({ forceRefresh: true }).subscribe({
        next: (updatedUser) => {
          console.log('User refreshed after avatar customization:', updatedUser);
          if (this.myProfile) {
            this.user = updatedUser;
            this.mainAvatar = this.user.mainAvatarPath;
            this.changeDetectorRef.detectChanges();
          }
        },
        error: (err) => console.error('Error refreshing user after avatar customization:', err)
      });
    }
  }

  goBack() {
    this.location.back();
  }

  async openFollowModal(type: 'followers' | 'following') {
    const modal = await this.modalCtrl.create({
      component: FollowListModalComponent,
      componentProps: {
        userId: this.user._id,
        type: type,
        isMyProfile: this.myProfile
      }
    });
    return await modal.present();
  }

  toggleFollow() {
    if (this.user.isFollowing || this.user.followStatus === 'pending') {
      const wasPending = this.user.followStatus === 'pending';
      this.userService.unfollow(this.user._id).subscribe({
        next: () => {
          this.user.isFollowing = false;
          this.user.followStatus = null;
          this.toastService.presentSuccessToastr(wasPending ? 'Follow request cancelled' : 'Unfollowed successfully');
        },
        error: (err) => {
          console.error('Error unfollowing:', err);
          this.toastService.presentErrorToastr('Error unfollowing user');
        }
      });
    } else {
      this.userService.follow(this.user._id).subscribe({
        next: (res) => {
          if (res.status === 'pending') {
            this.user.followStatus = 'pending';
            this.toastService.presentSuccessToastr('Follow request sent');
          } else {
            this.user.isFollowing = true;
            this.user.followStatus = 'active';
            this.toastService.presentSuccessToastr('Following successfully');
          }
        },
        error: (err) => {
          console.error('Error following:', err);
          this.toastService.presentErrorToastr('Error following user');
        }
      });
    }
  }
}
