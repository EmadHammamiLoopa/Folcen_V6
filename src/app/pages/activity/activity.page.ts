import { Component, OnInit } from '@angular/core';
import { ActivityService } from '../../services/activity.service';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../../services/socket.service';
import { Platform } from '@ionic/angular';
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

  constructor(private svc: ActivityService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.channelId = this.route.snapshot.queryParamMap.get('channelId');
    this.actorId = this.route.snapshot.queryParamMap.get('actorId');
    
    if (this.actorId === 'me') {
      // resolve current user id from SocketService or localStorage
      const owner = SocketService.getOwnerId();
      this.actorId = owner || null;
      this.filter = 'my';
      // For "My Archive", we want posts, comments, and votes (likes)
      this.load({ type: 'post,comment,like' });
    } else {
      this.load();
    }

    // init socket for realtime updates
    SocketService.initializeSocket().then(() => {
      SocketService.getSocket().then(sock => {
        if (!sock) return;
        sock.on('activity:created', (payload: any) => {
          // basic filtering: only prepend if matches active filters
          if (this.channelId && String(payload.channel) !== String(this.channelId)) return;
          if (this.actorId && String(payload.actor) !== String(this.actorId)) return;
          if (this.filter === 'posts' && payload.type !== 'post') return;
          if (this.filter === 'comments' && payload.type !== 'comment') return;
          this.activities.unshift(this.prepareActivity(payload));
        });
      });
    }).catch(() => {});
  }

  load(params: any = {}){
    if (!this.more && this.page !== 0) return;
    this.loading = true;
    const q: any = { page: this.page, limit: this.limit, ...params };
    if (this.channelId) q.channelId = this.channelId;
    if (this.actorId) q.actorId = this.actorId;
    
    if (!q.type) {
      if (this.filter === 'posts') q.type = 'post';
      else if (this.filter === 'comments') q.type = 'comment';
      else if (this.filter === 'my') q.type = 'post,comment,like';
    }

    this.svc.getActivities(q).subscribe((res: any) => {
      const docs = res.data && res.data.docs ? res.data.docs : [];
      const prepared = docs.map((d: any) => this.prepareActivity(d));
      if (this.page === 0) this.activities = prepared;
      else this.activities = this.activities.concat(prepared);
      if (docs.length < this.limit) this.more = false;
      this.loading = false;
      this.page++;
    }, () => this.loading = false);
  }

  private prepareActivity(a: any){
    // Ensure actor display name
    const actor = a.actor || {};
    const actorName = actor.firstName || actor.name || (actor._id ? ('User ' + String(actor._id).slice(-4)) : 'Unknown');

    // Build avatar URL: use absolute origin derived from environment.apiUrl if needed
    let avatar = actor.mainAvatar || '/assets/avatar-placeholder.png';
    try {
      const apiOrigin = environment.apiUrl.replace(/\/api\/v1\/?$/,'');
      if (avatar && avatar.indexOf('http') !== 0) {
        // Avoid double slashes
        avatar = apiOrigin.replace(/\/$/,'') + (avatar.startsWith('/') ? avatar : ('/' + avatar));
      }
    } catch (e) {}

    // channel name if provided
    const channelName = a.channel && typeof a.channel === 'object' ? (a.channel.name || a.channel.title || null) : null;

    // Summary / action verb
    let verb = 'performed an action';
    if (a.type === 'post') verb = 'posted';
    else if (a.type === 'comment') verb = 'commented';
    else if (a.type === 'like') verb = 'liked';

    const summary = actorName + ' ' + verb;

    // snippet
    const snippet = a.content ? (a.content.length > 120 ? a.content.slice(0,117) + '...' : a.content) : '';

    // target link heuristic
    let targetLink: any = a.targetLink || null;
    if (!targetLink) {
      if (a.type === 'post') {
        if (a.targetId) {
          targetLink = { path: '/tabs/channels/post/' + a.targetId };
        } else if (a.channel && typeof a.channel === 'object') {
          targetLink = { path: '/tabs/channels/channel', queryParams: { channel: JSON.stringify(a.channel) } };
        } else if (a.channel) {
          // If only id is available, pass minimal object and allow ChannelComponent to fetch
          targetLink = { path: '/tabs/channels/channel', queryParams: { channel: JSON.stringify({ id: a.channel }) } };
        }
      } else if (a.type === 'comment' || a.type === 'like') {
        if (a.targetId) {
          const queryParams: any = {};
          if (a.meta && a.meta.commentId) {
            queryParams.commentId = a.meta.commentId;
          }
          targetLink = { path: '/tabs/channels/post/' + a.targetId, queryParams };
        }
      }
    }

    return { ...a, actorName, avatar, summary, snippet, targetLink, channelName };
  }

  loadMore(event: any){
    this.load();
    setTimeout(() => { event.target.complete(); }, 600);
  }

  setFilter(f: any){
    const value: 'all'|'my'|'posts'|'comments' = (typeof f === 'string') ? f : (f && f.detail && f.detail.value ? f.detail.value : 'all');
    this.filter = value;
    this.page = 0;
    this.more = true;
    this.load();
  }

  openItem(a: any){
    try {
      if (!a || !a.targetLink) return;
      if (typeof a.targetLink === 'string') {
        this.router.navigateByUrl(a.targetLink);
        return;
      }
      // object route: { path, queryParams }
      if (a.targetLink.path && a.targetLink.queryParams) {
        this.router.navigate([a.targetLink.path], { queryParams: a.targetLink.queryParams });
        return;
      }
      if (a.targetLink.path) {
        this.router.navigateByUrl(a.targetLink.path);
        return;
      }
    } catch (e) { console.warn('Navigation failed', e); }
  }

  close(){
    try { this.router.navigateByUrl('/'); } catch (e) { window.history.back(); }
  }
}
