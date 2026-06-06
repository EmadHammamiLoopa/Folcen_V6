import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Socket } from 'socket.io-client';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { RequestService } from 'src/app/services/request.service';
import { AppEventsService, TabKey } from 'src/app/services/app-events.service';
import { SocketService } from 'src/app/services/socket.service';
import { UserService } from 'src/app/services/user.service';
import { environment } from 'src/environments/environment';
import { GuidedTourService } from 'src/app/services/guided-tour.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
})
export class TabsPage implements OnInit, OnDestroy {
  private socket: Socket | null = null;
  private destroy$ = new Subject<void>();
  private listenersAttached = false;

  private currentUrl = '';
  private activeTab = ''; // track active tab directly from ionTabsDidChange
  private routerSub: any;
  private badgeCounts = new Map<TabKey, number>();
  notificationCount = 0;
  showTabs = true;
  budget = 0;
  missedCallsCount = 0;

  tabs: { url: TabKey; icon: string; notificationEvent?: string }[] = [
    { url: 'profile',        icon: 'fas fa-user' },
    { url: 'friends',        icon: 'fas fa-users',        notificationEvent: 'new-friend-request' },
    { url: 'messages',       icon: 'fas fa-comments',     notificationEvent: 'new-message' },
    { url: 'new-friends',    icon: 'fas fa-search',       notificationEvent: 'friend-suggestion' },
    { url: 'channels',       icon: 'fas fa-object-group', notificationEvent: 'new-channel-activity' },
    { url: 'feed',           icon: 'fas fa-newspaper' },
    ...(environment.features.marketplace    ? [{ url: 'buy-and-sell'   as TabKey, icon: 'fas fa-store',     notificationEvent: 'new-buy-sell-update' }] : []),
    ...(environment.features.jobsBoard || environment.features.servicesBoard ? [{ url: 'small-business' as TabKey, icon: 'fas fa-briefcase', notificationEvent: 'new-business-post'   }] : []),
  ];

  constructor(
    private zone: NgZone,
    private router: Router,
    private badges: AppEventsService,
    private requestService: RequestService,
    private userService: UserService,
    private guidedTour: GuidedTourService
  ) {}

