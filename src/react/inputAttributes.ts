// What a search field tells a browser and the password managers about itself:
// that it is no form field to fill. A browser offers a name or an address from
// the visitor's contacts on a field it takes for one, in a popup that lands on
// the menu, and a password manager offers its logins and cards; `autocomplete`
// alone is not always heard, so the managers are told by the attributes each
// of them reads. Nothing here is the host's to set twice: the field is a
// search box, whatever its label says.

/** The attributes of a search field that is no form field to fill or correct. */
export const NO_FILL_ATTRIBUTES = {
  autoComplete: "off",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
  // 1Password, LastPass, Bitwarden, and the others that read `data-form-type`.
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": true,
  "data-form-type": "other",
} as const;
