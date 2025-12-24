import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private currentTheme: 'light' | 'dark' = 'dark';

  constructor(
    private rendererFactory: RendererFactory2,
    private platform: Platform,
    private nativeStorage: NativeStorage
  ) {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  async initializeTheme() {
    try {
      const savedTheme = await this.nativeStorage.getItem('theme_preference');
      if (savedTheme) {
        this.setTheme(savedTheme);
      } else {
        // Default to dark theme
        this.setTheme('dark');
      }
    } catch (e) {
      // If no preference saved, use default dark
      this.setTheme('dark');
    }
  }

  setTheme(theme: 'light' | 'dark') {
    this.currentTheme = theme;
    
    if (theme === 'dark') {
      this.renderer.addClass(document.body, 'dark-theme');
      this.renderer.removeClass(document.body, 'light-theme');
    } else {
      this.renderer.addClass(document.body, 'light-theme');
      this.renderer.removeClass(document.body, 'dark-theme');
    }

    this.nativeStorage.setItem('theme_preference', theme).catch(err => {
      console.warn('Could not save theme preference', err);
    });
  }

  getTheme() {
    return this.currentTheme;
  }

  toggleTheme() {
    this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }
}
