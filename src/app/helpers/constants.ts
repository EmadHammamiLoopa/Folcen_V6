import { environment } from '../../environments/environment';

const domainUrl = environment.socketUrl; // e.g. https://folcenv6-production.up.railway.app

export default {
  DOMAIN_URL: domainUrl,  // No trailing slash
  API_V1: '/api/v1/',  // Leading slash
  VERSION: '0.0.1',
  IMAGE_PLACEHOLDER: "default-img2.png",
  STRIPE_PUBLIC_KEY: "pk_live_51JEKkuI9qWJR5OvEyvANakwsHN2yntVnZiMywb4RwjBZ91C5N5Bx94aoqThUyyGtfPc4POpRY2XjYCpDAaWo1WKN00HYQHeKF1",
  defaultMaleAvatarUrl: `${domainUrl}/public/images/avatars/male.webp`,
  defaultFemaleAvatarUrl: `${domainUrl}/public/images/avatars/female.webp`,
  defaultOtherAvatarUrl: `${domainUrl}/public/images/avatars/other.webp`,

  channelsAvatars: {
    news: `${domainUrl}/public/images/avatars/channelsavtar/news.webp`,
    community: `${domainUrl}/public/images/avatars/channelsavtar/community.webp`,
    // Add other channel avatars here as needed
  },
  
  ERROR_CODES: {
    SUBSCRIPTION_ERROR: 1001
  }
};


