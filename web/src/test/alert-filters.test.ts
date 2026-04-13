import { describe, expect, it } from "vitest";
import { normalizeAlertFilters } from "@/lib/domain/alert-filters";

describe("normalizeAlertFilters", () => {
  it("aplica valores por defecto en objeto vacío", () => {
    const f = normalizeAlertFilters({});
    expect(f.searchText).toBe("");
    expect(f.tipoAdministracion).toBeNull();
    expect(f.orderBy).toBe("fechaRecepcion");
    expect(f.direccion).toBe("desc");
  });

  it("acepta tipo y orden válidos", () => {
    const f = normalizeAlertFilters({
      searchText: "pyme",
      tipoAdministracion: "A",
      orderBy: "descripcion",
      direccion: "asc",
    });
    expect(f.tipoAdministracion).toBe("A");
    expect(f.orderBy).toBe("descripcion");
    expect(f.direccion).toBe("asc");
  });

  it("rechaza tipo y orden inválidos", () => {
    const f = normalizeAlertFilters({
      tipoAdministracion: "X",
      orderBy: "no_existe",
    });
    expect(f.tipoAdministracion).toBeNull();
    expect(f.orderBy).toBe("fechaRecepcion");
  });
});
