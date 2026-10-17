// Native dynamic import preserves compatibility with all supported Node 22 minors.
// The existing ESM hostname contract remains the single implementation.
exports.loadPartnerDomainContract = () => import('./partner-domain-contract.mjs');
