const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_MONTH = 29.530588853 * 24 * 60 * 60 * 1000;

/** Fraction of the current synodic month, from new moon (0) through waxing to new moon (1). */
export function moonPhase(now = Date.now()): number {
  return ((now - NEW_MOON_EPOCH) % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH / SYNODIC_MONTH;
}

const RAD = Math.PI / 180;
const OBLIQUITY = 23.4397 * RAD;
const EARTH_RADIUS_KM = 6378.14;
const LUNAR_EQUATOR_INCLINATION = 1.54242 * RAD;

function equatorial(longitude: number, latitude: number) {
  return {
    ra: Math.atan2(Math.sin(longitude) * Math.cos(OBLIQUITY) - Math.tan(latitude) * Math.sin(OBLIQUITY), Math.cos(longitude)),
    dec: Math.asin(Math.sin(latitude) * Math.cos(OBLIQUITY) + Math.cos(latitude) * Math.sin(OBLIQUITY) * Math.sin(longitude)),
  };
}

/**
 * Approximate illumination and orientation as seen from the observer, with angles in radians.
 * `brightLimbAngle` and `axisAngle` (lunar north pole) are position angles from celestial north towards east;
 * `parallacticAngle` turns celestial north into the observer's zenith direction.
 * The low-precision solar and lunar positions are not intended for eclipse predictions.
 * Without a location the angles are relative to celestial north rather than the local horizon.
 */
export function moonAppearance(now: number, latitude?: number | null, longitude?: number | null) {
  const days = now / 86400000 - 10957.5;
  const solarMeanAnomaly = RAD * (357.5291 + 0.98560028 * days);
  const solarLongitude = solarMeanAnomaly
    + RAD * (1.9148 * Math.sin(solarMeanAnomaly) + 0.02 * Math.sin(2 * solarMeanAnomaly) + 0.0003 * Math.sin(3 * solarMeanAnomaly))
    + RAD * 102.9372 + Math.PI;
  const sun = equatorial(solarLongitude, 0);

  const lunarLongitude = RAD * (218.316 + 13.176396 * days);
  const lunarAnomaly = RAD * (134.963 + 13.064993 * days);
  const lunarArgument = RAD * (93.272 + 13.229350 * days);
  const elongation = RAD * (297.8502 + 12.19074912 * days);
  // largest periodic terms from Meeus, Astronomical Algorithms, ch. 47
  const eclipticLongitude = lunarLongitude + RAD * (6.289 * Math.sin(lunarAnomaly)
    + 1.274 * Math.sin(2 * elongation - lunarAnomaly) + 0.658 * Math.sin(2 * elongation)
    + 0.214 * Math.sin(2 * lunarAnomaly) - 0.186 * Math.sin(solarMeanAnomaly) - 0.114 * Math.sin(2 * lunarArgument));
  const eclipticLatitude = RAD * (5.128 * Math.sin(lunarArgument) + 0.281 * Math.sin(lunarAnomaly + lunarArgument)
    + 0.278 * Math.sin(lunarAnomaly - lunarArgument) + 0.173 * Math.sin(2 * elongation - lunarArgument));
  const moon = equatorial(eclipticLongitude, eclipticLatitude);
  const distance = 385001 - 20905 * Math.cos(lunarAnomaly) - 3699 * Math.cos(2 * elongation - lunarAnomaly)
    - 2956 * Math.cos(2 * elongation);

  // Meeus, Astronomical Algorithms, ch. 53, without nutation and physical libration
  const ascendingNode = RAD * (125.0445479 - 1934.1362891 * days / 36525);
  const poleX = Math.sin(LUNAR_EQUATOR_INCLINATION) * Math.sin(ascendingNode);
  const poleY = Math.sin(LUNAR_EQUATOR_INCLINATION) * Math.cos(ascendingNode) * Math.cos(OBLIQUITY)
    - Math.cos(LUNAR_EQUATOR_INCLINATION) * Math.sin(OBLIQUITY);
  const librationLatitude = Math.asin(
    -Math.sin(eclipticLongitude - ascendingNode) * Math.cos(eclipticLatitude) * Math.sin(LUNAR_EQUATOR_INCLINATION)
    - Math.sin(eclipticLatitude) * Math.cos(LUNAR_EQUATOR_INCLINATION),
  );
  const axisAngle = Math.asin(Math.max(-1, Math.min(1,
    Math.hypot(poleX, poleY) * Math.cos(moon.ra - Math.atan2(poleX, poleY)) / Math.cos(librationLatitude),
  )));
  let { ra, dec } = moon;
  let parallacticAngle = 0;

  if (latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    const lat = latitude * RAD;
    const sidereal = RAD * (280.16 + 360.9856235 * days + longitude);
    const hourAngle = sidereal - ra;
    const u = Math.atan(0.99664719 * Math.tan(lat));
    const rhoSin = 0.99664719 * Math.sin(u);
    const rhoCos = Math.cos(u);
    const parallax = Math.asin(EARTH_RADIUS_KM / distance);
    const raCorrection = Math.atan2(-rhoCos * Math.sin(parallax) * Math.sin(hourAngle),
      Math.cos(dec) - rhoCos * Math.sin(parallax) * Math.cos(hourAngle));
    dec = Math.atan2((Math.sin(dec) - rhoSin * Math.sin(parallax)) * Math.cos(raCorrection),
      Math.cos(dec) - rhoCos * Math.sin(parallax) * Math.cos(hourAngle));
    ra += raCorrection;
    parallacticAngle = Math.atan2(Math.sin(sidereal - ra),
      Math.tan(lat) * Math.cos(dec) - Math.sin(dec) * Math.cos(sidereal - ra));
  }

  const separation = Math.acos(Math.max(-1, Math.min(1,
    Math.sin(sun.dec) * Math.sin(dec) + Math.cos(sun.dec) * Math.cos(dec) * Math.cos(sun.ra - ra),
  )));
  const incidence = Math.atan2(149598000 * Math.sin(separation), distance - 149598000 * Math.cos(separation));
  const brightLimbAngle = Math.atan2(Math.cos(sun.dec) * Math.sin(sun.ra - ra),
    Math.sin(sun.dec) * Math.cos(dec) - Math.cos(sun.dec) * Math.sin(dec) * Math.cos(sun.ra - ra));

  return {
    illuminated: (1 + Math.cos(incidence)) / 2,
    brightLimbAngle,
    axisAngle,
    parallacticAngle,
  };
}

/**
 * Sunlit side right of the terminator, with the bright limb on the right before rotation. It reaches beyond
 * the limb so that blurring it only softens the terminator; clip it to the disc.
 */
export function moonLitPath(cx: number, cy: number, r: number, illuminated: number) {
  const terminator = 1 - 2 * illuminated;
  const rx = Math.max(0.01, Math.abs(terminator) * r);
  const sweep = terminator >= 0 ? 1 : 0;
  return `M${cx} ${cy - r}A${rx} ${r} 0 0 ${sweep} ${cx} ${cy + r}V${cy + 2 * r}H${cx + 2 * r}V${cy - 2 * r}H${cx}Z`;
}
