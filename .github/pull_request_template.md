<!-- Kurz in 1–3 Sätzen: Was ändert sich für Nutzer, und warum? -->


## Änderungen
<!-- Betroffene Dateien/Bereiche, neue Einstellungen (mit Standardwert), API-Endpunkte -->
- 

## Hintergrund
<!-- Optional: Ursache, verworfene Alternativen, bekannte Einschränkungen. Sonst löschen. -->

## Tests
<!-- Was wurde wie geprüft? Anzahl grüner Tests, manuelle/E2E-Tests, was ungetestet blieb (z. B. echte Geräte) -->
- Server: `cd server && npm test`
- Client: `cd client && npm test`; `npm run build`
- Manuell:

## Checkliste
- [ ] `CHANGELOG.md` ergänzt (bei neuer Version: Überschrift `## [x.y.z] – JJJJ-MM-TT`, daraus kommen App-Version und Release Notes)
- [ ] `README.md` aktualisiert, falls sich Einrichtung, Einstellungen oder Verhalten ändern
- [ ] Neue Einstellungen haben sinnvolle Standardwerte und einen Schalter in der Oberfläche
- [ ] Kiosk geprüft (Querformat 1280 × 800, Hochformat z. B. 1200 × 1980), px-Größen skalieren mit `--ui-scale`
- [ ] Neue Animationen/Blur werden bei Effektstufe „Mittel“/„Niedrig“ (`[data-effects]`) abgeschwächt
- [ ] Neue Widget-Typen in `client/src/lib/widgets.ts` und `server/src/dashboard.js` gleich
- [ ] Keine Zugangsdaten, Tokens oder privaten Adressen im Code, in Tests oder Screenshots

<!-- Screenshots (Desktop/Kiosk/Hochformat) gern hier anhängen -->
