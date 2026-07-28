import type { StegCoordinates } from './steg-map';

/**
 * Référentiel administratif tunisien utilisé pour rattacher un compte citoyen
 * à une zone opérationnelle. Le GPS seul ne suffit pas : le couple
 * gouvernorat/délégation reste la clé de rapprochement avec le réseau STEG.
 */
export interface Governorate {
  /** Identifiant stable, utilisé comme valeur de formulaire. */
  code: string;
  name: string;
  /** Centre approximatif du chef-lieu, en [longitude, latitude]. */
  center: StegCoordinates;
  delegations: string[];
}

export const TUNISIA_GOVERNORATES: readonly Governorate[] = [
  {
    code: 'tunis',
    name: 'Tunis',
    center: [10.1815, 36.8065],
    delegations: [
      'Bab Bhar', 'Bab Souika', 'Cité El Khadra', 'El Kabaria', 'El Menzah',
      'El Omrane', 'El Omrane Supérieur', 'El Ouardia', 'Ettahrir', 'Ezzouhour',
      'Jebel Jelloud', 'La Goulette', 'La Marsa', 'Le Bardo', 'Le Kram',
      'Médina', 'Séjoumi', 'Sidi El Béchir', 'Sidi Hassine',
    ],
  },
  {
    code: 'ariana',
    name: 'Ariana',
    center: [10.1934, 36.8625],
    delegations: [
      'Ariana Ville', 'Ettadhamen', 'Kalâat el-Andalous', 'La Soukra',
      'Mnihla', 'Raoued', 'Sidi Thabet',
    ],
  },
  {
    code: 'ben-arous',
    name: 'Ben Arous',
    center: [10.2189, 36.7533],
    delegations: [
      'Ben Arous', 'Bou Mhel el-Bassatine', 'El Mourouj', 'Ezzahra',
      'Fouchana', 'Hammam Chott', 'Hammam Lif', 'Mégrine', 'Mohamedia',
      'Mornag', 'Radès',
    ],
  },
  {
    code: 'manouba',
    name: 'Manouba',
    center: [10.0972, 36.8078],
    delegations: [
      'Borj El Amri', 'Djedeida', 'Douar Hicher', 'El Battan', 'Manouba',
      'Mornaguia', 'Oued Ellil', 'Tebourba',
    ],
  },
  {
    code: 'nabeul',
    name: 'Nabeul',
    center: [10.7357, 36.4513],
    delegations: [
      'Béni Khalled', 'Béni Khiar', 'Bou Argoub', 'Dar Chaâbane El Fehri',
      'El Haouaria', 'El Mida', 'Grombalia', 'Hammam Ghezèze', 'Hammamet',
      'Kélibia', 'Korba', 'Menzel Bouzelfa', 'Menzel Temime', 'Nabeul',
      'Soliman', 'Takelsa',
    ],
  },
  {
    code: 'bizerte',
    name: 'Bizerte',
    center: [9.8739, 37.2746],
    delegations: [
      'Bizerte Nord', 'Bizerte Sud', 'El Alia', 'Ghar El Melh', 'Ghezala',
      'Joumine', 'Mateur', 'Menzel Bourguiba', 'Menzel Jemil', 'Ras Jebel',
      'Sejnane', 'Tinja', 'Utique', 'Zarzouna',
    ],
  },
  {
    code: 'beja',
    name: 'Béja',
    center: [9.1817, 36.7256],
    delegations: [
      'Amdoun', 'Béja Nord', 'Béja Sud', 'Goubellat', 'Medjez el-Bab',
      'Nefza', 'Téboursouk', 'Testour', 'Thibar',
    ],
  },
  {
    code: 'jendouba',
    name: 'Jendouba',
    center: [8.7803, 36.5011],
    delegations: [
      'Aïn Draham', 'Balta-Bou Aouane', 'Bou Salem', 'Fernana', 'Ghardimaou',
      'Jendouba', 'Jendouba Nord', 'Oued Meliz', 'Tabarka',
    ],
  },
  {
    code: 'kef',
    name: 'Le Kef',
    center: [8.7049, 36.1742],
    delegations: [
      'Dahmani', 'El Ksour', 'Jérissa', 'Kalaat Senan', 'Kalâat Khasba',
      'Le Kef Est', 'Le Kef Ouest', 'Nebeur', 'Sakiet Sidi Youssef',
      'Sers', 'Tajerouine', 'Touiref',
    ],
  },
  {
    code: 'siliana',
    name: 'Siliana',
    center: [9.3708, 36.0849],
    delegations: [
      'Bargou', 'Bou Arada', 'El Aroussa', 'Gaâfour', 'Kesra', 'Makthar',
      'Rouhia', 'Sidi Bou Rouis', 'Siliana Nord', 'Siliana Sud',
    ],
  },
  {
    code: 'zaghouan',
    name: 'Zaghouan',
    center: [10.1425, 36.4029],
    delegations: [
      'Bir Mcherga', 'El Fahs', 'Nadhour', 'Saouaf', 'Zaghouan', 'Zriba',
    ],
  },
  {
    code: 'sousse',
    name: 'Sousse',
    center: [10.6412, 35.8256],
    delegations: [
      'Akouda', 'Bouficha', 'Enfidha', 'Hammam Sousse', 'Hergla',
      'Kalâa Kebira', 'Kalâa Seghira', 'Kondar', 'M’saken', 'Sidi Bou Ali',
      'Sidi El Hani', 'Sousse Jawhara', 'Sousse Médina', 'Sousse Riadh',
      'Sousse Sidi Abdelhamid',
    ],
  },
  {
    code: 'monastir',
    name: 'Monastir',
    center: [10.826, 35.7643],
    delegations: [
      'Bekalta', 'Bembla', 'Beni Hassen', 'Jemmal', 'Ksar Hellal',
      'Ksibet el-Médiouni', 'Moknine', 'Monastir', 'Ouerdanine', 'Sahline',
      'Sayada-Lamta-Bou Hajar', 'Téboulba', 'Zéramdine',
    ],
  },
  {
    code: 'mahdia',
    name: 'Mahdia',
    center: [11.0622, 35.5047],
    delegations: [
      'Bou Merdes', 'Chorbane', 'El Jem', 'Essouassi', 'Hebira', 'Ksour Essef',
      'La Chebba', 'Mahdia', 'Melloulèche', 'Ouled Chamekh', 'Sidi Alouane',
    ],
  },
  {
    code: 'sfax',
    name: 'Sfax',
    center: [10.7603, 34.7406],
    delegations: [
      'Agareb', 'Bir Ali Ben Khalifa', 'El Amra', 'El Hencha', 'Ghraiba',
      'Jebiniana', 'Kerkennah', 'Mahrès', 'Menzel Chaker', 'Sakiet Eddaïer',
      'Sakiet Ezzit', 'Sfax Est', 'Sfax Sud', 'Sfax Ville', 'Skhira', 'Thyna',
    ],
  },
  {
    code: 'kairouan',
    name: 'Kairouan',
    center: [10.0963, 35.6781],
    delegations: [
      'Bou Hajla', 'Chebika', 'Cherarda', 'El Alâa', 'Haffouz', 'Hajeb El Ayoun',
      'Kairouan Nord', 'Kairouan Sud', 'Nasrallah', 'Oueslatia', 'Sbikha',
    ],
  },
  {
    code: 'kasserine',
    name: 'Kasserine',
    center: [8.8365, 35.1676],
    delegations: [
      'El Ayoun', 'Ezzouhour', 'Feriana', 'Foussana', 'Haïdra', 'Hassi El Frid',
      'Jedelienne', 'Kasserine Nord', 'Kasserine Sud', 'Majel Bel Abbès',
      'Sbeïtla', 'Sbiba', 'Thala',
    ],
  },
  {
    code: 'sidi-bouzid',
    name: 'Sidi Bouzid',
    center: [9.4849, 35.0382],
    delegations: [
      'Bir El Hafey', 'Cebbala Ouled Asker', 'Jilma', 'Meknassy', 'Menzel Bouzaiane',
      'Mezzouna', 'Ouled Haffouz', 'Regueb', 'Sidi Ali Ben Aoun',
      'Sidi Bouzid Est', 'Sidi Bouzid Ouest', 'Souk Jedid',
    ],
  },
  {
    code: 'gabes',
    name: 'Gabès',
    center: [10.0982, 33.8815],
    delegations: [
      'El Hamma', 'Gabès Médina', 'Gabès Ouest', 'Gabès Sud', 'Ghannouch',
      'Matmata', 'Menzel El Habib', 'Métouia', 'Mareth', 'Nouvelle Matmata',
    ],
  },
  {
    code: 'medenine',
    name: 'Médenine',
    center: [10.5055, 33.3549],
    delegations: [
      'Ben Gardane', 'Beni Khedache', 'Djerba Ajim', 'Djerba Houmt Souk',
      'Djerba Midoun', 'Médenine Nord', 'Médenine Sud', 'Sidi Makhlouf', 'Zarzis',
    ],
  },
  {
    code: 'tataouine',
    name: 'Tataouine',
    center: [10.4518, 32.9297],
    delegations: [
      'Bir Lahmar', 'Dehiba', 'Ghomrassen', 'Remada', 'Smâr',
      'Tataouine Nord', 'Tataouine Sud',
    ],
  },
  {
    code: 'gafsa',
    name: 'Gafsa',
    center: [8.7842, 34.425],
    delegations: [
      'Belkhir', 'El Guettar', 'El Ksar', 'Gafsa Nord', 'Gafsa Sud',
      'Mdhilla', 'Métlaoui', 'Moularès', 'Redeyef', 'Sened', 'Sidi Aïch',
    ],
  },
  {
    code: 'tozeur',
    name: 'Tozeur',
    center: [8.1335, 33.9197],
    delegations: ['Degache', 'Hazoua', 'Nefta', 'Tameghza', 'Tozeur'],
  },
  {
    code: 'kebili',
    name: 'Kébili',
    center: [8.9715, 33.7047],
    delegations: [
      'Douz Nord', 'Douz Sud', 'Faouar', 'Kébili Nord', 'Kébili Sud', 'Souk Lahad',
    ],
  },
];

