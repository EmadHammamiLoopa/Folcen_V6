import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonInfiniteScroll, ModalController, PopoverController, AlertController, Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ChannelService } from './../../../services/channel.service';
import { ToastService } from './../../../services/toast.service';
import { Channel } from 'src/app/models/Channel';
import { User } from './../../../models/User';
import { Post } from './../../../models/Post';
import { PostFormComponent } from './post-form/post-form.component';
import { DropDownComponent } from './../../drop-down/drop-down.component';
import { ReportModalComponent } from '../../../components/report-modal/report-modal.component';
import { OneSignalService } from 'src/app/services/one-signal.service';
import { AuthService } from 'src/app/services/auth.service';
import { SocketService } from 'src/app/services/socket.service';
import { SessionAuthStateService } from 'src/app/services/session-auth-state.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChannelPopoverComponent } from '../list/ChannelPopoverComponent';

@Component({
  selector: 'app-channel',
  templateUrl: './channel.component.html',
  styleUrls: ['./channel.component.scss'],
})
export class ChannelComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;
  @ViewChild('content') content: IonContent;

  anonyme = false;
  channel: Channel;
  user: User = new User();
  pageLoading = false;
  posts: Post[] = [];
  page = 0;
  private destroy$ = new Subject<void>();
  private feedRefreshTimer: any;

  private hasEnteredView = false;
  private postsRequestInFlight = false;

  constructor(
    private channelService: ChannelService,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private popoverController: PopoverController,
    private alertCtrl: AlertController,
    private toastService: ToastService,
    private router: Router,
    private nativeStorage: NativeStorage,
    private platform: Platform,
    private authService: AuthService,
    private changeDetectorRef: ChangeDetectorRef,
    private oneSignalService: OneSignalService // Ensure to provide this service if needed
  ) {}

  ngOnInit() {
    this.getUserData();
    this.getChannelParams();
    this.bindRealtimePostRefresh();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    try { if (this.feedRefreshTimer) clearTimeout(this.feedRefreshTimer); } catch (e) {}
  }

  private bindRealtimePostRefresh() {
    SocketService.newFeedPost$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      try {
        const currentChannelId = String(this.channel?.id || '');
        if (!currentChannelId) return;

        const payloadChannelId = String(
          payload?.channel?._id ||
          payload?.channel ||
          payload?.channelId ||
          payload?.post?.channel?._id ||
          payload?.post?.channel ||
          ''
        );

        if (!payloadChannelId || payloadChannelId !== currentChannelId) return;

        if (this.feedRefreshTimer) clearTimeout(this.feedRefreshTimer);
        this.feedRefreshTimer = setTimeout(() => {
          this.getChannelPosts(null, true);
        }, 250);
      } catch (e) {}
    });
  }

  isOwner(channel: Channel): boolean {
    if (!channel) return false;
    const uid = this.user?.id || this.user?._id || '';
    return channel.isOwner(uid);
  }

  async showChannelInfo(event?: Event) {
    event?.stopPropagation();
    const modal = await this.modalCtrl.create({
      component: ChannelPopoverComponent,
      componentProps: { channel: this.channel },
      cssClass: 'full-screen-modal',
      mode: 'ios'
    });
    await modal.present();
  }

  ionViewWillEnter() {
    if (!this.hasEnteredView) {
      this.hasEnteredView = true;
      return;
    }

    // Refresh returning views without blanking existing posts.
    if (this.channel?.id) {
      this.getChannelPosts(
        null,
        true
      );
    }
  }

  private getUserData() {
    if (this.platform.is('cordova')) {
      (async () => {
        try {
          const u =
            await SessionAuthStateService
              .readNativeUserFalsyFallback(
                this.nativeStorage
              );

          if (u) {
            console.log('Fetched user data from NativeStorage:', u);
            this.initializeUser(u);
          } else {
            this.fetchUserFromLocalStorage();
          }
        } catch (error) {
          console.warn('Error fetching user data from NativeStorage:', error);
          this.fetchUserFromLocalStorage();
        }
      })();
    } else {
      this.fetchUserFromLocalStorage();
    }
  }

  private fetchUserFromLocalStorage() {
  const raw = SessionAuthStateService.readLocalUserRaw();
  const user = raw ? JSON.parse(raw) : null;
    if (user) {
      console.log('Fetched user data from localStorage:', user);
      this.initializeUser(user);
    } else {
      console.log('User data not found in localStorage');
      // Handle the scenario where user data is not found
      // For example, redirect to login or handle initial setup
    }
  }

  private initializeUser(user: any) {
    this.user = new User().initialize(user);
    // Assuming filterAvatars, connectUser, initWebrtc, and oneSignalService.open are methods you need
  //  this.oneSignalService.open(this.user._id);
    this.changeDetectorRef.detectChanges(); // Trigger Angular change detection
    console.log('User initialized successfully:', this.user);
  }
  

  getChannelParams() {
    this.route.queryParamMap
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe(params => {
        let channelData: any = {};

        try {
          channelData =
            JSON.parse(
              params.get('channel') ||
              '{}'
            );
        } catch (_) {
          channelData = {};
        }

        const incoming =
          Channel.createFromData(
            channelData
          );

        const oldId =
          String(
            this.channel?.id || ''
          );

        const newId =
          String(
            incoming?.id || ''
          );

        if (
          oldId &&
          newId &&
          oldId !== newId
        ) {
          this.posts = [];
          this.page = 0;
        }

        this.channel =
          incoming;

        if (!this.channel?.id) {
          this.pageLoading = false;
          return;
        }

        // Critical path: show posts immediately.
        this.getChannelPosts(
          null,
          true
        );

        // Header/follower data refreshes in parallel.
        this.channelService
          .show(this.channel.id)
          .then(
            (resp: any) => {
              if (
                resp?.data?.channel
              ) {
                this.channel =
                  Channel.createFromData(
                    resp.data.channel
                  );

                this.changeDetectorRef
                  .detectChanges();
              }
            },
            () => {
              // Route-provided channel data is already usable.
            }
          );
      });
  }


  getChannelPosts(
    event?,
    refresh = false
  ) {
    if (!this.channel?.id) {
      this.pageLoading = false;
      event?.target?.complete?.();
      return;
    }

    if (this.postsRequestInFlight) {
      event?.target?.complete?.();
      return;
    }

    this.postsRequestInFlight =
      true;

    if (refresh) {
      this.page = 0;

      if (this.infinitScroll) {
        this.infinitScroll.disabled =
          false;
      }
    }

    // Loader only when absolutely nothing is rendered.
    this.pageLoading =
      !this.posts ||
      this.posts.length === 0;

    const requestPage =
      this.page;

    this.channelService
      .getPosts(
        this.channel.id,
        requestPage
      )
      .then(
        (resp: any) => {
          const incoming =
            (resp?.data?.posts || [])
              .map(
                (pst: any) =>
                  new Post()
                    .initialize(pst)
              );

          if (refresh) {
            // Swap only after fresh response arrives.
            this.posts =
              incoming;
          } else {
            const existing =
              new Set(
                this.posts.map(
                  (post: any) =>
                    String(
                      post.id ||
                      post._id
                    )
                )
              );

            for (const post of incoming) {
              const id =
                String(
                  (post as any).id ||
                  (post as any)._id
                );

              if (!existing.has(id)) {
                this.posts.push(post);
                existing.add(id);
              }
            }
          }

          this.page =
            requestPage + 1;

          if (
            resp?.data?.more === false &&
            this.infinitScroll
          ) {
            this.infinitScroll.disabled =
              true;
          }

          this.pageLoading = false;
          this.postsRequestInFlight =
            false;

          event?.target?.complete?.();
        },
        err => {
          console.error(
            'Error fetching posts:',
            err
          );

          this.pageLoading = false;
          this.postsRequestInFlight =
            false;

          event?.target?.complete?.();
        }
      );
  }

  addPost(post: Post) {
    this.posts.unshift(post);
    this.content.scrollToTop(200);
  }

  deletePost(post: Post) {
    this.posts.splice(this.posts.indexOf(post), 1);
  }

