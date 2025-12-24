import { Component, OnInit } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DataService } from './../../../../services/data.service';

@Component({
  selector: 'app-display-user',
  templateUrl: './display-user.component.html',
  styleUrls: ['./display-user.component.scss']
})
export class DisplayUserComponent implements OnInit {

  profile: any = {};
  counts: any = {};
  related: any = {
    posts: [],
    comments: [],
    reports: [],
    products: [],
    jobs: [],
    services: [],
    channels: [],
    requests: []
  };
  loading = false;
  tab: string = 'profile';

  constructor(private http: HttpClient, private route: ActivatedRoute, private dataService: DataService) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || params.get('_id') || this.route.snapshot.queryParamMap.get('id');
      if (id) this.loadUserDash(id);
    });
  }

  loadUserDash(userId: string) {
    this.loading = true;
    const url = `user/dash/${userId}`;
    this.dataService.sendGetRequest(url, {}).subscribe(
      (resp: any) => {
        this.loading = false;
        const d = resp && resp.data ? resp.data : resp;
        this.profile = d.user || d.profile || d;
        this.counts = d.counts || d.count || {};
        this.related = {
          posts: d.posts || [],
          comments: d.comments || [],
          reports: d.reports || [],
          products: d.products || [],
          jobs: d.jobs || [],
          services: d.services || [],
          channels: d.channels || [],
          requests: d.requests || []
        };
        console.log('[DisplayUser] loaded user dash', { userId, profile: this.profile, counts: this.counts });
      },
      (err) => {
        this.loading = false;
        console.error('[DisplayUser] Failed to load user dash', { url, userId, err });
        alert(`Failed to load user data. See console for details.`);
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
    const id = this.itemId(this.profile);
    if (!id) return;
    this.loading = true;
    this.dataService.sendPutRequest(`user/toggle-status/${id}`, {}).subscribe(
      (resp: any) => {
        this.profile.enabled = !this.profile.enabled;
        this.loading = false;
      },
      err => {
        this.loading = false;
        alert('Failed to toggle user status');
      }
    );
  }

  deleteUser() {
    const id = this.itemId(this.profile);
    if (!id) return;
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      this.loading = true;
      this.dataService.sendDeleteRequest(`user/${id}`).subscribe(
        resp => {
          this.loading = false;
          alert('User deleted successfully');
          window.history.back();
        },
        err => {
          this.loading = false;
          alert('Failed to delete user');
        }
      );
    }
  }

  extractUserData(userId: string) {
    const format = prompt("Enter format: 'json' or 'csv'", "json")?.toLowerCase();
    if (!format || (format !== 'json' && format !== 'csv')) {
      alert("Invalid format! Please enter 'json' or 'csv'.");
      return;
    }
    const apiUrl = `${environment.apiUrl}/user/extract/${userId}?format=${format}`;
    if (format === 'json') {
      this.http.get(apiUrl).subscribe((data: any) => {
        const w = window.open('', '_blank');
        if (!w) { alert('Popup blocked. Please allow popups.'); return; }
        w.document.write('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
        w.document.close();
      }, err => alert('Failed to extract data'));
    } else {
      window.open(apiUrl, '_blank');
    }
  }

  extractJson(userId: string) {
    const apiUrl = `${environment.apiUrl}/user/extract/${userId}?format=json`;
    this.http.get(apiUrl).subscribe((data: any) => {
      const w = window.open('', '_blank');
      if (!w) { alert('Popup blocked. Please allow popups.'); return; }
      w.document.write('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
      w.document.close();
    }, err => alert('Failed to extract JSON'));
  }
}

