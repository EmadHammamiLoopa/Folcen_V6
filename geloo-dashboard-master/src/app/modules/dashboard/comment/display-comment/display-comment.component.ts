import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from 'src/app/services/data.service';
import { environment } from 'src/environments/environment';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-display-comment',
    templateUrl: './display-comment.component.html',
    styleUrls: ['./display-comment.component.scss'],
    standalone: false
})
export class DisplayCommentComponent implements OnInit {
  comment: any;
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
      const id = params['id'];
      if (id) {
        this.fetchComment(id);
      }
    });
  }

  fetchComment(id: string) {
    this.loading = true;
    this.dataService.sendGetRequest(`comment/dash/${id}`).subscribe(
      (res: any) => {
        this.comment = res.data;
        this.loading = false;
      },
      err => {
        console.error(err);
        this.loading = false;
        Swal.fire('Error', 'Could not fetch comment details', 'error');
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

  deleteComment() {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This comment will be permanently deleted!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendDeleteRequest(`comment/${this.itemId(this.comment)}`).subscribe(
          () => {
            Swal.fire('Deleted!', 'Comment has been deleted.', 'success');
            this.router.navigate(['/dashboard/Comments/list']);
          },
          err => Swal.fire('Error', 'Could not delete comment', 'error')
        );
      }
    });
  }

  clearReports() {
    Swal.fire({
      title: 'Dismiss reports?',
      text: 'Open and under-review reports will be dismissed. Moderation history will be retained according to the retention policy.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear them'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendPostRequest(`comment/${this.itemId(this.comment)}/clearReports`, {}).subscribe(
          () => {
            Swal.fire('Dismissed!', 'Reports have been dismissed.', 'success');
            this.fetchComment(this.itemId(this.comment));
          },
          err => Swal.fire('Error', 'Could not dismiss reports', 'error')
        );
      }
    });
  }
}
