import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

// The ONE place that normalises an auth response into the flat shape every screen reads
// (user.role, user.fullName, user.employeeCode, ...) — used for both POST /auth/login and
// GET /auth/me, which return different shapes from each other (docs/api-shapes.md):
//   login: { user: { id, employeeCode, email, role, status, employeeId } }        — flat
//   me:    { user: {...no employeeId...}, employee: {..., department} | null }    — nested
// Tolerant of a bare user object too (no `user` wrapper at all), in case a real deployment
// ever differs from the captured docs — better to fall back safely than crash on a shape
// that wasn't anticipated. `id` stays the auth user's id; the employee row's own id is kept
// as `employeeId` so the two are never confused. Returns null — never a half-built object —
// if a role can't be established, so callers (RoleRoute) can trust: user truthy => user.role set.
function normalizeAuthResponse(payload) {
  const user = payload?.user ?? payload;
  if (!user?.role) return null;
  const employee = payload?.employee ?? null;
  return {
    id: user.id,
    employeeId: employee?.id ?? user.employeeId ?? null,
    employeeCode: user.employeeCode,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    fullName: employee?.fullName ?? null,
    designation: employee?.designation ?? null,
    dateOfJoining: employee?.dateOfJoining ?? null,
    phone: employee?.phone ?? null,
    address: employee?.address ?? null,
    profilePhotoPath: employee?.profilePhotoPath ?? null,
    managerId: employee?.managerId ?? null,
    department: employee?.department ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(normalizeAuthResponse(me));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Throws ApiError on failure — callers (SignIn) catch it and show an inline error.
  const signIn = useCallback(async (email, password) => {
    await api.post('/auth/login', { email, password });
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  }, []);

  const value = { user, loading, signIn, signOut, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
