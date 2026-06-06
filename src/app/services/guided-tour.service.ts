import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { UserService } from './user.service';

export interface GuidedTourStep {
  id: string;
  title: string;
  body: string;
  icon: string;
  route?: string;
  target?: string;
}

export interface GuidedTourState {
  active: boolean;
  steps: GuidedTourStep[];
  index: number;
  mode: 'auto' | 'replay';
}

@Injectable({ providedIn: 'root' })
export class GuidedTourService {
  private readonly version = 'v2';
  private readonly pendingPrefix = 'folcen.guide.pending.';
  private readonly donePrefix = 'folcen.guide.done.';
  private readonly stateSubject = new BehaviorSubject<GuidedTourState>({
    active: false,
    steps: [],
    index: 0,
    mode: 'auto'
  });

  state$ = this.stateSubject.asObservable();

  constructor(
    private router: Router,
    private userService: UserService
  ) {}

  markPendingForUser(userLike?: any) {
    const userId = this.resolveUserId(userLike);
    if (!userId || this.hasFinished(userId)) return;
    this.safeSet(this.pendingKey(userId), '1');
  }

  async maybeStartAfterSignup() {
    if (this.stateSubject.value.active) return;
    const userId = this.resolveUserId();
    if (!userId || this.hasFinished(userId) || this.safeGet(this.pendingKey(userId)) !== '1') return;
    if (this.isSensitiveRoute()) return;
    await this.start('auto');
  }

  async replay() {
    await this.start('replay');
  }

  async start(mode: 'auto' | 'replay' = 'auto') {
    if (this.stateSubject.value.active) return;
    if (this.isSensitiveRoute()) return;
    const steps = this.buildSteps();
    this.stateSubject.next({ active: true, steps, index: 0, mode });
    await this.goToStep(0);
  }

  async next() {
    const state = this.stateSubject.value;
    const nextIndex = state.index + 1;
    if (nextIndex >= state.steps.length) {
      this.finish('completed');
      return;
    }
    this.stateSubject.next({ ...state, index: nextIndex });
    await this.goToStep(nextIndex);
  }

  async back() {
    const state = this.stateSubject.value;
    const prevIndex = Math.max(0, state.index - 1);
    this.stateSubject.next({ ...state, index: prevIndex });
    await this.goToStep(prevIndex);
  }

  skip() {
    this.finish('skipped');
  }

  finish(status: 'completed' | 'skipped') {
    const userId = this.resolveUserId();
    if (userId) {
      this.safeSet(this.doneKey(userId), JSON.stringify({ status, version: this.version, at: new Date().toISOString() }));
      this.safeRemove(this.pendingKey(userId));
    }
    this.stateSubject.next({ ...this.stateSubject.value, active: false });
  }

  private async goToStep(index: number) {
    const step = this.stateSubject.value.steps[index];
    if (step?.route && this.router.url !== step.route) {
      await this.router.navigateByUrl(step.route);
    }
  }

