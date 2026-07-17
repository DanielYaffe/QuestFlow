import { z } from 'zod';
import UserModel, { UserRole } from '../../models/userModel';
import { HttpError } from '../../utils/httpError';

export const setRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export interface AdminUserView {
  _id: string;
  email: string;
  role: UserRole;
  usesGoogleLogin: boolean;
}

export async function listUsers(): Promise<AdminUserView[]> {
  const users = await UserModel.find().select('email role googleId').sort({ email: 1 }).lean();
  return users.map((u) => ({
    _id: u._id.toString(),
    email: u.email,
    role: u.role ?? 'user',
    usesGoogleLogin: Boolean(u.googleId),
  }));
}

export async function setUserRole(
  actingUserId: string,
  targetUserId: string,
  role: UserRole,
): Promise<AdminUserView> {
  if (actingUserId === targetUserId && role !== 'admin') {
    throw new HttpError(400, 'You cannot demote yourself — ask another admin');
  }

  const user = await UserModel.findById(targetUserId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  if (user.role === 'admin' && role === 'user') {
    const adminCount = await UserModel.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw new HttpError(400, 'Cannot demote the last remaining admin');
    }
  }

  user.role = role;
  // A deliberate role change from the admin page must never be overridden by
  // the ADMIN_EMAILS bootstrap on the next request
  user.adminBootstrapApplied = true;
  await user.save();

  return {
    _id: user._id.toString(),
    email: user.email,
    role: user.role,
    usesGoogleLogin: Boolean(user.googleId),
  };
}
