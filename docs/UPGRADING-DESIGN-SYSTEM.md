# Upgrading the design system

This document describes how to upgrade the vendored `clear-design-system` from one version to another.

## Prerequisites

- The new export artifact (e.g., `clear-design-system-X.Y.Z/`)
- Read the new version's CHANGELOG for breaking changes

## Procedure

### 1. Replace the vendored folder

```sh
rm -rf src/design-system
cp -R path/to/clear-design-system-X.Y.Z src/design-system
```

### 2. Diff the export's styles.css against the app's import list

The export's `styles.css` lists which CSS layers are loaded and in what order. Compare it
to the imports in `src/main.tsx`:

```sh
cat src/design-system/styles.css
# Compare to the CSS imports in src/main.tsx
```

If the export added a new layer (e.g., a new CSS file in `css/`), add the corresponding
import to `src/main.tsx` in the correct position. **A newly-added layer that is not
imported will be silently dropped**, and you will not notice until a component looks wrong.

### 3. Diff the export's skin-clear.css against the app-owned skin

The app owns `src/styles/skin-clear.css`. The export's `css/skin-clear.css` is the
reference; they should declare the same tokens, but the app version omits the Google
Fonts `@import`.

```sh
diff src/design-system/css/skin-clear.css src/styles/skin-clear.css
```

If the export added new tokens or changed values:
- Add new tokens to the app-owned skin
- Update changed values in the app-owned skin
- **Never copy the @import line** — font delivery is handled by DS-02

### 4. Update the version pin in ATOMIC.md

Edit `docs/specs/design/ATOMIC.md` §1 to reflect the new version in the table:

```
| Version | `X.Y.Z` |
```

### 5. Run the version test

```sh
npm test -- src/design-system/version.test.ts
```

This asserts the exported `VERSION` constant equals the version in ATOMIC.md and
package.json. All three must agree.

### 6. Run the adherence lint

```sh
npm run lint
```

The `_adherence.oxlintrc.json` rules catch:
- Raw hex colours (use `var(--token)`)
- Raw px values (use `var(--spacing-*)`)
- Unknown component props
- Out-of-range enum values
- Imports from component internals

### 7. Check the Contrast Audit card

Load `/dev/gallery` and verify the Contrast Audit card still shows all pairs passing.
If you changed a colour token, this is where regressions appear.

## Checklist

- [ ] `src/design-system/` replaced with new export (byte-identical)
- [ ] New CSS layers (if any) added to `src/main.tsx` imports
- [ ] `src/styles/skin-clear.css` updated to match new export's tokens
- [ ] Version pin updated in `docs/specs/design/ATOMIC.md` §1
- [ ] `npm test` passes (version test)
- [ ] `npm run lint` passes (adherence lint)
- [ ] Contrast Audit card reviewed (if colours changed)
