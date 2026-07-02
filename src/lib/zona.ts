// Zona geográfica de una institución, derivada ON-READ (sin columna en BD): por cercanía GPS
// a un centroide conocido y, si no hay GPS, por palabras clave en la ubicación.
// ponytail: lista corta de centroides cubre el 95% de los datos (Caracas/La Guaira/diáspora);
// añade centroides cuando aparezcan zonas nuevas. Radio máx evita meter todo en la más cercana.
type Centroide = { zona: string; lat: number; lng: number; claves: string[] };
const CENTROIDES: Centroide[] = [
  { zona: "Caracas", lat: 10.49, lng: -66.88, claves: ["caracas", "libertador", "chacao", "baruta", "sucre", "el hatillo", "petare"] },
  { zona: "La Guaira", lat: 10.60, lng: -66.95, claves: ["la guaira", "vargas", "maiquetia", "catia la mar", "soublette", "carayaca"] },
  { zona: "Miranda (Altos Mirandinos)", lat: 10.34, lng: -67.04, claves: ["los teques", "guarenas", "guatire", "san antonio de los altos", "carrizal"] },
  { zona: "Valencia", lat: 10.17, lng: -68.00, claves: ["valencia", "carabobo", "naguanagua"] },
  { zona: "Maracay", lat: 10.25, lng: -67.60, claves: ["maracay", "aragua"] },
  { zona: "Maracaibo", lat: 10.65, lng: -71.64, claves: ["maracaibo", "zulia"] },
  { zona: "Barquisimeto", lat: 10.07, lng: -69.32, claves: ["barquisimeto", "lara"] },
  { zona: "Táchira", lat: 7.77, lng: -72.22, claves: ["san cristobal", "tachira", "cucuta"] },
  { zona: "Miami (EE.UU.)", lat: 25.77, lng: -80.19, claves: ["miami", "doral", "coconut creek", "florida", "fl", "ee.uu", "usa"] },
  { zona: "Bogotá (Colombia)", lat: 4.65, lng: -74.10, claves: ["bogota", "colombia"] },
];
const RADIO_MAX_KM = 70;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function zonaDe(x: { gps_lat?: number | null; gps_lng?: number | null; ubicacion?: string | null }): string {
  if (x.gps_lat != null && x.gps_lng != null) {
    let mejor: Centroide | null = null, min = Infinity;
    for (const c of CENTROIDES) {
      const d = km(x.gps_lat, x.gps_lng, c.lat, c.lng);
      if (d < min) { min = d; mejor = c; }
    }
    if (mejor && min <= RADIO_MAX_KM) return mejor.zona;
  }
  const u = norm(x.ubicacion ?? "");
  if (u) for (const c of CENTROIDES) if (c.claves.some((k) => u.includes(k))) return c.zona;
  return "Otra zona";
}
