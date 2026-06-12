import { Injectable } from '@angular/core';
import { FilePath } from '@ionic-native/file-path/ngx';
import { File as IonicFile } from '@ionic-native/file/ngx';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Platform } from '@ionic/angular';
import { Camera, CameraOptions, PictureSourceType, MediaType } from '@ionic-native/camera/ngx';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';
import { PermissionService } from './permission.service';
import { MockCordovaService } from './mock-cordova.service';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import constants from '../helpers/constants';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UploadFileService {

  constructor(
    private filePath: FilePath,
    private file: IonicFile,
    private webView: WebView,
    private platform: Platform,
    private camera: Camera,
    private permissionService: PermissionService,
    private androidPermission: AndroidPermissions,
    private mockCordovaService: MockCordovaService,
    private http: HttpClient
  ) {}

    private apiUrl = `${environment.apiUrl}/user`;
  
  takeMedia(sourceType: number, mediaType: 'image' | 'video'): Promise<{ filePath: string, mediaType: string }> {
    const destinationType = this.camera.DestinationType.NATIVE_URI;
    const options: CameraOptions = {
      quality: 75,
      destinationType,
      encodingType: this.camera.EncodingType.JPEG,
      mediaType: (mediaType === 'video') ? this.camera.MediaType.VIDEO : this.camera.MediaType.PICTURE,
      sourceType,
      allowEdit: false,
      saveToPhotoAlbum: false,
      correctOrientation: true,
    };

    return this.platform.ready().then(() => {
      if (!this.platform.is('cordova')) {
        // Browser fallback
        return this.mockCordovaService.getPicture({ sourceType });
      }

      return new Promise((resolve, reject) => {
        const permission = sourceType === PictureSourceType.CAMERA 
            ? this.androidPermission.PERMISSION.CAMERA 
            : this.androidPermission.PERMISSION.READ_EXTERNAL_STORAGE;

        this.permissionService.getPermission(permission)
          .then(() => {
            this.camera.getPicture(options)
              .then((mediaUri) => {
                if (this.platform.is('android') && sourceType === PictureSourceType.PHOTOLIBRARY) {
                  this.filePath.resolveNativePath(mediaUri)
                    .then(filePath => resolve({ filePath, mediaType }))
                    .catch(err => reject(err));
                } else {
                  resolve({ filePath: mediaUri, mediaType });
                }
              }).catch(err => reject(err));
          }).catch(err => reject(err));
      });
    });
  }

  // Browser file picker
  getFileFromBrowser(): Promise<any> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = () => {
        const file = input.files[0];
        if (file) resolve(file);
        else reject('No file selected');
      };
      input.click();
    });
  }

  
  upload(file: any, userId: string): Observable<any> {
    const maxSizeMB = 20;
    if (file && file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`File exceeds ${maxSizeMB} MB limit.`);
    }
    const formData = new FormData();
    formData.append('upload', file);
    return this.http.post(`${this.apiUrl}/${userId}/upload`, formData);


    }

  takePicture(sourceType: number, mediaType: 'image' | 'video' = 'image'): Promise<any> {
    const mediaTypeValue = (mediaType === 'image')
      ? this.camera.MediaType.PICTURE
      : this.camera.MediaType.VIDEO;

    const options: CameraOptions = {
      quality: 75,
      destinationType: this.camera.DestinationType.FILE_URI,
      mediaType: mediaTypeValue,
      sourceType: sourceType,
      saveToPhotoAlbum: false,
      correctOrientation: true
    };

    const dataUrlOptions: CameraOptions = {
      ...options,
      destinationType: this.camera.DestinationType.DATA_URL
    };

    // Infer MIME type from file extension; fallback to image/jpeg or video/mp4
    const mimeFromName = (name: string): string => {
      const ext = (name.split('.').pop() || '').toLowerCase();
      const map: { [k: string]: string } = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
        mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp',
        avi: 'video/x-msvideo', mkv: 'video/x-matroska',
      };
      return map[ext] || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
    };

    const blobFromBase64 = (base64: string, mimeType: string): Blob => {
      const byteChars = atob(base64);
      const byteArrays = [];
      for (let offset = 0; offset < byteChars.length; offset += 512) {
        const slice = byteChars.slice(offset, offset + 512);
        const bytes = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          bytes[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(bytes));
      }
      return new Blob(byteArrays, { type: mimeType });
    };

    return this.platform.ready().then(async () => {
      const isNativeRuntime = this.platform.is('cordova') || this.platform.is('capacitor') || this.platform.is('hybrid');
      if (!isNativeRuntime) {
        return this.mockCordovaService.getPicture({ sourceType, mediaType: mediaTypeValue });
      }

      if (mediaType === 'image') {
        const source = sourceType === this.camera.PictureSourceType.CAMERA
          ? CameraSource.Camera
          : CameraSource.Photos;
        const photo = await CapacitorCamera.getPhoto({
          quality: 75,
          resultType: CameraResultType.Uri,
          source,
          correctOrientation: true,
          saveToGallery: false
        });
        return photo.webPath || photo.path || '';
      }

      if (sourceType === this.camera.PictureSourceType.CAMERA) {
        await this.permissionService.getPermission(this.androidPermission.PERMISSION.CAMERA);
      } else {
        const mediaImagesPermission = (this.androidPermission.PERMISSION as any).READ_MEDIA_IMAGES || 'android.permission.READ_MEDIA_IMAGES';
        try {
          await this.permissionService.getPermission(mediaImagesPermission);
        } catch (_) {
          await this.permissionService.getPermission(this.androidPermission.PERMISSION.READ_EXTERNAL_STORAGE);
        }
      }
      return this.camera.getPicture(options);
    }).then(async imageData => {
      let fileBlob: Blob = null;

      // Derive safe filename with extension from the URI
      const rawName = imageData.substring(imageData.lastIndexOf('/') + 1) || '';
      const safeName = rawName.includes('.') ? rawName : rawName + (mediaType === 'image' ? '.jpg' : '.mp4');
      const mimeType = mimeFromName(safeName);

      if (this.platform.is('cordova') || this.platform.is('capacitor') || this.platform.is('hybrid')) {
        try {
          const convertedPath = this.webView.convertFileSrc(imageData);
          const response = await fetch(convertedPath);
          const blob = await response.blob();
          fileBlob = new Blob([blob], { type: blob.type || mimeType });
        } catch (e) {
          console.warn('fetch via convertFileSrc failed, trying File plugin', e);
          try {
            // For content:// URIs (Android 13+), resolve to native file path first
            let nativePath = imageData;
            if (imageData.startsWith('content://')) {
              nativePath = await this.filePath.resolveNativePath(imageData);
            }
            const dir = nativePath.substring(0, nativePath.lastIndexOf('/') + 1);
            const fileName = nativePath.substring(nativePath.lastIndexOf('/') + 1);
            const buffer = await this.file.readAsArrayBuffer(dir, fileName);
            fileBlob = new Blob([buffer], { type: mimeType });
          } catch (e2) {
            console.warn('File plugin fallback failed, trying direct URI fetch', e2);
            try {
              const response = await fetch(imageData);
              const blob = await response.blob();
              fileBlob = new Blob([blob], { type: blob.type || mimeType });
            } catch (e3) {
              console.error('All native media readbacks failed', e3);
            }
          }
        }
      }

      if (!fileBlob && mediaType === 'image' && sourceType === this.camera.PictureSourceType.CAMERA) {
        console.warn('Native camera URI readback returned no file, retrying as DATA_URL');
        const base64Image = await this.camera.getPicture(dataUrlOptions);
        fileBlob = blobFromBase64(base64Image, 'image/jpeg');
      }

      return { imageData, file: fileBlob, name: safeName, mimeType };
    });
  }
}
