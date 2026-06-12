import constants from '../helpers/constants';
import { User } from './User';

interface PhotoObject {
  path: string;
  type?: string;
}

export class Channel {
  private _id!: string;
  private _name!: string;
  private _description!: string;
  private _approved!: boolean;
  private _photo!: string;
  private _createdAt!: Date;
  private _user!: User;
  private _followers!: string[];
  private _category!: string;
  private _city?: string;
  private _country?: string;
  private _tags!: string[];

  // Optional properties for static channels
  private _icon?: string;
  private _type?: 'static' | 'user' | 'static_events' |'static_dating';

  constructor() {}

  private static isUsablePhoto(value: any): value is string {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    return !!normalized && normalized !== 'undefined' && normalized !== 'null' && normalized !== '[object Object]';
  }

  initialize(channel: Partial<Channel>) {
    const c = channel as any;
    const baseUrl = constants.DOMAIN_URL;
    this._id = c.id ?? c['_id'] ?? '';
    this._name = c.name ?? '';
    this._description = c.description ?? '';
    this._approved = true;

    // Handle photo normalization in initialize as well
    const photoData = c['photo'] || c['image'] || c['avatar'] || c['cover'] || c['picture'] || c['_photo'];
    if (Channel.isUsablePhoto(photoData)) {
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
    const uInit = c.user;
    if (!uInit || (typeof uInit === 'object' && Object.keys(uInit).length === 0)) {
      const uidInit = c.userId || c.user_id || c.createdBy || c.ownerId;
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
    this._createdAt = c.createdAt ? new Date(c.createdAt) : new Date();
    this._category = c.category ?? '';
    this._followers = c.followers ?? [];
    this._tags = c.tags ?? [];
    this._icon = c.icon;
    this._type = c.type;
    this._city = c.city;
    this._country = c.country;
    return this;
  }

  static createFromData(data: Partial<Channel>): Channel {
    const channel = new Channel();
    const d = data as any;
    const baseUrl = constants.DOMAIN_URL;

    channel._id = d.id ?? d['_id'] ?? '';
    channel._name = d.name || '';
    channel._description = d.description || '';
    channel._approved = d.approved ?? true;

    const photoData = d['photo'] || d['image'] || d['avatar'] || d['cover'] || d['picture'] || d['_photo'];
    if (Channel.isUsablePhoto(photoData)) {
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

    channel._createdAt = d.createdAt ? new Date(d.createdAt) : new Date();
    // Normalize user: can be string (id), populated object, or empty
    const u = d.user;
    if (!u) {
      // try common fallback fields
      const uid = d.userId || d.user_id || d.createdBy || d.ownerId;
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
    channel._followers = d.followers || [];
    channel._category = d.category || '';
    channel._tags = d.tags || [];
    channel._icon = d.icon;
    channel._type = d.type;
    channel._city = d.city;
    channel._country = d.country;

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
    const uid = String(userId);
    // Owners are always considered followers
    if (this.isOwner(uid)) return true;

    try {
      if (!this._followers) return false;
      return this._followers.some((f: any) => {
        if (!f) return false;
        if (typeof f === 'string') return String(f) === uid;
        if (typeof f === 'object') {
          if (typeof f.getId === 'function') return String(f.getId()) === uid;
          if (f._id && String(f._id) === uid) return true;
          if (f.id && String(f.id) === uid) return true;
          // sometimes followers may be ObjectId-like; try string conversion
          try { if (String(f) === uid) return true; } catch(e) {}
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
    if (!Channel.isUsablePhoto(photo)) {
      this._photo = 'assets/images/default-channel.png';
      return;
    }
    const baseUrl = constants.DOMAIN_URL;
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
