const KEYS = {
  REMEMBER_ME: "remember-me",
  ACTIVE_SESSION: "active-session",
} as const;

export function setRememberMe(value: boolean): void {
  if (value) {
    localStorage.setItem(KEYS.REMEMBER_ME, "true");
  } else {
    localStorage.removeItem(KEYS.REMEMBER_ME);
  }
}

export function markSessionActive(): void {
  sessionStorage.setItem(KEYS.ACTIVE_SESSION, "true");
}

export function clearAuthStorage(): void {
  localStorage.removeItem(KEYS.REMEMBER_ME);
  sessionStorage.removeItem(KEYS.ACTIVE_SESSION);
}

export function shouldAutoSignOut(): boolean {
  return (
    !sessionStorage.getItem(KEYS.ACTIVE_SESSION) &&
    !localStorage.getItem(KEYS.REMEMBER_ME)
  );
}
