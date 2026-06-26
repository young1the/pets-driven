/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design system ships raw TypeScript/TSX from the workspace; let Next
  // transpile it (and process its co-located component CSS) instead of
  // expecting a pre-built dist.
  transpilePackages: ["@pets-driven/design-system"],
};

export default nextConfig;
