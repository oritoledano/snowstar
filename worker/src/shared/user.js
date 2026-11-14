/** Public shape of a user — never leak hashes, salts or internal ids. Shared
 * by every route that hands a user object to the client, so the fields stay
 * in lock-step no matter which file mints the object (index.js, oauth.js). */
export const publicUser = (u) => ({
  email: u.email,
  name: u.name,
  first_name: u.first_name || null,
  last_name: u.last_name || null,
  country: u.country || null,
  phone: u.phone || null,
  role: u.role || null,
  company: u.company || null,
  newsletter: !!u.newsletter,
  admin: !!u.admin,
  avatar: u.avatar || null,
  has_password: !!u.pw_hash,
  via: u.signup_source || null,
});
