/** @type {import('next').NextConfig} */
const nextConfig={
  transpilePackages:['@aaraagate/api-client','@aaraagate/config','@aaraagate/types'],
  // Next 16 no longer accepts eslint configuration; CI runs lint separately.
};

export default nextConfig;
