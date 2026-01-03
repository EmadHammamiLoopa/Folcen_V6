import { UserService } from './../../../../services/user.service';
import { User } from './../../../../models/User';
import { Component, OnInit, ViewChild } from '@angular/core';
import { TableComponent } from '../../../table/table.component';
import { environment } from '../../../../../environments/environment';

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
      name: "mainAvatar",
      title: "User",
      type: "avatar",
      sort: false,
      align: "center"
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
      type: "text",
      align: "center"
    },
    {
      name: "enabled",
      title: "Status",
      type: "boolean",
      values: ["Disabled", "Enabled"],
      align: "center"
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
  stats: any = {
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    reportedUsersCount: 0
  };
  filters: any = {
    searchQuery: '',
    role: '',
    enabled: null,
    minReports: null,
    fromDate: '',
    toDate: ''
  };

  @ViewChild(TableComponent) table: TableComponent;

  selectedUsers: any[] = [];
  adminMessage = {
    text: '',
    sending: false
  };

  constructor(public userService: UserService) { }

  ngOnInit(): void {
    this.getUser();
  }

  onSelectionChange(selected: any[]) {
    this.selectedUsers = selected;
  }

  exportUsers(format: 'csv' | 'json') {
    const token = window.localStorage.getItem('token');
    const baseUrl = environment.apiUrl;
    // Corrected URL to match backend route: /api/v1/admin/users/export
    const url = `${baseUrl}/admin/users/export?format=${format}&token=${token}`;
    window.open(url, '_blank');
  }

  sendBulkMessage() {
    if (!this.adminMessage.text || this.selectedUsers.length === 0) {
      console.warn('sendBulkMessage: missing text or selected users', { text: !!this.adminMessage.text, count: this.selectedUsers.length });
      return;
    }

    this.adminMessage.sending = true;
    const userIds = this.selectedUsers.map(u => this.getId(u)).filter(id => !!id);
    console.log('DEBUG sendBulkMessage: sending to userIds', userIds);
    console.log('DEBUG sendBulkMessage: message text', this.adminMessage.text);

    if (userIds.length === 0) {
      alert('No valid user IDs found in selection');
      this.adminMessage.sending = false;
      return;
    }

    const payload = {
      userIds,
      text: this.adminMessage.text
    };
    console.log('DEBUG sendBulkMessage: final payload', payload);

    this.userService.sendPostRequest('admin/messages/send', payload).subscribe({
      next: (resp: any) => {
        console.log('DEBUG sendBulkMessage: success response', resp);
        this.adminMessage.sending = false;
        this.adminMessage.text = '';
        this.selectedUsers = [];
        if (this.table) this.table.clearSelection();
        alert('Messages sent successfully to ' + (resp.data?.count || 0) + ' users');
      },
      error: (err) => {
        console.error('DEBUG sendBulkMessage: error response', err);
        this.adminMessage.sending = false;
        // Backend uses 'errors' field for error messages in sendError
        const errorMsg = err.error?.errors || err.error?.message || err.message || 'Failed to send messages';
        alert('Error: ' + errorMsg);
      }
    });
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
