// Relatórios e tags lidos pelo catálogo local de Vendas. Este módulo contém apenas dados.
export const salesCatalogSources = [
  { tag: "VEN03-542fa7d6", suffixes: ["op", "read"], people: ["global", "reader", "denied"], doc: "docs/modules/sales/VEN03_LOCAL_VALIDATION.md" },
  ...["c3ee065b", "65d16aa2", "db29681c", "52472d04", "8e9668d6", "3d364035", "8b441b99"].map(t => ({
    tag: `VEN04A-${t}`, suffixes: ["operator", "creator", "reader", "editor", "deleter", "denied", "sector"],
    people: ["operator", "creator", "reader", "editor", "deleter", "denied", "sector"], doc: "docs/modules/sales/VEN04A_LOCAL_VALIDATION.md",
  })),
  { tag: "VEN04B-8b441b99", suffixes: ["global", "unita", "unitb", "operations", "creator", "denied", "sector"], people: [], doc: "docs/modules/sales/VEN04B_LOCAL_VALIDATION.md" },
];
