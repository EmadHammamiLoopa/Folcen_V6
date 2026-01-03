import { Component, OnInit } from '@angular/core';
import { Header } from 'src/app/models/Header';
import { User } from 'src/app/models/User';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {
  headers: { title: string; name: string; type: string; values?: string[] }[] = [
    {
      name: "_id",
      title: "ID",
      type: "text"
    },
    {
      name: "text",
      title: "Content",
      type: "text"
    },
    {
      name: "channel",
      title: "Channel",
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
      name: "comments",
      title: "Comments",
      type: "number"
    },
    {
      name: "reports",
      title: "Reports",
      type: "number"
    }
  ];

  user: User;

  constructor() { }

  ngOnInit(): void {
    this.getUser();
  }

  getDisplayLinkPost = (row: any): string => {
    const id = this.getId(row);
    if (!id) {
      console.error('Row or id is missing');
      return '/dashboard/Posts/display'; // Default fallback
    }
    return `/dashboard/Posts/display/${id}`;
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
