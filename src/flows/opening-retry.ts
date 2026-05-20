export function isOpeningRetryComment(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return false;

  return [
    "belum ada",
    "blm ada",
    "belom ada",
    "ga ada",
    "gak ada",
    "nggak ada",
    "ngga ada",
    "gk ada",
    "kagak ada",
    "dm belum",
    "dm blm",
    "dm belom",
    "dm ga",
    "dm gak",
    "dm gk",
    "dm tidak",
    "dm kaga",
    "dm kagak",
    "belum masuk",
    "blm masuk",
    "ga masuk",
    "gak masuk",
    "nggak masuk",
    "tidak masuk",
    "dm mana",
    "dmnya mana",
    "no dm",
    "no message",
    "not received",
    "didnt get",
    "didn t get",
    "did not get",
    "nothing received",
    "cant see",
    "can t see"
  ].some((phrase) => normalized.includes(phrase));
}
