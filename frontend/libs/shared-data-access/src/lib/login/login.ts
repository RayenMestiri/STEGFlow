import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { AuthService } from '../auth.service';
import { RegisterCitizen, UserRole } from '../auth.models';
import { assessPassword, PASSWORD_RULES } from '../password';
import {
  createStegMap,
  createStegPinMarker,
  supportsStegMap,
  type StegCoordinates,
} from '../steg-map';
import {
  findGovernorate,
  formatCoordinates,
  isInsideTunisia,
  nearestGovernorate,
  TUNISIA_GOVERNORATES,
} from '../tunisia-geo';

export type Portal = 'admin' | 'maintenance' | 'citizen';

/** Étapes du parcours « Créer votre compte ». */
const REGISTER_STEPS = [
  { key: 'identity', label: 'Identité', hint: 'Qui êtes-vous ?' },
  { key: 'security', label: 'Sécurité', hint: 'Protégez votre compte' },
  { key: 'location', label: 'Adresse', hint: 'Où suivre votre courant ?' },
  { key: 'confirm', label: 'Confirmation', hint: 'Vérifiez et validez' },
] as const;

type StepKey = (typeof REGISTER_STEPS)[number]['key'];

const TUNISIAN_PHONE = /^(\+216)?[\s.-]?[2459]\d[\s.-]?\d{3}[\s.-]?\d{3}$/;
const CONTRACT_NUMBER = /^[A-Za-z0-9-]{4,24}$/;
const DEFAULT_CENTER: StegCoordinates = [10.1815, 36.8065];

function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;
  return assessPassword(value).valid ? null : { weakPassword: true };
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  if (!confirmation) return null;
  return password === confirmation ? null : { passwordMismatch: true };
}

@Component({
  selector: 'steg-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  host: { '[attr.data-portal]': 'portal()' },
})
export class Login {
  readonly portal = input.required<Portal>();
  readonly signedIn = output<void>();

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly registerMode = signal(false);
  protected readonly step = signal<StepKey>('identity');
  protected readonly showPassword = signal(false);
  protected readonly capsLockOn = signal(false);
  protected readonly error = signal('');
  protected readonly locating = signal(false);
  protected readonly locationNotice = signal('');

  protected readonly steps = REGISTER_STEPS;
  protected readonly governorates = TUNISIA_GOVERNORATES;
  protected readonly passwordRules = PASSWORD_RULES;

