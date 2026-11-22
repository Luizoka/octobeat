export const USERNAME_ERROR = "Use só letras, números e espaços no usuário (até 255 caracteres).";
export const PASSWORD_ACCOUNT_DOMAIN = "contas.octobeat.luizoka.dev";

export function normalizeUsername(value) {
  // O btrim da migração inclui espaços não separáveis nas pontas.
  // No interior, [:space:] segue a classe POSIX da collation C.UTF-8.
  return value == null ? null : value.trim().replace(/[\t-\r \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+/g, " ");
}

export function isValidUsername(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 255
    && /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(value);
}

// O SQL usa lower(... COLLATE "C"), que converte apenas as letras ASCII.
function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function usernameSlug(value) {
  return value == null ? null : asciiLower(value).replaceAll(" ", "-");
}

export function passwordAccountEmail(value) {
  return value == null ? null : `${asciiLower(value).replaceAll(" ", ".")}@${PASSWORD_ACCOUNT_DOMAIN}`;
}
