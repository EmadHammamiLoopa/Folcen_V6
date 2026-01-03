import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Socket } from 'socket.io-client';
import { BehaviorSubject, of } from 'rxjs';
import { filter } from 'rxjs/operators';

import { RequestService } from 'src/app/services/request.service';
import { AppEventsService, TabKey } from 'src/app/services/app-events.service';
import { SocketService } from 'src/app/services/socket.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
})
export class TabsPage implements OnInit, OnDestroy {
  private socket: Socket | null = null;
  private listenersAttached = false;

  private currentUrl = '';
  private routerSub: any;
  private badgeCounts = new Map<TabKey, number>();
  showTabs = true;
  budget = 0;

  tabs: { url: TabKey; icon: string; notificationEvent?: string }[] = [
    { url: 'profile',        icon: 'fas fa-user' },
    { url: 'friends',        icon: 'fas fa-users',        notificationEvent: 'new-friend-request' },
    { url: 'messages',       icon: 'fas fa-comments',     notificationEvent: 'new-message' },
    { url: 'new-friends',    icon: 'fas fa-search',       notificationEvent: 'friend-suggestion' },
    { url: 'channels',       icon: 'fas fa-object-group', notificationEvent: 'new-channel-activity' },
    { url: 'feed',           icon: 'fas fa-newspaper' },
    { url: 'buy-and-sell',   icon: 'fas fa-store',        notificationEvent: 'new-buy-sell-update' },
    { url: 'small-business', icon: 'fas fa-briefcase',    notificationEvent: 'new-business-post' },
  ];

  constructor(
    private zone: NgZone,
    private router: Router,
    private badges: AppEventsService,
    private requestService: RequestService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    // Initialize badge subscriptions
    this.tabs.forEach(tab => {
      this.badges.badge$(tab.url).subscribe(count => {
        this.badgeCounts.set(tab.url, count || 0);
      });
    });

    this.badges.budget$.subscribe(b => {
      this.zone.run(() => {
        this.budget = b || 0;
      });
    });

    this.badges.showTabs$.subscribe(show => {
      this.showTabs = show;
    });

    // track route changes for smarter message badge behavior
    this.routerSub = this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) this.currentUrl = ev.urlAfterRedirects || ev.url;
    });
    this.currentUrl = this.router.url;

    try {
      // bind + connect socket
      (SocketService as any).bindToAuthUser?.(); // safe optional
      await SocketService.initializeSocket();
      await SocketService.ensureConnected();
      this.socket = await SocketService.getSocket();

      // realtime listeners (only if socket created)
      if (this.socket) {
        this.attachSocketListenersOnce();

        // seed exact count for friends on first load
        this.recountFriends();

        // seed again on reconnect
        this.socket.on('connect', () => this.recountFriends());
      }
    } catch (error) {
      console.error('Failed to init Tabs sockets:', error);
    }

    this.routerSub = this.router.events
      .pipe(filter(ev => ev instanceof NavigationEnd))
      .subscribe((ev: NavigationEnd) => {
        this.currentUrl = ev.urlAfterRedirects || ev.url;

        // Only clear the messages badge when landing on the Messages root view
        // (not when navigating to chat threads like /messages/chat/:id)
        if (this.isMessagesRoot()) {
          this.badges.reset('messages');
        }
      });
  
  }

  ngOnDestroy() {
    if (this.routerSub) this.routerSub.unsubscribe();

    if (this.socket) {
      // remove per-tab generics
      this.tabs.forEach(t => t.notificationEvent && this.socket!.off(t.notificationEvent));

      // remove friends specifics
      this.socket.off('friend-requests-updated');
      this.socket.off('friend-request-accepted');
      this.socket.off('friend-request-declined');

      // remove messages specifics
      this.socket.off('messages-updated');

      this.socket.off('connect');
      this.socket.off('disconnect');
    }
  }

  // ----- template helpers -----
  trackByUrl(index: number, tab: { url: TabKey; icon: string; notificationEvent?: string }) {
    return tab.url;
  }

  getBadgeCount(tab: TabKey): number {
    return this.badgeCounts.get(tab) || 0;
  }

  // ----- realtime / API -----
  private attachSocketListenersOnce() {
    if (!this.socket || this.listenersAttached) return;

    // generic per-tab events
    this.tabs.forEach(tab => {
      if (!tab.notificationEvent) return;
      const eventName = tab.notificationEvent;

      this.socket!.on(eventName, (payload: any) => {
        this.zone.run(() => {
          if (tab.url === 'friends') {
            // keep friends exact
            this.recountFriends();
            return;
          }

          if (tab.url === 'messages' && eventName === 'new-message') {
            // Skip bump if already on Messages root or in the same chat thread
            if (this.isOnMessagesScreen()) return;
            const incomingFrom = payload?.from?._id || payload?.from;
            if (incomingFrom && this.isInChatWith(incomingFrom)) return;

            this.badges.inc('messages', 1);
            return;
          }

          // all other tabs
          this.badges.inc(tab.url, 1);
        });
      });
    });

    // precise recount hooks for friends
    ['friend-requests-updated', 'friend-request-accepted', 'friend-request-declined']
      .forEach(ev => this.socket!.on(ev, () => this.zone.run(() => {
        this.recountFriends();
        this.userService.triggerFriendsRefresh();
      })));

    // optional precise messages recount hook (if server emits totals)
    this.socket.on('messages-updated', (data: any) => {
      this.zone.run(() => {
        const total = Number(data?.totalUnread);
        if (Number.isFinite(total)) this.badges.set('messages', Math.max(0, total));
      });
    });

    this.listenersAttached = true;
  }

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
    const activeTab = event?.detail?.tab || event?.tab;
    if (!activeTab) return;

    if (activeTab === 'friends') {
      // visually clear; recount keeps it correct
      this.badges.reset('friends');
    }

    if (activeTab === 'messages') {
      // visually clear when entering messages root
      if (this.isMessagesRoot()) this.badges.reset('messages');
    }

    if (activeTab === 'channels') {
      // Force navigation to the 'followed' list whenever the channels tab is clicked
      this.router.navigate(['/tabs/channels/list/followed']);
    }
  }

  private isMessagesRoot(): boolean {
    // Consider messages root as exactly '/messages' or '/tabs/messages' variants
    const url = this.currentUrl || '';
    return url === '/messages' || url.startsWith('/messages?') || url.endsWith('/messages') || url.includes('/tabs/messages');
  }

  // ----- helpers -----
  private isOnMessagesScreen(): boolean {
    // covers /messages, /messages/..., /messages/chat/:id
    return this.currentUrl?.includes('/messages');
    // You can tighten this to `^/tabs/messages` with a proper router tree if needed
  }

  private isInChatWith(peerId: string): boolean {
    if (!this.currentUrl) return false;
    const m = this.currentUrl.match(/\/messages\/chat\/([a-f0-9]{24})/i);
    return !!m && m[1] === String(peerId);
  }
}
