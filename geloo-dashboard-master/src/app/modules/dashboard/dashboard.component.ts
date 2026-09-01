import { Component, OnInit } from '@angular/core';
import { LegalAcceptanceService } from '../../services/legal-acceptance.service';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: false
})
export class DashboardComponent implements OnInit {

  constructor(private legalService: LegalAcceptanceService) { }

  ngOnInit(): void {
    this.checkLegalAcceptance();
  }

  checkLegalAcceptance() {
    this.legalService.checkAcceptance().subscribe(status => {
      if (status && !status.accepted) {
        console.warn('User has not accepted the latest legal versions');
        // In a real scenario, we would trigger a modal here
      }
    });
  }

}
