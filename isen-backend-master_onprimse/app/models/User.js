const mongoose = require('mongoose');
const crypto = require('crypto');
const _ = require('lodash');
let bcrypt;
try {
    bcrypt = require('bcrypt');
} catch (e) {
    try {
        console.warn('bcrypt native module failed to load; attempting bcryptjs fallback');
        bcrypt = require('bcryptjs');
    } catch (e2) {
        console.warn('bcrypt and bcryptjs not available — using lightweight fallback for development only');
        const crypto = require('crypto');
        bcrypt = {
            hashSync: (pwd) => 'devhash:' + crypto.createHash('sha256').update(pwd).digest('hex'),
            hash: async (pwd) => 'devhash:' + crypto.createHash('sha256').update(pwd).digest('hex'),
            compare: async (pwd, hash) => ('devhash:' + crypto.createHash('sha256').update(pwd).digest('hex')) === hash,
            compareSync: (pwd, hash) => ('devhash:' + crypto.createHash('sha256').update(pwd).digest('hex')) === hash
        };
    }
}

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    enabled: {
        type: Boolean,
        default: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true  // This allows for the unique index to ignore documents without an email field or with a null value.
    },
    hashed_password: String,
    salt: String,
    gender: {
        type: String,
        enum: ['male', 'female', 'other', 'prefer not to say'],
        default: 'prefer not to say'
    },
    genderVisible: {
        type: Boolean,
        default: true
    },
    lastSeen: { type: Date }, // Optional: Track when the user was last online
    // Timestamp used to track when the user cleared missed calls (helps multi-device sync)
    missedCallsClearedAt: { type: Date, default: null },
    // Optional budget counter for missed calls
    missedCallBudget: { type: Number, default: 0 },
    is2FAEnabled: {
        type: Boolean,
        default: false
    },
    twoFAToken: {
        type: String,
        default: ''
    },
    phone: String,
    country: { type: String, default: '' },
    city: { type: String, default: '' },
    role: {
        type: String,
        enum: ['USER', 'ADMIN', 'SUPER ADMIN'],
        default: 'USER'
    },
    birthDate: String,
    aboutMe: {
        type: String,
        default: '',
    },
    mainAvatar: String,
    avatar: [{ type: String, default: [] }],
    avatarStyle: { type: String, default: 'avataaars' },
    avatarSeed: { type: String, default: '' },
    avatarVariant: { type: String, default: 'classic' },
    avatarOverrides: { type: mongoose.Schema.Types.Mixed, default: null },
    school: String,
    education: String,
    profession: String,
    interests: [String],
    languages: [String],
    location: {
        type: [Number],
        index: '2d'
    },
    deletedAt: { type: Date, default: null },
    purgeAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    bannedReason: String,
    banUntil: { type: Date, default: null },
    reports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
    requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request' }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
    messagedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    subscription: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
        expireDate: Date
    },
    randomVisible: { type: Boolean, default: true },
    allowVideoRequestsFromNonFriends: { type: Boolean, default: true },
    ageVisible: { type: Boolean, default: true },
    loggedIn: { type: Boolean, default: false },
    visitProfile: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false }, // GDPR: Privacy by design
    deletedAt: { type: Date, default: null },
    googleId: { type: String, unique: true, sparse: true },
    firebaseUid: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    acceptedTerms: { type: Boolean, default: false },
    acceptedTermsAt: { type: Date, default: null }
}, { timestamps: true,     toJSON: { virtuals: true }, 
toObject: { virtuals: true } 
});

// Pre-save hook to handle default avatars and DiceBear integration
userSchema.pre('save', function(next) {
    const isOldDefault = (p) => {
        if (!p || typeof p !== 'string') return false;
        return ['male.webp', 'female.webp', 'other.webp'].some(d => p.includes(d)) || 
               p.includes('dicebear.com/9.x/bottts') || 
               p.includes('dicebear.com/7.x/bottts') || 
               p.includes('dicebear.com/6.x/bottts');
    };
    
    // If mainAvatar is missing or an old default, replace with DiceBear —
    // BUT only when the user has no saved customization (avatarStyle).
    // When avatarStyle is set the frontend's fallback chain recovers the
    // customized avatar from avatarSeed/avatarOverrides, so we must NOT
    // overwrite mainAvatar with a generic seed-based default here.
    if (!this.mainAvatar || isOldDefault(this.mainAvatar)) {
        if (!this.avatarStyle || this.avatarStyle !== 'avataaars') {
            // No customization saved — set a generic DiceBear default
            this.mainAvatar = this.getDefaultAvatar();
        }
        // else: leave mainAvatar null/falsy; the frontend getter falls back
        // to avatarStyle → avatarSeed → avatarOverrides (the customized avatar)
    }
    
    // Clean up avatar array: remove old defaults and ensure mainAvatar is
    // included only when it's a real uploaded path (not a DiceBear fallback).
    if (this.avatar && Array.isArray(this.avatar)) {
        this.avatar = this.avatar.filter(a => a && typeof a === 'string' && !isOldDefault(a));
        if (this.mainAvatar && !this.mainAvatar.includes('dicebear.com') && !this.avatar.includes(this.mainAvatar)) {
            this.avatar.unshift(this.mainAvatar);
        }
    } else if (this.mainAvatar && !this.mainAvatar.includes('dicebear.com')) {
        this.avatar = [this.mainAvatar];
    } else {
        this.avatar = [];
    }
    
    next();
});

// Indexes for search and filtering
userSchema.index({ firstName: 'text', lastName: 'text', aboutMe: 'text', interests: 'text' });
userSchema.index({ interests: 1 });
userSchema.index({ languages: 1 });
userSchema.index({ location: '2dsphere' });
userSchema.index({ lastSeen: -1 });
userSchema.index({ followers: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for password hashing using bcrypt
userSchema.virtual('password')
    .set(function(password) {
        this._password = password;
        this.hashed_password = bcrypt.hashSync(password, 10);  // bcrypt handles salt internally
    })
    .get(function() {
        return this._password;
    });




// Password encryption method

// Authenticate method to compare passwords
userSchema.methods.authenticate = async function(plainText) {
    const candidate = String(plainText || '');
    const currentHash = String(this.hashed_password || '');
    if (!candidate || !currentHash) return false;

    // Normal/modern path: bcrypt hashes start with $2a$, $2b$, or $2y$.
    if (/^\$2[aby]\$\d{2}\$/.test(currentHash)) {
        return bcrypt.compare(candidate, currentHash);
    }

    // Legacy path: only migrate if the candidate matches the legacy salted hash.
    const hasLegacySalt = typeof this.salt === 'string' && this.salt.length > 0;
    if (!hasLegacySalt) {
        return false;
    }

    const legacyHash = crypto
        .createHmac('sha1', this.salt)
        .update(candidate)
        .digest('hex');

    if (legacyHash !== currentHash) {
        return false;
    }

    // Successful legacy login: transparently upgrade to bcrypt.
    this.hashed_password = await bcrypt.hash(candidate, 10);
    this.salt = undefined;
    await this.save();
    return true;
};



userSchema.methods.isOldPasswordFormat = function() {
    const currentHash = String(this.hashed_password || '');
    return !/^\$2[aby]\$\d{2}\$/.test(currentHash);
};


// Get default avatar based on gender
userSchema.methods.getDefaultAvatar = function() {
    const seed = this._id ? this._id.toString() : crypto.randomBytes(8).toString('hex');
    // Use happy avataaars instead of bottts/monsters for a "happy face" default
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&eyes=happy&mouth=smile`;
};

// Initialize main avatar
userSchema.methods.initializeMainAvatar = function() {
    if (!this.mainAvatar && this.avatar.length > 0) {
        this.mainAvatar = this.avatar[0];
    } else if (!this.mainAvatar) {
        this.mainAvatar = this.getDefaultAvatar();
    }
};

// Return public info about the user
userSchema.methods.publicInfo = function(isLoggedInUser = false) {
    const sanitize = (val) => (val === 'undefined' || val === undefined || val === null) ? '' : val;

    // Helper: decode interests if the stored field is a single base64-encoded string
    const decodeInterestsIfNeeded = (raw) => {
        if (!raw) return [];
        // Already an array -> if it's a single base64-encoded string, decode it, otherwise return as-is
        if (Array.isArray(raw)) {
            if (raw.length === 1 && typeof raw[0] === 'string') {
                const candidate = raw[0].trim();
                // Lenient check: allow missing padding and length > 4
                const looksBase64Single = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                if (looksBase64Single) {
                    try {
                        const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                        if (decoded && /[A-Za-z]/.test(decoded)) {
                            return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                        }
                    } catch (e) {
                        // fall through to returning the raw array below
                    }
                }
            }
            return raw.map(r => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
        }

        // If it's not a string, try to coerce to string
        if (typeof raw !== 'string') raw = String(raw || '');
        raw = raw.trim();
        if (!raw) return [];

        // If it looks like base64 try decode
        const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 4;
        if (looksBase64) {
            try {
                const decoded = Buffer.from(raw, 'base64').toString('utf-8');
                if (decoded && /[A-Za-z]/.test(decoded)) {
                    return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                }
            } catch (e) {
                // fallthrough to fallback splitting below
            }
        }

        // Fallback: split by common separators
        if (raw.indexOf(',') !== -1 || raw.indexOf('|') !== -1 || raw.indexOf(';') !== -1) {
            return raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        }

        // As last resort, return single-item array
        return [raw];
    };

    const decodedInterests = decodeInterestsIfNeeded(this.interests);
    // Helper to defensively decode languages stored in legacy or malformed formats
    const decodeLanguagesIfNeeded = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            if (raw.length === 1 && typeof raw[0] === 'string') {
                const candidate = raw[0].trim();
                const looksBase64Single = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                if (looksBase64Single) {
                    try {
                        const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                        if (decoded && /[A-Za-z]/.test(decoded)) {
                            return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                        }
                    } catch (e) {}
                }
            }
            return raw.map(r => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
        }
        let s = typeof raw === 'string' ? raw.trim() : String(raw || '');
        if (!s) return [];

        const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 4;
        if (looksBase64) {
            try {
                const decoded = Buffer.from(s, 'base64').toString('utf-8');
                if (decoded && /[A-Za-z]/.test(decoded)) {
                    return decoded.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
                }
            } catch (e) {}
        }

        // try comma/pipe/semicolon split
        if (s.indexOf(',') !== -1 || s.indexOf('|') !== -1 || s.indexOf(';') !== -1) {
            return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
        }
        return [s];
    };

    const decodedLanguages = decodeLanguagesIfNeeded(this.languages);

    return {
        _id: this._id,
        firstName: sanitize(this.firstName),
        lastName: sanitize(this.lastName),
        email: this.email,
        role: this.role,
        avatar: this.avatar,
        mainAvatar: this.mainAvatar,
        country: sanitize(this.country),
        city: sanitize(this.city),
        gender: sanitize(this.gender),
        aboutMe: sanitize(this.aboutMe),
        school: sanitize(this.school),
        education: sanitize(this.education),
        profession: sanitize(this.profession),
        interests: Array.isArray(decodedInterests) ? decodedInterests : (decodedInterests ? [decodedInterests] : []),
        languages: Array.isArray(decodedLanguages) ? decodedLanguages : (decodedLanguages ? [decodedLanguages] : []),
        randomVisible: this.randomVisible,
        ageVisible: this.ageVisible,
        allowVideoRequestsFromNonFriends: !(this.allowVideoRequestsFromNonFriends === false || this.allowVideoRequestsFromNonFriends === 'false' || this.allowVideoRequestsFromNonFriends === 0 || this.allowVideoRequestsFromNonFriends === '0'),
        loggedIn: this.loggedIn,
        online: this.online,
        visitProfile: this.visitProfile,
        isPrivate: this.isPrivate,
        avatarStyle: this.avatarStyle,
        avatarSeed: this.avatarSeed,
        avatarVariant: this.avatarVariant,
        avatarOverrides: this.avatarOverrides,
        profileCreated: this.profileCreated,
        enabled: this.enabled,
        emailVerified: this.emailVerified,
        is2FAEnabled: this.is2FAEnabled,
        banned: this.banned,
        banUntil: this.banUntil,
        bannedReason: this.bannedReason,
        reports: this.reports,
        followers: this.followers,
        following: this.following,
        friends: this.friends,
        blockedUsers: this.blockedUsers,
        followedChannels: this.followedChannels,
        messagedUsers: this.messagedUsers,
        lastSeen: this.lastSeen,
        lastSeenText: this.lastSeenText,
        createdAt: this.createdAt || (this._id && mongoose.Types.ObjectId.isValid(this._id) ? new Date(parseInt(this._id.toString().substring(0, 8), 16) * 1000) : null),
       // Only include birthDate if ageVisible is true or the user is the one logged in
        birthDate: this.ageVisible || isLoggedInUser ? this.birthDate : null
    };
};

userSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.hashed_password);
};

// Add friend to user
userSchema.methods.addFriend = function(friendId) {
    if (!this.friends.includes(friendId)) {
        this.friends.push(friendId);
    }
};

// Remove friend from user
userSchema.methods.removeFriend = function(friendId) {
    this.friends = this.friends.filter(id => id.toString() !== friendId.toString());
};

// Add follower
userSchema.methods.addFollower = function(followerId) {
    if (!this.followers.includes(followerId)) {
        this.followers.push(followerId);
    }
};


userSchema.virtual('online').get(function () {
    const { isUserOnline } = require('../utils/socketManager');
    return isUserOnline(this._id.toString());
  });
  
  userSchema.virtual('lastSeenText').get(function () {
    const { isUserOnline } = require('../utils/socketManager');
    if (isUserOnline(this._id.toString())) return 'Online now';
    if (!this.lastSeen) return 'Never seen';
  
    const diffMs = Date.now() - this.lastSeen.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
  
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute(s) ago`;
    if (diffHours < 24) return `${diffHours} hour(s) ago`;
    return `${diffDays} day(s) ago`;
  });

// Remove follower
userSchema.methods.removeFollower = function(followerId) {
    this.followers = this.followers.filter(id => id.toString() !== followerId.toString());
};

module.exports = mongoose.model('User', userSchema);
