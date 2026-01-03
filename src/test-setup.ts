import { TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { CallNumber } from '@ionic-native/call-number/ngx';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { AppModule } from './app/app.module';

declare const require: any;

function tryRequire(path: string) {
  try { return require(path); } catch (e) { return null; }
}

const nativeStorageModule = tryRequire('@ionic-native/native-storage/ngx');
const NativeStorage = nativeStorageModule?.NativeStorage;

const cameraModule = tryRequire('@ionic-native/camera/ngx');
const Camera = cameraModule?.Camera;


const androidPermModule = tryRequire('@ionic-native/android-permissions/ngx') || tryRequire('@awesome-cordova-plugins/android-permissions/ngx');
const AndroidPermissions = androidPermModule?.AndroidPermissions;

const stripeModule = tryRequire('ngx-stripe') || tryRequire('@ionic-native/stripe/ngx');
const Stripe = stripeModule?.Stripe || stripeModule?.StripeService;

const mockNativeStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};
const mockCamera = { getPicture: () => Promise.reject('no-camera') };
const mockAndroidPermissions = { checkPermission: () => Promise.resolve({ hasPermission: false }), requestPermission: () => Promise.resolve({ hasPermission: false }) };
const mockStripe = {};
const mockCallNumber = { callNumber: (a: any, b: any) => Promise.reject('no-call') };

const originalConfigure = TestBed.configureTestingModule.bind(TestBed);
(function registerStubPipes() {
  @Pipe({ name: 'extractDiffTime' })
  class ExtractDiffTimePipe implements PipeTransform {
    transform(value: any): any { return value; }
  }

  // Attach to global object so tests can reference the class if needed
  (globalThis as any).__ExtractDiffTimePipe = ExtractDiffTimePipe;
})();
(TestBed as any).configureTestingModule = (moduleDef: any = {}) => {
  moduleDef.imports = [...(moduleDef.imports || []),
    RouterTestingModule.withRoutes([]),
    HttpClientTestingModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule.forRoot(),
    AppModule
  ];
  moduleDef.providers = [...(moduleDef.providers || [])];
  moduleDef.declarations = [...(moduleDef.declarations || []), (globalThis as any).__ExtractDiffTimePipe].filter(Boolean);
  if (NativeStorage) moduleDef.providers.push({ provide: NativeStorage, useValue: mockNativeStorage });
  if (Camera) moduleDef.providers.push({ provide: Camera, useValue: mockCamera });
  if (AndroidPermissions) moduleDef.providers.push({ provide: AndroidPermissions, useValue: mockAndroidPermissions });
  if (Stripe) moduleDef.providers.push({ provide: Stripe, useValue: mockStripe });
  // Ensure a mock CallNumber provider so components depending on it don't fail in tests
  try {
    moduleDef.providers.push({ provide: CallNumber, useValue: mockCallNumber });
  } catch (e) {}
  moduleDef.schemas = [...(moduleDef.schemas || []), CUSTOM_ELEMENTS_SCHEMA];
  return originalConfigure(moduleDef);
};

// Helpful global: silence console warnings during tests
try { console.debug = console.debug || (() => {}); } catch (e) {}

// Prevent real socket connections during unit tests by stubbing SocketService
try {
  const svc = require('./app/services/socket.service');
  const SocketService = svc?.SocketService;
  if (SocketService) {
    SocketService.initializeSocket = async () => { return; };
    // Return a minimal socket-like object with safe no-op methods so tests that call .on/.emit don't fail
    SocketService.getSocket = async () => {
      return {
        on: (ev: string, cb?: any) => { /* noop */ },
        emit: (ev: string, data?: any) => { /* noop */ },
        off: (ev?: string) => { /* noop */ },
        disconnect: () => { /* noop */ }
      };
    };
    SocketService.emit = (event: string, data: any) => { /* noop */ };
  }
} catch (e) {
  // ignore if service not present in test environment
}
