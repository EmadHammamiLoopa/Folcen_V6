import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../../../services/data.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-display-service',
    templateUrl: './display-service.component.html',
    styleUrls: ['./display-service.component.scss'],
    standalone: false
})
export class DisplayServiceComponent implements OnInit {
  serviceId: string;
  service: any;
  loading = true;
  activeTab = 'details';
  apiUrl = environment.apiUrl.replace(/\/api\/v1\/?$/, ''); // backend root for static files

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.serviceId = params['id'];
      if (this.serviceId) {
        this.fetchService();
      }
    });
  }

  fetchService() {
    this.loading = true;
    this.dataService.sendGetRequest(`service/dash/${this.serviceId}`).subscribe(
      (res: any) => {
        this.service = res.data || res;
        this.loading = false;
      },
      err => {
        console.error('Error fetching service:', err);
        this.loading = false;
        Swal.fire('Error', 'Could not fetch service details', 'error');
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

  toggleStatus() {
    this.dataService.sendPostRequest(`service/${this.serviceId}/status`, {}).subscribe(
      (res: any) => {
        this.service.deletedAt = res.data ? res.data.deletedAt : (this.service.deletedAt ? null : new Date());
        Swal.fire('Success', res.message || 'Status updated', 'success');
      },
      err => Swal.fire('Error', 'Failed to update status', 'error')
    );
  }

  clearReports() {
    Swal.fire({
      title: 'Are you sure?',
      text: 'Open and under-review reports will be dismissed. Moderation history will be retained.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear them'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendPostRequest(`service/${this.serviceId}/clearReports`, {}).subscribe(
          (res: any) => {
            this.service.reports = [];
            Swal.fire('Cleared', 'Reports have been dismissed', 'success');
          },
          err => Swal.fire('Error', 'Failed to dismiss reports', 'error')
        );
      }
    });
  }

  deleteService() {
    Swal.fire({
      title: 'Delete Service?',
      text: 'This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Delete'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendDeleteRequest(`service/dash/${this.serviceId}`).subscribe(
          () => {
            Swal.fire('Deleted', 'Service has been deleted', 'success');
            this.router.navigate(['/dashboard/Services/list']);
          },
          err => Swal.fire('Error', 'Failed to delete service', 'error')
        );
      }
    });
  }

  buttons: any[] = [
    {
      name: 'Enable',
      icon: 'fas fa-lightbulb',
      color: 'green',
      request: {
        url: 'service/:id/status',
        methode: 'post'
      },
      condition: 'deletedAt'
    },
    {
      name: 'Disable',
      icon: 'far fa-lightbulb',
      color: 'red',
      request: {
        url: 'service/:id/status',
        methode: 'post'
      },
      condition: '!deletedAt'
    },
    {
      name: 'Edit',
      icon: 'fas fa-edit',
      link: '/dashboard/Services/form/edit?id=:id',
      color: 'gray',
    },
    {
      name: 'Delete',
      icon: 'fas fa-trash-alt',
      color: 'red',
      request: {
        url: 'service/dash/:id',
        methode: 'delete',
        redirectURL: '/dashboard/Services/list'
      },
      confirmation: {
        title: 'Delete Service',
        text: 'Are you sure you want to delete this service',
        confirmButtonText: 'Yes',
        confirmButtonColor: 'red',
        showCancelButton: true,
        cancelButtonText: 'No',
        icon: 'warning'
      }
    },
  ];
}
