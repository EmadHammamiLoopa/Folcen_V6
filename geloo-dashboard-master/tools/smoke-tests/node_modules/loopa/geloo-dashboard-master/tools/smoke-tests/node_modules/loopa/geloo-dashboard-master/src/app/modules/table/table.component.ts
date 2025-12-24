import { NotificationService } from './../../services/notification.service';
import { DataService } from './../../services/data.service';
import { environment } from './../../../environments/environment';
import { Component, Input, OnInit } from '@angular/core';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss']
})
export class TableComponent implements OnInit {
  @Input() extraParams: any = {};
  @Input() retrieveURL: string;
  @Input() deleteURL: string;
  @Input() displayLink: ((row: any) => string) | string = '';
  @Input() editLink: string;
  @Input() createLink: string;
  @Input() showDeleteButton = true;
  @Input() showUpdateButton = true;
  @Input() showCreateButton = true;
  @Input() plurarName: string;
  @Input() singleName: string;
  @Input() icon: string = '';

  // Headers with required properties
  @Input() headers: { title: string; name: string; type: string; values?: string[], sort?: boolean }[] = [];

  data: any[] = [];
  pages: number[] = [];
  error: string;
  success: string;

  currentPage = 1;
  limit = 20;
  searchQuery = '';
  sortBy = '_id';
  sortDir = 1;

  constructor(
    private dataService: DataService,
    private route: ActivatedRoute,
    private notification: NotificationService
  ) {}

  ngOnInit(): void {
    this.getQueryParams();
    this.getData();
  }

  getQueryParams() {
    this.route.queryParamMap.subscribe((query) => {
      const flashMessage = query.get('flashMessage');
      if (flashMessage) {
        this.success = flashMessage;
        setTimeout(() => {
          this.success = null;
        }, 2000);
      }
    });
  }

  getData() {
    this.error = undefined;

    const requestParams = {
      sortBy: this.sortBy,
      sortDir: this.sortDir,
      page: this.currentPage,
      limit: this.limit,
      searchQuery: this.searchQuery.trim()  // ✅ Ensure searchQuery is sent properly
    };
    // Merge external params (filters) provided by parent components
    Object.assign(requestParams, this.extraParams || {});

    console.log('Fetching data with params:', requestParams);

    this.dataService.sendGetRequest(this.retrieveURL, requestParams).subscribe(
      (resp: any) => {
        console.log('GET request successful, response received:', resp);

        if (resp.success && resp.data && resp.data.docs) {
          // Populate rows
          this.data = resp.data.docs;

          // Dynamically generate headers if not provided
          if (!this.headers.length && this.data.length) {
            this.headers = Object.keys(this.data[0]).map((key) => ({
              title: key.replace(/([A-Z])/g, ' $1').toUpperCase(),
              name: key,
              type: this.detectType(this.data[0][key]),
            }));
          }

          // Generate pagination pages
          this.pages = Array.from({ length: resp.data.totalPages }, (_, i) => i + 1);
        } else {
          this.error = 'Unexpected response structure';
        }
      },
      (err) => {
        console.error('GET request failed:', err);
        // err may be normalized by DataService to {message, status, detail}
        this.error = (err && err.message) ? err.message : JSON.stringify(err);
      }
    );
  }

  detectType(value: any): string {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string' && Date.parse(value)) return 'date';
    // Support avatar when value is a string path, array, or object containing image
    if (typeof value === 'string' && value.match(/\.(jpeg|jpg|gif|png)$/)) return 'avatar';
    if (Array.isArray(value) && value.length) return 'avatar';
    if (value && typeof value === 'object') {
      if (value.url || value.path || value.mainAvatar || value.avatar) return 'avatar';
    }
    return 'text';
  }

  getAvatar(row: any, name: string): string {
    const v = row[name];
    // compute backend root by stripping possible `/api/v1` suffix from environment.apiUrl
    const backendRoot = environment.apiUrl ? environment.apiUrl.replace(/\/api\/v1\/?$/i, '') : '';
    const defaultAvatar = backendRoot + '/public/images/avatars/other.webp';

    if (!v) return defaultAvatar;
    if (typeof v === 'string') {
      // If already absolute, return as-is
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      // If it's a server-relative path (starts with /), prefix backend root
      if (v.startsWith('/')) return backendRoot + v;
      // Otherwise treat as relative URL on backend
      return backendRoot + '/' + v;
    }
    if (Array.isArray(v) && v.length) return this.getAvatar({ [name]: v[0] }, name);
    if (v.url) return (v.url.startsWith('http') ? v.url : backendRoot + v.url);
    if (v.path) return (v.path.startsWith('http') ? v.path : backendRoot + v.path);
    if (v.mainAvatar) return (v.mainAvatar.startsWith('http') ? v.mainAvatar : backendRoot + v.mainAvatar);
    if (v.avatar && Array.isArray(v.avatar) && v.avatar.length) return this.getAvatar({ [name]: v.avatar[0] }, name);
    // fallback
    return defaultAvatar;
  }

