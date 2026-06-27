# Contributing

Thanks for your interest in PCB Colour-Plan.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (parser, BOM, geometry, renderer, pagination)
npm run lint     # eslint
npm run build    # type-check + production build to dist/
```

The core (`src/core/`) is framework-agnostic, pure TypeScript and is where most
of the logic lives; the React UI in `src/ui/` is a thin shell. Adding an input
format is a `format -> Board` adapter under `src/core/import/` - the BOM,
renderer and colour-plan pipeline are shared.

## Ground rules

- **Keep parsing client-side.** Design data must never be uploaded. Anything that
  would send file contents off the device will be rejected.
- **Add tests** for parser / model / geometry changes; run `npm test` before
  opening a PR.
- **Permissive dependencies only.** The build runs a licence guard
  (`npm run check-licenses`) that fails on copyleft deps. New dependencies must be
  MIT / BSD / ISC / Apache-2.0 or similar.
- **Match the surrounding style** - TypeScript, existing naming and comment density.

## Licence

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).

## Security

Please report vulnerabilities privately - see [`SECURITY.md`](SECURITY.md).
