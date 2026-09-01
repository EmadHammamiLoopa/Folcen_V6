import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../../../services/data.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-display-job',
    templateUrl: './display-job.component.html',
    styleUrls: ['./display-job.component.scss'],
    standalone: false
})
export class DisplayJobComponent implements OnInit {
  jobId: string;
  job: any;
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
      this.jobId = params['id'];
      if (this.jobId) {
        this.fetchJob();
      }
    });
  }

  fetchJob() {
    this.loading = true;
    this.dataService.sendGetRequest(`job/dash/${this.jobId}`).subscribe(
      (res: any) => {
        this.job = res.data || res;
        this.loading = false;
      },
      err => {
        console.error('Error fetching job:', err);
        this.loading = false;
        Swal.fire('Error', 'Could not fetch job details', 'error');
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
    this.dataService.sendPostRequest(`job/${this.jobId}/status`, {}).subscribe(
      (res: any) => {
        this.job.deletedAt = res.data ? res.data.deletedAt : (this.job.deletedAt ? null : new Date());
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
        this.dataService.sendPostRequest(`job/${this.jobId}/clearReports`, {}).subscribe(
          (res: any) => {
            this.job.reports = [];
            Swal.fire('Cleared', 'Reports have been dismissed', 'success');
          },
          err => Swal.fire('Error', 'Failed to dismiss reports', 'error')
        );
      }
    });
  }

  deleteJob() {
    Swal.fire({
      title: 'Delete Job?',
      text: 'This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Delete'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendDeleteRequest(`job/dash/${this.jobId}`).subscribe(
          () => {
            Swal.fire('Deleted', 'Job has been deleted', 'success');
            this.router.navigate(['/dashboard/Jobs/list']);
          },
          err => Swal.fire('Error', 'Failed to delete job', 'error')
        );
      }
    });
  }
}
