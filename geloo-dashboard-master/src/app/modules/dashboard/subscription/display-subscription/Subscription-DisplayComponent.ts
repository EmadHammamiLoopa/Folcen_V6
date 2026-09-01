import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from 'src/app/services/data.service';
import { environment } from 'src/environments/environment';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-subscription-display',
    templateUrl: './subscription-display.component.html',
    styleUrls: ['./subscription-display.component.scss'],
    standalone: false
})
export class SubscriptionDisplayComponent implements OnInit {
  subscription: any;
  loading = true;
  activeTab = 'details';
  apiUrl = environment.apiUrl.replace(/\/api\/v1\/?$/, ''); // backend root for static files

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['subscriptionId'] || params['id'] || this.route.snapshot.queryParamMap.get('id');
      if (id) {
        this.fetchSubscription(id);
      }
    });
  }

  fetchSubscription(id: string) {
    this.loading = true;
    this.dataService.sendGetRequest(`subscription/dash/${id}`).subscribe(
      (res: any) => {
        this.subscription = res.data;
        this.loading = false;
      },
      err => {
        console.error(err);
        this.loading = false;
        Swal.fire('Error', 'Could not fetch subscription details', 'error');
      }
    );
  }

  itemId(v: any): string {
    if (!v) return '';
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.itemId(v._id || v.id);
    }
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      if (v.$oid) return String(v.$oid);
      if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
      const buf = v.buffer || v.data || v;
      if (buf && (typeof buf === 'object' || Array.isArray(buf))) {
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length >= 12) {
          return keys.map(k => Number(buf[k]).toString(16).padStart(2, '0')).join('');
        }
      }
    }
    return String(v) === '[object Object]' ? '' : String(v);
  }

  deleteSubscription() {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This subscription will be permanently deleted!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendDeleteRequest(`subscription/${this.itemId(this.subscription)}`).subscribe(
          () => {
            Swal.fire('Deleted!', 'Subscription has been deleted.', 'success');
            this.router.navigate(['/dashboard/subscriptions/list']);
          },
          err => Swal.fire('Error', 'Could not delete subscription', 'error')
        );
      }
    });
  }
}
