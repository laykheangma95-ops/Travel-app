/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @domner/core ships raw TypeScript; Next must compile it rather than
  // expect a prebuilt dist. @domner/supplier is deliberately absent — the
  // staff console must never bundle the GoHub client.
  transpilePackages: ['@domner/core'],
};

export default nextConfig;
