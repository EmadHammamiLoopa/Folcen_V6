import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { FormComponent } from './form/form.component';
import { DisplayComponent } from './display/display.component';
import { AuthGuard } from 'src/app/guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        redirectTo: 'display/null',
        pathMatch: 'full',
        canActivate: [AuthGuard]

      },
      {
        path: 'display/:id',
        component: DisplayComponent,
        canActivate: [AuthGuard] // Protect this route
      },
      {
        path: 'form',
        component: FormComponent,
        canActivate: [AuthGuard] // Protect this route
      },
      {
        path: 'chat/:id', // Add this route for chatting with friend
        loadChildren: () => import('../messages/messages.module').then(m => m.MessagesPageModule),
        canActivate: [AuthGuard]
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProfilePageRoutingModule {}
