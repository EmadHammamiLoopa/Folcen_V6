import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './pages/messages/chat/chat.component';
import { VideoComponent } from './pages/messages/chat/video/video.component';
import { ErrorComponent } from './pages/error/error.component';
import { AuthGuard } from './guards/auth.guard';
import { GuestGuard } from './guards/guest.guard';
import { EditProductComponent } from './edit-product/edit-product.component';
import { ProductComponent