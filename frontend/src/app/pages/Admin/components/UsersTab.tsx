import React, { useState } from 'react';
import { ShieldCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AdminUser, setAdminUserRole } from '../../../api/adminApi';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (message) return message;
  }
  return fallback;
}

interface UsersTabProps {
  users: AdminUser[];
  meId: string | null;
  onChanged: () => void;
}

export function UsersTab({ users, meId, onChanged }: UsersTabProps) {
  const [demoting, setDemoting] = useState<AdminUser | null>(null);

  const promote = async (user: AdminUser) => {
    try {
      await setAdminUserRole(user._id, 'admin');
      toast.success(`${user.email} is now an admin`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update role'));
    }
  };

  const confirmDemote = async () => {
    if (!demoting) return;
    try {
      await setAdminUserRole(demoting._id, 'user');
      toast.success(`${demoting.email} is no longer an admin`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update role'));
    } finally {
      setDemoting(null);
    }
  };

  return (
    <div>
      <p className="text-steel-400 text-sm mb-4">
        Admins can manage styles, model registries and user roles. You cannot demote yourself.
      </p>

      <div className="space-y-2">
        {users.map((user) => {
          const isSelf = user._id === meId;
          const isAdmin = user.role === 'admin';
          return (
            <div key={user._id} className="bg-steel-850 border border-steel-700 rounded-md px-4 py-3 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isAdmin ? 'bg-volt/10' : 'bg-steel-800'}`}>
                {isAdmin
                  ? <ShieldCheck className="w-4 h-4 text-volt" />
                  : <UserIcon className="w-4 h-4 text-steel-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-steel-100 text-sm truncate">{user.email}</span>
                  {isSelf && <span className="text-steel-500 text-xs">(you)</span>}
                </div>
                <div className="text-steel-400 text-xs mt-0.5">
                  {isAdmin ? 'Admin' : 'User'}{user.usesGoogleLogin ? ' · Google login' : ''}
                </div>
              </div>
              {isAdmin ? (
                <button
                  onClick={() => setDemoting(user)}
                  disabled={isSelf}
                  title={isSelf ? 'You cannot demote yourself' : 'Remove admin access'}
                  className="px-3 py-1.5 text-xs rounded-md bg-steel-800 hover:bg-steel-700 text-steel-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Demote to user
                </button>
              ) : (
                <button
                  onClick={() => promote(user)}
                  className="px-3 py-1.5 text-xs rounded-md bg-volt hover:brightness-95 text-steel-950 font-semibold transition-[filter] cursor-pointer"
                >
                  Make admin
                </button>
              )}
            </div>
          );
        })}
        {users.length === 0 && <p className="text-steel-500 text-sm text-center py-10">No users found.</p>}
      </div>

      <ConfirmModal
        isOpen={demoting !== null}
        title="Remove admin access"
        message={`Demote ${demoting?.email} to a regular user? They will immediately lose access to this admin page.`}
        confirmLabel="Demote"
        danger
        onConfirm={confirmDemote}
        onCancel={() => setDemoting(null)}
      />
    </div>
  );
}
