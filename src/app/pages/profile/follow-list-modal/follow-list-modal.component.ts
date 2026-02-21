import { Component, Input, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from 'src/app/services/socket.service';
import { ModalController, NavController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';
import { IdService } from 'src/app/services/id.service';
import constants from 'src/app/helpers/constants';
import { Router } from '@angular/router';
import { User } from 'src/app/models/User';

@Component({
  selector: 'app-follow-list-modal',
  templateUrl: './follow-list-modal.component.html',
  styleUrls: ['./follow-list-modal.component.scss'],
})
export class FollowListModalComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  @Input() userId: string;
  @Input() type: 'followers' | 'following' | 'friends';
  @Input() isMyProfile: boolean;

  users: any[] = [];
  filteredUsers: any[] = [];
  requests: any[] = [];
  loading = true;
  loadingRequests = false;
  domaine = constants.DOMAIN_URL;
  searchTerm = '';

  constructor(
    private modalCtrl: ModalController,
    private userService: UserService,
    private toastService: ToastService,
    private idService: IdService,
    private navCtrl: NavController,
    private router: Router,
    private zone: NgZone
  ) {}

  ngOnInit() {
    try {
      const nid = this.idService.normalizeId(this.userId);
      if (nid) this.userId = nid;
    } catch (e) { console.warn('Failed to normalize userId in follow-list modal', e); }
    this.loadUsers();
    if (this.isMyProfile && this.type === 'followers') {
      this.loadRequests();
    }

    // Refresh friends list on friend-related socket events
    try {
      SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
        if (this.type === 'friends') this.zone.run(() => this.loadFriends());
      });
    } catch (e) {}
    // Refresh entries when server notifies profile updates
    try {
      SocketService.userProfileUpdated$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
        try {
          const uid = payload?.userId;
          if (!uid) return;
          const idx = this.users.findIndex(u => (u && (u._id || u.id)) === String(uid));
          if (idx !== -1) {
            // force refresh this profile and replace
            this.userService.getUserProfile(uid, { forceRefresh: true }).subscribe({
              next: (u: any) => { if (u && u._id) { this.users[idx] = u; } },
              error: () => {}
            });
          }
        } catch (e) { console.warn('follow-list modal profile update handler error', e); }
      });
    } catch (e) {}
    // Refresh list when follow/unfollow/block events affect this list
    try {
      SocketService.followUpdate$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
        try {
          const followerId = payload?.followerId || payload?.follower;
          const followedId = payload?.followedId || payload?.followed;
          // If this modal is showing followers and the target user is the viewed user,
          // reload to reflect the change
          if ((this.type === 'followers' && String(followedId) === String(this.userId)) ||
              (this.type === 'following' && String(followerId) === String(this.userId))) {
            this.zone.run(() => this.loadUsers());
          }
        } catch (e) {}
      });
    } catch (e) {}
    try {
      SocketService.friendRequestsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
        if (this.isMyProfile) this.zone.run(() => this.loadUsers());
      });
    } catch (e) {}
  }

  async goToProfile(user: any) {
    const id = user?._id || user?.id;
    if (!id) return;
    const userId = this.idService.encodeForTransport(id);
    await this.modalCtrl.dismiss();
    this.navCtrl.navigateForward(['/profile/display', userId]);
  }

  ngOnDestroy() {
    try { this.destroy$.next(); this.destroy$.complete(); } catch (e) {}
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  private isFullUser(x: any) {
    return x && (x._id || x.firstName || x.id || x.email);
  }

  private extractIdFromBuffer(obj: any): string | null {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    if (obj._id && typeof obj._id === 'string') return obj._id;
    const candidate = obj.buffer || (obj.id && obj.id.buffer) || (obj._bsontype && obj.id);
    let buf: any = candidate;
    if (!buf) return null;
    const bytes: number[] = [];
    if (Array.isArray(buf)) {
      for (let b of buf) bytes.push(Number(b) & 0xff);
    } else if (typeof buf === 'object') {
      const len = buf.length || Object.keys(buf).filter(k => /^\d+$/.test(k)).length;
      for (let i = 0; i < len; i++) {
        const v = buf[i];
        if (v === undefined) break;
        bytes.push(Number(v) & 0xff);
      }
    }
    if (!bytes.length) return null;
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  loadUsers() {
    if (this.type === 'friends') {
      this.loadFriends();
      return;
    }
    if (!this.isMyProfile) {
      this.loading = false;
      this.users = [];
      this.filteredUsers = [];
      return;
    }
    this.loading = true;
    const obs = this.type === 'followers' 
      ? this.userService.getFollowers(this.userId)
      : this.userService.getFollowing(this.userId);

    obs.subscribe({
      next: (res: any) => {
        // Backend returns { docs: [], total: 0, pages: 0 }
        const docs = (res.data && res.data.docs) ? res.data.docs : (Array.isArray(res.data) ? res.data : []);
        this.users = [];
        this.filteredUsers = [];

        if (!docs || docs.length === 0) {
          // If API returned no docs but this is the authenticated user's "following" list,
          // fall back to the `currentUserValue.following` array which may be populated.
          if (this.type === 'following') {
            try {
              const me = this.userService.currentUserValue;
              const myFollowing = me && Array.isArray(me.following) ? me.following : [];
              if (myFollowing.length > 0 && String(me._id) === String(this.userId)) {
                let pending = myFollowing.length;
                myFollowing.forEach((fid: any) => {
                  const id = this.idService.normalizeId ? this.idService.normalizeId(fid) : String(fid);
                  this.userService.getUserProfile(id).subscribe({
                    next: (u: any) => {
                      if (u && u._id) this.users.push(u);
                      else this.users.push({ _id: id, firstName: 'User', lastName: '' });
                      this.filteredUsers = [...this.users];
                      pending -= 1; if (pending === 0) this.loading = false;
                    },
                    error: (err: any) => {
                      this.users.push({ _id: id, firstName: 'User', lastName: '' });
                      this.filteredUsers = [...this.users];
                      pending -= 1; if (pending === 0) this.loading = false;
                    }
                  });
                });
                return;
              }
            } catch (e) { /* ignore and continue */ }
          }
          this.loading = false;
          return;
        }

        let pending = docs.length;
        docs.forEach((entry: any) => {
          if (this.isFullUser(entry)) {
            this.users.push(new User().initialize(entry));
            this.filteredUsers = [...this.users];
            pending -= 1;
            if (pending === 0) this.loading = false;
            return;
          }

          // Try to extract an id and fetch the full profile
          const id = this.extractIdFromBuffer(entry) || this.extractIdFromBuffer(entry?._id) || this.extractIdFromBuffer(entry?.id);
          if (!id) {
            // push a minimal placeholder
            this.users.push({ _id: null, firstName: 'User', lastName: '' });
            this.filteredUsers = [...this.users];
            pending -= 1;
            if (pending === 0) this.loading = false;
            return;
          }

          this.userService.getUserProfile(id).subscribe({
            next: (u: any) => {
              if (u && u._id) this.users.push(u);
              else this.users.push({ _id: id, firstName: 'User', lastName: '' });
              this.filteredUsers = [...this.users];
              pending -= 1;
              if (pending === 0) this.loading = false;
            },
            error: (err: any) => {
              console.error('Failed to load profile for follower id', id, err);
              this.users.push({ _id: id, firstName: 'User', lastName: '' });
              this.filteredUsers = [...this.users];
              pending -= 1;
              if (pending === 0) this.loading = false;
            }
          });
        });
      },
      error: (err) => {
        console.error('Error loading follow list:', err);
        this.loading = false;
        this.toastService.presentErrorToastr('Error loading list');
      }
    });
  }

  loadRequests() {
    this.loadingRequests = true;
    this.userService.getFollowRequests().subscribe({
      next: (res: any) => {
        const rawRequests = res.data || [];
        this.requests = rawRequests.map((req: any) => {
          if (req.follower) {
            req.follower = new User().initialize(req.follower);
          }
          return req;
        });
        this.loadingRequests = false;
      },
      error: (err) => {
        console.error('Error loading follow requests:', err);
        this.loadingRequests = false;
      }
    });
  }

  acceptRequest(followerId: string) {
    this.userService.respondToFollowRequest(followerId, 'active').subscribe({
      next: () => {
        const req = this.requests.find(r => (r.follower?._id || r.follower?.id) === followerId);
        if (req && req.follower) {
          this.users.unshift(req.follower);
          this.filterUsers();
        }
        this.requests = this.requests.filter(r => (r.follower?._id || r.follower?.id) !== followerId);
        this.toastService.presentSuccessToastr('Request accepted');
      },
      error: (err) => {
        console.error('Error accepting request:', err);
        this.toastService.presentErrorToastr('Error accepting request');
      }
    });
  }

  rejectRequest(followerId: string) {
    this.userService.respondToFollowRequest(followerId, 'rejected').subscribe({
      next: () => {
        this.requests = this.requests.filter(r => (r.follower?._id || r.follower?.id) !== followerId);
        this.toastService.presentSuccessToastr('Request rejected');
      },
      error: (err) => {
        console.error('Error rejecting request:', err);
        this.toastService.presentErrorToastr('Error rejecting request');
      }
    });
  }

  filterUsers() {
    if (!this.searchTerm || this.searchTerm.trim() === '') {
      this.filteredUsers = [...this.users];
      return;
    }
    const term = this.searchTerm.toLowerCase().trim();
    this.filteredUsers = this.users.filter(u => 
      (u.firstName && u.firstName.toLowerCase().includes(term)) || 
      (u.lastName && u.lastName.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term))
    );
  }

  unfollow(targetUserId: string) {
    try { targetUserId = this.idService.normalizeId(targetUserId) || targetUserId; } catch (e) {}
    this.userService.unfollow(targetUserId).subscribe({
      next: () => {
        this.users = this.users.filter(u => (u._id || u.id) !== targetUserId);
        this.filterUsers();
        this.toastService.presentSuccessToastr('Unfollowed successfully');
      },
      error: (err) => {
        console.error('Error unfollowing:', err);
        this.toastService.presentErrorToastr('Error unfollowing user');
      }
    });
  }

  removeFollower(targetUserId: string) {
    this.userService.removeFollower(targetUserId).subscribe({
      next: () => {
        this.users = this.users.filter(u => (u._id || u.id) !== targetUserId);
        this.filterUsers();
        this.toastService.presentSuccessToastr('Follower removed');
      },
      error: (err) => {
        console.error('Error removing follower:', err);
        this.toastService.presentErrorToastr('Error removing follower');
      }
    });
  }

  loadFriends() {
    this.loading = true;
    this.userService.getFriends(0).subscribe({
      next: (res: any) => {
        // Backend returns { friends: [...], more: bool } — not wrapped in res.data
        const docs = (res.friends && Array.isArray(res.friends)) ? res.friends
          : (res.data && res.data.docs) ? res.data.docs
          : (res.data && Array.isArray(res.data)) ? res.data
          : (Array.isArray(res) ? res : []);
        this.users = [];
        this.filteredUsers = [];
        if (!docs || docs.length === 0) { this.loading = false; return; }
        let pending = docs.length;
        docs.forEach((entry: any) => {
          if (this.isFullUser(entry)) {
            this.users.push(new User().initialize(entry));
            this.filteredUsers = [...this.users];
            pending -= 1;
            if (pending === 0) this.loading = false;
            return;
          }
          const id = this.extractIdFromBuffer(entry) || this.extractIdFromBuffer(entry?._id);
          if (!id) { pending -= 1; if (pending === 0) this.loading = false; return; }
          this.userService.getUserProfile(id).subscribe({
            next: (u: any) => {
              if (u && u._id) this.users.push(u);
              this.filteredUsers = [...this.users];
              pending -= 1; if (pending === 0) this.loading = false;
            },
            error: () => { pending -= 1; if (pending === 0) this.loading = false; }
          });
        });
      },
      error: () => { this.loading = false; this.toastService.presentErrorToastr('Error loading friends'); }
    });
  }

  removeFriend(targetUserId: string) {
    this.userService.removeFriendship(targetUserId).subscribe({
      next: (resp: any) => {
        this.users = this.users.filter(u => (u._id || u.id) !== targetUserId);
        this.filterUsers();
        this.toastService.presentSuccessToastr(resp.message || 'Friend removed');
      },
      error: (err) => {
        console.error('Error removing friend:', err);
        this.toastService.presentErrorToastr('Error removing friend');
      }
    });
  }

  avatarUrl(avatar: any, gender: string = 'male', userId?: string): string {
    const getDiceBear = (seed?: string) => {
      const s = seed || userId || 'default-seed';
      // Use happy avataaars instead of bottts
      return `https://api.dicebear.com/9.x/avataaars/svg?seed=${s}&eyes=happy&mouth=smile`;
    };

    // Normalize avatar input
    if (!avatar) {
      return getDiceBear();
    }

    // handle arrays
    if (Array.isArray(avatar)) {
      avatar = avatar.length ? avatar[0] : null;
    }

    // handle objects
    if (avatar && typeof avatar === 'object') {
      avatar = avatar.path || avatar.url || avatar.mainAvatar || avatar._id || avatar.id || null;
    }

    if (!avatar) {
      return getDiceBear();
    }

    // now avatar should be a string
    try {
      avatar = String(avatar).trim();
    } catch (e) {
      return getDiceBear();
    }

    // If it's an old default avatar, replace with DiceBear
    const oldDefaults = ['male.webp', 'female.webp', 'other.webp'];
    if (oldDefaults.some(d => avatar.includes(d))) {
      return getDiceBear(avatar); // Use the old path as seed for consistency
    }

    // If it's already an absolute URL, return as-is
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;

    // Ensure single slash between domain and path
    const path = avatar.startsWith('/') ? avatar : `/${avatar}`;
    return this.domaine ? (this.domaine.replace(/\\/g, '') + path) : path;
  }
}
