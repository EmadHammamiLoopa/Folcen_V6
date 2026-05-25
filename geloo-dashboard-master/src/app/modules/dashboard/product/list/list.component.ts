import { User } from './../../../../models/User';
import { Component, OnInit } from '@angular/core';
import { Header } from 'src/app/models/Header';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {
  headers: { title: string; name: string; type: string; values?: string[]; maxLength?: number; sort?: boolean; align?: string; reverseBooleanColors?: boolean }[] = [
    {
      name: "photos",
      title: "",
      type: "avatar",
      sort: false,
      align: "center"
    },
    {
      name: "_id",
      title: "ID",
      type: "text"
    },
    {
      name: "label",
      title: "Label",
      type: "text"
    },
    {
      name: "description",
      title: "Description",
      type: "text",
      maxLength: 80
    },
    {
      name: "city",
      title: "City",
      type: "text"
    },
    {
      name: "price",
      title: "Price",
      type: "number"
    },
    {
      name: "currency",
      title: "Currency",
      type: "text"
    },
    {
      name: "deletedAt",
      title: "Status",
      type: "boolean",
      reverseBooleanColors: true,
      values: ["Enabled", "Disabled"]
    },
    {
      name: "available",
      title: "Availability",
      type: "boolean",
      values: ["Sold", "Available"]
    },
    {
      name: "reports",
      title: "Reports",
      type: "number"
    }
  ];

  user: User;

  constructor() {}

  ngOnInit(): void {
    this.getUser();
  }

  getDisplayLinkproduct = (row: any): string => {
    const id = this.getId(row);
    if (!id) {
      console.error("Row or id is missing");
      return "/dashboard/Products/display"; // Default fallback
    }
    return `/dashboard/Products/display/${id}`;
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
    this.user = new User().initialize(JSON.parse(localStorage.getItem("user")));
  }
}
