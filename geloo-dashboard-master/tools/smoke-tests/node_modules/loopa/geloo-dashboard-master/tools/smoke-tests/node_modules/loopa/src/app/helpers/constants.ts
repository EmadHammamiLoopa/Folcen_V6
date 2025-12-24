export default {
  DOMAIN_URL: 'http://127.0.0.1:3300',  // No trailing slash
  API_V1: '/api/v1/',  // Leading slash
  VERSION: '0.0.1',
  IMAGE_PLACEHOLDER: "default-img2.png",
  STRIPE_PUBLIC_KEY: "pk_live_51JEKkuI9qWJR5OvEyvANakwsHN2yntVnZiMywb4RwjBZ91C5N5Bx94aoqThUyyGtfPc4POpRY2XjYCpDAaWo1WKN00HYQHeKF1",
  defaultMaleAvatarUrl: 'http://127.0.0.1:3300/public/images/avatars/male.webp',
  defaultFemaleAvatarUrl: 'http://127.0.0.1:3300/public/images/avatars/female.webp',
  defaultOtherAvatarUrl: 'http://127.0.0.1:3300/public/images/avatars/other.webp',

  channelsAvatars: {
    news: 'http://127.0.0.1:3300/public/images/avatars/channelsavtar/news.webp',
    community: 'http://127.0.0.1:3300/public/images/avatars/channelsavtar/community.webp',
    // Add other channel avatars here as needed
  },
  
  ERROR_CODES: {
    SUBSCRIPTION_ERROR: 1001
  }
};


