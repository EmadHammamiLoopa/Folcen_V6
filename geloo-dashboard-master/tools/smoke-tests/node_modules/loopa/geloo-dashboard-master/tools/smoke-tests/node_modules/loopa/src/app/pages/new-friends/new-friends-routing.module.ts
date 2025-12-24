import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { NewFriendsPage } from './new-friends.page';

const routes: Routes = [
  {
    path: '',
    component: NewFriendsPage
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NewFriendsPageRoutingModule {}
