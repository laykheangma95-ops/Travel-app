# Corner Map vendored fonts

`geist-latin.woff2` and `geist-mono-latin.woff2` are the Latin subsets of
**Geist** and **Geist Mono** by Vercel, licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/).

They are vendored rather than pulled through `next/font/google` because Next
14.2's Google Font manifest predates Geist's addition to Google Fonts. They are
loaded via `next/font/local` in `app/(corner)/layout.tsx`.

Bricolage Grotesque and Kantumruy Pro are loaded through `next/font/google` and
are not vendored here.
