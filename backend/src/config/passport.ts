import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/userModel';
import { config } from './config';

if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google profile'));

          let user = await User.findOne({ googleId: profile.id });
          if (!user) {
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              await user.save();
            } else {
              user = await User.create({ email, googleId: profile.id });
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  console.warn('Google OAuth is disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env');
}

export default passport;
