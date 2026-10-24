// One native identity policy for API input and offline build planning.
const pattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const reserved = /^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)/;
const keywords = new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _'.split(' '));
exports.validAndroidIdentity = function(value) {
  return typeof value === 'string' && value.length <= 150 && pattern.test(value) &&
    !reserved.test(value) && !value.split('.').some(part => keywords.has(part));
};
