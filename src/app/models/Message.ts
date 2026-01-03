import { SafeUrl } from '@angular/platform-browser';
import constants from '../helpers/constants';
import { Product } from './Product';

export class Message {
  public _id: string;
  public tempId?: string;   // ✅ add this for optimistic messages

  private _from: string;
  private _to: string;
  private _text: string;
  private _state: string;
  private _createdAt: Date;
  private _image: string;
  private _type: string;
  public   status?: 'pending' | 'accepted' | 'cancelled';
  public productId?: string; // Property to store product ID
  public product?: Product;  // Property to store product details
  public safeImage?: SafeUrl; // sanitized image

  constructor() {}

  initialize(message: any) {
    // Defensive initialization: accept ISO string, numeric timestamp, Date object, or Buffer-like objects
    const parseDate = (v: any): Date => {
      try {
        if (!v) {
          // Attempt to derive timestamp from Mongo ObjectId if present
          try {
            if (this._id && /^[a-fA-F0-9]{24}$/.test(this._id)) {
              const secs = parseInt(this._id.slice(0, 8), 16);
              if (!isNaN(secs)) return new Date(secs * 1000);
            }
          } catch (e) {}
          // unknown -> return epoch start (so UI won't show 'now')
          return new Date(0);
        }
        if (v instanceof Date) return v;
        if (typeof v === 'number' && !isNaN(v)) return new Date(v);
        if (typeof v === 'string' && v.trim() !== '' && !isNaN(Date.parse(v))) return new Date(v);
        // handle numeric strings
        if (typeof v === 'string' && !isNaN(Number(v))) return new Date(Number(v));
        // handle Buffer-like objects { data: [...] } or numeric-indexed objects
        const tryExtractBytes = (obj: any): number[] | null => {
          if (!obj) return null;
          if (Array.isArray(obj)) return obj.map(n => Number(n));
          if (obj.data && Array.isArray(obj.data)) return obj.data.map(n => Number(n));
          if (obj.buffer && obj.buffer.data && Array.isArray(obj.buffer.data)) return obj.buffer.data.map(n => Number(n));
          const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
          if (keys.length) return keys.map(k => Number(obj[k]));
          return null;
        };
        const bytes = tryExtractBytes(v);
        if (bytes && bytes.length) {
          try {
            const dec = new TextDecoder().decode(new Uint8Array(bytes));
            if (dec && !isNaN(Date.parse(dec))) return new Date(dec);
          } catch (e) {}
          // fallback: try to interpret as unix/epoch bytes
          try {
            const asNum = bytes.reduce((acc, b) => (acc << 8) + (b & 0xff), 0);
            if (!isNaN(asNum)) return new Date(asNum);
          } catch (e) {}
        }
      } catch (e) {}
      return new Date();
    };

    this._id = message._id || message.id;
    this.tempId = message.tempId; // ✅ keep tempId if provided

    (this as any).id = this._id;  // Force id to exist at top level

    this.from = message.from;
    this.to = message.to;
    this.text = message.text;
    this.createdAt = parseDate(message.createdAt);
    this.image = message.image;
    this.state = message.state;
    this.type = message.type;
    this.status = message.status || 'pending';

    // Initialize productId and product based on the message type
    if (this.type === 'product') {
      this.productId = message.productId || null;
      this.product = message.product
        ? new Product().initialize(message.product)
        : null;
    } else {
      this.productId = null;
      this.product = null;
    }

    return this;
  }

  get id(): string {
    return this._id;
  }
  get from(): string {
    return this._from;
  }
  get to(): string {
    return this._to;
  }
  get text(): string {
    return this._text;
  }
  get state(): string {
    return this._state;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get image(): string {
    return this._image;
  }
  get type(): string {
    return this._type;
  }

  set id(id: string) {
    this._id = id;
  }
  set from(from: string) {
    this._from = from;
  }
  set to(to: string) {
    this._to = to;
  }
  set text(text: string) {
    this._text = text;
  }
  set state(state: string) {
    this._state = state;
  }
  set createdAt(createdAt: Date) {
    this._createdAt = createdAt;
  }
  set image(image: any) {
    if (!image || image === 'undefined' || image === 'null') {
      this._image = null;
    } else if (typeof image === 'string') {
      if (image.startsWith('data:image/')) {
        this._image = image; // base64
      } else if (image.startsWith('http')) {
        this._image = image; // full URL
      } else {
        this._image = constants.DOMAIN_URL + image;
      }
    } else if (typeof image === 'object' && image.path) {
      this._image = constants.DOMAIN_URL + image.path;
    } else {
      this._image = null;
    }
  }
  set type(type: string) {
    this._type = type;
  }

  isMine(id: string): boolean {
    return this.from === id;
  }
}