  getDisplayValue(row: any, name: string): string {
    const v = row[name];
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    // Mongoose ObjectId may provide toString() or have $oid depending on API
    try {
      // If this looks like an id field, prefer to extract a hex string
      const isIdField = (name === '_id') || /(^|\b)id(\b|$)/i.test(String(name));
      if (isIdField) {
        // Common Mongoose ObjectId APIs
        if (v && typeof v.toHexString === 'function') return v.toHexString();
        if (v && v.$oid) return String(v.$oid);
        if (v && v._bsontype === 'ObjectID' && typeof v.toHexString === 'function') return v.toHexString();
        // Buffer-backed id (v.id or v.buffer.data) -> convert to hex if 12 bytes
        const bufCandidate = (v && v.id) || (v && v.buffer) || (v && v.data);
        if (bufCandidate) {
          // normalize to array of bytes
          const arr = bufCandidate.data || bufCandidate;
          if (Array.isArray(arr) && arr.length === 12) {
            return arr.map((b: any) => (b.toString(16).padStart(2, '0'))).join('');
          }
        }
      }

      if (v && v._id) return String(v._id);
      if (typeof v.toString === 'function' && v.toString() !== '[object Object]') {
        const s = v.toString();
        // try to extract ObjectId("...") pattern
        const m = /ObjectId\(["']?([0-9a-fA-F]{24})["']?\)/.exec(s);
        if (m) return m[1];
        return s;
      }
    } catch (e) {}
    if (v.$oid) return String(v.$oid);

    // Detect Node/Buffer-like objects (serialized) and try to extract hex id when possible
    const tryBufferToHex = (candidate: any): string | null => {
      if (!candidate) return null;
      // Array of bytes
      if (Array.isArray(candidate)) {
        return candidate.map((b: any) => Number(b).toString(16).padStart(2, '0')).join('');
      }
      // Uint8Array / ArrayBuffer
      if (candidate instanceof Uint8Array) {
        return Array.from(candidate).map((b: any) => b.toString(16).padStart(2, '0')).join('');
      }
      if (candidate instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(candidate)).map((b: any) => b.toString(16).padStart(2, '0')).join('');
      }
      // { type: 'Buffer', data: [...] } or { data: [...] }
      if (candidate.data && Array.isArray(candidate.data)) {
        return candidate.data.map((b: any) => Number(b).toString(16).padStart(2, '0')).join('');
      }
      if (candidate.buffer && candidate.buffer.data && Array.isArray(candidate.buffer.data)) {
        return candidate.buffer.data.map((b: any) => Number(b).toString(16).padStart(2, '0')).join('');
      }
      // object with numeric keys
      const numericKeys = Object.keys(candidate || {}).filter(k => String(Number(k)) === k).sort((a, b) => Number(a) - Number(b));
      if (numericKeys.length) return numericKeys.map(k => Number(candidate[k]).toString(16).padStart(2, '0')).join('');
      return null;
    };

    if (v && (v.type === 'Buffer' || v.buffer || v.data || Object.prototype.hasOwnProperty.call(v, '0'))) {
      // Prefer nested _id if present
      if (v._id) return String(v._id);
      // try common nested locations for binary id
      const candidates = [v.id, v.buffer, v.data, v];
      for (const c of candidates) {
        const hex = tryBufferToHex(c);
        if (hex && hex.length >= 12) return hex.length === 24 ? hex : hex.slice(0, 24);
      }
      return '[binary]';
    }
    // Fallback: JSON stringify but keep small
    try {
      const s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + '...' : s;
    } catch (e) {
      return '[object]';
    }
  }

  // Extract a usable id string from various _id shapes
  getId(v: any): string {
    if (!v) return '';
    // If it's a row object, try to get _id or id
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.getId(v._id || v.id);
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
      
      if (v._id) return this.getId(v._id);
      if (v.id) return this.getId(v.id);
    }
    // Fallback to string representation but avoid [object Object]
    const s = String(v);
    if (s === '[object Object]' || s === 'undefined' || s === 'null') return '';
    return s;
  }

  getDisplayLink(row: any): string {
    if (typeof this.displayLink === 'function') {
      return this.displayLink(row);
    }
    if (typeof this.displayLink === 'string') {
      const id = this.getId(row);
      return this.displayLink.replace(':id', id);
    }
    return '';
  }

  showDeleteConf() {
    return Swal.fire({
      title: 'Are you sure?',
      text: 'Do you really want to delete this item?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'red',
      confirmButtonText: 'Yes, delete it!',
    });
  }

  deleteRow(row, ind) {
    this.showDeleteConf().then((resp) => {
      if (resp.isConfirmed) {
        const deleteUrl = this.deleteURL.replace(':id', this.getId(row));
        this.dataService.sendDeleteRequest(deleteUrl).subscribe(
          (resp: any) => {
            this.data.splice(ind, 1);
            this.notification.showSuccess(resp.message, 'Success');
          },
          (err) => {
            this.notification.showError(err.error, 'Error');
          }
        );
      }
    });
  }

  canNext(): boolean {
    return this.pages && this.currentPage < this.pages.length;
  }

  canPrevious(): boolean {
    return this.pages && this.currentPage > 1;
  }

  nextPage() {
    if (this.canNext()) {
      this.currentPage++;
      this.getData();
    }
  }

  previousPage() {
    if (this.canPrevious()) {
      this.currentPage--;
      this.getData();
    }
  }

  sortableHeaders() {
    return this.headers.filter(header => header.sort !== false || header.sort === undefined);
  }
  

  
}
