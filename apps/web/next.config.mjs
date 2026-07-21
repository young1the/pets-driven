/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design system ships raw TypeScript/TSX from the workspace; let Next
  // transpile it (and process its co-located component CSS) instead of
  // expecting a pre-built dist.
  transpilePackages: ["@pets-driven/design-system", "@pets-driven/pet-engine", "@pets-driven/i18n"],
  experimental: {
    // These are barrel packages: importing one symbol (e.g. PetAvatar) would
    // otherwise pull every re-exported component into the bundle. Rewrite such
    // imports to their direct module paths so only what's used is bundled.
    optimizePackageImports: ["@pets-driven/design-system", "@pets-driven/i18n"],
  },
};

export default nextConfig;
