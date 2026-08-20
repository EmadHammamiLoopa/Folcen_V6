import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { RequestService } from 'src/app/services/request.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';
import { Request } from 'src/app/models/Request';
import { User } from 'src/app/models/User';
import { AlertController } from '@ionic/angular';
import { AppEventsService } from 'src/app/services/app-events.service';
import { SocketService } from 'src/app/services/socket.service';
import { Subject, Subscription, merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss'],
})
export class RequestsComponent implements OnInit, OnDestroy {
  requests: Request[] = [];
  pageLoading = false;
  showSandglass = false;
  page: number = 0;
  private destroy$ = new Subject<void>();
  private badgeSubscription!: Subscription;
  private friendRequestCount = 0;

  constructor(
    private router: Router,
    private requestService: RequestService,
    private userService: UserService,
    private toastService: ToastService,
    private alertCtrl: AlertController,
    private appEvents: AppEventsService,
    private zone: NgZone
  ) {}

  goToProfile(userId: string) {
    if (!userId) return;
    this.router.navigate(['/tabs/profile/display', userId]);
  }

  async ngOnInit() {
    this.badgeSubscription = this.appEvents.badge$('friends').subscribe(count => {
      this.friendRequestCount = count;
      this.updatePageTitle();
    });

    merge(
      SocketService.newFriendRequest$,
      SocketService.friendRequestsUpdated$
    ).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.zone.run(() => {
        this.page = 0;
        this.loadRequests();
        this.updatePageTitle();
      });
    });

    this.loadRequests();
  }

  ionViewWillEnter() {
    this.page = 0;
    this.loadRequests();
    this.updatePageTitle();
  }

  ionViewWillLeave() {
    this.resetPageTitle();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.badgeSubscription) this.badgeSubscription.unsubscribe();
    this.resetPageTitle();
  }

  private updatePageTitle() {
    if (this.friendRequestCount > 0) {
      document.title = `(${this.friendRequestCount}) Friend Requests`;
    } else {
      document.title = 'Friend Requests';
    }
  }

  private resetPageTitle() {
    document.title = 'Your App Name';
  }

  loadRequests(event?: any) {
    this.pageLoading = true;
    this.getRequests(this.page, event);
  }

  getRequests(page: number = this.page, event?: any) {
    this.requestService.requests(page).then(
      (resp: any) => {
        const dataArray = Array.isArray(resp?.data) ? resp.data : [];
        if (!event) {
          this.requests = [];
        }

        this.requests = [
          ...this.requests,
          ...dataArray.map((requestData: any) => {
            const request = new Request().initialize(requestData);
            request.from = new User().initialize({
              ...requestData.from,
              mainAvatar: requestData.from?.mainAvatar || requestData.from?.avatar?.[0],
            });
            return request;
          }),
        ];

        if (page === 0) {
          const count = dataArray.length;
          this.appEvents.set('friends', count);
          this.friendRequestCount = count;
          this.updatePageTitle();
        }

        if (event?.target) event.target.complete();
        this.pageLoading = false;
      },
      (err) => {
        this.pageLoading = false;
        console.error('Error loading requests:', err);
        this.toastService.presentErrorToastr('Failed to load requests.');
        if (event?.target) event.target.complete();
      }
    );
  }

  async acceptRequest(request: Request) {
    const requestId = request._id;
    this.showSandglass = true;
    try {
      const resp: any = await this.requestService.acceptRequest(requestId);
      this.requests = this.requests.filter((r) => r._id !== requestId);
      this.toastService.presentSuccessToastr(resp.message);
      this.appEvents.inc('friends', -1);
      this.friendRequestCount = Math.max(0, this.friendRequestCount - 1);
      this.updatePageTitle();
      this.userService.triggerFriendsRefresh();
      SocketService.emit('friend-request-accepted', { requestId });
    } catch (err) {
      console.error('Error accepting request:', err);
      this.toastService.presentErrorToastr('Failed to accept request.');
    } finally {
      this.showSandglass = false;
    }
  }

  async rejectRequestConf(request: Request) {
    const displayName = request?.from?.fullName || 'this user';
    const alert = await this.alertCtrl.create({
      header: 'Decline request?',
      message: `${displayName}'s friend request will be removed.`,
      cssClass: 'folcen-confirm-alert',
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'folcen-alert-cancel' },
        { text: 'Decline', cssClass: 'folcen-alert-danger', handler: () => this.rejectRequest(request) },
      ],
    });
    await alert.present();
  }

  async rejectRequest(request: Request) {
    const requestId = request._id;
    this.showSandglass = true;
    try {
      const resp: any = await this.requestService.rejectRequest(requestId);
      this.requests = this.requests.filter((r) => r._id !== requestId);
      this.toastService.presentSuccessToastr(resp.message);
      this.appEvents.inc('friends', -1);
      this.friendRequestCount = Math.max(0, this.friendRequestCount - 1);
      this.updatePageTitle();
      SocketService.emit('friend-request-declined', { requestId });
    } catch (err) {
      console.error('Error rejecting request:', err);
      this.toastService.presentErrorToastr('Failed to reject request.');
    } finally {
      this.showSandglass = false;
    }
  }
}
