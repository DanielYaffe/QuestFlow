import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { IUser } from '../models/userModel';

const generateToken = (userId: string) => {
  const secret = config.JWT_SECRET;
  const token = jwt.sign({ _id: userId }, secret, { expiresIn: config.JWT_EXPIRES_IN });
  const rand = Math.floor(Math.random() * 1000);
  const refreshToken = jwt.sign({ _id: userId, rand }, secret, { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN });
  return { token, refreshToken };
};

export async function googleCallback(req: Request, res: Response) {
  const user = req.user as IUser;
  if (!user) {
    return res.redirect(`${config.FRONTEND_URL}/#/login?error=google_failed`);
  }

  const { token, refreshToken } = generateToken(user._id.toString());

  if (!user.refreshTokens) user.refreshTokens = [];
  user.refreshTokens.push(refreshToken);
  await user.save();

  // Redirect to frontend with tokens in query params — frontend reads and stores them
  res.redirect(
    `${config.FRONTEND_URL}/#/auth/callback?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}`
  );
}
