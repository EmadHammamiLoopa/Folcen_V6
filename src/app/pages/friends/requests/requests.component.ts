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
    // Subscribe to friend request count changes
    this.badgeSubscription = this.appEvents.badge$('friends').subscribe(count => {
      this.friendRequestCount = count;
      this.updatePageTitle();
    });

    // Merge all friend-request-related socket events into one stream (reconnect-safe)
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
    this.updatePageTitle(); // Update title when entering page
  }

  ionViewWillLeave() {
    // Reset title when leaving the page
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
    // Reset to your app's default title
    document.title = 'Your App Name'; // Replace with your actual app name
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

          // Update the badge when we load page 0
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

      // Remove from list immediately
      this.requests = this.requests.filter((r) => r._id !== requestId);
      this.toastService.presentSuccessToastr(resp.message);

      // Instant badge change (optimistic)
      this.appEvents.inc('friends', -1);
      this.friendRequestCount = Math.max(0, this.friendRequestCount - 1); // Update local count
      this.updatePageTitle(); // Update page title

      // Refresh friends list and current user
      this.userService.triggerFriendsRefresh();
      
      // Emit socket event to notify other clients
      SocketService.emit('friend-request-accepted', { requestId });
      
    } catch (err) {
      console.error('Error accepting request:', err);
      this.toastService.presentErrorToastr('Failed to accept request.');
    } finally {
      this.showSandglass = false;
    }
  }

  async rejectRequestConf(request: Request) {
    const alert = await this.alertCtrl.create({
      header: 'Reject request',
      message: 'Do you really want to reject this request?',
      buttons: [
        { text: 'CANCEL', role: 'cancel' },
        { text: 'REJECT', cssClass: 'text-danger', handler: () => this.rejectRequest(request) },
      ],
    });
    await alert.present();
  }

  async rejectRequest(request: Request) {
    const requestId = request._id;
    this.showSandglass = true;
    try {
      const resp: any = await this.requestService.rejectRequest(requestId);

      // Remove from list immediately
      this.requests = this.requests.filter((r) => r._id !== requestId);
      this.toastService.presentSuccessToastr(resp.message);

      // Instant badge change (optimistic)
      this.appEvents.inc('friends', -1);
      this.friendRequestCount = Math.max(0, this.friendRequestCount - 1); // Update local count
      this.updatePageTitle(); // Update page title

      // Emit socket event to notify other clients
      SocketService.emit('friend-request-declined', { requestId });
      
    } catch (err) {
      console.error('Error rejecting request:', err);
      this.toastService.presentErrorToastr('Failed to reject request.');
    } finally {
      this.showSandglass = false;
    }
  }
}