import { Component, OnInit } from '@angular/core';
import { User } from 'src/app/models/User';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {
  // Ensure the headers match the expected type
  headers: { title: string; name: string; type: string; values?: string[]; maxLength?: number }[] = [
    {
      name: "_id",
      title: "ID",
      type: "text"
    },
    {
      name: "text",
      title: "Content",
      type: "text",
      maxLength: 40
    },
    {
      name: "post",
      title: "Post",
      type: "text"
    },
    {
      name: "user",
      title: "User",
      type: "text"
    },
    {
      name: "userStatus",
      title: "User Status",
      type: "text"
    },
    {
      name: "reportsCount",
      title: "Reports",
      type: "number"
    },
    {
      name: "anonyme",
      title: "Anonymous",
      type: "boolean",
      values: ["No", "Yes"]
    },
    {
      name: "createdAt",
      title: "Created At",
      type: "date"
    },
    {
      name: "updatedAt",
      title: "Updated At",
      type: "date"
    }
  ];

  user: User;

  constructor() { }

  ngOnInit(): void {
    this.getUser();
  }

  getDisplayLinkcommnts = (row: any): string => {
    const id = this.getId(row);
    if (!id) {
      console.error('Row or id is missing');
      return '/dashboard/Comments/display';
    }
    return `/dashboard/Comments/display/${id}`;
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

  getUser() {
    this.user = new User().initialize(JSON.parse(localStorage.getItem('user')));
  }
}
