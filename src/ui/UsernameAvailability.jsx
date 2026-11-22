import { useEffect, useState } from "react";
import { usernameAvailable } from "../identity/auth.js";
import { isValidUsername, normalizeUsername, USERNAME_ERROR } from "../identity/username.js";

export function UsernameAvailability({ username }) {
  const name = normalizeUsername(username);
  const [check, setCheck] = useState(null);

  useEffect(() => {
    if (!isValidUsername(name)) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await usernameAvailable(name);
        if (active) setCheck({ name, message: result.available ? "Nome disponível." : result.reason });
      } catch (error) {
        if (active) setCheck({ name, message: error.message });
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name]);

  if (!name) return null;
  return <small role="status">{!isValidUsername(name) ? USERNAME_ERROR
    : check?.name === name ? check.message : "Verificando disponibilidade…"}</small>;
}
