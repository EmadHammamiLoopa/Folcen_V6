import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

let bootstrapped = false;

function bootstrapApp() {
  if (bootstrapped) return;
  bootstrapped = true;

  platformBrowserDynamic().bootstrapModule(AppModule)
    .catch(err => console.error(err));
}

const hasCordova = typeof window !== 'undefined' && !!(window as any).cordova;

if (hasCordova) {
  document.addEventListener('deviceready', bootstrapApp, false);
} else {
  bootstrapApp();
}
