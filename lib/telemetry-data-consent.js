export const TELEMETRY_DATA_COLLECTION_PERMISSIONS = Object.freeze([
  "browsingActivity",
  "financialAndPaymentInfo",
  "locationInfo",
  "personallyIdentifyingInfo",
  "technicalAndInteraction",
  "websiteContent"
]);

function declaredOptionalPermissions(runtime) {
  try {
    const declared = runtime?.getManifest?.()
      ?.browser_specific_settings
      ?.gecko
      ?.data_collection_permissions
      ?.optional;
    return Array.isArray(declared)
      ? [...new Set(declared.map(String).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

/**
 * Returns the Firefox data-collection permission state for telemetry.
 * A build without Firefox declarations keeps the existing in-product consent
 * path so this module remains harmless in Chromium source trees and tests.
 */
export async function telemetryDataCollectionPermissionState({
  permissionsApi = globalThis.chrome?.permissions,
  runtime = globalThis.chrome?.runtime
} = {}) {
  const declared = declaredOptionalPermissions(runtime);
  if (!declared.length) {
    return { managedByFirefox: false, granted: true, declared: [], missing: [] };
  }
  if (typeof permissionsApi?.getAll !== "function") {
    return { managedByFirefox: true, granted: false, declared, missing: declared };
  }

  const current = await permissionsApi.getAll();
  const grantedPermissions = new Set(
    Array.isArray(current?.data_collection) ? current.data_collection.map(String) : []
  );
  const missing = declared.filter((permission) => !grantedPermissions.has(permission));
  return {
    managedByFirefox: true,
    granted: missing.length === 0,
    declared,
    missing
  };
}

/**
 * Must be called directly from a user-activated extension-page event. Firefox
 * rejects optional data-collection permission requests made later in a task.
 */
export async function requestTelemetryDataCollectionPermission({
  permissionsApi = globalThis.chrome?.permissions,
  runtime = globalThis.chrome?.runtime
} = {}) {
  const declared = declaredOptionalPermissions(runtime);
  if (!declared.length) {
    return { managedByFirefox: false, granted: true, declared: [], missing: [] };
  }
  if (typeof permissionsApi?.request !== "function") {
    return { managedByFirefox: true, granted: false, declared, missing: declared };
  }

  const accepted = await permissionsApi.request({ data_collection: declared });
  if (!accepted) {
    return { managedByFirefox: true, granted: false, declared, missing: declared };
  }
  return telemetryDataCollectionPermissionState({ permissionsApi, runtime });
}