/** Limites approximatives du territoire tunisien, pour valider une position. */
export const TUNISIA_BOUNDS = {
  minLongitude: 7.5,
  maxLongitude: 11.6,
  minLatitude: 30.2,
  maxLatitude: 37.6,
} as const;

export function isInsideTunisia([longitude, latitude]: StegCoordinates): boolean {
  return (
    longitude >= TUNISIA_BOUNDS.minLongitude &&
    longitude <= TUNISIA_BOUNDS.maxLongitude &&
    latitude >= TUNISIA_BOUNDS.minLatitude &&
    latitude <= TUNISIA_BOUNDS.maxLatitude
  );
}

export function findGovernorate(code: string): Governorate | undefined {
  return TUNISIA_GOVERNORATES.find((governorate) => governorate.code === code);
}

/**
 * Rattache une position GPS au gouvernorat dont le chef-lieu est le plus proche.
 * Approximation suffisante pour pré-remplir le formulaire : la validation
 * définitive du rattachement réseau reste faite côté API à partir du compteur.
 */
export function nearestGovernorate(coordinates: StegCoordinates): Governorate {
  const [longitude, latitude] = coordinates;
  // Correction de la convergence des méridiens à la latitude tunisienne.
  const longitudeScale = Math.cos((latitude * Math.PI) / 180);
  let closest = TUNISIA_GOVERNORATES[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const governorate of TUNISIA_GOVERNORATES) {
    const deltaLongitude = (governorate.center[0] - longitude) * longitudeScale;
    const deltaLatitude = governorate.center[1] - latitude;
    const distance = deltaLongitude * deltaLongitude + deltaLatitude * deltaLatitude;
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closest = governorate;
    }
  }

  return closest;
}

/** Formate une position pour l'affichage (5 décimales ≈ 1 m). */
export function formatCoordinates([longitude, latitude]: StegCoordinates): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
