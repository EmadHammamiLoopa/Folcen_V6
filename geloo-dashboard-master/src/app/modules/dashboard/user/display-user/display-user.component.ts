import { Component, OnInit } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { ActivatedRoute } from '@angular/router';
import { DataService } from './../../../../services/data.service';
import { GdprService } from './../../../../services/gdpr.service';
import { User } from './../../../../models/User';
import { AvatarUrlUtil } from './../../../../utils/avatar-url-util';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-display-user',
    templateUrl: './display-user.component.html',
    styleUrls: ['./display-user.component.scss'],
    standalone: false
})
export class DisplayUserComponent implements OnInit {

  profile: any = {};
  currentUser: User;
  counts: any = {};
  related: any = {
    posts: [],
    comments: [],
    reports: [],
    products: [],
    jobs: [],
    services: [],
    channels: [],
    requests: []
  };
  acceptances: any[] = [];
  auditLogs: any[] = [];
  loading = false;
  tab: string = 'profile';
  today: Date = new Date();

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private gdprService: GdprService
  ) { }

  ngOnInit(): void {
    this.currentUser = new User().initialize(JSON.parse(localStorage.getItem('user')));
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || params.get('_id') || this.route.snapshot.queryParamMap.get('id');
      if (id) {
        this.loadUserDash(id);
        this.loadLegalData(id);
      }
    });
  }

  loadUserDash(userId: string) {
    this.loading = true;
    const url = `user/dash/${userId}`;
    this.dataService.sendGetRequest(url, {}).subscribe(
      (resp: any) => {
        this.loading = false;
        const d = resp && resp.data ? resp.data : resp;
        this.profile = d.user || d.profile || d;
        this.counts = d.counts || d.count || {};
        this.related = {
          posts: d.posts || [],
          comments: d.comments || [],
          reports: d.reports || [],
          products: d.products || [],
          jobs: d.jobs || [],
          services: d.services || [],
          channels: d.channels || [],
          requests: d.requests || []
        };
        console.log('[DisplayUser] loaded user dash', { userId, profile: this.profile, counts: this.counts });
      },
      (err) => {
        this.loading = false;
        console.error('[DisplayUser] Failed to load user dash', { url, userId, err });
        alert(`Failed to load user data. See console for details.`);
      }
    );
  }

  loadLegalData(userId: string) {
    // Load acceptances
    this.dataService.sendGetRequest('gdpr/acceptances', { userId }).subscribe((resp: any) => {
      this.acceptances = (resp.data || []).map((acc: any) => {
        // Ensure acceptedAt is never empty for the UI
        if (!acc.acceptedAt || acc.acceptedAt === 'N/A') {
          acc.acceptedAt = acc.createdAt || acc.updatedAt || acc._id;
        }
        return acc;
      });
    });

    // Load audit logs
    this.dataService.sendGetRequest('gdpr/audit-logs', { userId }).subscribe((resp: any) => {
      this.auditLogs = resp.data?.docs || [];
    });
  }

  viewDocument(acc: any) {
    let title = acc.documentType ? acc.documentType.replace(/_/g, ' ').toUpperCase() : 'Document';
    const dateStr = this.getRobustDate(acc);
    const meta = acc.meta || {};
    
    let content = `
      <div class="bg-gray-50 rounded-2xl p-5 mb-6 border border-gray-100 shadow-sm">
        <h4 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
          <span class="mr-2">Technical Evidence</span>
          <div class="flex-1 h-px bg-gray-200"></div>
        </h4>
        <div class="grid grid-cols-1 gap-3 text-sm">
          <div class="flex justify-between items-center border-b border-gray-200/50 pb-2">
            <span class="text-gray-500 font-medium">Version</span>
            <span class="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs">${acc.documentVersion}</span>
          </div>
          <div class="flex justify-between items-center border-b border-gray-200/50 pb-2">
            <span class="text-gray-500 font-medium">Accepted on</span>
            <span class="font-bold text-gray-700">${dateStr}</span>
          </div>
          <div class="flex justify-between items-center border-b border-gray-200/50 pb-2">
            <span class="text-gray-500 font-medium">Context</span>
            <span class="text-gray-700 capitalize">${acc.acceptanceContext || 'signup'}</span>
          </div>
          <div class="flex justify-between items-center border-b border-gray-200/50 pb-2">
            <span class="text-gray-500 font-medium">IP Address</span>
            <span class="font-mono text-gray-600">${meta.ip || 'N/A'}</span>
          </div>
          <div class="flex flex-col gap-1.5 pt-1">
            <span class="text-gray-500 font-medium">User Agent</span>
            <span class="text-[10px] text-gray-400 break-all leading-relaxed bg-white p-3 rounded-xl border border-gray-100 shadow-inner">${meta.userAgent || 'N/A'}</span>
          </div>
        </div>
      </div>
      <div class="relative mb-6">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
          <div class="w-full border-t border-gray-200"></div>
        </div>
        <div class="relative flex justify-center">
          <span class="bg-white px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] italic">Document Content</span>
        </div>
      </div>
    `;

    if (acc.documentType === 'terms' || acc.documentType === 'terms_and_privacy' || acc.documentType === 'terms_and_conditions') {
      content += `
        <div class="prose prose-sm max-w-none text-left text-gray-600 leading-relaxed">
          <h3 class="font-black text-gray-800 mb-2">TERMS OF SERVICE</h3>
          <p>By using Folcen, you agree to be bound by these Terms of Service. This includes general terms of use, user privacy, and GDPR compliance.</p>
          <p>Every new user is entitled to specific usage limits and privileges, including friend requests, video calls, and posts.</p>
          <div class="mt-4 p-3 bg-amber-50 border-l-4 border-amber-400 text-amber-700 text-xs italic rounded-r-lg">
            Note: This is a summary of the terms accepted by the user at the time of registration.
          </div>
        </div>
      `;
    } else if (acc.documentType === 'privacy' || acc.documentType === 'privacy_policy') {
      content += `
        <div class="prose prose-sm max-w-none text-left text-gray-600 leading-relaxed">
          <h3 class="font-black text-gray-800 mb-2">PRIVACY POLICY</h3>
          <p>This Privacy Policy describes how Folcen collects, uses, and shares your personal information when you use our mobile application.</p>
          <p>We collect information you provide directly to us, such as when you create an account or update your profile.</p>
          <div class="mt-4 p-3 bg-amber-50 border-l-4 border-amber-400 text-amber-700 text-xs italic rounded-r-lg">
            Note: This is a summary of the privacy policy accepted by the user.
          </div>
        </div>
      `;
    } else if (acc.documentType?.includes('disclaimer')) {
      content += `
        <div class="prose prose-sm max-w-none text-left text-gray-600 leading-relaxed">
          <h3 class="font-black text-gray-800 mb-2">${title}</h3>
          <p>The user has accepted the specific disclaimer for ${acc.documentType.replace('_disclaimer', 's')}.</p>
          <p>This disclaimer outlines the responsibilities and limitations of liability for content and transactions within this category.</p>
          <div class="mt-4 p-3 bg-amber-50 border-l-4 border-amber-400 text-amber-700 text-xs italic rounded-r-lg">
            Note: This is a summary of the disclaimer accepted by the user.
          </div>
        </div>
      `;
    } else {
      content += `<div class="text-center py-8"><p class="italic text-gray-400 text-sm">Full content for this document type (${acc.documentType}) is not available in the dashboard preview.</p></div>`;
    }

    Swal.fire({
      title: null,
      html: `
        <div class="text-center mb-8 pt-4">
          <h2 class="text-2xl font-black text-gray-800 uppercase tracking-widest">${title}</h2>
          <div class="flex justify-center mt-3">
            <div class="h-1.5 w-20 bg-indigo-600 rounded-full shadow-sm shadow-indigo-200"></div>
          </div>
        </div>
        <div class="px-2">
          ${content}
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-download"></i> Download as Text',
      cancelButtonText: 'Close',
      confirmButtonColor: '#4f46e5',
      width: '650px',
      customClass: {
        popup: 'rounded-3xl border-none shadow-2xl',
        confirmButton: 'rounded-xl px-8 py-3 font-bold uppercase tracking-widest text-sm',
        cancelButton: 'rounded-xl px-8 py-3 font-bold uppercase tracking-widest text-sm'
      },
      showClass: {
        popup: 'animate__animated animate__fadeInUp animate__faster'
      },
      hideClass: {
        popup: 'animate__animated animate__fadeOutDown animate__faster'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.downloadDocumentAsText(acc);
      }
    });
  }

  downloadDocumentAsText(acc: any) {
    const dateStr = this.getRobustDate(acc);
    const meta = acc.meta || {};
    const text = `
LEGAL ACCEPTANCE RECORD (GDPR COMPLIANT)
---------------------------------------
Document: ${acc.documentType.toUpperCase()}
Version: ${acc.documentVersion}
Accepted On: ${dateStr}
Context: ${acc.acceptanceContext || 'N/A'}

TECHNICAL EVIDENCE:
------------------
IP Address: ${meta.ip || 'N/A'}
User Agent: ${meta.userAgent || 'N/A'}
Platform: ${meta.clientType || 'N/A'}

USER INFORMATION:
-----------------
User ID: ${this.itemId(this.profile)}
Name: ${this.profile.firstName} ${this.profile.lastName}
Email: ${this.profile.email}

This document serves as non-repudiable evidence that the user specified above 
accepted the terms/disclaimer on the date and time indicated from the 
technical environment described.
    `.trim();

    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acceptance-${acc.documentType}-${this.itemId(this.profile)}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  getRobustDate(acc: any): string {
    if (!acc) return 'N/A';
    
    // Try fields in order of preference
    const rawDate = acc.acceptedAt || acc.createdAt || acc.updatedAt || acc._id;
    if (!rawDate) return 'N/A';

    const formatted = this.formatDate(rawDate);
    if (formatted !== 'N/A') return formatted;

    // Last resort: if it's an object with _id, try extracting from that
    if (acc._id) {
      const idFormatted = this.formatDate(acc._id);
      if (idFormatted !== 'N/A') return idFormatted;
    }

    return 'N/A';
  }

  formatDate(date: any): string {
    if (!date || date === 'N/A') return 'N/A';
    
    try {
      // 1. If it's already a Date object
      if (date instanceof Date) {
        return date.toLocaleString();
      }

      // 2. Handle standard Date/ISO strings
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        // Check if it's a very old date (like 1970) which might indicate a parsing error of a small number
        if (d.getFullYear() > 2000) {
          return d.toLocaleString();
        }
      }

      // 3. Handle numeric timestamps (string or number)
      const num = Number(date);
      if (!isNaN(num) && String(date).trim() !== '' && String(date).length > 8) {
        // If it's in seconds (10 digits), convert to ms
        const timestamp = num < 10000000000 ? num * 1000 : num;
        const d2 = new Date(timestamp);
        if (!isNaN(d2.getTime())) return d2.toLocaleString();
      }

      // 4. Handle MongoDB ObjectIDs (24-char hex)
      const idStr = this.itemId(date); // Use itemId to get the string representation
      if (idStr && idStr.length === 24 && /^[0-9a-fA-F]+$/.test(idStr)) {
        const timestamp = parseInt(idStr.substring(0, 8), 16) * 1000;
        const d3 = new Date(timestamp);
        if (!isNaN(d3.getTime())) return d3.toLocaleString();
      }

      // 5. Final attempt: just try to return the string if it looks like a date
      if (typeof date === 'string' && date.length > 10) {
        return date;
      }

      return 'N/A';
    } catch (e) {
      return 'N/A';
    }
  }

  getAvatarUrl(profile: any): string {
    const backendRoot = environment.apiUrl ? environment.apiUrl.replace(/\/api\/v1\/?$/i, '') : '';
    let url = AvatarUrlUtil.getAvatarUrl(profile, backendRoot);
    
    // Add cache-busting timestamp if updatedAt exists and it's a local file
    if (profile.updatedAt && !url.includes('dicebear.com')) {
      const timestamp = new Date(profile.updatedAt).getTime();
      url += (url.includes('?') ? '&' : '?') + 't=' + timestamp;
    }
    return url;
  }

  itemId(v: any): string {
    if (!v) return '';
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.itemId(v._id || v.id);
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

  giveFreeSubscription(days: number) {
    const userId = this.itemId(this.profile);
    if (!userId) return;

    Swal.fire({
      title: 'Give Free Subscription',
      text: `Give ${days} days of free subscription to ${this.profile.firstName}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, give it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.dataService.sendPostRequest('subscription/free', { userId, days }).subscribe(
          (res: any) => {
            Swal.fire('Success', res.message, 'success');
            this.loadUserDash(userId); // Refresh user data
          },
          err => Swal.fire('Error', 'Could not give free subscription', 'error')
        );
      }
    });
  }

  toggleStatus() {
    const id = this.itemId(this.profile);
    if (!id) return;
    this.loading = true;
    this.dataService.sendPutRequest(`user/toggle-status/${id}`, {}).subscribe(
      (resp: any) => {
        this.profile.enabled = !this.profile.enabled;
        this.loading = false;
      },
      err => {
        this.loading = false;
        alert('Failed to toggle user status');
      }
    );
  }

  verifyUser(verified: boolean) {
    const id = this.itemId(this.profile);
    if (!id) return;
    this.loading = true;
    this.dataService.sendPostRequest(`user/verify/${id}`, { verified }).subscribe(
      (resp: any) => {
        this.profile.verified = verified;
        this.loading = false;
      },
      err => {
        this.loading = false;
        alert('Failed to update verification status');
      }
    );
  }

  changeRole() {
    const id = this.itemId(this.profile);
    if (!id) return;
    const role = prompt("Enter role (USER, ADMIN, SUPER ADMIN)", this.profile.role);
    if (role === null) return;
    
    const validRoles = ['USER', 'ADMIN', 'SUPER ADMIN'];
    if (!validRoles.includes(role.toUpperCase())) {
      alert("Invalid role! Please use USER, ADMIN, or SUPER ADMIN.");
      return;
    }
    
    this.loading = true;
    this.dataService.sendPostRequest(`user/role/${id}`, { role: role.toUpperCase() }).subscribe(
      (resp: any) => {
        this.profile.role = role.toUpperCase();
        this.loading = false;
      },
      err => {
        this.loading = false;
        alert('Failed to update user role');
      }
    );
  }

  deleteUser() {
    const id = this.itemId(this.profile);
    if (!id) return;
    const reason = prompt('Please provide a reason for deleting this user:');
    if (reason === null) return; // Cancelled

    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      this.loading = true;
      this.dataService.sendDeleteRequest(`user/${id}?reason=${encodeURIComponent(reason)}`).subscribe(
        resp => {
          this.loading = false;
          alert('User deleted successfully');
          window.history.back();
        },
        err => {
          this.loading = false;
          alert('Failed to delete user');
        }
      );
    }
  }

  banUser() {
    const id = this.itemId(this.profile);
    if (!id) return;
    
    const reason = prompt('Reason for banning this user:');
    if (reason === null) return;
    
    const duration = prompt('Ban duration in days (leave empty for permanent):', '');
    if (duration === null) return;

    this.loading = true;
    this.dataService.sendPostRequest(`user/${id}/ban`, { 
      message: reason, 
      duration: duration ? parseInt(duration) : null 
    }).subscribe(
      (resp: any) => {
        this.profile.banned = true;
        this.profile.banUntil = resp.data?.banUntil;
        this.loading = false;
        alert('User banned successfully');
      },
      err => {
        this.loading = false;
        alert('Failed to ban user');
      }
    );
  }

  unbanUser() {
    const id = this.itemId(this.profile);
    if (!id) return;
    
    if (!confirm('Are you sure you want to unban this user?')) return;

    this.loading = true;
    this.dataService.sendPostRequest(`user/${id}/unban`, {}).subscribe(
      (resp: any) => {
        this.profile.banned = false;
        this.profile.banUntil = null;
        this.loading = false;
        alert('User unbanned successfully');
      },
      err => {
        this.loading = false;
        alert('Failed to unban user');
      }
    );
  }

  extractUserData(userId: string) {
    if (
      !userId ||
      userId === 'undefined' ||
      userId === 'null'
    ) {
      alert(
        'Cannot extract data: Invalid User ID'
      );
      return;
    }

    const format =
      prompt(
        "Enter format: 'json' or 'csv'",
        'json'
      )?.toLowerCase();

    if (
      !format ||
      (
        format !== 'json' &&
        format !== 'csv'
      )
    ) {
      alert(
        "Invalid format! Please enter 'json' or 'csv'."
      );
      return;
    }

    // Authorization remains in the Authorization header. Never place the
    // bearer token in a query string / browser history / proxy log.
    this.dataService
      .sendGetBlobRequest(
        `user/extract/${userId}`,
        { format }
      )
      .subscribe({
        next: (blob: Blob) => {
          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              'a'
            );

          link.href =
            url;

          link.download =
            `user-${userId}.${format}`;

          link.style.display =
            'none';

          document.body.appendChild(
            link
          );

          link.click();
          link.remove();

          setTimeout(
            () =>
              URL.revokeObjectURL(
                url
              ),
            0
          );
        },

        error: (err) => {
          alert(
            err?.message ||
            'Failed to extract data'
          );
        }
      });
  }

  extractJson(userId?: string) {
    const id =
      userId ||
      this.itemId(
        this.profile
      );

    if (!id) return;

    this.loading = true;

    this.gdprService
      .exportUserDataAll(id)
      .subscribe({
        next: (data: any) => {
          this.loading = false;

          if (
            data &&
            data.complete === false
          ) {
            alert(
              'GDPR export was not marked complete by the server.'
            );
            return;
          }

          const blob =
            new Blob(
              [
                JSON.stringify(
                  data,
                  null,
                  2
                )
              ],
              {
                type:
                  'application/json'
              }
            );

          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              'a'
            );

          link.href =
            url;

          link.download =
            `gdpr-export-${id}-${Date.now()}.json`;

          document.body.appendChild(
            link
          );

          link.click();
          link.remove();

          URL.revokeObjectURL(
            url
          );

          this.loadLegalData(
            id
          );
        },

        error: (err) => {
          this.loading = false;

          alert(
            err?.message ||
            'Failed to extract GDPR data'
          );
        }
      });
  }

  gdprErase() {
    const id = this.itemId(this.profile);
    if (!id) return;
    const reason = prompt('Please provide a reason for this GDPR erasure request:');
    if (reason === null) return; // Cancelled

    if (confirm('GDPR ERASURE: This will PERMANENTLY DELETE the user and all their data (files, posts, etc.) immediately. This action is irreversible. Are you sure?')) {
      this.loading = true;
      this.dataService.sendPostRequest('gdpr/erase', { userId: id, reason }).subscribe(
        (resp: any) => {
          this.loading = false;
          alert('User permanently erased and data purged.');
          window.history.back();
        },
        err => {
          this.loading = false;
          alert('Failed to perform GDPR erasure');
        }
      );
    }
  }
}