async showPostForm() {
  const modal = await this.modalCtrl.create({
    component: PostFormComponent,
    componentProps: {
      channelId: this.channel.id,
      channel: this.channel ? this.channel.toObject() : null,
    },
  });

  await modal.present();

  const { data } = await modal.onWillDismiss();
  if (data && data.post) {
    this.addPost(data.post);
  } else {
    console.log("Modal was closed without any post submission.");
  }

  // Proper dismissal of the modal
  await modal.dismiss();
  await modal.onDidDismiss(); // Ensures cleanup
  console.log('Modal cleanup complete');
}

  
  

  async presentPopover(ev: any) {
    const popoverItems = this.getPopoverItems();
    const popover = await this.popoverController.create({
      component: DropDownComponent,
      event: ev,
      cssClass: 'dropdown-popover',
      showBackdrop: false,
      componentProps: { items: popoverItems },
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data && data.event) this.handlePopoverEvent(data.event);
  }

  getPopoverItems() {
    const items = [];
    const chanUser: any = (this.channel && (this.channel as any).user) || null;
    const chanUserId = chanUser && (chanUser.id || chanUser._id || (typeof chanUser.getId === 'function' ? chanUser.getId() : null)) || '';
    const myId = this.user && (this.user.id || this.user._id) ? (this.user.id || this.user._id) : '';

    if (chanUserId && this.user && String(chanUserId) === String(myId)) {
      items.push({ text: 'Delete', icon: 'fas fa-trash-alt', event: 'delete' });
    } else {
      const authId = myId;
      items.push(
        { text: this.channel.followedBy(authId) ? 'Unfollow' : 'Follow', icon: this.channel.followedBy(authId) ? 'fas fa-minus-circle' : 'fas fa-plus', event: 'follow' },
        { text: 'Report', icon: 'fas fa-exclamation-triangle', event: 'report' }
      );
    }
    return items;
  }

  async handlePopoverEvent(event) {
    if (event === 'follow') {
      if (this.channel.followedBy(this.user._id)) this.togglefollowConf();
      else this.togglefollow();
    } else if (event === 'delete') this.deleteConf();
    else if (event === 'report') this.reportChannel();
  }

  async togglefollowConf() {
    const alert = await this.alertCtrl.create({
      header: `Unfollow ${this.channel.name}`,
      message: 'Do you really want to unfollow this channel?',
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Yes', handler: () => this.togglefollow(), cssClass: 'text-danger' }
      ],
    });
    await alert.present();
  }

  togglefollow() {
    const uid = this.user && (this.user.id || this.user._id) ? (this.user.id || this.user._id) : '';
    this.channelService.follow(this.channel.id).then(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        try {
          let currentFollowers = [...(this.channel.followers || [])];
          if (resp.data) {
            // add uid if not present
            const exists = currentFollowers.find((f: any) => (typeof f === 'string' ? f === uid : (f && (f._id === uid || f.id === uid))));
            if (!exists) currentFollowers.push(uid);
          } else {
            // remove all entries matching uid
            currentFollowers = currentFollowers.filter((f: any) => {
              if (!f) return false;
              if (typeof f === 'string') return f !== uid;
              return String(f._id || f.id) !== String(uid);
            });
          }
          this.channel.followers = currentFollowers;
          this.changeDetectorRef.detectChanges();
        } catch (e) { console.warn('Error updating channel.followers', e); }
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  async deleteConf() {
    const alert = await this.alertCtrl.create({
      header: 'Delete Channel',
      message: 'Do you really want to delete this channel?',
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Yes', handler: () => this.deleteChannel(), cssClass: 'text-danger' }
      ],
    });
    await alert.present();
  }

  deleteChannel() {
    this.channelService.deleteChannel(this.channel.id).then(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        this.router.navigateByUrl('/tabs/channels/list/mines');
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }
  async reportChannel() {
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: this.channel.name
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.channelService.reportChannel(this.channel.id, data).then(
        (resp: any) => {
          this.toastService.presentSuccessToastr('Report submitted successfully.');
        },
        err => {
          this.toastService.presentErrorToastr('Error submitting report.');
        }
      );
    }
  }
  

  
}