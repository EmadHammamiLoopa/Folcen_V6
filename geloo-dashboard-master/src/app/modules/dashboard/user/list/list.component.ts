import { UserService } from './../../../../services/user.service';
import { User } from './../../../../models/User';
import { Component, OnInit, ViewChild } from '@angular/core';
import { TableComponent } from '../../../table/table.component';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit {

  headers = [
    {
      name: "mainAvatar",
      title: "Avatar",
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
      name: "firstName",
      title: "First Name",
      type: "text"
    },
    {
      name: "lastName",
      title: "Last Name",
      type: "text"
    },
    {
      name: "email",
      title: "E-mail",
      type: "text"
    },
    {
      name: "role",
      title: "Role",
      type: "text"
    },
    {
      name: "enabled",
      title: "Status",
      type: "boolean",
      values: ["Disabled", "Enabled"]
    },
    {
      name: "reports",
      title: "Reports",
      type: "number",
      align: "center"
    },
    {
      name: "lastSeen",
      title: "Last Active",
      type: "date"
    },
    {
      name: "createdAt",
      title: "Joined",
      type: "date"
    }
  ];
  
  user: User;
  filters: any = {
    role: '',
    enabled: null,
    minReports: null,
    fromDate: '',
    toDate: ''
  };

  @ViewChild(TableComponent) table: TableComponent;

  constructor(public userService: UserService) { }

  ngOnInit(): void {
    this.getUser();
  }

  getDisplayLink = (row: any): string => {
    const id = this.getId(row);
    if (!id) {
      console.error('Row or id is missing');
      return '/dashboard/Users/display'; // Default fallback
    }
    return `/dashboard/Users/display/${id}`;
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
  
  getUser(){
    this.user = new User().initialize(JSON.parse(localStorage.getItem('user')));
  }

  applyFilters() {
    if (this.table) {
      // reset to first page
      this.table.currentPage = 1;
      this.table.extraParams = Object.assign({}, this.filters);
      this.table.getData();
    }
  }
}
