import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from 'src/app/services/data.service';

@Component({
    selector: 'app-display-report',
    templateUrl: './display-report.component.html',
    styleUrls: ['./display-report.component.scss'],
    standalone: false
})
export class DisplayReportComponent implements OnInit {
  report: any = {};
  loading = true;
  actionNotes = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public dataService: DataService
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
    this.dataService.sendPostRequest(`report/${id}/action`, {
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
      'photo': 'Users',
      'channel': 'Channels',
      'comment': 'comments',
      'product': 'products',
      'job': 'jobs',
      'service': 'services'
    };
    const folder = routeMap[model] || model + 's';
    return [`/dashboard/${folder}/display`, this.itemId(this.report.entityId)];
  }

  getMediaUrl() {
    if (this.report.photoUrl) return this.getEvidenceUrl(this.report.photoUrl);
    if (!this.report.entity) return null;
    const entity = this.report.entity;
    const backendRoot = (this.dataService as any).apiUrl ? (this.dataService as any).apiUrl.replace(/\/api\/v1\/?$/i, '') : '';
    
    let path = '';
    if (entity.media && entity.media.url) path = entity.media.url;
    else if (entity.photo && entity.photo.path) path = entity.photo.path;
    else if (entity.photo && typeof entity.photo === 'string') path = entity.photo;
    else if (entity.photos && Array.isArray(entity.photos) && entity.photos.length > 0) {
      const first = entity.photos[0];
      path = typeof first === 'string' ? first : (first.path || first.url || '');
    } else if (entity.mainAvatar) path = entity.mainAvatar;

    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${backendRoot}/${path.replace(/\\/g, '/')}`;
  }

  isMediaVideo() {
    let path = '';
    if (this.report.photoUrl) path = this.report.photoUrl;
    else if (this.report.entity) {
      const entity = this.report.entity;
      if (entity.media && entity.media.url) path = entity.media.url;
      else if (entity.photo && entity.photo.path) path = entity.photo.path;
    }
    
    if (!path) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm'];
    return videoExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }

  getEvidenceUrl(path: string) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const backendRoot = (this.dataService as any).apiUrl ? (this.dataService as any).apiUrl.replace(/\/api\/v1\/?$/i, '') : '';
    return `${backendRoot}/${path.replace(/\\/g, '/')}`;
  }

  openImage(url: string) {
    window.open(this.getEvidenceUrl(url), '_blank');
  }
}
