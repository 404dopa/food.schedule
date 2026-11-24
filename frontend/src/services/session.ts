// Session management: stores user name, household_id, family_code in localStorage.

const SESSION_KEY = 'bayti_session';

export interface BaytiSession {
  user_name: string;
  household_id: string;
  family_code: string;
}

export function getSession(): BaytiSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BaytiSession;
  } catch {
    return null;
  }
}

export function saveSession(session: BaytiSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getHouseholdId(): string {
  return getSession()?.household_id || 'default';
}
