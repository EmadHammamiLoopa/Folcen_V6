import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ChannelService } from './../../services/channel.service';
import { User } from 'src/app/models/User';
import { Post } from 'src/app/models/Post';
import { UserService } from 'src/app/services/user.service';
import { SessionAuthStateService } from 'src/app/services/session-auth-state.service';
import { AppEventsService } from 'src/app/services/app-events.service';
import { SocketService } from 'src/app/services/socket.service';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import constants from 'src/app/helpers/constants';

@Component({
  selector: 'app-feed',
  templateUrl: './feed.page.html',
  styleUrls: ['./feed.page.scss'],
})
export class FeedPage implements OnInit, OnDestroy {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;

  user: User = new User();
  budget = 0;
  private subs: Subscription[] = [];
  private destroy$ = new Subject<void>();
  pageLoading = false;
  posts: any[] = [];
  page = 1;

  private lastSuccessfulRefreshAt = 0;
  private readonly warmRefreshMs = 15000;

  constructor(
    private channelService: ChannelService,
    private nativeStorage: NativeStorage,
    private platform: Platform,
    private userService: UserService,
    private appEvents: AppEventsService,
    private router: Router
  ) {}

  ngOnInit() {
    this.getUserData();
    // react to user updates
    this.subs.push(this.userService.currentUser.subscribe(u => { if (u) this.user = u; }));
    // react to budget changes
    this.subs.push(this.appEvents.budget$.subscribe(b => { this.budget = b || 0; }));

    // ✅ Real-time: new post in feed from followed users/channels
    SocketService.newFeedPost$.pipe(takeUntil(this.destroy$)).subscribe((post: any) => {
      try {
        if (!post || !post._id) return;
        // Don't duplicate
        if (this.posts.some((p: any) => String(p._id) === String(post._id))) return;
        // Prepend to top of feed
        this.posts = [post, ...this.posts];
      } catch (e) { console.warn('newFeedPost$ error', e); }
    });
  }

  ionViewWillEnter() {
    this.page = 1;

    // Socket newFeedPost$ already updates a recent rendered feed.
    // Short tab switches should therefore be instant.
    if (
      this.posts.length > 0 &&
      this.lastSuccessfulRefreshAt &&
      (
        Date.now() -
        this.lastSuccessfulRefreshAt
      ) < this.warmRefreshMs
    ) {
      this.pageLoading = false;
      return;
    }

    this.getFeed(
      null,
      true
    );
  }

  private getUserData() {
    // Prefer reactive user store
    const current = this.userService.currentUserValue;
    if (current) {
      this.user = current;
      return;
    }
    // fallback: try local/native storage
    if (this.platform.is('cordova')) {
      SessionAuthStateService
        .readNativeLegacyUser(
          this.nativeStorage
        )
        .then(u => {
          this.user = new User().initialize(u);
        }).catch(() => {
        const raw = SessionAuthStateService.readLocalUserRaw();
        const u = raw ? JSON.parse(raw) : null;
        if (u) this.user = new User().initialize(u);
      });
    } else {
      const raw = SessionAuthStateService.readLocalUserRaw();
      const u = raw ? JSON.parse(raw) : null;
      if (u) this.user = new User().initialize(u);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.subs.forEach(s => { try { s.unsubscribe(); } catch(e){} });
  }

  getFeed(event = null, refresh = false) {
    if (refresh) {
      this.page = 1;

      // Block only on the first real load; keep warm feed visible on return.
      this.pageLoading = this.posts.length === 0;

      if (this.infinitScroll) {
        this.infinitScroll.disabled = false;
      }
    }

    this.channelService.getFeed(this.page).then((res: any) => {
      console.log('Feed response:', res);
      const newActivities = (res.data && res.data.docs) ? res.data.docs : [];
      
      // Process activities to ensure images are easily accessible and correctly formatted
      newActivities.forEach(act => {
        act.displayImage = this.getActivityImage(act);
        
        // Ensure user avatar is also correctly formatted
        if (act.user && act.user.mainAvatar) {
          if (!act.user.mainAvatar.startsWith('http')) {
            act.user.mainAvatar = constants.DOMAIN_URL + (act.user.mainAvatar.startsWith('/') ? '' : '/') + act.user.mainAvatar;
          }
        }
      });

      if (refresh) {
        this.posts = newActivities;
      } else {
        this.posts = [...this.posts, ...newActivities];
      }

      this.page++;

      if (refresh) {
        this.lastSuccessfulRefreshAt =
          Date.now();
      }

      this.pageLoading = false;

      if (event) {
        event.target.complete();
      }

      if (newActivities.length === 0 && this.infinitScroll) {
        this.infinitScroll.disabled = true;
      }
    }).catch(err => {
      console.error('Error fetching feed:', err);
      this.pageLoading = false;
      if (event) event.target.complete();
    });
  }

  getActivityImage(activity: any): string | null {
    let imgPath = null;

    if (activity.activityType === 'post') {
      // Check for expired media
      if (activity.media?.expiryDate) {
        const expiryTime = new Date(activity.media.expiryDate).getTime();
        if (Number.isFinite(expiryTime) && expiryTime <= Date.now()) {
          return null; // Media expired, hide it in feed
        }
      }
      imgPath = activity.media?.url || activity.photo || null;
    } else if (activity.activityType === 'product') {
      imgPath = activity.photos?.[0]?.url || activity.photos?.[0]?.path || activity.photo || null;
    } else if (activity.activityType === 'job' || activity.activityType === 'service') {
      imgPath = activity.photo || activity.photos?.[0] || null;
    }

    if (!imgPath) return null;

    // If it's already a full URL, return it
    if (imgPath.startsWith('http')) return imgPath;

    // Otherwise, prepend the domain
    return constants.DOMAIN_URL + (imgPath.startsWith('/') ? '' : '/') + imgPath;
  }

  getActivityIcon(type: string): string {
    switch (type) {
      case 'post': return 'document-text-outline';
      case 'product': return 'cart-outline';
      case 'job': return 'briefcase-outline';
      case 'service': return 'construct-outline';
      case 'comment': return 'chatbubble-ellipses-outline';
      default: return 'flash-outline';
    }
  }

  doRefresh(event) {
    this.getFeed(event, true);
  }

  loadData(event) {
    this.getFeed(event);
  }

  goToActivity(activity: any) {
    let link: string | null = activity.targetLink || null;

    // Client-side fallback: build the link from activityType + _id
    if (!link) {
      const id = activity._id;
      switch (activity.activityType) {
        case 'post':    link = `/tabs/channels/post/${id}`; break;
        case 'product': link = `/tabs/buy-and-sell/product/${id}`; break;
        case 'job':     link = `/tabs/small-business/jobs/job/${id}`; break;
        case 'service': link = `/tabs/small-business/services/service/${id}`; break;
        case 'comment':
          // activity._id is the comment; post is the parent
          const postId = activity.post?._id || activity.post;
          if (postId) link = `/tabs/channels/post/${postId}?commentId=${id}`;
          break;
      }
    }

    if (link) this.router.navigateByUrl(link);
  }
}