  // --- Formulaires ---------------------------------------------------------
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    remember: new FormControl(this.auth.persistSession(), { nonNullable: true }),
  });

  protected readonly identityForm = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(180)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(TUNISIAN_PHONE)],
    }),
  });

  protected readonly securityForm = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, strongPassword],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  protected readonly locationForm = new FormGroup({
    governorate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    delegation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    district: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    address: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4), Validators.maxLength(180)],
    }),
    contractNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(CONTRACT_NUMBER)],
    }),
  });

  protected readonly consentForm = new FormGroup({
    acceptTerms: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });

  // --- État dérivé ---------------------------------------------------------
  private readonly passwordValue = signal('');
  private readonly governorateCode = signal('');
  protected readonly coordinates = signal<StegCoordinates | null>(null);

  protected readonly assessment = computed(() => assessPassword(this.passwordValue()));

  protected readonly delegations = computed(
    () => findGovernorate(this.governorateCode())?.delegations ?? [],
  );

  protected readonly coordinatesLabel = computed(() => {
    const position = this.coordinates();
    return position ? formatCoordinates(position) : 'Aucune position sélectionnée';
  });

  protected readonly stepIndex = computed(() =>
    REGISTER_STEPS.findIndex((entry) => entry.key === this.step()),
  );

  protected readonly progress = computed(
    () => ((this.stepIndex() + 1) / REGISTER_STEPS.length) * 100,
  );

  protected readonly recap = computed(() => {
    const identity = this.identityForm.getRawValue();
    const place = this.locationForm.getRawValue();
    const governorate = findGovernorate(place.governorate)?.name ?? '—';
    return [
      { label: 'Titulaire', value: `${identity.firstName} ${identity.lastName}`.trim() || '—' },
      { label: 'Adresse e-mail', value: identity.email || '—' },
      { label: 'Téléphone', value: identity.phone || 'Non renseigné' },
      {
        label: 'Adresse suivie',
        value:
          [place.address, place.district, place.delegation, governorate]
            .filter(Boolean)
            .join(' · ') || '—',
      },
      { label: 'Numéro de contrat', value: place.contractNumber || 'À rattacher plus tard' },
      { label: 'Position GPS', value: this.coordinatesLabel() },
    ];
  });

  // --- Carte ---------------------------------------------------------------
  private map?: MapLibreMap;
  private marker?: Marker;
  private mapElement?: HTMLElement;

  @ViewChild('locationMap')
  protected set locationMapRef(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    this.initializeMap(container.nativeElement);
  }

  constructor() {
    this.securityForm.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.passwordValue.set(value ?? ''));

    this.locationForm.controls.governorate.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((code) => this.onGovernorateChange(code ?? ''));

    this.destroyRef.onDestroy(() => {
      this.marker?.remove();
      this.map?.remove();
    });
  }

  // --- Textes selon le portail --------------------------------------------
  protected get title() {
    if (this.portal() === 'admin') return 'Centre des opérations';
    if (this.portal() === 'maintenance') return 'Espace équipe terrain';
    return 'Votre électricité, en toute transparence';
  }

  protected get subtitle() {
    if (this.portal() === 'admin')
      return 'Supervisez le réseau, les incidents et les équipes depuis un espace sécurisé.';
    if (this.portal() === 'maintenance')
      return 'Recevez vos missions et partagez leur progression en temps réel.';
    return 'Suivez votre zone, recevez les alertes et signalez un incident en quelques secondes.';
  }

  protected get portalLabel() {
    if (this.portal() === 'admin') return 'ESPACE INTERNE';
    if (this.portal() === 'maintenance') return 'APPLICATION TERRAIN';
    return 'ESPACE CITOYEN';
  }

  // --- Interactions --------------------------------------------------------
  protected toggleMode(): void {
    this.error.set('');
    this.step.set('identity');
    this.registerMode.update((value) => !value);
    this.coordinates.set(null);
    if (this.marker) {
      this.marker.remove();
      this.marker = undefined;
    }
  }

  protected trackCapsLock(event: KeyboardEvent): void {
    if (typeof event.getModifierState !== 'function') return;
    this.capsLockOn.set(event.getModifierState('CapsLock'));
  }

  protected fillDemo(): void {
    const credentials = {
      admin: ['superviseur@steg.tn', 'Admin2026!'],
      maintenance: ['technicien@steg.tn', 'Tech2026!'],
      citizen: ['citoyen@steg.tn', 'Client2026!'],
    }[this.portal()];
    this.loginForm.patchValue({ email: credentials[0], password: credentials[1] });
  }

  protected submitLogin(): void {
    this.error.set('');
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password, remember } = this.loginForm.getRawValue();
    this.auth.login(email, password, remember).subscribe({
      next: () => this.authorizePortal(),
      error: (error) => this.setError(error),
    });
  }

  protected nextStep(): void {
    this.error.set('');
    const current = this.currentStepForm();
    if (current.invalid) {
      current.markAllAsTouched();
      return;
    }
    this.step.set(REGISTER_STEPS[Math.min(this.stepIndex() + 1, REGISTER_STEPS.length - 1)].key);
  }

  protected previousStep(): void {
    this.error.set('');
    this.step.set(REGISTER_STEPS[Math.max(this.stepIndex() - 1, 0)].key);
  }

  /** Autorise le retour en arrière via le fil d'étapes, jamais le saut en avant. */
  protected goToStep(key: StepKey): void {
    const target = REGISTER_STEPS.findIndex((entry) => entry.key === key);
    if (target < this.stepIndex()) this.step.set(key);
  }

  protected submitRegistration(): void {
    this.error.set('');
    const forms = [this.identityForm, this.securityForm, this.locationForm, this.consentForm];
    const firstInvalid = forms.findIndex((form) => form.invalid);
    if (firstInvalid >= 0) {
      forms[firstInvalid].markAllAsTouched();
      this.step.set(REGISTER_STEPS[firstInvalid].key);
      return;
    }

    const identity = this.identityForm.getRawValue();
    const place = this.locationForm.getRawValue();
    const position = this.coordinates();
    const payload: RegisterCitizen = {
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      password: this.securityForm.controls.password.value,
      phone: identity.phone || undefined,
      contractNumber: place.contractNumber || undefined,
      address: place.address,
      governorate: findGovernorate(place.governorate)?.name,
      delegation: place.delegation,
      district: place.district || undefined,
      latitude: position?.[1],
      longitude: position?.[0],
      acceptTerms: true,
    };

    this.auth.register(payload, this.loginForm.controls.remember.value).subscribe({
      next: () => this.authorizePortal(),
      error: (error) => this.setError(error),
    });
  }

  protected locateMe(): void {
    if (!navigator.geolocation) {
      this.locationNotice.set("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    this.locating.set(true);
    this.locationNotice.set('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.locating.set(false);
        const coordinates: StegCoordinates = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        if (!isInsideTunisia(coordinates)) {
          this.locationNotice.set(
            'La position détectée est hors du territoire couvert. Placez l’épingle manuellement.',
          );
          return;
        }
        this.applyCoordinates(coordinates, true);
        this.locationNotice.set(
          'Position détectée. Ajustez l’épingle si nécessaire pour viser votre compteur.',
        );
      },
      () => {
        this.locating.set(false);
        this.locationNotice.set(
          'Localisation refusée. Placez l’épingle sur la carte à l’emplacement de votre logement.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  protected clearPosition(): void {
    this.coordinates.set(null);
    this.marker?.remove();
    this.marker = undefined;
    this.locationNotice.set('');
    this.map?.once('click', (event) =>
      this.applyCoordinates([event.lngLat.lng, event.lngLat.lat], false),
    );
  }

  // --- Aides de validation pour le gabarit ---------------------------------
  protected invalid(control: AbstractControl | null): boolean {
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected errorText(control: AbstractControl | null, field: string): string {
    if (!this.invalid(control)) return '';
    const errors = control?.errors ?? {};
    if (errors['required'] || errors['requiredTrue']) return `${field} est obligatoire.`;
    if (errors['email']) return 'Adresse e-mail invalide.';
    if (errors['minlength'])
      return `${field} doit contenir au moins ${errors['minlength'].requiredLength} caractères.`;
    if (errors['maxlength'])
      return `${field} ne doit pas dépasser ${errors['maxlength'].requiredLength} caractères.`;
    if (errors['weakPassword']) return this.assessment().hint;
    if (errors['pattern']) return `${field} n’a pas le format attendu.`;
    return `${field} est invalide.`;
  }

  // --- Interne -------------------------------------------------------------
  private currentStepForm(): FormGroup {
    return {
      identity: this.identityForm,
      security: this.securityForm,
      location: this.locationForm,
      confirm: this.consentForm,
    }[this.step()];
  }

  private onGovernorateChange(code: string): void {
    this.governorateCode.set(code);
    const governorate = findGovernorate(code);
    if (!governorate) return;
    if (!this.delegations().includes(this.locationForm.controls.delegation.value)) {
      this.locationForm.controls.delegation.setValue('');
    }
    if (!this.coordinates()) this.map?.easeTo({ center: governorate.center, zoom: 11.5 });
  }

  private async initializeMap(element: HTMLElement): Promise<void> {
    if (!supportsStegMap()) {
      this.locationNotice.set(
        'La carte interactive nécessite WebGL. Vous pouvez continuer en renseignant votre adresse.',
      );
      return;
    }
    if (this.map && this.mapElement === element) {
      this.map.resize();
      return;
    }
    this.map?.remove();
    this.mapElement = element;
    const governorate = findGovernorate(this.locationForm.controls.governorate.value);
    const existing = this.coordinates();
    const center = existing ?? governorate?.center ?? DEFAULT_CENTER;
    this.map = await createStegMap(element, center, existing ? 15 : 11.5);
    this.map.once('load', () => this.map?.resize());

    if (existing) {
      void this.attachMarker(existing);
    }

    // Listener permanent pour poser ou déplacer l'épingle au clic
    this.map.on('click', (event) => {
      this.applyCoordinates([event.lngLat.lng, event.lngLat.lat], false);
    });
  }

  private applyCoordinates(coordinates: StegCoordinates, recenter: boolean): void {
    this.coordinates.set(coordinates);
    if (this.marker) {
      this.marker.setLngLat(coordinates);
    } else {
      void this.attachMarker(coordinates);
    }
    if (recenter) {
      this.map?.easeTo({ center: coordinates, zoom: 15, duration: 600 });
    }

    // Pré-remplit le gouvernorat tant que l'utilisateur ne l'a pas choisi.
    if (!this.locationForm.controls.governorate.value) {
      this.locationForm.controls.governorate.setValue(nearestGovernorate(coordinates).code);
    }
  }

  private async attachMarker(coordinates: StegCoordinates): Promise<void> {
    if (!this.map || this.marker) return;
    const marker = await createStegPinMarker(this.map, coordinates, (next) =>
      this.applyCoordinates(next, false),
    );
    this.marker = marker;
  }

  private authorizePortal(): void {
    const allowedRoles: Record<Portal, UserRole[]> = {
      admin: ['admin', 'supervisor', 'dispatcher'],
      maintenance: ['admin', 'supervisor', 'technician'],
      citizen: ['citizen'],
    };
    this.auth.requireRole(allowedRoles[this.portal()]).subscribe({
      next: () => this.signedIn.emit(),
      error: (error) => this.error.set(error.message),
    });
  }

  private setError(error: { status?: number; error?: { message?: string | string[] } }): void {
    const message = error.error?.message;
    if (Array.isArray(message)) {
      this.error.set(message[0]);
      return;
    }
    if (message) {
      this.error.set(message);
      return;
    }
    this.error.set(
      error.status === 0
        ? 'Service STEG injoignable. Vérifiez votre connexion et réessayez.'
        : 'Connexion impossible. Vérifiez vos informations et réessayez.',
    );
  }
}
