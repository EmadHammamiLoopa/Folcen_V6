import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-gdpr-centre',
  templateUrl: './gdpr-centre.component.html',
  styleUrls: ['./gdpr-centre.component.scss']
})
export class GdprCentreComponent {

  tabs = [
    { label: 'DSAR / Export',    path: 'dsar',      icon: 'fas fa-download',       desc: 'Art. 15 & 20' },
    { label: 'Erase User',       path: 'erase',     icon: 'fas fa-user-slash',     desc: 'Art. 17' },
    { label: 'Consent Controls', path: 'consent',   icon: 'fas fa-toggle-on',      desc: 'Art. 7' },
    { label: 'Audit Log',        path: 'audit-log', icon: 'fas fa-clipboard-list', desc: 'Art. 30' },
    { label: 'Interests',        path: 'interests', icon: 'fas fa-chart-bar',      desc: 'Analytics' },
  ];

  constructor(public router: Router) {}

  isActive(path: string): boolean {
    return this.router.url.includes('/gdpr/' + path.toLowerCase())
        || this.router.url.toUpperCase().includes('/GDPR/' + path.toUpperCase());
  }
}
