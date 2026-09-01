import { NotificationService } from './../../services/notification.service';
import { DataService } from './../../services/data.service';
import { environment } from './../../../environments/environment';
import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';
import { AvatarUrlUtil } from '../../utils/avatar-url.util';

@Component({
    selector: 'app-table',
    templateUrl: './table.component.html',
    styleUrls: ['./table.component.scss'],
    standalone: false
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
  @Input() hideHeader = false;
  @Input() selectable = false;
  @Input() promptReason = false;

  @Output() selectionChange = new EventEmitter<any[]>();

  // Headers with required properties
  @Input() headers: { title: string; name: string; type: string; values?: string[], sort?: boolean, align?: string }[] = [];

  data: any[] = [];
  pages: number[] = [];
  error: string;
  success: string;

  currentPage = 1;
  limit = 20;
  searchQuery = '';
  sortBy = '_id';
  sortDir = 1;

  selectedRows: Set<any> = new Set();

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
    this.selectedRows.clear();
    this.selectionChange.emit([]);

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
    const backendRoot = environment.apiUrl ? environment.apiUrl.replace(/\/api\/v1\/?$/i, '') : '';

    // For non-user rows (photo/photos fields), use the named field value directly
    if (name !== 'mainAvatar') {
      const fieldVal = row[name];
      if (fieldVal) {
        // Direct string path (channel, job, service photos)
        if (typeof fieldVal === 'string') {
          const url = fieldVal.startsWith('http') ? fieldVal : backendRoot + (fieldVal.startsWith('/') ? '' : '/') + fieldVal;
          return this.addCacheBust(url, row);
        }
        // Array of photo objects (products)
        if (Array.isArray(fieldVal) && fieldVal.length > 0) {
          const first = fieldVal[0];
          const p = typeof first === 'string' ? first : (first.path || first.url || first.src);
          if (p) {
            const url = p.startsWith('http') ? p : backendRoot + (p.startsWith('/') ? '' : '/') + p;
            return this.addCacheBust(url, row);
          }
        }
        // Single photo object with path/url
        if (typeof fieldVal === 'object' && (fieldVal.path || fieldVal.url)) {
          const p = fieldVal.path || fieldVal.url;
          const url = p.startsWith('http') ? p : backendRoot + (p.startsWith('/') ? '' : '/') + p;
          return this.addCacheBust(url, row);
        }
      }
    }

    // User-style avatars (mainAvatar, avatarStyle, avatarSeed, etc.)
    let url = AvatarUrlUtil.getAvatarUrl(row, backendRoot);
    if (!url) {
      return backendRoot + '/public/images/avatars/other.webp';
    }
    return this.addCacheBust(url, row);
  }

  private addCacheBust(url: string, row: any): string {
    if (row.updatedAt && !url.includes('dicebear.com')) {
      const timestamp = new Date(row.updatedAt).getTime();
      url += (url.includes('?') ? '&' : '?') + 't=' + timestamp;
    }
    return url;
  }

  getDisplayValue(row: any, name: string): string {
    const v = row[name];
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    
    // If it's an object, try to extract a meaningful string (especially for IDs)
    try {
      const isIdField = (name === '_id') || name.toLowerCase().includes('id');
      if (isIdField) {
        const id = this.getId(v);
        if (id) return id;
      }

      if (v._id) return this.getId(v._id);
      
      if (typeof v.toString === 'function' && v.toString() !== '[object Object]') {
        return v.toString();
      }
      
      // Handle Buffer/Binary data
      if (v.type === 'Buffer' && Array.isArray(v.data)) {
        return v.data.map((b: any) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
      }
    } catch (e) {}
    
    return 'Object';
  }

  // Extract a usable id string from various _id shapes
  getId(v: any): string {
    if (!v) return '';
    
    // If it's a row object, try to get _id or id
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.getId(v._id || v.id);
    }
    
    if (typeof v === 'string') return v;
    
    if (typeof v === 'object') {
      // Mongoose/BSON ObjectId
      if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
      if (v.$oid) return String(v.$oid);
      if (v._bsontype === 'ObjectID' && v.id) v = v.id; // Fall through to buffer handling
      
      // Handle Buffer/Binary IDs
      const buf = v.buffer || v.data || v;
      if (buf && (Array.isArray(buf) || buf instanceof Uint8Array || buf.data)) {
        const data = buf.data || buf;
        if (Array.isArray(data) || data instanceof Uint8Array) {
          const hex = Array.from(data).map((b: any) => b.toString(16).padStart(2, '0')).join('');
          if (hex.length >= 12) return hex.slice(0, 24);
        }
      }
      
      if (typeof v.toString === 'function' && v.toString() !== '[object Object]') {
        return v.toString();
      }
    }
    
    const s = String(v);
    return (s === '[object Object]' || s === 'undefined' || s === 'null') ? '' : s;
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
    const config: any = {
      title: 'Are you sure?',
      text: 'Do you really want to delete this item?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'red',
      confirmButtonText: 'Yes, delete it!',
    };

    if (this.promptReason) {
      config.input = 'text';
      config.inputPlaceholder = 'Enter reason for deletion...';
      config.inputValidator = (value) => {
        if (!value) {
          return 'You need to provide a reason!';
        }
        return null;
      };
    }

    return Swal.fire(config);
  }

  deleteRow(row, ind) {
    this.showDeleteConf().then((resp) => {
      if (resp.isConfirmed) {
        let deleteUrl = this.deleteURL.replace(':id', this.getId(row));
        if (this.promptReason && resp.value) {
          const separator = deleteUrl.includes('?') ? '&' : '?';
          deleteUrl += `${separator}reason=${encodeURIComponent(resp.value)}`;
        }
        this.dataService.sendDeleteRequest(deleteUrl).subscribe(
          (resp: any) => {
            this.data.splice(ind, 1);
            this.notification.showSuccess(resp.message, 'Success');
          },
          (err) => {
            const responseBody =
              err && err.detail && err.detail.error !== undefined
                ? err.detail.error
                : (err && err.error !== undefined ? err.error : null);

            const candidate =
              (err && typeof err.message === 'string' && err.message) ||
              (responseBody &&
                typeof responseBody === 'object' &&
                typeof responseBody.message === 'string' &&
                responseBody.message) ||
              (responseBody &&
                typeof responseBody === 'object' &&
                typeof responseBody.errors === 'string' &&
                responseBody.errors) ||
              (typeof responseBody === 'string' && responseBody) ||
              'Delete failed';

            this.notification.showError(candidate, 'Error');
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

  // Selection Methods
  toggleSelection(row: any) {
    if (this.selectedRows.has(row)) {
      this.selectedRows.delete(row);
    } else {
      this.selectedRows.add(row);
    }
    this.selectionChange.emit(Array.from(this.selectedRows));
  }

  toggleAllSelection() {
    if (this.isAllSelected()) {
      this.selectedRows.clear();
    } else {
      this.data.forEach(row => this.selectedRows.add(row));
    }
    this.selectionChange.emit(Array.from(this.selectedRows));
  }

  isAllSelected() {
    return this.data.length > 0 && this.selectedRows.size === this.data.length;
  }

  clearSelection() {
    this.selectedRows.clear();
    this.selectionChange.emit([]);
  }
}
