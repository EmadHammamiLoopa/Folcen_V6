import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {
  headers = [
    {
      name: "_id",
      title: "ID",
      type: "text"
    },
    {
      name: "status",
      title: "Status",
      type: "text"
    },
    {
      name: "referenceId",
      title: "Reference ID",
      type: "text"
    },
    {
      name: "referenceType",
      title: "Type",
      type: "text"
    },
    {
      name: "reportType",
      title: "Catagory",
      type: "text"
    },
    {
      name: "severity",
      title: "Severity",
      type: "severity"
    },
    {
      name: "userId",
      title: "User ID",
      type: "text"
    },
    {
      name: "message",
      title: "Message",
      type: "text",
      maxLength: 30
    },
    {
      name: "createdAt",
      title: "Date",
      type: "date"
    }

    
  ];

  constructor() {}

  getDisplayLinkreport = (row: any): string => {
    const id = this.getId(row);
    if (!id) {
      console.error('Row or id is missing');
      return '/dashboard/reports/display';
    }
    return `/dashboard/reports/display/${id}`;
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

  ngOnInit(): void {}
}
