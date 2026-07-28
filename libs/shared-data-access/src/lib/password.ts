/**
 * Politique de mot de passe STEGFlow — identique côté Angular et côté API
 * (`apps/api/src/auth/password.policy.ts`). Toute évolution doit être
 * répercutée des deux côtés.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  { id: 'lower', label: 'Une lettre minuscule', test: (value) => /[a-z]/.test(value) },
  { id: 'upper', label: 'Une lettre majuscule', test: (value) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Un chiffre', test: (value) => /\d/.test(value) },
  {
    id: 'symbol',
    label: 'Un caractère spécial (! ? @ # …)',
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

/** Suites et mots trop courants pour un mot de passe de compte STEG. */
const WEAK_PATTERNS = [
  /(.)\1{3,}/, // quatre caractères identiques d'affilée
  /0123|1234|2345|3456|4567|5678|6789/,
  /azerty|qwerty|motdepasse|password|steg|tunisie|admin/i,
];

export type PasswordLevel = 'vide' | 'faible' | 'moyen' | 'bon' | 'excellent';

export interface PasswordAssessment {
  /** Score normalisé de 0 à 4, utilisable directement pour une jauge. */
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordLevel;
  label: string;
  /** Identifiants des règles satisfaites. */
  satisfied: string[];
  /** Règles restantes, dans l'ordre d'affichage. */
  missing: PasswordRule[];
  /** Vrai lorsque toutes les règles obligatoires sont respectées. */
  valid: boolean;
  /** Conseil affiché sous la jauge. */
  hint: string;
}

const LEVEL_LABELS: Record<PasswordLevel, string> = {
  vide: 'Aucun mot de passe',
  faible: 'Faible',
  moyen: 'Moyen',
  bon: 'Bon',
  excellent: 'Excellent',
};

export function assessPassword(value: string): PasswordAssessment {
  const satisfied = PASSWORD_RULES.filter((rule) => rule.test(value)).map((rule) => rule.id);
  const missing = PASSWORD_RULES.filter((rule) => !satisfied.includes(rule.id));
  const valid = missing.length === 0 && value.length <= PASSWORD_MAX_LENGTH;

  if (!value) {
    return {
      score: 0,
      level: 'vide',
      label: LEVEL_LABELS.vide,
      satisfied,
      missing,
      valid: false,
      hint: 'Choisissez une phrase de passe que vous êtes seul à connaître.',
    };
  }

  const isPredictable = WEAK_PATTERNS.some((pattern) => pattern.test(value));
  let points = satisfied.length;
  if (value.length >= 14) points += 1;
  if (value.length >= 20) points += 1;
  if (isPredictable) points -= 2;

  const score = Math.max(0, Math.min(4, points - 1)) as PasswordAssessment['score'];
  const level: PasswordLevel =
    !valid || score <= 1 ? 'faible' : score === 2 ? 'moyen' : score === 3 ? 'bon' : 'excellent';

  const hint = isPredictable
    ? 'Évitez les suites, les répétitions et les mots liés à la STEG.'
    : missing.length
      ? `Il manque : ${missing[0].label.toLowerCase()}.`
      : value.length < 14
        ? 'Allongez encore le mot de passe pour une sécurité optimale.'
        : 'Mot de passe robuste. Ne le réutilisez sur aucun autre service.';

  return { score, level, label: LEVEL_LABELS[level], satisfied, missing, valid, hint };
}
