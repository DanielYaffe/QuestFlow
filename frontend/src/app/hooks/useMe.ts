import { useEffect, useState } from 'react';
import { getMe, Me } from '../api/adminApi';
import { useAuth } from '../context/AuthContext';

// Fetches the current user's profile (incl. role) — used to gate admin-only UI
export function useMe(): { me: Me | null; loading: boolean; isAdmin: boolean } {
  const { isAuthenticated } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setMe(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    getMe()
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { me, loading, isAdmin: me?.role === 'admin' };
}
