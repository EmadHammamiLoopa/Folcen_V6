import { Component, OnInit } from '@angular/core';
import { ActivityService } from '../../services/activity.service';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../../services/socket.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-activity',
  templateUrl: './activity.page.html',
  styleUrls: ['./activity.page.scss']
})
export class ActivityPage implements OnInit {
  activities: any[] = [];
  loading = false;
  page = 0;
  limit = 20;
  more = true;
  filter: 'all' | 'my' | 'posts' | 'comments' = 'all';

  private channelId: string | null = null;
  public actorId: string | null = null;

  private filterCache: { [key: string]: any[] } = {};
  private filterMore: { [key: string]: boolean } = {};
  private filterPage: { [key: string]: number } = {};
  private requestSeq = 0;

  constructor(private svc: ActivityService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.channelId = this.route.snapshot.queryParamMap.get('channelId');
    this.actorId = this.route.snapshot.queryParamMap.get('actorId');

    if (this.actorId === 'me') {
      const owner = SocketService.getOwnerId();
      this.actorId = owner || null;
      this.filter = 'my';
      this.load({ type: 'post,comment,like' });
    } else {
      this.load();
    }

    SocketService.initializeSocket().then(() => {
      SocketService.getSocket().then(sock => {
        if (!sock) return;
        sock.on('activity:created', (payload: any) => {
          if (this.channelId && String(payload.channel) !== String(this.channelId)) return;
          if (this.actorId && String(payload.actor) !== String(this.actorId)) return;

          const prepared = this.prepareActivity(payload);
          this.prependToRelevantCaches(prepared);

          if (this.matchesFilter(prepared, this.filter)) {
            this.activities = [prepared, ...this.activities];
          }
        });
      });
    }).catch(() => {});
  }

  private cacheKey(filter: string = this.filter): string {
    return filter || 'all';
  }

  private matchesFilter(activity: any, filter: string): boolean {
    if (filter === 'posts') return activity?.type === 'post';
    if (filter === 'comments') return activity?.type === 'comment';
    if (filter === 'my') return ['post', 'comment', 'like'].includes(activity?.type);
    return true;
  }

  private deriveFromCache(filter: 'all' | 'my' | 'posts' | 'comments'): any[] {
    const direct = this.filterCache[this.cacheKey(filter)];
    if (direct?.length) return direct;

    const broad = this.filterCache.my || this.filterCache.all || [];
    return broad.filter(item => this.matchesFilter(item, filter));
  }

  private prependToRelevantCaches(activity: any) {
    Object.keys(this.filterCache).forEach(key => {
      if (this.matchesFilter(activity, key)) {
        this.filterCache[key] = [activity, ...this.filterCache[key]];
      }
    });
  }

  load(params: any = {}, options: { background?: boolean } = {}) {
    const activeFilter = this.filter;
    const key = this.cacheKey(activeFilter);
    const requestedPage = this.page;

    if (!this.more && requestedPage !== 0) return;

    const requestId = ++this.requestSeq;
    if (!options.background || this.activities.length === 0) this.loading = true;

    const q: any = { page: requestedPage, limit: this.limit, ...params };
    if (this.channelId) q.channelId = this.channelId;
    if (this.actorId) q.actorId = this.actorId;

    if (!q.type) {
      if (activeFilter === 'posts') q.type = 'post';
      else if (activeFilter === 'comments') q.type = 'comment';
      else if (activeFilter === 'my') q.type = 'post,comment,like';
    }

    this.svc.getActivities(q).subscribe((res: any) => {
      const docs = res.data && res.data.docs ? res.data.docs : [];
      const prepared = docs.map((d: any) => this.prepareActivity(d));
      const existing = requestedPage === 0 ? [] : (this.filterCache[key] || []);
      const merged = requestedPage === 0 ? prepared : existing.concat(prepared);

      this.filterCache[key] = merged;
      this.filterMore[key] = docs.length >= this.limit;
      this.filterPage[key] = requestedPage + 1;

      if (this.filter === activeFilter) {
        this.activities = merged;
        this.more = this.filterMore[key];
        this.page = this.filterPage[key];
        this.loading = false;
      } else if (requestId === this.requestSeq) {
        this.loading = false;
      }
    }, () => {
      if (this.filter === activeFilter) this.loading = false;
    });
  }

