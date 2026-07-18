/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["jsdom", "@mozilla/readability", "isomorphic-dompurify", "unpdf"],
};

export default nextConfig;
