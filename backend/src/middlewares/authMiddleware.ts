import { config } from "../config/config";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel from "../models/userModel";

export type AuthRequest = Request & { user?: { _id: string } };

declare global {
  namespace Express {
    interface Request {
      user?: { _id: string };
    }
  }
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.headers.authorization && req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token as string}`;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const secret = config.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined");
    }
    try {
        const decoded = jwt.verify(token, secret) as { _id: string };

        const user = await UserModel.findById(decoded._id);
        if (!user) {
            return res.status(401).json({ error: "Unauthorized: User not found" });
        }

        req.user = { _id: decoded._id };
        next();
    } catch (err) {
        return res.status(401).json({ message: "Unauthorized" });
    }
};