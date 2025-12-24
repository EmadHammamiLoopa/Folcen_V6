import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';
import { IdService } from 'src/app/services/id.service';
import constants from 'src/app/helpers/constants';

@Component({
  selector: 'app-follow-list-modal',
  templateUrl: './follow-list-modal.component.html',
  styleUrls: ['./follow-list-modal.component.scss'],
})
export class FollowListModalComponent implements OnInit {
  @Input() userId: string;
  @Input() type: 'followers' | 'following';
  @Input() isMyProfile: boolean;

  users: any[] = [];
  loading = true;
  domaine = constants.DOMAIN_URL;

  constructor(
    private modalCtrl: ModalController,
    private userService: UserService,
    private toastService: ToastService
    , private idService: IdService
  ) {}

  ngOnInit() {
    try {
      const nid = this.idService.normalizeId(this.userId);
      if (nid) this.userId = nid;
    } catch (e) { console.warn('Failed to normalize userId in follow-list modal', e); }
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    const obs = this.type === 'followers' 
      ? this.userService.getFollowers(this.userId)
      : this.userService.getFollowing(this.userId);

    obs.subscribe({
      next: (res: any) => {
        this.users = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading follow list:', err);
        this.loading = false;
        this.toastService.presentToast('Error loading list');
      }
    });
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  unfollow(targetUserId: string) {
    try { targetUserId = this.idService.normalizeId(targetUserId) || targetUserId; } catch (e) {}
    this.userService.unfollow(targetUserId).subscribe({
      next: () => {
        this.users = this.users.filter(u => u._id !== targetUserId);
        this.toastService.presentToast('Unfollowed successfully');
      },
      error: (err) => {
        console.error('Error unfollowing:', err);
        this.toastService.presentToast('Error unfollowing user');
      }
    });
  }

  removeFollower(targetUserId: string) {
    this.userService.removeFollower(targetUserId).subscribe({
      next: () => {
        this.users = this.users.filter(u => u._id !== targetUserId);
        this.toastService.presentToast('Follower removed');
      },
      error: (err) => {
        console.error('Error removing follower:', err);
        this.toastService.presentToast('Error removing follower');
      }
    });
  }

  avatarUrl(avatar: string): string {
    if (!avatar) return 'assets/images/default-avatar.png';
    if (avatar.startsWith('http')) return avatar;
    return this.domaine + avatar;
  }
}