  private prepareActivity(a: any) {
    const actor = a.actor || {};
    const actorName = actor.firstName || actor.name || (actor._id ? ('User ' + String(actor._id).slice(-4)) : 'Unknown');

    let avatar = actor.mainAvatar || '/assets/avatar-placeholder.png';
    try {
      const apiOrigin = environment.apiUrl.replace(/\/api\/v1\/?$/, '');
      if (avatar && avatar.indexOf('http') !== 0) {
        avatar = apiOrigin.replace(/\/$/, '') + (avatar.startsWith('/') ? avatar : ('/' + avatar));
      }
    } catch (e) {}

    const channelName = a.channel && typeof a.channel === 'object' ? (a.channel.name || a.channel.title || null) : null;

    let verb = 'performed an action';
    if (a.type === 'post') verb = 'posted';
    else if (a.type === 'comment') verb = 'commented';
    else if (a.type === 'like') verb = 'liked';

    const summary = actorName + ' ' + verb;
    const snippet = a.content ? (a.content.length > 120 ? a.content.slice(0, 117) + '...' : a.content) : '';

    let targetLink: any = a.targetLink || null;
    if (!targetLink) {
      if (a.type === 'post') {
        if (a.targetId) {
          targetLink = { path: '/tabs/channels/post/' + a.targetId };
        } else if (a.channel && typeof a.channel === 'object') {
          targetLink = { path: '/tabs/channels/channel', queryParams: { channel: JSON.stringify(a.channel) } };
        } else if (a.channel) {
          targetLink = { path: '/tabs/channels/channel', queryParams: { channel: JSON.stringify({ id: a.channel }) } };
        }
      } else if (a.type === 'comment') {
        if (a.targetId) {
          const queryParams: any = {};
          if (a.meta && a.meta.commentId) queryParams.commentId = a.meta.commentId;
          targetLink = { path: '/tabs/channels/post/' + a.targetId, queryParams };
        }
      } else if (a.type === 'like') {
        if (a.targetType === 'comment' && a.meta && a.meta.postId) {
          targetLink = { path: '/tabs/channels/post/' + a.meta.postId, queryParams: { commentId: a.targetId } };
        } else if (a.targetId) {
          targetLink = { path: '/tabs/channels/post/' + a.targetId };
        }
      } else if (a.type === 'product') {
        if (a.targetId) targetLink = { path: '/tabs/buy-and-sell/product/' + a.targetId };
      } else if (a.type === 'job') {
        if (a.targetId) targetLink = { path: '/tabs/small-business/jobs/job/' + a.targetId };
      } else if (a.type === 'service') {
        if (a.targetId) targetLink = { path: '/tabs/small-business/services/service/' + a.targetId };
      }
    }

    return { ...a, actorName, avatar, summary, snippet, targetLink, channelName };
  }

  loadMore(event: any) {
    this.load();
    setTimeout(() => { event.target.complete(); }, 600);
  }

  setFilter(f: any) {
    const value: 'all' | 'my' | 'posts' | 'comments' =
      (typeof f === 'string') ? f : (f && f.detail && f.detail.value ? f.detail.value : 'all');

    if (value === this.filter) return;

    this.filter = value;
    const key = this.cacheKey(value);
    const cached = this.deriveFromCache(value);

    // Update the UI immediately from memory. The network refresh happens in the background.
    this.activities = cached;
    this.page = this.filterPage[key] ?? 0;
    this.more = this.filterMore[key] ?? true;
    this.loading = false;

    // First visit to a filter: fetch its authoritative list without blocking the tab transition.
    if (!this.filterCache[key]) {
      this.page = 0;
      this.more = true;
      this.load({}, { background: true });
    }
  }

  openItem(a: any) {
    try {
      if (!a || !a.targetLink) return;
      if (typeof a.targetLink === 'string') {
        this.router.navigateByUrl(a.targetLink);
        return;
      }
      if (a.targetLink.path && a.targetLink.queryParams) {
        this.router.navigate([a.targetLink.path], { queryParams: a.targetLink.queryParams });
        return;
      }
      if (a.targetLink.path) this.router.navigateByUrl(a.targetLink.path);
    } catch (e) { console.warn('Navigation failed', e); }
  }

  close() {
    try { this.router.navigateByUrl('/'); } catch (e) { window.history.back(); }
  }
}
