/** @type {import('next').NextConfig} */
const nextConfig={
  transpilePackages:['@aaraagate/api-client','@aaraagate/config','@aaraagate/types'],
  // Admin lint runs as its own required CI step; avoid duplicate build-time linting.
  eslint:{ignoreDuringBuilds:true},
};

export default nextConfig;