  private buildSteps(): GuidedTourStep[] {
    const steps: GuidedTourStep[] = [
      {
        id: 'welcome',
        title: 'Welcome to Folcen',
        body: 'A quick tour, then the app is yours.',
        icon: 'sparkles-outline',
        route: '/tabs/new-friends'
      },
      {
        id: 'discover',
        title: 'Discover People',
        body: 'Find new friends nearby and open profiles that feel worth knowing.',
        icon: 'search-outline',
        route: '/tabs/new-friends',
        target: '[data-tour="tab-new-friends"]'
      },
      {
        id: 'profile',
        title: 'Your Profile',
        body: 'Your photos, bio, privacy, and the way others meet you.',
        icon: 'person-circle-outline',
        route: '/tabs/profile',
        target: '[data-tour="tab-profile"]'
      },
      {
        id: 'avatar-customize',
        title: 'Make It Yours',
        body: 'Upload photos or design a custom avatar with your own Folcen style.',
        icon: 'color-palette-outline',
        route: '/tabs/profile',
        target: '[data-tour="profile-avatar-tools"]'
      },
      {
        id: 'friends',
        title: 'Friends & Requests',
        body: 'Accept requests, keep your circle close, and stay in control.',
        icon: 'people-outline',
        route: '/tabs/friends',
        target: '[data-tour="tab-friends"]'
      },
      {
        id: 'chat',
        title: 'Chat Instantly',
        body: 'Messages live here, with real-time status when your friends reply.',
        icon: 'chatbubbles-outline',
        route: '/tabs/messages/list',
        target: '[data-tour="tab-messages"]'
      },
      {
        id: 'calls',
        title: 'Calls When It Matters',
        body: 'Start video or audio calls from chat when both users can connect.',
        icon: 'videocam-outline',
        route: '/tabs/messages/list',
        target: '[data-tour="tab-messages"]'
      },
      {
        id: 'posts',
        title: 'Posts & Channels',
        body: 'Share updates and follow conversations from your community.',
        icon: 'newspaper-outline',
        route: '/tabs/channels/list/followed',
        target: '[data-tour="tab-channels"]'
      },
      {
        id: 'explore-channels',
        title: 'Explore Channels',
        body: 'Browse city, country, and global channels to find communities worth following.',
        icon: 'globe-outline',
        route: '/tabs/channels/list/followed',
        target: '[data-tour="channels-explore"]'
      },
      {
        id: 'follow-channel',
        title: 'Follow What You Like',
        body: 'Open Explore to find channels first. Follow the ones you want in your feed.',
        icon: 'heart-outline',
        route: '/tabs/channels/list/explore',
        target: '[data-tour="channels-explore"]'
      },
      {
        id: 'create-channel',
        title: 'Create a Space',
        body: 'Start your own channel for a topic, place, event, or local group.',
        icon: 'add-circle-outline',
        route: '/tabs/channels/list/mines',
        target: '[data-tour="channels-create"]'
      },
      {
        id: 'post-privacy',
        title: 'Post With Control',
        body: 'Choose Public, Friends, or Private before you publish.',
        icon: 'eye-outline',
        route: '/tabs/channels/list/followed'
      },
      {
        id: 'anonymous-posts',
        title: 'Anonymity When Needed',
        body: 'Posts and comments can protect your identity when the moment calls for it.',
        icon: 'person-circle-outline',
        route: '/tabs/channels/list/followed'
      },
      {
        id: 'feed',
        title: 'The Feed',
        body: 'A familiar stream for what friends and communities are sharing.',
        icon: 'albums-outline',
        route: '/tabs/feed',
        target: '[data-tour="tab-feed"]'
      },
      {
        id: 'notifications',
        title: 'Never Miss a Beat',
        body: 'Badges and alerts help you catch requests, messages, and calls.',
        icon: 'notifications-outline',
        route: '/tabs/profile',
        target: '[data-tour="tab-profile"]'
      },
      {
        id: 'privacy',
        title: 'Privacy Controls',
        body: 'Tune profile privacy, video requests, blocked users, and who can see you.',
        icon: 'shield-checkmark-outline',
        route: '/tabs/profile/settings',
        target: '[data-tour="settings-privacy"]'
      },
      {
        id: 'theme',
        title: 'Light or Dark',
        body: 'Switch theme anytime so Folcen feels comfortable day or night.',
        icon: 'contrast-outline',
        route: '/tabs/profile/settings',
        target: '[data-tour="settings-theme"]'
      },
      {
        id: 'settings',
        title: 'Replay Anytime',
        body: 'Settings is also where you can replay this guide later.',
        icon: 'settings-outline',
        route: '/tabs/profile/settings',
        target: '[data-tour="settings-guide"]'
      }
    ];

    if (environment.features.marketplace) {
      steps.splice(8, 0, {
        id: 'marketplace',
        title: 'Marketplace',
        body: 'Buy and sell safely when marketplace features are enabled.',
        icon: 'storefront-outline',
        route: '/tabs/buy-and-sell',
        target: '[data-tour="tab-buy-and-sell"]'
      });
    }

    if (environment.features.jobsBoard || environment.features.servicesBoard) {
      steps.splice(8, 0, {
        id: 'business',
        title: 'Jobs & Services',
        body: 'Find local opportunities and useful services in one place.',
        icon: 'briefcase-outline',
        route: '/tabs/small-business',
        target: '[data-tour="tab-small-business"]'
      });
    }

    return steps;
  }

  private hasFinished(userId: string): boolean {
    return !!this.safeGet(this.doneKey(userId));
  }

  private isSensitiveRoute(): boolean {
    const url = this.router.url || '';
    return url.includes('/messages/chat/')
      || url.includes('/video')
      || url.includes('/auth/')
      || url.includes('/profile/form');
  }

  private resolveUserId(userLike?: any): string | null {
    const user = userLike || this.userService.currentUserValue;
    return user?._id || user?.id || this.userService.getCurrentUserId();
  }

  private pendingKey(userId: string) {
    return `${this.pendingPrefix}${this.version}.${userId}`;
  }

  private doneKey(userId: string) {
    return `${this.donePrefix}${this.version}.${userId}`;
  }

  private safeGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  private safeSet(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  private safeRemove(key: string) {
    try { localStorage.removeItem(key); } catch (_) {}
  }
}
