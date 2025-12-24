import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from 'src/app/services/data.service';

@Component({
  selector: 'app-display-report',
  templateUrl: './display-report.component.html',
  styleUrls: ['./display-report.component.scss']
})
export class DisplayReportComponent implements OnInit {
  report: any = {};
  loading = true;
  actionNotes = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params.id) {
        this.loadReport(params.id);
      }
    });
  }

  loadReport(id: string) {
    this.loading = true;
    this.dataService.sendGetRequest(`report/${id}`).subscribe(
      (resp: any) => {
        if (resp && resp.data) {
          this.report = resp.data;
        }
        this.loading = false;
      },
      err => {
        console.error('Error loading report:', err);
        this.loading = false;
      }
    );
  }

  itemId(v: any): string {
    if (!v) return '';
    // If it's a row object, try to get _id or id
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.itemId(v._id || v.id);
    }
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      if (v.$oid) return String(v.$oid);
      if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
      
      // Handle Buffer-like objects from Mongoose/BSON
      const buf = v.buffer || v.data || v;
      if (buf && (typeof buf === 'object' || Array.isArray(buf))) {
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length >= 12) {
          return keys.map(k => Number(buf[k]).toString(16).padStart(2, '0')).join('');
        }
      }
      
      if (v._id) return this.itemId(v._id);
      if (v.id) return this.itemId(v.id);
    }
    // Fallback to string representation but avoid [object Object]
    const s = String(v);
    return s === '[object Object]' ? '' : s;
  }

  takeAction(action: string) {
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    const id = this.itemId(this.report);
    this.dataService.sendPostRequest(`report/report/${id}/action`, {
      action: action,
      notes: this.actionNotes
    }).subscribe(
      (resp: any) => {
        alert(resp.message || 'Action taken successfully');
        this.router.navigate(['/dashboard/reports/list']);
      },
      err => {
        console.error('Error taking action:', err);
        alert('Failed to take action');
      }
    );
  }

  keys(obj: any) {
    return obj ? Object.keys(obj).filter(k => typeof obj[k] !== 'object' || obj[k] === null) : [];
  }

  getLinkForEntity() {
    if (!this.report.entityModel || !this.report.entityId) return null;
    const model = this.report.entityModel.toLowerCase();
    // Map models to dashboard routes
    const routeMap: any = {
      'post': 'posts',
      'user': 'Users',
      'channel': 'Channels',
      'comment': 'comments',
      'product': 'products',
      'job': 'jobs',
      'service': 'services'
    };
    const folder = routeMap[model] || model + 's';
    return [`/dashboard/${folder}/display`, this.itemId(this.report.entityId)];
  }
}
