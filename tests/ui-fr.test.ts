import { describe, expect, it } from "vitest";
import { adminUiPage } from "../src/admin/ui";

describe("interface Ki’Savan en français", () => {
  const html = adminUiPage("test-nonce");

  it("affiche la marque et les libellés de connexion en français", () => {
    expect(html).toContain("Ki’Savan AutoDM");
    expect(html).toContain("Se connecter au tableau de bord");
    expect(html).toContain("Identifiant");
    expect(html).toContain("Mot de passe");
    expect(html).toContain("Clé de sécurité");
  });

  it("ne conserve pas les principaux libellés indonésiens de connexion", () => {
    expect(html).not.toContain("Masuk ke dashboard");
    expect(html).not.toContain("Gunakan akun operator");
    expect(html).not.toContain("Kode akses tambahan");
  });

  it("conserve les routes et champs nécessaires au formulaire", () => {
    expect(html).toContain("/admin/session");
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain('name="adminToken"');
  });
});
