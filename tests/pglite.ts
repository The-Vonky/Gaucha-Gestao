import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

// Extensão usada pela migration AG-01; cada instância continua isolada em memória.
export function createTestDatabase() {
  return new PGlite({ extensions: { btree_gist } });
}
