import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IdService {
  // Try to extract a plain string id from several possible shapes
  normalizeId(v: any): string | null {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      // Mongoose-like ObjectId objects often stringify
      try {
        if (typeof v.toString === 'function') {
          const s = v.toString();
          if (s && s !== '[object Object]') return s;
        }
      } catch (e) {}

      // Common wrapper shape coming from Buffer serialization { buffer: { data: [...] } }
      const buf = (v as any).buffer || (v as any).data || v;
      if (buf && typeof buf === 'object') {
        // If numeric-indexed bytes exist, convert to string when possible
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length) {
          try {
            const bytes = keys.map(k => Number(buf[k]));
            // attempt to decode utf8
            const arr = new Uint8Array(bytes);
            const dec = new TextDecoder();
            const s = dec.decode(arr);
            if (s && /^[\x20-\x7E]+$/.test(s)) return s;
            // fallback — produce hex string from bytes (good for ObjectId)
            const hex = bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
            if (hex) return hex;
          } catch (e) {}
        }
      }

      // If object has _id or id fields
      if ((v as any)._id) return this.normalizeId((v as any)._id);
      if ((v as any).id) return this.normalizeId((v as any).id);
    }
    return null;
  }

  // Encode for transport (base64-safe). Returns null if id invalid.
  encodeForTransport(id: string | null): string | null {
    if (!id) return null;
    try {
      // encode utf8 -> base64
      const u8 = new TextEncoder().encode(id);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < u8.length; i += chunkSize) {
        const slice = u8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(slice));
      }
      return btoa(binary);
    } catch (e) {
      try { return btoa(String(id)); } catch (err) { return null; }
    }
  }

  // Decode base64 transport value back to string id
  decodeFromTransport(enc: string): string | null {
    if (!enc) return null;
    try {
      const binary = atob(enc);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      return null;
    }
  }
}
