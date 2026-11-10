/*
 * Demonstration brands. ALL FICTITIOUS: no real company, logo or customer data.
 * Shaped exactly like the future tenant payload and validated by sanitizeBrand.
 */
import { DEFAULT_BRAND, brandScale, type BrandConfig } from "../shared/theme/brand";

export const EMPRESA_A: BrandConfig = {
  id: "empresa-a",
  name: "Empresa A (fictícia)",
  shortName: "Empresa A",
  monogram: "A",
  fictitious: true,
  colors: {
    // Copper. 600 carries white text at 5.3:1; accent is a muted olive.
    primary: brandScale(["#fcf5f0", "#f8e7da", "#f0cbb1", "#e6a882", "#d9845a", "#c8683c", "#a9522c", "#8a4225", "#6f3621", "#5a2d1d", "#33170e"]),
    accent: brandScale(["#f5f6f0", "#e7eadb", "#d0d6b8", "#b3bd8e", "#97a46b", "#7d8a52", "#626d40", "#4d5634", "#3f462c", "#363b27", "#1c2013"]),
  },
};

export const EMPRESA_B: BrandConfig = {
  id: "empresa-b",
  name: "Empresa B (fictícia)",
  shortName: "Empresa B",
  monogram: "B",
  fictitious: true,
  colors: {
    // Green. 600 carries white text at 5.1:1; accent is amber.
    primary: brandScale(["#ecfaf3", "#d1f2e2", "#a6e4c7", "#6fcfa5", "#3fb584", "#1f9a6a", "#137d55", "#116446", "#10503a", "#0e4231", "#06261c"]),
    accent: brandScale(["#fdf9ec", "#f9eecb", "#f2db93", "#ebc35a", "#e4ab33", "#d38c1d", "#b46b16", "#8f4f16", "#764018", "#643618", "#3a1b09"]),
  },
};

export const DEMO_BRANDS: readonly BrandConfig[] = [DEFAULT_BRAND, EMPRESA_A, EMPRESA_B];

export function findDemoBrand(id: string | null | undefined): BrandConfig {
  return DEMO_BRANDS.find((brand) => brand.id === id) ?? DEFAULT_BRAND;
}
