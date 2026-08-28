import { Component, OnInit } from '@angular/core';
import { DataService } from './../../../../services/data.service';

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
    { name: "dayPrice", title: "Day Price", type: "text" },
    { name: "weekPrice", title: "Week Price", type: "text" },
    { name: "monthPrice", title: "Month Price", type: "text" },
    { name: "yearPrice", title: "Year Price", type: "text" },
    { name: "currency", title: "Currency", type: "text" },
    { name: "subscribed", title: "Subscribed", type: "boolean", values: ['No', 'Yes'] }
  ];

  constructor(
    private dataService: DataService
  ) { }

  ngOnInit(): void {}

  exportSubscriptions(format: 'csv' | 'json') {
    this.dataService
      .sendGetBlobRequest(
        'admin/subscriptions/export',
        { format }
      )
      .subscribe({
        next: (blob: Blob) => {
          const objectUrl =
            URL.createObjectURL(blob);

          const link =
            document.createElement('a');

          link.href =
            objectUrl;

          link.download =
            `folcen-subscriptions.${format}`;

          link.style.display =
            'none';

          document.body.appendChild(link);

          link.click();
          link.remove();

          setTimeout(
            () =>
              URL.revokeObjectURL(
                objectUrl
              ),
            0
          );
        },

        error: (err) => {
          alert(
            err?.message ||
            'Failed to export subscriptions'
          );
        }
      });
  }

  getDisplayLink = (row: any): string => {
    const subId = this.getId(row.subscriptionId);
    if (subId && subId !== 'N/A') {
      return `/dashboard/subscriptions/display/${subId}`;
    }
    const userId = this.getId(row.userId || row._id || row.id);
    if (!userId) {
      console.error('Row or userId is missing');
      return '/dashboard/subscriptions/list'; // Default fallback
    }
    return `/dashboard/Users/display/${userId}`;
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
