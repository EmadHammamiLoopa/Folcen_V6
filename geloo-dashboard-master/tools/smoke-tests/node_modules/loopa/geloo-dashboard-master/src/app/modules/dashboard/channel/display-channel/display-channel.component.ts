import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataService } from 'src/app/services/data.service';

@Component({
  selector: 'app-display-channel',
  templateUrl: './display-channel.component.html',
  styleUrls: ['./display-channel.component.scss']
})
export class DisplayChannelComponent implements OnInit {
  channel: any = {};
  posts: any[] = [];
  reports: any[] = [];
  counts: any = {};
  loading = true;
  tab = 'info';
  apiUrl = 'http://localhost:3000'; // Default API URL

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params.id) {
        this.loadChannel(params.id);
      }
    });
  }

  loadChannel(id: string) {
    this.loading = true;
    this.dataService.sendGetRequest(`channel/${id}`).subscribe(
      (resp: any) => {
        if (resp && resp.data) {
          if (resp.data.channel) {
            this.channel = resp.data.channel;
            this.posts = resp.data.posts || [];
            this.reports = resp.data.reports || [];
            this.counts = resp.data.counts || {};
          } else {
            this.channel = resp.data;
          }
        }
        this.loading = false;
      },
      err => {
        console.error('Error loading channel:', err);
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

  keys(obj: any) {
    return obj ? Object.keys(obj).filter(k => typeof obj[k] !== 'object' || obj[k] === null) : [];
  }

  formatValue(key: string) {
    const val = this.channel[key];
    if (val === null || val === undefined) return '';
    if (key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt') {
      return new Date(val).toLocaleString();
    }
    return val;
  }

  toggleStatus() {
    const id = this.itemId(this.channel);
    this.dataService.sendPostRequest(`channel/${id}/status`, {}).subscribe(() => {
      this.loadChannel(id);
    });
  }

  toggleApprovement() {
    const id = this.itemId(this.channel);
    this.dataService.sendPostRequest(`channel/${id}/approvement`, {}).subscribe(() => {
      this.loadChannel(id);
    });
  }

  clearReports() {
    if (confirm('Are you sure you want to clear all reports for this channel?')) {
      const id = this.itemId(this.channel);
      this.dataService.sendPostRequest(`channel/${id}/clearReports`, {}).subscribe(() => {
        this.loadChannel(id);
      });
    }
  }
}
