import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config/config";

const sendError = (status: number, message: string, res: Response) => {
  res.status(status).json({ error: message });
};

type GeneratedTokens = {
  token: string;
  refreshToken: string;
};

export const getJWTSecret = (): string => {
  const secret = config.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  return secret;
};

const generateToken = (userId: string): GeneratedTokens => {
  const secret = getJWTSecret();
  if (!config.JWT_EXPIRES_IN) {
    throw new Error("JWT_EXPIRES_IN is not defined");
  }
  const expiresIn = config.JWT_EXPIRES_IN;
  const token = jwt.sign({ _id: userId }, secret, { expiresIn: expiresIn });

  if (!config.REFRESH_TOKEN_EXPIRES_IN) {
    throw new Error("REFRESH_TOKEN_EXPIRES_IN is not defined");
  }
  const refreshExpiresIn = config.REFRESH_TOKEN_EXPIRES_IN;
  const rand = Math.floor(Math.random() * 1000);
  const refreshToken = jwt.sign({ _id: userId, rand: rand }, secret, {
    expiresIn: refreshExpiresIn,
  });
  return { token, refreshToken };
};

const register = async (req: Request, res: Response) => {
  const email = req.body.email;
  const password = req.body.password;
  if (!email || !password) {
    return sendError(400, "Email and password are required", res);
  }
  try {
    const user = await User.findOne({ email: email });
    if (user) {
      return sendError(409, "User already exists", res);
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({
      email: email,
      password: hashedPassword,
    });
    const savedUser = await newUser.save();
    const tokens = generateToken(savedUser._id.toString());
    if (!savedUser.refreshTokens) {
      savedUser.refreshTokens = [];
    }
    savedUser.refreshTokens.push(tokens.refreshToken);
    await savedUser.save();
    res.status(201).json(tokens);
  } catch (err) {
    return sendError(
      400,
      err instanceof Error ? err.message : "Error creating user",
      res,
    );
  }
};

const login = async (req: Request, res: Response) => {
    const email = req.body.email;
    const password = req.body.password;
    if (!email || !password) {
        return sendError(400, "Email and password are required", res);
    }
    try {
        const user = await User.findOne({ email: email });
        if (!user || !user.password) {
            return sendError(400, "Invalid email or account uses Google login", res);
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return sendError(400, "Invalid password", res);
        }

        const tokens = generateToken(user._id.toString());
        if (!user.refreshTokens) {
            user.refreshTokens = [];
        }
        user.refreshTokens.push(tokens.refreshToken);
        await user.save();
        res.status(200).json(tokens);
    } catch {
        return sendError(500, "Internal server error", res);
    }
};

const refreshToken = async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) {
        return sendError(400, "Refresh token is required", res);
    }

    try {
        const secret = getJWTSecret();
        const decoded = jwt.verify(refreshToken, secret) as { _id: string };
        const user = await User.findById(decoded._id);
        if (!user) {
            return sendError(401, "Invalid refresh token", res);
        }
        if (!user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
            user.refreshTokens = [];
            await user.save();
            return sendError(401, "Invalid refresh token", res);
        }
        const tokens = generateToken(user._id.toString());
        user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);
        user.refreshTokens.push(tokens.refreshToken);
        await user.save();
        res.status(200).json(tokens);
    } catch (err) {
        if (err instanceof Error && err.message === "JWT_SECRET is not defined") {
            return sendError(500, err.message, res);
        }
        return sendError(401, "Invalid refresh token", res);
    }
};

const logout = async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) {
        return sendError(400, "Refresh token is required", res);
    }

    try {
        const secret = getJWTSecret();
        const decoded = jwt.verify(refreshToken, secret) as { _id: string };
        const user = await User.findById(decoded._id);
        if (!user) {
            return sendError(401, "Invalid refresh token", res);
        }
        if (!user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
            user.refreshTokens = [];
            await user.save();
            return sendError(401, "Invalid refresh token", res);
        }
        user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);
        await user.save();
        res.status(200).send();
    } catch (err) {
        if (err instanceof Error && err.message === "JWT_SECRET is not defined") {
            return sendError(500, err.message, res);
        }
        return sendError(401, "Invalid refresh token", res);
    }
};

export default {
    register,
    login,
    refreshToken,
    logout
};
