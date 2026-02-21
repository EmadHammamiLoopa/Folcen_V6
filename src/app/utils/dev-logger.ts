import { environment } from 'src/environments/environment';

/**
 * Folcen Developer Logger
 * Only active in non-production environments.
 * Prevents accidental data leaks in customer browser consoles.
 */
export const devLogger = {
  log(message: any, ...optionalParams: any[]) {
    if (!environment.production) {
      if (typeof message === 'string') {
        console.log(`[DEV-LOG] ${message}`, ...optionalParams);
      } else {
        console.log('[DEV-LOG]', message, ...optionalParams);
      }
    }
  },

  debug(message: any, ...optionalParams: any[]) {
    if (!environment.production) {
      if (typeof message === 'string') {
        console.debug(`[DEV-DEBUG] ${message}`, ...optionalParams);
      } else {
        console.debug('[DEV-DEBUG]', message, ...optionalParams);
      }
    }
  },

  warn(message: any, ...optionalParams: any[]) {
    if (!environment.production) {
      if (typeof message === 'string') {
        console.warn(`[DEV-WARN] ${message}`, ...optionalParams);
      } else {
        console.warn('[DEV-WARN]', message, ...optionalParams);
      }
    }
  },

  error(message: any, ...optionalParams: any[]) {
    if (typeof message === 'string') {
      console.error(`[DEV-ERROR] ${message}`, ...optionalParams);
    } else {
      console.error('[DEV-ERROR]', message, ...optionalParams);
    }
  }
};
