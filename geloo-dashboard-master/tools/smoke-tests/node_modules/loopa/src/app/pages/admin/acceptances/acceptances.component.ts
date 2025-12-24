import { Component, OnInit } from '@angular/core';
import { LegalService } from '../../../services/legal.service';

@Component({
  selector: 'app-admin-acceptances',
  templateUrl: './acceptances.component.html',
  styleUrls: ['./acceptances.component.scss']
})
export class AcceptancesComponent implements OnInit {
  acceptances: any[] = [];
  loading = false;
  userId = '';

  constructor(private legal: LegalService) {}

  ngOnInit(): void {}

  async load() {
    if (!this.userId) return;
    this.loading = true;
    try {
      const res: any = await this.legal.getAcceptancesForUser(this.userId);
      this.acceptances = res && res.data ? res.data : [];
    } catch (e) {
      console.error('Failed to load acceptances', e);
    } finally { this.loading = false; }
  }
}
