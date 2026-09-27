/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Node-only mail libraries: load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
};

module.exports = nextConfig;
