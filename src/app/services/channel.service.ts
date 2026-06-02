import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ChannelService extends DataService {

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('channel', nativeStorage, http, httpClient, router, platform);
  }

  myChannels(page: number, search: string){
    return this.sendRequest({
      method: 'get',
      url: '/myChannels',
      data: {page: page.toString(), search}
    })
  }

  updatePostVisibility(postId: string, visibility: string) {
    return this.sendRequest({
      method: 'put',  // Try using 'put' instead of 'patch'
      url: `/post/${postId}/visibility`,
      data: { visibility }
    });
  }
  
  

  getCityChannels(city: string, country: string, page: number = 0, search: string = '') {
    const params = new URLSearchParams({
      city,
      country,
      page: page.toString(),
      search,
    }).toString();
  console.log("parametrerssssssssss", params);
    return this.sendRequest({
      method: 'post',
      url: `/citychannels?${params}`, // Manually append query parameters to the URL
    });
  }
  
  
  
  
  followedChannels(page: number, search: string, category?: string) {
    console.log('Requesting followed channels with:', { page, search, category });

    const data: any = { page: page.toString(), search };
    if (category) data.category = category;

    return this.sendRequest({
      method: 'get',
      url: '/followed',
      data,
    });
  }
  
  

  exploreChannels(page: number, search: string, level: 'city' | 'country' | 'global', category?: string) {
    const data: any = { page: page.toString(), search, level };
    if (category) data.category = category;
    return this.sendRequest({
      method: 'get',
      url: '/explore',
      data
    });
  }
  
  
  

  deleteChannel(id: string){
    return this.sendRequest({
      method: 'delete',
      url: '/' + id
    })
  }

  store(data){
    return this.sendRequest({
      method: 'post',
      url: '',
      data,
      serializer: 'multipart'
    });
  }

  follow(id: string){
    return this.sendRequest({
      method: 'post',
      url: '/follow/' + id
    });
  }

  show(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/' + id
    });
  }

  getPosts(id: string, page: number){
    return this.sendRequest({
      method: 'get',
      url: '/' + id + '/getposts/',
      data: {page: page.toString()}
    })
  }

  getFeed(page: number){
    return this.sendRequest({
      method: 'get',
      url: '/feed',
      data: {page: page.toString()}
    })
  }

  storePost(id: string, data) {
    // Log the postId to confirm it's correct
    console.log("Sending post to post ID:", id);

    // Check the form data contents
    if (data instanceof FormData) {
        data.forEach((value, key) => {
            console.log(`FormData key: ${key}, value:`, value);
        });
    } else {
        console.log("Data is not FormData:", data);
    }

    // Send the request with serializer set to 'multipart' for FormData
    return this.sendRequest({
        method: 'post',
        url: '/' + id + '/post', // Make sure `id` is a valid postId
        data,
        serializer: 'multipart'  // This ensures proper FormData handling
    });

  }
  
  deletePost(id: string){
    return this.sendRequest({
      method: 'delete',
      url: '/post/' + id
    })
  }

  voteOnPost(id: string, vote: number){
    return this.sendRequest({
      method: 'post',
      url: '/post/' + id + '/vote',
      data: {vote}
    })
  }
  storeComment(id: string, data) {
    // Log the postId to confirm it's correct
    console.log("Sending comment to post ID:", id);

    // Check the form data contents
    if (data instanceof FormData) {
        data.forEach((value, key) => {
            console.log(`FormData key: ${key}, value:`, value);
        });
    } else {
        console.log("Data is not FormData:", data);
    }

    // Send the request — FormData MUST be sent as multipart on Android
    // (cordova-advanced-http defaults to JSON serializer which silently drops files).
    return this.sendRequest({
        method: 'post',
        url: '/post/' + id + '/comment', // Make sure `id` is a valid postId
        data,
        serializer: data instanceof FormData ? 'multipart' : undefined
    });
}



  

  getComments(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/post/' + id + '/comment'
    })
  }

  deleteComment(id: string){
    return this.sendRequest({
      method: 'delete',
      url: '/comment/' + id
    })
  }

  voteOnComment(id: string, vote: number){
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/vote',
      data: {vote}
    })
  }

  reportChannel(id: string, reportData: any) {
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/report',
      data: reportData
    });
  }
  

  reportPost(id: string, reportData: any){
    return this.sendRequest({
      method: 'post',
      url: '/post/' + id + '/report',
      data: reportData
    })
  }

  reportComment(id: string, reportData: any){
    return this.sendRequest({
      method: 'post',
      url: '/comment/' + id + '/report',
      data: reportData
    })
  }

  getPost(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/post/' + id
    })
  }
}
