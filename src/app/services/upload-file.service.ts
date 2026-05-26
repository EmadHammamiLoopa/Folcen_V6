import { Injectable } from '@angular/core';
import { FilePath } from '@ionic-native/file-path/ngx';
import { File as IonicFile } from '@ionic-native/file/ngx';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Platform } from '@ionic/angular';
import { Camera, CameraOptions, PictureSourceType, MediaType } from '@ionic-native/camera/ngx';
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

    return this.camera.getPicture(options).then(async imageData => {
      let fileBlob: Blob = null;

      // Derive safe filename with extension from the URI
      const rawName = imageData.substring(imageData.lastIndexOf('/') + 1) || '';
      const safeName = rawName.includes('.') ? rawName : rawName + (mediaType === 'image' ? '.jpg' : '.mp4');
      const mimeType = mimeFromName(safeName);

      if (this.platform.is('cordova')) {
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
            console.error('File plugin fallback also failed', e2);
          }
        }
      }

      return { imageData, file: fileBlob, name: safeName, mimeType };
    });
  }
}