import constants from '../helpers/constants';
import { User } from './User';

interface PhotoObject {
  path: string;
  type?: string;
}

export class Channel {
  private _id: string;
  private _name: string;
  private _description: string;
  private _approved: boolean;
  private _photo: string;
  private _createdAt: Date;
  private _user: User;
  private _followers: string[];
  private _category: string;
  private _city?: string;
  private _country?: string;
  private _tags: string[];
  
  // Optional properties for static channels
  private _icon?: string;
  private _type?: 'static' | 'user' | 'static_events' |'static_dating';

  constructor() {}

  initialize(channel: Partial<Channel>) {
    const baseUrl = constants.DOMAIN_URL || 'http://127.0.0.1:3300';
    this._id = channel.id ?? channel['_id'] ?? '';
    this._name = channel.name ?? '';
    this._description = channel.description ?? '';
    this._approved = true;

    // Handle photo normalization in initialize as well
    const photoData = channel['photo'] || channel['image'] || channel['avatar'] || channel['cover'] || channel['picture'] || channel['_photo'];
    if (typeof photoData === 'string' && photoData.length > 0) {
      this._photo = (photoData.startsWith('http') || photoData.startsWith('assets/'))
        ? photoData
        : `${baseUrl}${photoData.startsWith('/') ? '' : '/'}${photoData}`;
    } else if (typeof photoData === 'object' && photoData !== null && (photoData['path'] || photoData['url'])) {
      const p = photoData['path'] || photoData['url'];
      this._photo = p.startsWith('http') ? p : `${baseUrl}${p.startsWith('/') ? '' : '/'}${p}`;
    } else {
      this._photo = 'assets/images/default-channel.png';
    }

    // Normalize user: accept string id, populated object, or empty -> try fallbacks
    const uInit = (channel as any).user;
    if (!uInit || (typeof uInit === 'object' && Object.keys(uInit).length === 0)) {
      const uidInit = (channel as any).userId || (channel as any).user_id || (channel as any).createdBy || (channel as any).ownerId;
      if (uidInit) {
        this._user = new User();
        this._user.id = String(uidInit);
      } else {
        this._user = new User();
      }
    } else if (typeof uInit === 'string') {
      this._user = new User();
      this._user.id = uInit;
    } else if (typeof uInit === 'object') {
      const uidInit = uInit._id || uInit.id || uInit.userId;
      if (uidInit) this._user = new User().initialize({ _id: uidInit, firstName: uInit.firstName || '', lastName: uInit.lastName || '' });
      else this._user = new User();
    } else {
      this._user = new User();
    }
    this._createdAt = channel.createdAt ? new Date(channel.createdAt) : new Date();
    this._category = channel.category ?? '';
    this._followers = channel.followers ?? [];
    this._tags = channel.tags ?? [];
    this._icon = channel.icon;
    this._type = channel.type;
    this._city = channel.city;
    this._country = channel.country;
    return this;
  }

  static createFromData(data: Partial<Channel>): Channel {
    const channel = new Channel();
    const baseUrl = constants.DOMAIN_URL || 'http://127.0.0.1:3300';
  
    channel._id = data.id ?? data['_id'] ?? '';
    channel._name = data.name || '';
    channel._description = data.description || '';
    channel._approved = data.approved ?? true;

    const photoData = data['photo'] || data['image'] || data['avatar'] || data['cover'] || data['picture'] || data['_photo'];
    if (typeof photoData === 'string' && photoData.length > 0) {
      channel._photo = (photoData.startsWith('http') || photoData.startsWith('assets/'))
        ? photoData
        : `${baseUrl}${photoData.startsWith('/') ? '' : '/'}${photoData}`;
    } else if (typeof photoData === 'object' && photoData !== null && (photoData['path'] || photoData['url'])) {
      const path = photoData['path'] || photoData['url'];
      channel._photo = path.startsWith('http')
        ? path
        : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    } else {
      channel._photo = 'assets/images/default-channel.png'; // Fallback image
    }

    channel._createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    // Normalize user: can be string (id), populated object, or empty
    const u = data.user;
    if (!u) {
      // try common fallback fields
      const uid = (data as any).userId || (data as any).user_id || (data as any).createdBy || (data as any).ownerId;
      if (uid) {
        channel._user = new User();
        channel._user.id = String(uid);
      } else {
        channel._user = new User();
      }
    } else if (typeof u === 'string') {
      channel._user = new User();
      channel._user.id = u;
    } else if (typeof u === 'object') {
      // if object has id fields, initialize user wrapper
      const uid = (u as any)._id || (u as any).id || (u as any).userId;
      if (uid) {
        channel._user = new User().initialize({ _id: uid, firstName: (u as any).firstName || (u as any).name || '', lastName: (u as any).lastName || '' });
      } else {
        // empty object -> create empty User
        channel._user = new User();
      }
    } else {
      channel._user = new User();
    }
    channel._followers = data.followers || [];
    channel._category = data.category || '';
    channel._tags = data.tags || [];
    channel._icon = data.icon;
    channel._type = data.type;
    channel._city = data.city;
    channel._country = data.country;

    return channel;
  }

