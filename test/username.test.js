import assert from "node:assert/strict";
import test from "node:test";
import { isValidUsername, matchesDeletionConfirmation, normalizeDeletionConfirmation, normalizeUsername, passwordAccountEmail, usernameSlug } from "../src/identity/username.js";

test("normaliza espaços como a migração e preserva a capitalização", () => {
  assert.equal(normalizeUsername("\uFEFF\u00a0 Luiz\t\n  Teste  2 \u202f"), "Luiz Teste 2");
  assert.equal(normalizeUsername("Luiz\u2003\u3000Teste"), "Luiz Teste");
  assert.equal(normalizeUsername("Luiz\u00a0Teste"), "Luiz\u00a0Teste");
  assert.equal(normalizeUsername(" \t "), "");
  assert.equal(normalizeUsername(null), null);
});

test("valida somente nomes já normalizados, com 1 a 255 caracteres ASCII", () => {
  for (const name of ["a", "0", "Luiz Teste 2", "a".repeat(255)]) assert.equal(isValidUsername(name), true);
  for (const name of ["", " a", "a ", "a  b", "a\nb", "a\n", "a\u00a0b", "a".repeat(256), "João",
    "a_b", "a-b", "a.b", "a/b", null]) assert.equal(isValidUsername(name), false);
});

test("deriva slug e e-mail a partir do nome normalizado", () => {
  const name = normalizeUsername("  Luiz   Teste 2  ");
  assert.equal(usernameSlug(name), "luiz-teste-2");
  assert.equal(passwordAccountEmail(name), "luiz.teste.2@contas.octobeat.luizoka.dev");
  assert.equal(usernameSlug("JOÃO"), "joÃo");
  assert.equal(usernameSlug(null), null);
  assert.equal(passwordAccountEmail(null), null);
});

test("confirma a exclusão pelo slug do próprio perfil", () => {
  const slug = "joao-silva";
  assert.equal(normalizeDeletionConfirmation("  @João   SILVA  ", slug), slug);
  for (const value of ["@joao-silva", "João Silva"]) assert.ok(matchesDeletionConfirmation(value, slug));
  for (const value of ["", null, "excluir", "@outro-perfil", "@@joao-silva"]) {
    assert.equal(matchesDeletionConfirmation(value, slug), false);
  }
});

test("conta sem perfil confirma a exclusão com a palavra excluir", () => {
  assert.ok(matchesDeletionConfirmation("  Excluir  "));
  for (const value of ["", null, "@excluir", "excluir agora"]) {
    assert.equal(matchesDeletionConfirmation(value), false);
  }
});

test("stripAccents tira acentos e cedilha, mantendo o resto", async () => {
  const { stripAccents, isValidUsername } = await import("../src/identity/username.js");
  assert.equal(stripAccents("Jogador Anônimo"), "Jogador Anonimo");
  assert.equal(stripAccents("João Conceição Müller"), "Joao Conceicao Muller");
  assert.ok(isValidUsername(stripAccents("Jogador Anônimo")));
  assert.equal(stripAccents("abc 123"), "abc 123");
  assert.equal(stripAccents(null), null);
});