  async ngOnInit() {
    // Initialize badge subscriptions
    this.tabs.forEach(tab => {
      this.badges.badge$(tab.url).pipe(takeUntil(this.destroy$)).subscribe(count => {
        this.badgeCounts.set(tab.url, count || 0);
      });
    });

    this.badges.budget$.pipe(takeUntil(this.destroy$)).subscribe(b => {
      this.zone.run(() => {
        this.budget = b || 0;
      });
    });

    this.badges.notificationCount$.pipe(takeUntil(this.destroy$)).subscribe(count => {
      this.zone.run(() => {
        this.notificationCount = count || 0;
      });
    });

    this.badges.missedCalls$.pipe(takeUntil(this.destroy$)).subscribe((calls: any[]) => {
      this.zone.run(() => {
        const count = Array.isArray(calls) ? calls.length : 0;
        this.missedCallsCount = count;
        if (count === 0 && this.budget > 0) {
          this.budget = 0;
        }
      });
    });

    this.badges.showTabs$.pipe(takeUntil(this.destroy$)).subscribe(show => {
      this.showTabs = show;
    });

    // track route changes for smarter message badge behavior

    this.currentUrl = this.router.url;
    // Pre-populate activeTab from initial URL so badge guards work before
    // the first ionTabsDidChange event fires (e.g. app starting on messages tab).
    const urlParts = this.currentUrl.split('/');
    const tabsIdx = urlParts.indexOf('tabs');
    if (tabsIdx !== -1 && urlParts[tabsIdx + 1]) {
      this.activeTab = urlParts[tabsIdx + 1];
    }

    try {
      // bind + connect socket
      (SocketService as any).bindToAuthUser?.(); // safe optional
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      this.socket = await SocketService.getSocket();

      // seed exact count for friends on first load
      this.recountFriends();

      // seed again on reconnect
      if (this.socket) this.socket.on('connect', () => this.recountFriends());
    } catch (error) {
      console.error('Failed to init Tabs sockets:', error);
    }

    // ── Observable-based real-time listeners (reconnect-safe) ──────────────
    // New incoming message → increment messages badge (skip only if already on messages tab)
    SocketService.newMessage$.pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      this.zone.run(() => {
        if (this.activeTab === 'messages') return; // on messages tab — no badge needed
        const incomingFrom = payload?.from?._id || payload?.from;
        if (incomingFrom && this.isInChatWith(String(incomingFrom))) return;
        this.badges.inc('messages', 1);
      });
    });

    // New feed post → increment feed badge
    SocketService.newFeedPost$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.zone.run(() => {
        if (this.activeTab !== 'feed') {
          this.badges.inc('feed', 1);
        }
      });
    });

    // New incoming friend request → increment immediately then recount from API after a short delay
    SocketService.newFriendRequest$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.zone.run(() => {
        if (this.activeTab !== 'friends') {
          this.badges.inc('friends', 1);
        }
        // Delayed API recount to get accurate count (avoids race with DB write)
        setTimeout(() => this.recountFriends(), 1500);
      });
    });

    // Friend request accepted/declined/cancelled → recount from API after delay
    SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.zone.run(() => {
        // Delay to avoid race condition where API is queried before DB write completes
        setTimeout(() => {
          this.recountFriends();
          this.userService.triggerFriendsRefresh();
        }, 800);
      });
    });

    // Connection restored → re-seed counts
    SocketService.connection$.pipe(takeUntil(this.destroy$)).subscribe(status => {
      if (status === 'connected') {
        this.zone.run(() => this.recountFriends());
      }
    });

    this.routerSub = this.router.events
      .pipe(filter(ev => ev instanceof NavigationEnd))
      .subscribe((ev: NavigationEnd) => {
        this.currentUrl = ev.urlAfterRedirects || ev.url;
        // Feed / friends: reset badge whenever landing on those tab roots.
        // Messages: handled exclusively in onTabChanged to avoid resetting while navigating
        //           within a chat conversation (entering a chat is not a "tab change").
        if (this.currentUrl.includes('/tabs/feed')) {
          this.badges.reset('feed');
        }
        if (this.currentUrl.includes('/tabs/friends')) {
          this.badges.reset('friends');
        }
        setTimeout(() => this.guidedTour.maybeStartAfterSignup(), 450);
      });

    setTimeout(() => this.guidedTour.maybeStartAfterSignup(), 900);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.routerSub) this.routerSub.unsubscribe();
    if (this.socket) this.socket.off('connect');
  }

  // ----- template helpers -----
  trackByUrl(index: number, tab: { url: TabKey; icon: string; notificationEvent?: string }) {
    return tab.url;
  }

  getBadgeCount(tab: TabKey): number {
    return this.badgeCounts.get(tab) || 0;
  }

  // ----- realtime / API -----
  private attachSocketListenersOnce() {}

  private async recountFriends() {
    try {
      const resp: any = await this.requestService.requests(0);
      const count = Array.isArray(resp?.data) ? resp.data.length : 0;
      this.badges.set('friends', count);
    } catch (error) {
      console.error('Failed to recount friends:', error);
      this.badges.set('friends', 0);
    }
  }

  // ----- UI events -----
  onTabChanged(event: any) {
    // The template passes the already-extracted tab string:
    //   (ionTabsDidChange)="onTabChanged(($any($event)?.tab) || ($any($event)?.detail?.tab))"
    // so `event` is a string like 'messages', 'feed', etc.
    // Also handle raw CustomEvent in case the binding is changed later.
    const activeTab: string =
      typeof event === 'string' ? event : (event?.detail?.tab || event?.tab || '');
    if (!activeTab) return;
    this.activeTab = activeTab; // track for guard checks

    if (activeTab === 'friends') {
      this.badges.reset('friends');
      this.recountFriends();
    }

    if (activeTab === 'messages') {
      // visually clear when entering messages root
      if (this.isMessagesRoot()) this.badges.reset('messages');
    }

    if (activeTab === 'feed') {
      this.badges.reset('feed');
    }

    if (activeTab === 'channels') {
      // Only force the list view when the user taps the channels tab button directly.
      // When code programmatically navigates to a specific post/channel sub-page, the
      // router will have an ongoing navigation whose destination includes that sub-path —
      // in that case we must NOT override it, or the target page never loads.
      const nav = this.router.getCurrentNavigation();
      const destStr = nav?.extractedUrl?.toString() || this.router.url || '';
      const isDeepLink = /\/tabs\/channels\/(post|channel)\//.test(destStr)
                      || destStr.includes('/tabs/channels/post/')
                      || destStr.includes('/tabs/channels/channel/');
      if (!isDeepLink) {
        this.router.navigate(['/tabs/channels/list/followed']);
      }
    }
  }

  private isMessagesRoot(): boolean {
    return this.activeTab === 'messages';
  }

  // ----- helpers -----
  private isOnMessagesScreen(): boolean {
    return this.activeTab === 'messages';
  }

  private isInChatWith(peerId: string): boolean {
    if (!this.currentUrl) return false;
    const m = this.currentUrl.match(/\/messages\/chat\/([a-f0-9]{24})/i);
    return !!m && m[1] === String(peerId);
  }
}
