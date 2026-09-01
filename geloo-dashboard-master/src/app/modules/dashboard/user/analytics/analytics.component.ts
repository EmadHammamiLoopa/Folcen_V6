import { Component, OnInit } from '@angular/core';
import { DataService } from './../../../../services/data.service';
import { ChartDataset, ChartOptions } from 'chart.js';

@Component({
    selector: 'app-analytics',
    templateUrl: './analytics.component.html',
    styleUrls: ['./analytics.component.scss'],
    standalone: false
})
export class AnalyticsComponent implements OnInit {

  loading = true;
  canDeleteAnnouncements = false;
  kpis: any = {};
  retention: any = {};

  // Growth Chart
  growthChartData: ChartDataset<'line', number[]>[] = [
    {
      data: [],
      label: 'New Users',
      backgroundColor: 'rgba(79, 70, 229, 0.2)',
      borderColor: 'rgba(79, 70, 229, 1)',
      pointBackgroundColor: 'rgba(79, 70, 229, 1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(79, 70, 229, 0.8)'
    }
  ];
  growthChartLabels: string[] = [];

  // Engagement Chart
  engagementChartData: ChartDataset<'line', number[]>[] = [
    {
      data: [],
      label: 'Active Users',
      backgroundColor: 'rgba(79, 70, 229, 0.2)',
      borderColor: 'rgba(79, 70, 229, 1)',
      pointBackgroundColor: 'rgba(79, 70, 229, 1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(79, 70, 229, 0.8)'
    }
  ];
  engagementChartLabels: string[] = [];

  // Status Chart
  statusChartData: ChartDataset<'pie', number[]>[] = [
    {
      data: [],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ]
    }
  ];
  statusChartLabels: string[] = ['Enabled', 'Disabled'];

  // Feature Usage
  features: any = {};

  announcements: any[] = [];
  newAnnouncement = {
    title: '',
    content: '',
    type: 'info',
    target: 'all'
  };

  chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  constructor(private dataService: DataService) { }

  ngOnInit(): void {
    try {
      const rawUser =
        localStorage.getItem('user');

      const user =
        rawUser
          ? JSON.parse(rawUser)
          : null;

      this.canDeleteAnnouncements =
        !!user &&
        user.role === 'SUPER ADMIN';

    } catch (_) {
      this.canDeleteAnnouncements =
        false;
    }

    this.loadAnalytics();
    this.loadRetention();
    this.loadAnnouncements();
  }

  loadAnnouncements() {
    this.dataService.sendGetRequest('admin/announcements').subscribe((resp: any) => {
      this.announcements = resp.data;
    });
  }

  createAnnouncement() {
    if (!this.newAnnouncement.title || !this.newAnnouncement.content) return;
    this.dataService.sendPostRequest('admin/announcements', this.newAnnouncement).subscribe(() => {
      this.loadAnnouncements();
      this.newAnnouncement = { title: '', content: '', type: 'info', target: 'all' };
    });
  }

  deleteAnnouncement(id) {
    if (confirm('Are you sure you want to delete this announcement?')) {
      this.dataService.sendDeleteRequest('admin/announcements/' + id).subscribe(() => {
        this.loadAnnouncements();
      });
    }
  }

  loadAnalytics() {
    this.loading = true;
    this.dataService.sendGetRequest('admin/analytics', {}).subscribe(
      (resp: any) => {
        const data = resp.data;
        this.kpis = data.kpis;
        this.features = data.charts.features;

        // Growth Chart
        this.growthChartLabels = data.charts.growth.map(i => i._id);
        this.growthChartData = [
          {
            ...this.growthChartData[0],
            data: data.charts.growth.map(i => i.count)
          }
        ];

        // Engagement Chart
        this.engagementChartLabels = data.charts.engagement.map(i => i._id);
        this.engagementChartData = [
          {
            ...this.engagementChartData[0],
            data: data.charts.engagement.map(i => i.count)
          }
        ];

        // Status Chart
        const enabled = data.charts.status.find(s => s._id === true)?.count || 0;
        const disabled = data.charts.status.find(s => s._id === false)?.count || 0;
        this.statusChartData = [
          {
            ...this.statusChartData[0],
            data: [enabled, disabled]
          }
        ];

        this.loading = false;
      },
      err => {
        console.error('Failed to load analytics', err);
        this.loading = false;
      }
    );
  }

  loadRetention() {
    this.dataService.sendGetRequest('admin/analytics/users/retention', {}).subscribe(
      (resp: any) => {
        this.retention = resp.data;
      }
    );
  }
}
