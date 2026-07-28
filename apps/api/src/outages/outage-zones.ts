export interface OutageZoneDefinition {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  affectedCustomers: number;
}

export const OUTAGE_ZONES: OutageZoneDefinition[] = [
  {
    id: 'zone-el-menzah-6-a3',
    label: 'El Menzah 6',
    longitude: 10.1764,
    latitude: 36.8427,
    affectedCustomers: 1842,
  },
  {
    id: 'zone-le-bardo-b1',
    label: 'Le Bardo',
    longitude: 10.1346,
    latitude: 36.8094,
    affectedCustomers: 2310,
  },
  {
    id: 'zone-la-marsa-hta',
    label: 'La Marsa',
    longitude: 10.3303,
    latitude: 36.8782,
    affectedCustomers: 1450,
  },
  {
    id: 'zone-cite-ennasr-2',
    label: 'Cité Ennasr 2',
    longitude: 10.1635,
    latitude: 36.8667,
    affectedCustomers: 1976,
  },
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function resolveOutageZone(
  zoneId: string,
  zoneLabel: string,
): OutageZoneDefinition | null {
  const normalizedId = normalize(zoneId);
  const normalizedLabel = normalize(zoneLabel);
  return (
    OUTAGE_ZONES.find(
      (zone) =>
        normalize(zone.id) === normalizedId ||
        normalize(zone.label) === normalizedLabel,
    ) ?? null
  );
}
