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
  
  
  
  
  followedChannels(page: number, search: string) {
    console.log('Requesting followed channels with:', { page, search });
  
    return this.sendRequest({
      method: 'get',
      url: '/followed',
      data: { page: page.toString(), search },
    });
  }
  
  

  exploreChannels(page: number, search: string, level: 'city' | 'country' | 'global') {
    return this.sendRequest({
      method: 'get',
      url: '/explore',
      data: { page: page.toString(), search, level }  // Pass the exploration level as a query parameter
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

  getPosts(id: string, page: number){
    return this.sendRequest({
      method: 'get',
      url: '/' + id + '/getposts/',
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

    // Send the request
    return this.sendRequest({
        method: 'post',
        url: '/' + id + '/post', // Make sure `id` is a valid postId
        data
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

    // Send the request
    return this.sendRequest({
        method: 'post',
        url: '/post/' + id + '/comment', // Make sure `id` is a valid postId
        data
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
      url: '/comment/' + id + '/vote',
      data: {vote}
    })
  }

  reportChannel(id: string, reportType: string, message: string) {
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/report',
      data: {
        reportType,  // ✅ Now sending `reportType`
        message      // ✅ Sending the user-provided message
      }
    });
  }
  

  reportPost(id: string, message: string){
    return this.sendRequest({
      method: 'post',
      url: '/post/' + id + '/report',
      data: {message}
    })
  }

  reportComment(id: string, message: string){
    return this.sendRequest({
      method: 'post',
      url: '/comment/' + id + '/report',
      data: {message}
    })
  }

  getPost(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/post/' + id
    })
  }
}
