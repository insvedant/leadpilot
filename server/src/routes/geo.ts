import { Router } from 'express';
import { City, Country, State } from 'country-state-city';

/**
 * Location lists are served from the API instead of bundled into the web app;
 * the full city dataset is several MB, which would wreck mobile load times.
 */
const router = Router();

const countries = Country.getAllCountries()
  .map((c) => ({ code: c.isoCode, name: c.name, flag: c.flag }))
  .sort((a, b) => a.name.localeCompare(b.name));

router.get('/countries', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(countries);
});

router.get('/countries/:cc/states', (req, res) => {
  const states = State.getStatesOfCountry(req.params.cc.toUpperCase())
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(states);
});

router.get('/countries/:cc/states/:sc/cities', (req, res) => {
  const names = [
    ...new Set(City.getCitiesOfState(req.params.cc.toUpperCase(), req.params.sc.toUpperCase()).map((c) => c.name)),
  ].sort((a, b) => a.localeCompare(b));
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(names);
});

export default router;
