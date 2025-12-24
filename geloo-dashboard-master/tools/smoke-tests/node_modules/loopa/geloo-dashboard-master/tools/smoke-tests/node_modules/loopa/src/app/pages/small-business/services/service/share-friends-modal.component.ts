import { Component, OnInit, Input } from '@angular/core';
import { ModalController, Platform } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { SocketService } from 'src/app/services/socket.service';
import { ToastService } from 'src/app/services/toast.service';
import { Service } from 'src/app/models/Service';
import { User } from 'src/app/models/User';

@Component({
  selector: 'app-share-friends-modal',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar class="vibrant-toolbar">
        <ion-title>Share with Friends</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">
            <i class="fas fa-times"></i>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="vibrant-dark-theme">
      <div class="mesh-gradient"></div>
      
      <div class="search-bar">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search friends..." [(ngModel)]="searchTerm">
      </div>

      <app-loader *ngIf="loading"></app-loader>

      <div class="friends-list" *ngIf="!loading">
        <div class="friend-item animate__animated animate__fadeInUp" 
             *ngFor="let friend of filteredFriends(); let i = index"
             [style.animation-delay]="(i * 0.05) + 's'"
             (click)="shareWith(friend)">
          <div class="avatar">
            <img [src]="friend.avatar || 'assets/imgs/user.png'" alt="">
          </div>
          <div class="info">
            <span class="name">{{ friend.fullName }}</span>
            <span class="status" [class.online]="friend.isOnline">
              {{ friend.isOnline ? 'Online' : 'Offline' }}
            </span>
          </div>
          <div class="share-icon">
            <i class="fas fa-paper-plane"></i>
          </div>
        </div>

        <div class="empty-state" *ngIf="filteredFriends().length === 0">
          <i class="fas fa-user-friends"></i>
          <p>No friends found</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .vibrant-toolbar {
      --background: var(--loopa-toolbar-background);
      --color: var(--ion-text-color);
      padding: 10px;
    }

    .vibrant-dark-theme {
      --background: var(--ion-background-color);
      position: relative;
    }

    .mesh-gradient {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.1) 0px, transparent 50%),
                  radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.1) 0px, transparent 50%);
      z-index: -1;
      opacity: var(--loopa-mesh-opacity);
    }

    .search-bar {
      margin: 15px;
      background: rgba(var(--ion-text-color-rgb), 0.05);
      border: 1px solid rgba(var(--ion-text-color-rgb), 0.1);
      border-radius: 15px;
      padding: 12px 15px;
      display: flex;
      align-items: center;
      gap: 12px;

      i { color: #818cf8; }
      input {
        background: transparent;
        border: none;
        color: var(--ion-text-color);
        width: 100%;
        outline: none;
        font-size: 0.9rem;
      }
    }

    .friends-list {
      padding: 0 15px 20px;
    }

    .friend-item {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 18px;
      padding: 12px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 15px;
      transition: all 0.2s ease;

      &:active {
        background: rgba(255, 255, 255, 0.08);
        transform: scale(0.98);
      }

      .avatar {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        overflow: hidden;
        img { width: 100%; height: 100%; object-fit: cover; }
      }

      .info {
        flex: 1;
        display: flex;
        flex-direction: column;
        .name { color: #f8fafc; font-weight: 600; font-size: 0.95rem; }
        .status { 
          font-size: 0.75rem; color: #94a3b8; 
          &.online { color: #10b981; }
        }
      }

      .share-icon {
        width: 36px;
        height: 36px;
        background: rgba(99, 102, 241, 0.1);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #818cf8;
      }
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #64748b;
      i { font-size: 3rem; margin-bottom: 15px; opacity: 0.3; }
    }
  `]
})
export class ShareFriendsModalComponent implements OnInit {
  @Input() service: Service;
  @Input() authUser: User;

  friends: any[] = [];
  loading = true;
  searchTerm = '';

  constructor(
    private modalCtrl: ModalController,
    private userService: UserService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadFriends();
  }

  loadFriends() {
    this.userService.getFriends(1).subscribe(
      (resp: any) => {
        this.friends = resp.data || [];
        this.loading = false;
      },
      err => {
        this.loading = false;
        this.toastService.presentStdToastr('Failed to load friends');
      }
    );
  }

  filteredFriends() {
    if (!this.searchTerm) return this.friends;
    return this.friends.filter(f => 
      f.fullName.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  async shareWith(friend: any) {
    const payload = {
      id: Date.now().toString(),
      tempId: Date.now().toString(),
      from: this.authUser.id,
      to: friend._id,
      text: `Check out this service: ${this.service.title}\n${window.location.origin}/tabs/small-business/services/service/${this.service.id}`,
      state: 'sending',
      type: 'friend',
      createdAt: new Date(),
    };

    try {
      await SocketService.initializeSocket();
      SocketService.emit('send-message', payload);
      this.toastService.presentStdToastr(`Shared with ${friend.fullName}`);
      this.dismiss();
    } catch (error) {
      this.toastService.presentStdToastr('Failed to share message');
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
