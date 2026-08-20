import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { IdService } from 'src/app/services/id.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-blocked-users-modal',
  templateUrl: './blocked-users-modal.component.html',
  styleUrls: ['./blocked-users-modal.component.scss']
})
export class BlockedUsersModalComponent implements OnInit {
  blockedIds: string[] = [];
  users: any[] = [];
  loading = true;
  searchTerm = '';

  get visibleUsers(): any[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) return this.users;

    return this.users.filter((user: any) => {
      const searchable = [
        user?.fullName,
        user?.firstName,
        user?.lastName,
        user?.city,
        user?.country
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }

  constructor(
    private modalCtrl: ModalController,
    private userService: UserService,
    private idService: IdService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    try {
      const cu = this.userService.currentUserValue;
      this.blockedIds = (cu && cu.blockedUsers) ? cu.blockedUsers.map((b:any) => String(b)) : [];
    } catch (e) { this.blockedIds = []; }

    if (!this.blockedIds.length) {
      this.loading = false;
      return;
    }

    let pending = this.blockedIds.length;
    this.users = [];
    this.blockedIds.forEach(rawId => {
      let id = rawId;
      try { id = this.idService.normalizeId(rawId) || String(rawId); } catch (e) { id = String(rawId); }
      this.userService.getUserProfile(id, { forceRefresh: true }).subscribe({
        next: (u: any) => {
          if (u) {
            this.users.push(u);
          } else {
            this.users.push({ _id: id, firstName: 'Blocked', lastName: 'User', fullName: 'Blocked User' });
          }
          pending -= 1; if (pending === 0) this.loading = false;
        },
        error: (err: any) => {
          this.users.push({ _id: id, firstName: 'Blocked', lastName: 'User', fullName: 'Blocked User' });
          pending -= 1; if (pending === 0) this.loading = false;
        }
      });
    });
  }

  close() {
    this.modalCtrl.dismiss();
  }

  unblock(user: any) {
    const id = user?._id || user?.id;
    if (!id) return;
    this.userService.unblock(id).subscribe({
      next: () => {
        this.toastService.presentSuccessToastr('User unblocked');
        this.users = this.users.filter(u => (u._id || u.id) !== id);
        // Invalidate cached profile for the unblocked user and refresh current user/friends
        try { this.userService.invalidateProfile(String(id)); } catch (e) {}
        try { this.userService.triggerFriendsRefresh(); } catch (e) {}
        this.userService.refreshCurrentUser({ forceRefresh: true }).subscribe(()=>{}, ()=>{});
      },
      error: (err) => {
        console.error('Error unblocking user', err);
        this.toastService.presentErrorToastr('Error unblocking user');
      }
    });
  }

  goToProfile(user: any) {
    const id = user?._id || user?.id;
    if (!id) return;
    this.modalCtrl.dismiss({ goToProfile: id });
  }
}