  isOwner(userId: string): boolean {
    if (!userId) return false;
    try {
      const ownerId = this._user?.id || (this as any).user?._id || (this as any).userId || (this as any).createdBy || (this as any).ownerId;
      return !!ownerId && String(ownerId) === String(userId);
    } catch (e) {
      return false;
    }
  }

  followedBy(userId: string): boolean {
    if (!userId) return false;
    // Owners are always considered followers
    if (this.isOwner(userId)) return true;

    try {
      if (!this._followers) return false;
      return this._followers.some((f: any) => {
        if (!f) return false;
        if (typeof f === 'string') return f === userId;
        if (typeof f === 'object') {
          if (typeof f.getId === 'function') return f.getId() === userId;
          if (f._id && String(f._id) === userId) return true;
          if (f.id && String(f.id) === userId) return true;
          // sometimes followers may be ObjectId-like; try string conversion
          try { if (String(f) === userId) return true; } catch(e) {}
        }
        return false;
      });
    } catch (e) {
      return false;
    }
  }
  

  get id(): string { return this._id; }
  get name(): string { return this._name; }
  get description(): string { return this._description; }
  get approved(): boolean { return this._approved; }
  get user(): User { return this._user; }
  get photo(): string { return this._photo; }
  get createdAt(): Date { return this._createdAt; }
  get followers(): string[] { return this._followers; }
  get category(): string { return this._category; }
  get city(): string | undefined { return this._city; }
  get country(): string | undefined { return this._country; }
  get tags(): string[] { return this._tags; }

  get icon(): string | undefined { return this._icon; }
  get type(): 'static' | 'user' | 'static_events' |'static_dating'| undefined { 
    return this._type; 
}
  set id(id: string) { this._id = id; }
  set name(name: string) { this._name = name; }
  set description(description: string) { this._description = description; }
  set approved(approved: boolean) { this._approved = approved; }
  set user(user: User) {
    if (user) {
      if (typeof user === 'string') {
        this._user = new User();
        this._user.id = user;
      } else {
        this._user = new User().initialize(user);
      }
    }
  }
  set photo(photo: string) {
    if (!photo) {
      this._photo = 'assets/images/default-channel.png';
      return;
    }
    const baseUrl = constants.DOMAIN_URL || 'http://127.0.0.1:3300';
    this._photo = (photo.startsWith('http') || photo.startsWith('assets/'))
      ? photo
      : `${baseUrl}${photo.startsWith('/') ? '' : '/'}${photo}`;
  }
  set createdAt(createdAt: Date) { this._createdAt = createdAt; }
  set followers(followers: string[]) { this._followers = followers; }
  set category(category: string) { this._category = category; }
  set city(city: string | undefined) { this._city = city; }
  set country(country: string | undefined) { this._country = country; }
  set tags(tags: string[]) { this._tags = tags; }

  set icon(icon: string | undefined) { this._icon = icon; }
  set type(type: 'static' | 'user' | 'static_events' |'static_dating'| undefined) { 
    this._type = type; 
}

  toObject() {
    return {
      _id: this.id,
      name: this.name,
      description: this.description,
      approved: this.approved,
      category: this.category,
      photo: this.photo,
      createdAt: this.createdAt,
      user: this.user instanceof User ? this.user.toObject() : {},
      followers: this.followers,
      tags: this.tags,
      icon: this.icon,
      type: this.type,
      city: this.city,
      country: this.country
    };
  }
}
