import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  requestTelemetryDataCollectionPermission,
  TELEMETRY_DATA_COLLECTION_PERMISSIONS,
  telemetryDataCollectionPermissionState
} from "../lib/telemetry-data-consent.js";

const manifest = JSON.parse(
  await readFile(new URL("../manifest.json", import.meta.url), "utf8")
);

test("Firefox manifest uses an MV3 event page and a stable Gecko identity", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background.scripts, ["background.js"]);
  assert.equal(manifest.background.type, "module");
  assert.equal("service_worker" in manifest.background, false);
  assert.equal("minimum_chrome_version" in manifest, false);
  assert.equal(manifest.browser_specific_settings.gecko.id, "veilance@veilance.org");
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "140.0");
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ["none"]
  );
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions.optional,
    TELEMETRY_DATA_COLLECTION_PERMISSIONS
  );
});

test("Firefox telemetry permission request asks for every declared optional category", async () => {
  let requested = null;
  let granted = [];
  const runtime = { getManifest: () => manifest };
  const permissionsApi = {
    async request(value) {
      requested = value;
      granted = [...value.data_collection];
      return true;
    },
    async getAll() {
      return { permissions: [], origins: [], data_collection: granted };
    }
  };

  const result = await requestTelemetryDataCollectionPermission({ permissionsApi, runtime });
  assert.deepEqual(requested, { data_collection: TELEMETRY_DATA_COLLECTION_PERMISSIONS });
  assert.equal(result.managedByFirefox, true);
  assert.equal(result.granted, true);
  assert.deepEqual(result.missing, []);
});

test("Firefox telemetry stays blocked when one declared category is not granted", async () => {
  const granted = TELEMETRY_DATA_COLLECTION_PERMISSIONS.slice(0, -1);
  const result = await telemetryDataCollectionPermissionState({
    runtime: { getManifest: () => manifest },
    permissionsApi: {
      async getAll() {
        return { data_collection: granted };
      }
    }
  });

  assert.equal(result.granted, false);
  assert.deepEqual(result.missing, [TELEMETRY_DATA_COLLECTION_PERMISSIONS.at(-1)]);
});

test("a non-Firefox manifest keeps the existing local consent path", async () => {
  const result = await telemetryDataCollectionPermissionState({
    runtime: { getManifest: () => ({ manifest_version: 3 }) },
    permissionsApi: null
  });
  assert.deepEqual(result, {
    managedByFirefox: false,
    granted: true,
    declared: [],
    missing: []
  });
});
