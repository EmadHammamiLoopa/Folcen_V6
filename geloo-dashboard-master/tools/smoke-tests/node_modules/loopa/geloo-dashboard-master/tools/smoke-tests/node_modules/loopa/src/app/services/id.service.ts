import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IdService {
  normalizeId(v: any): string | null {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      try {
        if (typeof v.toString === 'function') {
          const s = v.toString();
          if (s && s !== '[object Object]') return s;
        }
      } catch (e) {}

      const buf = (v as any).buffer || (v as any).data || v;
      if (buf && typeof buf === 'object') {
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length) {
          try {
            const bytes = keys.map(k => Number(buf[k]));
            const arr = new Uint8Array(bytes);
            const dec = new TextDecoder();
            const s = dec.decode(arr);
            // if decoded string looks printable, return it
            if (s && /^[\x20-\x7E]+$/.test(s)) return s;
            // otherwise, fallback to hex representation of bytes (common for ObjectId)
            const hex = bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
            if (hex) return hex;
          } catch (e) {}
        }
      }

      if ((v as any)._id) return this.normalizeId((v as any)._id);
      if ((v as any).id) return this.normalizeId((v as any).id);
    }
    return null;
  }

  encodeForTransport(id: string | null): string | null {
    if (!id) return null;
    try {
      const u8 = new TextEncoder().encode(id);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < u8.length; i += chunkSize) {
        const slice = u8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(slice));
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      try { return btoa(String(id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (err) { return null; }
    }
  }

  decodeFromTransport(enc: string): string | null {
    if (!enc) return null;
    try {
      // revert URL-safe base64
      const safe = enc.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(safe);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      return null;
    }
  }
}
