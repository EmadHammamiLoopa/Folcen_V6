import { UserService } from './../../../services/user.service';
import { User } from './../../../models/User';
import { Platform, IonInfiniteScroll } from '@ionic/angular';
import { ToastService } from './../../../services/toast.service';
import { Component, OnInit, ViewChild, OnDestroy, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AppEventsService } from 'src/app/services/app-events.service';
import { WebrtcService } from './../../../services/webrtc.service';
import { Subscription } from 'rxjs';
import { RequestService } from './../../../services/request.service';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;

  pageLoading = false;
  friends: User[] = [];
  showSandglass: boolean = false;
  page: number = 0;
  myProfile: User;
  private missedSub: Subscription;
  public missedMap: { [userId: string]: number } = {};
  public missedMap$: Observable<{ [userId: string]: number }>;
  private friendsSub: Subscription;

  constructor(
    private requestService: RequestService,
    private platform: Platform,
    private toastService: ToastService,
    private userService: UserService,
    private alertCtrl: AlertController,
    private webRTC: WebrtcService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private appEvents: AppEventsService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadUserProfile();
    const source$ = this.appEvents && this.appEvents.missedCalls$ ? this.appEvents.missedCalls$ : this.webRTC.missedCalls$;
    this.missedMap$ = source$.pipe(
      map((calls: any[]) => {
        const map: { [userId: string]: number } = {};
        (calls || []).forEach((c: any) => {
          const id = String(c.userId || c.peerId || c.from || c.to || '');
          if (!id) return;
          map[id] = (map[id] || 0) + 1;
        });
        this.missedMap = map;
        this.cdr.markForCheck();
        return map;
      })
    );

    try { this.refreshMissedFromService(); } catch(e) {}

    this.friendsSub = this.userService.friendsUpdated$.subscribe(() => {
      this.zone.run(() => {
        console.log('👥 Friends list update received, refreshing...');
        this.page = 0;
        this.friends = [];
        this.getFriends();
      });
    });
  }

  private refreshMissedFromService() {
    try {
      const calls = this.appEvents.getMissedCalls ? this.appEvents.getMissedCalls() : this.webRTC.getMissedCalls();
      const map: { [userId: string]: number } = {};
      (calls || []).forEach((c: any) => {
        const id = String(c.userId || c.peerId || c.from || c.to || '');
        if (!id) return;
        map[id] = (map[id] || 0) + 1;
      });
      this.missedMap = map;
      this.cdr.markForCheck();
    } catch (e) { console.warn('friends.refreshMissedFromService failed', e); }
  }

  ngOnDestroy() {
    try { this.missedSub?.unsubscribe(); } catch (e) {}
    try { this.friendsSub?.unsubscribe(); } catch (e) {}
  }

  ionViewWillEnter() {
    this.platform.ready().then(() => {
      this.page = 0;
      this.friends = [];
      this.getFriends();
    });
  }

  isAdmin(user: User): boolean {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }

  navigateToProfile(friend: User) {
    if (this.isAdmin(friend)) {
      this.toastService.presentErrorToastr('This profile is not available');
      return;
    }
    try {
      const cached = this.userService.getCachedProfile(friend._id);
      if (cached) {
        this.router.navigate(['/tabs/profile/display', friend._id]);
        return;
      }
    } catch (e) {}

    this.showSandglass = true;
    this.cdr.markForCheck();
    this.router.navigate(['/tabs/profile/display', friend._id]).finally(() => {
      this.showSandglass = false;
      try { this.cdr.markForCheck(); } catch (e) {}
    });
  }

  loadUserProfile() {
    const currentUserId = this.userService.getCurrentUserId();
    if (!currentUserId) {
      console.error('Current user ID not found');
      this.toastService.presentErrorToastr('Failed to load profile.');
      return;
    }

    this.userService.getUserProfile(currentUserId).subscribe(
      (profile: User) => {
        this.myProfile = profile;
      },
      (error) => {
        console.error('Error loading user profile:', error);
        this.toastService.presentErrorToastr('Failed to load profile.');
      }
    );
  }

  private usableImage(value: any): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return normalized && normalized !== 'undefined' && normalized !== 'null' && normalized !== '[object Object]' ? normalized : '';
  }

  private mergeStableAvatars(userProfile: any, fallback: any) {
    const profileMain = this.usableImage(userProfile?.mainAvatar);
    const fallbackMain = this.usableImage(fallback?.mainAvatar);
    const profileAvatars = Array.isArray(userProfile?.avatar)
      ? userProfile.avatar.filter((avatar: any) => this.usableImage(avatar))
      : [];
    const fallbackAvatars = Array.isArray(fallback?.avatar)
      ? fallback.avatar.filter((avatar: any) => this.usableImage(avatar))
      : [];

    return {
      mainAvatar: profileMain || fallbackMain || fallbackAvatars[0] || profileAvatars[0] || '',
      avatar: profileAvatars.length ? profileAvatars.slice() : fallbackAvatars.slice()
    };
  }

  getFriends(event?: any, refresh: boolean = false) {
    if (!event) this.pageLoading = true;
    if (refresh) this.page = 0;

    this.userService.getFriends(this.page).subscribe(
      (resp: any) => {
        const newFriendsRaw = resp.friends || [];

        if (newFriendsRaw.length === 0) {
          if (!event || refresh) this.friends = [];
          this.pageLoading = false;
          if (event) event.target.complete();
          this.cdr.markForCheck();
          return;
        }

        const profileRequests = newFriendsRaw.map((usr: any) =>
          this.userService.getUserProfile(usr._id).pipe(
            map(userProfile => {
              const stableAvatar = this.mergeStableAvatars(userProfile, usr);
              const safeProfile = {
                _id: usr._id,
                firstName: userProfile.firstName || usr.firstName,
                lastName: userProfile.lastName || usr.lastName,
                mainAvatar: stableAvatar.mainAvatar,
                avatar: stableAvatar.avatar,
                fullName: (userProfile.firstName || usr.firstName) + ' ' + (userProfile.lastName || usr.lastName),
                country: userProfile.country || usr.country || '-',
                city: userProfile.city || usr.city || '-',
                online: userProfile.online
              };
              const friend = new User().initialize(safeProfile);
              friend.friend = true;
              return friend;
            }),
            catchError(() => {
              const stableAvatar = this.mergeStableAvatars(null, usr);
              const friend = new User().initialize({
                _id: usr._id,
                firstName: usr.firstName,
                lastName: usr.lastName,
                mainAvatar: stableAvatar.mainAvatar,
                avatar: stableAvatar.avatar,
                country: usr.country || '-',
                city: usr.city || '-'
              });
              friend.friend = true;
              return of(friend);
            })
          )
        );

        forkJoin(profileRequests).subscribe((fetchedFriends: User[]) => {
          if (!event || refresh) {
            this.friends = fetchedFriends;
          } else {
            this.friends = [...this.friends, ...fetchedFriends];
          }

          if (refresh && this.infinitScroll) {
            this.infinitScroll.disabled = false;
          }

          this.pageLoading = false;
          this.page++;

          if (event) {
            event.target.complete();
            if (!resp.more && !refresh) event.target.disabled = true;
          }
          this.cdr.markForCheck();
        });
      },
      (err) => {
        console.error('Error fetching friends:', err);
        this.toastService.presentErrorToastr('Failed to load friends.');
        this.pageLoading = false;
        if (event) event.target.complete();
        this.cdr.markForCheck();
      }
    );
  }

  loadMoreFriends(event: any) {
    this.getFriends(event);
  }

  async removeFriend(friend: User) {
    const alert = await this.alertCtrl.create({
      header: 'Remove friend?',
      message: `${friend.fullName} will be removed from your friends list.`,
      cssClass: 'folcen-confirm-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'folcen-alert-cancel',
        },
        {
          text: 'Remove',
          cssClass: 'folcen-alert-danger',
          handler: () => {
            this.userService.removeFriendship(friend._id).subscribe(
              (resp: any) => {
                this.toastService.presentSuccessToastr(resp.message);
                this.friends = this.friends.filter((f) => f._id !== friend._id);
                this.userService.triggerFriendsRefresh();
                this.cdr.markForCheck();
              },
              (err) => {
                console.error('Error removing friend:', err);
                this.toastService.presentErrorToastr('Failed to remove friend.');
              }
            );
          },
        },
      ],
    });
    await alert.present();
  }

  async blockUser(friend: User) {
    const alert = await this.alertCtrl.create({
      header: 'Block user?',
      message: `${friend.fullName} will no longer be able to interact with you as a friend.`,
      cssClass: 'folcen-confirm-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'folcen-alert-cancel',
        },
        {
          text: 'Block',
          cssClass: 'folcen-alert-danger',
          handler: () => {
            this.userService.block(friend._id).subscribe(
              (resp: any) => {
                this.toastService.presentSuccessToastr(resp.message);
                this.friends = this.friends.filter((f) => f._id !== friend._id);
                this.userService.triggerFriendsRefresh();
                this.cdr.markForCheck();
              },
              (err) => {
                console.error('Error blocking user:', err);
                this.toastService.presentErrorToastr('Failed to block user.');
              }
            );
          },
        },
      ],
    });
    await alert.present();
  }
}
