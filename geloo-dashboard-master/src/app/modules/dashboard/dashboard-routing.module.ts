import { SuperAdminGuard } from './../../guards/super-admin.guard';
import { DashboardComponent } from './dashboard.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes, CanActivate } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      {
        path: '',
        redirectTo: 'Users',
        pathMatch: 'full'
      },
      {
        path: 'Users',
        loadChildren: () => import('./user/user.module').then(m => m.UserModule)
      },
      {
        path: 'Channels',
        loadChildren: () => import('./channel/channel.module').then(m => m.ChannelModule)
      },
      {
        path: 'Posts',
        loadChildren: () => import('./post/post.module').then(m => m.PostModule)
      },
      {
        path: 'Comments',
        loadChildren: () => import('./comment/comment.module').then(m => m.CommentModule)
      },
      {
        path: 'Products',
        loadChildren: () => import('./product/product.module').then(m => m.ProductModule)
      },
      {
        path: 'Services',
        loadChildren: () => import('./service/service.module').then(m => m.ServiceModule)
      },
      {
        path: 'Jobs',
        loadChildren: () => import('./job/job.module').then(m => m.JobModule)
      },
      {
        path: 'reports',
        loadChildren: () => import('./reports/reports.module').then(m => m.ReportsModule)
      },
      {
        path: 'subscriptions',
        loadChildren: () => import('./subscription/subscription.module').then(m => m.SubscriptionModule),
      },
      {
        path: 'GDPR',
        loadChildren: () => import('./gdpr/gdpr.module').then(m => m.GdprModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule { }
