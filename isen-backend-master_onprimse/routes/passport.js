const passport = require('passport');
let GoogleStrategy;
try {
  GoogleStrategy = require('passport-google-oauth20').Strategy;
} catch (e) {
  GoogleStrategy = null;
}
const User = require('../app/models/User');

// Only configure Google OAuth strategy when credentials are provided
if (GoogleStrategy && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = new User({ googleId: profile.id, email: profile.emails && profile.emails[0] && profile.emails[0].value, name: profile.displayName });
          await user.save();
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  ));
} else {
  console.warn('Google OAuth strategy not configured (missing GOOGLE_CLIENT_ID/SECRET)');
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

module.exports = passport;


