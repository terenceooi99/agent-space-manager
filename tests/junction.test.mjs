// tests/junction.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 5: Safe Junction Lifecycle", () => {
  test("createJunction creates link, is idempotent, retargets cleanly, and removeJunction severs link without touching source", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const src1 = path.join(sb.hub, "plugins", "alpha-plugin");
      const src2 = path.join(sb.hub, "plugins", "beta-plugin");
      const link = path.join(sb.home, "links", "test-link");

      const r1 = m.createJunction(src1, link);
      assert.equal(r1.success, true);
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);

      // Idempotent call
      const r2 = m.createJunction(src1, link);
      assert.equal(r2.success, true);

      // Retarget to src2
      const r3 = m.createJunction(src2, link);
      assert.equal(r3.success, true);
      assert.equal(fs.existsSync(path.join(link, "skills", "deploy-helper", "SKILL.md")), true);

      // Remove junction without deleting source files
      const rem = m.removeJunction(link);
      assert.equal(rem.success, true);
      assert.equal(fs.existsSync(link), false);
      assert.equal(fs.existsSync(path.join(src2, "skills", "deploy-helper", "SKILL.md")), true);
    } finally {
      sb.cleanup();
    }
  });

  test("createJunction refuses to overwrite a real user-owned directory", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const src = path.join(sb.hub, "plugins", "alpha-plugin");
      const realUserDir = path.join(sb.home, "user-real-dir");
      fs.mkdirSync(realUserDir, { recursive: true });
      const preciousFile = path.join(realUserDir, "my-handwritten-skill.md");
      fs.writeFileSync(preciousFile, "do not delete me", "utf8");

      const res = m.createJunction(src, realUserDir);
      assert.equal(res.success, false, "createJunction must NOT delete a real user directory");
      assert.equal(fs.existsSync(preciousFile), true, "User file inside real directory must survive");
    } finally {
      sb.cleanup();
    }
  });
});
