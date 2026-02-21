import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ChannelService } from './../../services/channel.service';
import { User } from 'src/app/models/User';
import { Post } from 'src/app/models/Post';
import { UserService } from 'src/app/services/user.service';
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
    this.posts = [];
    this.getFeed(null, true);
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
      this.nativeStorage.getItem('user').then(u => {
        this.user = new User().initialize(u);
      }).catch(() => {
        const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
        const u = raw ? JSON.parse(raw) : null;
        if (u) this.user = new User().initialize(u);
      });
    } else {
      const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
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
      this.pageLoading = true;
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
    if (activity.targetLink) {
      this.router.navigateByUrl(activity.targetLink);
    }
  }
}
