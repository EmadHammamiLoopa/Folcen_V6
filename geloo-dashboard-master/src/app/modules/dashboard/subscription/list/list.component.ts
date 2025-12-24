import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {

  headers = [
    { name: "subscriptionId", title: "Subscription ID", type: "text" },
    { name: "userId", title: "User ID", type: "text" },
    { name: "email", title: "Email", type: "text" },
    { name: "dayPrice", title: "Day Price", type: "number" },
    { name: "weekPrice", title: "Week Price", type: "number" },
    { name: "monthPrice", title: "Month Price", type: "number" },
    { name: "yearPrice", title: "Year Price", type: "number" },
    { name: "currency", title: "Currency", type: "text" },
    { name: "subscribed", title: "Subscribed", type: "boolean", values: ['No', 'Yes'] }
  ];

  constructor() { }

  ngOnInit(): void {}

  getDisplayLink = (row: any): string => {
    const id = this.getId(row.subscriptionId || row._id || row.id);
    if (!id) {
      console.error('Row or subscriptionId is missing');
      return '/dashboard/subscriptions/display'; // Default fallback
    }
    return `/dashboard/subscriptions/display/${id}`;
  }

  getId(v: any): string {
    if (!v) return '';
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.getId(v._id || v.id);
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
}
