import { type Href, Redirect, useLocalSearchParams } from 'expo-router';

const LEGACY_EQUIPMENT_ROUTE_ROOTS = new Set([
  'activity',
  'assistant',
  'bays',
  'documents',
  'jobs',
  'plan',
  'products',
  'quotes',
  'stores',
  'units',
]);

export default function LegacyEquipmentRoute() {
  const { legacy, ...params } = useLocalSearchParams<{ legacy: string | string[] }>();
  const segments = Array.isArray(legacy) ? legacy : [legacy];
  const [routeRoot] = segments;

  if (!routeRoot || !LEGACY_EQUIPMENT_ROUTE_ROOTS.has(routeRoot)) {
    return <Redirect href="/equipment" />;
  }

  return (
    <Redirect
      href={
        {
          pathname: `/equipment/${segments.join('/')}`,
          params,
        } as Href
      }
    />
  );
}
