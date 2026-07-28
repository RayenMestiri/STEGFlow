/**
 * Politique de mot de passe STEGFlow — miroir serveur de
 * `libs/shared-data-access/src/lib/password.ts`. Le client aide l'utilisateur,
 * mais c'est cette implémentation qui fait foi.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const REQUIRED_CLASSES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /[a-z]/, label: 'une lettre minuscule' },
  { pattern: /[A-Z]/, label: 'une lettre majuscule' },
  { pattern: /\d/, label: 'un chiffre' },
  { pattern: /[^A-Za-z0-9]/, label: 'un caractère spécial' },
];

const WEAK_PATTERNS = [
  /(.)\1{3,}/,
  /0123|1234|2345|3456|4567|5678|6789/,
  /azerty|qwerty|motdepasse|password|steg|tunisie|admin/i,
];

export const PASSWORD_POLICY_MESSAGE =
  `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères, ` +
  'une majuscule, une minuscule, un chiffre et un caractère spécial, ' +
  'sans suite évidente ni mot lié à la STEG.';

export function isStrongPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false;
  if (!REQUIRED_CLASSES.every(({ pattern }) => pattern.test(value))) return false;
  return !WEAK_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Refuse un mot de passe qui reprend l'identité du titulaire : c'est la
 * première chose testée lors d'une attaque ciblée.
 */
export function containsPersonalData(
  password: string,
  personalValues: Array<string | null | undefined>,
): boolean {
  const normalized = password.toLowerCase();
  return personalValues.some((value) => {
    const candidate = value?.toLowerCase().trim();
    if (!candidate || candidate.length < 4) return false;
    const localPart = candidate.split('@')[0];
    return normalized.includes(localPart);
  });
}
